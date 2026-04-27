import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runRecipesForItem, RecipesForItemInput } from '../../src/tools/recipes-for-item.js';
import { primeManager } from '../helpers/prime.js';

const items: Record<string, unknown> = {
  item_1: { InternalName: 'IronOre' },
  item_2: { InternalName: 'IronBar' },
  item_3: { InternalName: 'IronSword' },
};
const recipes: Record<string, unknown> = {
  recipe_smelt: {
    InternalName: 'SmeltIron',
    Skill: 'Blacksmithing',
    Ingredients: [{ ItemCode: 1 }],
    ResultItems: [{ ItemCode: 2 }],
  },
  recipe_forge: {
    InternalName: 'ForgeSword',
    Skill: 'Blacksmithing',
    Ingredients: [{ ItemCode: 2 }],
    ResultItems: [{ ItemCode: 3 }],
  },
};

describe('runRecipesForItem', () => {
  it('rejects when both selectors are missing', () => {
    assert.throws(() => RecipesForItemInput.parse({}), /exactly one/i);
  });

  it('role=result returns recipes whose result is the item', async () => {
    const m = primeManager({ items, recipes });
    const out = await runRecipesForItem({ internal_name: 'IronBar', role: 'result' } as never, m);
    assert.equal(out.summary?.matched, 1);
    assert.equal(out.items?.[0]?.key, 'recipe_smelt');
  });

  it('role=ingredient returns recipes that consume the item', async () => {
    const m = primeManager({ items, recipes });
    const out = await runRecipesForItem({ internal_name: 'IronBar', role: 'ingredient' } as never, m);
    assert.equal(out.summary?.matched, 1);
    assert.equal(out.items?.[0]?.key, 'recipe_forge');
  });

  it('role=any unions result+ingredient with no duplicates', async () => {
    const m = primeManager({ items, recipes });
    const out = await runRecipesForItem({ internal_name: 'IronBar', role: 'any' } as never, m);
    assert.equal(out.summary?.matched, 2);
    const keys = (out.items ?? []).map((i) => i.key).sort();
    assert.deepEqual(keys, ['recipe_forge', 'recipe_smelt']);
  });

  it('item_id resolves to internal name then queries indexes', async () => {
    const m = primeManager({ items, recipes });
    const out = await runRecipesForItem({ item_id: 2, role: 'result' } as never, m);
    assert.equal(out.summary?.matched, 1);
    assert.equal(out.items?.[0]?.key, 'recipe_smelt');
  });

  it('returns found:false for unknown internal_name', async () => {
    const m = primeManager({ items, recipes });
    const out = await runRecipesForItem({ internal_name: 'Nope', role: 'any' } as never, m);
    assert.equal((out as { found: boolean }).found, false);
  });
});
