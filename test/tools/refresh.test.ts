import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runRefresh } from '../../src/tools/refresh.js';
import { runCdnVersion } from '../../src/tools/cdn-version.js';
import { primeManager } from '../helpers/prime.js';

describe('runRefresh', () => {
  it('"all" scope clears every loaded source', async () => {
    const m = primeManager({ items: { item_1: { InternalName: 'X' } } });
    assert.equal(m.loaded().length, 1);
    const out = await runRefresh({}, m);
    assert.equal(out.scope, 'all');
    assert.equal(m.loaded().length, 0);
  });
});

describe('runCdnVersion include_loaded', () => {
  it('returns per-source freshness when include_loaded is true', async () => {
    const m = primeManager({ items: { item_1: {} }, recipes: { recipe_1: {} } });
    const out = await runCdnVersion({ include_loaded: true }, m);
    assert.ok('loaded' in out);
    const loaded = (out as { loaded: Array<{ source: string }> }).loaded;
    const sources = loaded.map((s) => s.source).sort();
    assert.deepEqual(sources, ['items', 'recipes']);
  });

  it('omits loaded[] when include_loaded is false', async () => {
    const m = primeManager({ items: { item_1: {} } });
    const out = await runCdnVersion({ include_loaded: false }, m);
    assert.equal('loaded' in out, false);
  });
});
