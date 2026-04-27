import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SourceLoader } from '../../src/sources/loader.js';

interface MockServerHandle {
  server: Server;
  url: string;
  hits: number;
  reset(): void;
}

function startMock(handler: (url: string, hits: number) => { status: number; body?: string; headers?: Record<string, string> }): Promise<MockServerHandle> {
  return new Promise((resolve) => {
    let hits = 0;
    const server = createServer((req, res) => {
      hits += 1;
      const r = handler(req.url ?? '', hits);
      res.writeHead(r.status, r.headers ?? {});
      if (r.body !== undefined) res.write(r.body);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        server,
        url: `http://127.0.0.1:${addr.port}/`,
        get hits() { return hits; },
        reset() { hits = 0; },
      });
    });
  });
}

describe('SourceLoader disk cache', () => {
  let cacheDir: string;
  before(() => {
    cacheDir = mkdtempSync(path.join(os.tmpdir(), 'pg-data-mcp-test-'));
  });
  after(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('writes the source + meta sidecar atomically on miss', async () => {
    const mock = await startMock(() => ({
      status: 200,
      body: JSON.stringify({ item_1: { InternalName: 'X' } }),
      headers: { 'content-type': 'application/json', etag: '"abc"' },
    }));
    try {
      const loader = new SourceLoader({
        cdnRoot: mock.url,
        fallbackVersion: 'vTest',
        fetchTimeoutMs: 1000,
        cacheDir,
      });
      await loader.get('vTest', 'items');
      assert.equal(mock.hits, 1);

      const dataPath = path.join(cacheDir, 'vTest', 'items.json');
      const metaPath = path.join(cacheDir, 'vTest', 'items.meta.json');
      assert.ok(existsSync(dataPath), 'data file missing');
      assert.ok(existsSync(metaPath), 'meta file missing');
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      assert.equal(meta.etag, '"abc"');
      assert.ok(meta.sha256.length === 64);
      // No leftover .tmp files.
      assert.equal(existsSync(`${dataPath}.tmp`), false);
      assert.equal(existsSync(`${metaPath}.tmp`), false);
    } finally {
      mock.server.close();
    }
  });

  it('reads from disk on memory miss without hitting the CDN', async () => {
    const mock = await startMock(() => ({ status: 500 })); // would 500 if reached
    try {
      const loader = new SourceLoader({
        cdnRoot: mock.url,
        fallbackVersion: 'vTest',
        fetchTimeoutMs: 1000,
        cacheDir,
      });
      const got = await loader.get('vTest', 'items');
      assert.equal(mock.hits, 0, 'should have served from disk');
      assert.equal((got.data.item_1 as { InternalName: string }).InternalName, 'X');
      assert.equal(got.etag, '"abc"');
    } finally {
      mock.server.close();
    }
  });
});

describe('SourceLoader revalidate', () => {
  it('reuses cached body on 304 and bumps fetchedAt', async () => {
    let calls = 0;
    const mock = await startMock((_url) => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 200,
          body: JSON.stringify({ item_1: { InternalName: 'A' } }),
          headers: { etag: '"v1"' },
        };
      }
      return { status: 304, headers: { etag: '"v1"' } };
    });
    try {
      const loader = new SourceLoader({
        cdnRoot: mock.url,
        fallbackVersion: 'vTest',
        fetchTimeoutMs: 1000,
        cacheDir: null,
      });
      const first = await loader.get('vTest', 'items');
      const firstFetched = first.fetchedAt.getTime();
      // small wait so fetchedAt changes meaningfully
      await new Promise((r) => setTimeout(r, 10));
      const second = await loader.revalidate('vTest', 'items');
      assert.ok(second.fetchedAt.getTime() >= firstFetched);
      assert.equal(second.etag, '"v1"');
      assert.equal((second.data.item_1 as { InternalName: string }).InternalName, 'A');
      assert.equal(calls, 2);
    } finally {
      mock.server.close();
    }
  });
});
