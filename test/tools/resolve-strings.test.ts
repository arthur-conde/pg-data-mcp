import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runResolveStrings } from '../../src/tools/resolve-strings.js';
import { SourceManager } from '../../src/sources/manager.js';
import type { LoadedSource } from '../../src/sources/loader.js';

function primeStrings(strings: Record<string, string>): SourceManager {
  const manager = new SourceManager({
    cdnRoot: 'http://127.0.0.1:1/',
    fallbackVersion: 'v0test',
    fetchTimeoutMs: 250,
    cacheDir: null,
  });
  const loader = (manager as unknown as { loader: { cache: Map<string, LoadedSource> } }).loader;
  loader.cache.set('v0test::strings_all', {
    version: 'v0test',
    source: 'strings_all',
    url: 'http://test/strings_all.json',
    fetchedAt: new Date(0),
    etag: null,
    lastModified: null,
    data: strings,
  });
  (manager as unknown as { detectedVersion: string }).detectedVersion = 'v0test';
  return manager;
}

describe('runResolveStrings', () => {
  it('resolves present keys and reports missing ones', async () => {
    const manager = primeStrings({
      item_1_Name: 'Carrot',
      item_2_Name: 'Carrot Seeds',
    });
    const out = await runResolveStrings(
      { keys: ['item_1_Name', 'item_2_Name', 'item_999_Name'] },
      manager,
    );
    assert.equal(out.resolved.item_1_Name, 'Carrot');
    assert.equal(out.resolved.item_2_Name, 'Carrot Seeds');
    assert.equal(out.resolved.item_999_Name, null);
    assert.deepEqual(out.missing, ['item_999_Name']);
  });
});
