import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildItemIndexes } from '../../src/sources/indexes.js';

const sample: Record<string, unknown> = {
  item_1: {
    InternalName: 'IronOre',
    Name: 'Iron Ore',
    IconId: 100,
    Keywords: ['Loot', 'Ore', 'Equipment=10'],
    EffectDescs: ['+5 Mining Skill'],
    Value: 25,
  },
  item_2: {
    InternalName: 'GoldOre',
    Name: 'Gold Ore',
    IconId: 100,
    Keywords: ['Loot', 'Ore'],
    EffectDescs: [],
    Value: 100,
  },
  item_3: {
    InternalName: 'IronSword',
    Name: 'Iron Sword',
    IconId: 200,
    Keywords: ['Equipment'],
    EffectDescs: ['+10 Sword Damage'],
  },
  // Malformed entries should not crash indexing.
  item_bad: 'oops',
};

describe('buildItemIndexes', () => {
  it('indexes by InternalName', () => {
    const ix = buildItemIndexes(sample);
    assert.equal(ix.byInternalName.get('IronOre')?.[0], 'item_1');
    assert.equal(ix.byInternalName.get('GoldOre')?.[0], 'item_2');
    assert.equal(ix.byInternalName.get('Nonexistent'), undefined);
  });

  it('indexes by IconId, allowing duplicates', () => {
    const ix = buildItemIndexes(sample);
    const sharedIcon = ix.byIconId.get(100) ?? [];
    assert.equal(sharedIcon.length, 2);
    assert.deepEqual(sharedIcon.map(([k]) => k).sort(), ['item_1', 'item_2']);
  });

  it('indexes by EffectDesc tokens, lowercased', () => {
    const ix = buildItemIndexes(sample);
    const mining = ix.byEffectDescToken.get('mining') ?? [];
    assert.equal(mining.length, 1);
    assert.equal(mining[0]?.[0], 'item_1');
    const damage = ix.byEffectDescToken.get('damage') ?? [];
    assert.equal(damage.length, 1);
    assert.equal(damage[0]?.[0], 'item_3');
  });

  it('strips =qty suffixes from keywords before indexing', () => {
    const ix = buildItemIndexes(sample);
    // "Equipment=10" should be indexed as "Equipment", same bucket as item_3's plain "Equipment".
    const eq = ix.byKeyword.get('Equipment') ?? [];
    assert.deepEqual(eq.map(([k]) => k).sort(), ['item_1', 'item_3']);
  });

  it('skips malformed (non-object) entries', () => {
    const ix = buildItemIndexes(sample);
    // No internal_name for 'item_bad' — verify it didn't crash.
    assert.equal(ix.byInternalName.get('oops'), undefined);
  });
});
