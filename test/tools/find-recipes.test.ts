import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runFindRecipes, FindRecipesInput } from '../../src/tools/find-recipes.js';
import { primeManager } from '../helpers/prime.js';

const items: Record<string, unknown> = {
  item_1: { InternalName: 'IronOre', Name: 'Iron Ore' },
  item_2: { InternalName: 'IronBar', Name: 'Iron Bar' },
  item_3: { InternalName: 'IronSword', Name: 'Iron Sword' },
};

const recipes: Record<string, unknown> = {
  recipe_1: {
    InternalName: 'SmeltIron',
    Skill: 'Blacksmithing',
    SkillLevelReq: 5,
    Ingredients: [{ ItemCode: 1, Quantity: 2 }],
    ResultItems: [{ ItemCode: 2, Quantity: 1 }],
    ResultEffectDescs: ['Produces an iron bar'],
  },
  recipe_2: {
    InternalName: 'ForgeSword',
    Skill: 'Blacksmithing',
    SkillLevelReq: 25,
    Ingredients: [{ ItemCode: 2, Quantity: 3 }],
    ResultItems: [{ ItemCode: 3, Quantity: 1 }],
    ResultEffectDescs: ['Forges a sword'],
  },
  recipe_3: {
    InternalName: 'CookCarrot',
    Skill: 'Cooking',
    SkillLevelReq: 1,
    Ingredients: [],
    ResultItems: [],
    ResultEffectDescs: [],
  },
};

describe('runFindRecipes', () => {
  it('zod refine rejects calls with no filter', () => {
    assert.throws(() => FindRecipesInput.parse({}), /at least one filter/i);
  });

  it('skill filter narrows via index', async () => {
    const m = primeManager({ items, recipes });
    const out = await runFindRecipes({ skill: 'Cooking', limit: 50, offset: 0, role: 'any' as never } as never, m);
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'recipe_3');
  });

  it('result_internal_name uses the cross-source index', async () => {
    const m = primeManager({ items, recipes });
    const out = await runFindRecipes({ result_internal_name: 'IronBar', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'recipe_1');
  });

  it('ingredient_internal_name uses the cross-source index', async () => {
    const m = primeManager({ items, recipes });
    const out = await runFindRecipes({ ingredient_internal_name: 'IronBar', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'recipe_2');
  });

  it('field projection trims to requested fields', async () => {
    const m = primeManager({ items, recipes });
    const out = await runFindRecipes(
      { skill: 'Blacksmithing', fields: ['InternalName'], limit: 50, offset: 0 } as never,
      m,
    );
    for (const r of out.items) {
      assert.deepEqual(Object.keys(r.data), ['InternalName']);
    }
  });

  it('limit + truncated marker behaves correctly', async () => {
    const m = primeManager({ items, recipes });
    const out = await runFindRecipes({ skill: 'Blacksmithing', limit: 1, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 2);
    assert.equal(out.summary.returned, 1);
    assert.equal(out.summary.truncated, true);
  });
});
