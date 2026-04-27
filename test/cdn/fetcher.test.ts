import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildSourceUrl, fetchSource, SourceNotAvailableError } from '../../src/cdn/fetcher.js';

function startMock(handler: (url: string, headers: Record<string, string | string[] | undefined>) => { status: number; body?: string; headers?: Record<string, string> }): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const r = handler(req.url ?? '', req.headers as Record<string, string | string[] | undefined>);
      res.writeHead(r.status, r.headers ?? {});
      if (r.body !== undefined) res.write(r.body);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

describe('buildSourceUrl', () => {
  it('joins root + version + source with the canonical /data/ path', () => {
    const url = buildSourceUrl({
      cdnRoot: 'https://cdn.projectgorgon.com/',
      version: 'v469',
      source: 'items',
      timeoutMs: 30_000,
    });
    assert.equal(url, 'https://cdn.projectgorgon.com/v469/data/items.json');
  });

  it('adds a trailing slash to the root if missing', () => {
    const url = buildSourceUrl({
      cdnRoot: 'https://cdn.projectgorgon.com',
      version: 'v470',
      source: 'recipes',
      timeoutMs: 30_000,
    });
    assert.equal(url, 'https://cdn.projectgorgon.com/v470/data/recipes.json');
  });
});

describe('fetchSource', () => {
  it('throws SourceNotAvailableError on 404', async () => {
    const mock = await startMock(() => ({ status: 404 }));
    try {
      await assert.rejects(
        () =>
          fetchSource({
            cdnRoot: mock.url,
            version: 'vX',
            source: 'lorebookinfo',
            timeoutMs: 1000,
          }),
        (err) => err instanceof SourceNotAvailableError && /not available in version vX/.test(err.message),
      );
    } finally {
      mock.server.close();
    }
  });

  it('passes If-None-Match and surfaces 304 with notModified=true', async () => {
    let sawHeader: string | undefined;
    const mock = await startMock((_url, headers) => {
      sawHeader = headers['if-none-match'] as string | undefined;
      return { status: 304, headers: { etag: '"abc"' } };
    });
    try {
      const got = await fetchSource({
        cdnRoot: mock.url,
        version: 'vY',
        source: 'items',
        timeoutMs: 1000,
        ifNoneMatch: '"abc"',
      });
      assert.equal(sawHeader, '"abc"');
      assert.equal(got.notModified, true);
      assert.equal(got.body.length, 0);
      assert.equal(got.etag, '"abc"');
    } finally {
      mock.server.close();
    }
  });

  it('returns body + etag + lastModified on 200', async () => {
    const mock = await startMock(() => ({
      status: 200,
      body: '{"item_1":{}}',
      headers: { etag: '"v2"', 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' },
    }));
    try {
      const got = await fetchSource({
        cdnRoot: mock.url,
        version: 'vZ',
        source: 'items',
        timeoutMs: 1000,
      });
      assert.equal(got.notModified, false);
      assert.equal(got.body.toString('utf8'), '{"item_1":{}}');
      assert.equal(got.etag, '"v2"');
      assert.equal(got.lastModified, 'Wed, 01 Jan 2025 00:00:00 GMT');
    } finally {
      mock.server.close();
    }
  });
});
