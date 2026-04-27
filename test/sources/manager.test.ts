import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { SourceManager } from '../../src/sources/manager.js';

/**
 * resolveVersion() falls back when the network call returns null. The
 * fetcher itself is exercised via integration tests; this just pins the
 * fallback path so PR mistakes that delete the env-var-driven fallback
 * fail loudly.
 */
describe('SourceManager.resolveVersion (offline)', () => {
  it('uses the configured fallback when detection returns nothing', async () => {
    // Point at an unreachable bogus host so detectCdnVersion errors out
    // without making real CDN traffic during unit tests.
    const manager = new SourceManager({
      cdnRoot: 'http://127.0.0.1:1/',
      fallbackVersion: 'v999',
      fetchTimeoutMs: 250,
      cacheDir: null,
    });
    const v = await manager.resolveVersion();
    assert.equal(v, 'v999');
    assert.equal(manager.detectedFromCdn(), false);
  });
});
