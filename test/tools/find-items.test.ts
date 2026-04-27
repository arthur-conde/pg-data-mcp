import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runFindItems, FindItemsInput } from '../../src/tools/find-items.js';
import { SourceManager } from '../../src/sources/manager.js';
import type { LoadedSource } from '../../src/sources/loader.js';

/**
 * Test helper: prime the manager's loader cache with a synthetic items
 * payload so we don't actually hit the CDN in unit tests.
 */
function primeManager(items: Record<string, unknown>): SourceManager {
  const manager = new SourceManager({
    cdnRoot: 'http://127.0.0.1:1/',
    fallbackVersion: 'v0test',
    fetchTimeoutMs: 250,
    cacheDir: null,
  });
  // Reach into the loader cache; the production API doesn't need this but
  // exposing a test seam would balloon scope. The key shape matches
  // SourceLoader.cacheKey('v0test', 'items').
  const loader = (manager as unknown as { loader: { cache: Map<string, LoadedSource> } }).loader;
  loader.cache.set('v0test::items', {
    version: 'v0test',
    source: 'items',
    url: 'http://test/items.json',
    fetchedAt: new Date(0),
    etag: null,
    lastModified: null,
    data: items,
  });
  // Pin the resolved version too so resolveVersion() doesn't try to detect.
  (manager as unknown as { detectedVersion: string }).detectedVersion = 'v0test';
  return manager;
}

const fixture: Record<string, unknown> = {
  item_1: {
    InternalName: 'Carrot',
    Name: 'Carrot',
    IconId: 50,
    Keywords: ['Food', 'Loot'],
    EffectDescs: ['+5 Health'],
    Value: 10,
  },
  item_2: {
    InternalName: 'CarrotSeeds',
    Name: 'Carrot Seeds',
    IconId: 51,
    Keywords: ['Loot', 'Seed'],
    EffectDescs: [],
    Value: 5,
  },
  item_3: {
    InternalName: 'IronSword',
    Name: 'Iron Sword',
    IconId: 200,
    EquipSlot: 'MainHand',
    Keywords: ['Equipment'],
    EffectDescs: ['+10 Sword Damage', '+2 Strength'],
    SkillReqs: { Sword: 5 },
    Value: 500,
  },
};

describe('runFindItems', () => {
  it('zod refine rejects calls with no filter', () => {
    assert.throws(
      () => FindItemsInput.parse({ limit: 10, offset: 0 }),
      /at least one filter/i,
    );
  });

  it('exact internal_name uses the index and returns one hit', async () => {
    const manager = primeManager(fixture);
    const out = await runFindItems(
      { internal_name: 'Carrot', limit: 10, offset: 0 },
      manager,
    );
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'item_1');
    assert.equal(out.items[0]?.data.InternalName, 'Carrot');
  });

  it('internal_name_contains is case-insensitive', async () => {
    const manager = primeManager(fixture);
    const out = await runFindItems(
      { internal_name_contains: 'carrot', limit: 10, offset: 0 },
      manager,
    );
    assert.equal(out.summary.matched, 2);
    assert.deepEqual(out.items.map((i) => i.key).sort(), ['item_1', 'item_2']);
  });

  it('keyword filter buckets through the index', async () => {
    const manager = primeManager(fixture);
    const out = await runFindItems(
      { keyword: 'Equipment', limit: 10, offset: 0 },
      manager,
    );
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'item_3');
  });

  it('effect_desc_contains tokenises and matches via the token index', async () => {
    const manager = primeManager(fixture);
    const out = await runFindItems(
      { effect_desc_contains: 'damage', limit: 10, offset: 0 },
      manager,
    );
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'item_3');
  });

  it('value range narrows correctly', async () => {
    const manager = primeManager(fixture);
    const out = await runFindItems(
      { value_min: 100, value_max: 1000, limit: 10, offset: 0 },
      manager,
    );
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'item_3');
  });

  it('skill_prereq matches SkillReqs key', async () => {
    const manager = primeManager(fixture);
    const out = await runFindItems(
      { skill_prereq: 'Sword', limit: 10, offset: 0 },
      manager,
    );
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'item_3');
  });

  it('field projection trims to requested fields', async () => {
    const manager = primeManager(fixture);
    const out = await runFindItems(
      { internal_name: 'IronSword', fields: ['InternalName', 'EquipSlot'], limit: 10, offset: 0 },
      manager,
    );
    assert.deepEqual(out.items[0]?.data, { InternalName: 'IronSword', EquipSlot: 'MainHand' });
  });

  it('limit + truncated marker behave correctly', async () => {
    const manager = primeManager(fixture);
    const out = await runFindItems(
      { internal_name_contains: 'carrot', limit: 1, offset: 0 },
      manager,
    );
    assert.equal(out.summary.matched, 2);
    assert.equal(out.summary.returned, 1);
    assert.equal(out.summary.truncated, true);
  });
});
