import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runItemSources, ItemSourcesInput } from '../../src/tools/item-sources.js';
import { primeManager } from '../helpers/prime.js';

const items: Record<string, unknown> = {
  item_1: { InternalName: 'IronOre', Name: 'Iron Ore' },
};
const sources_items: Record<string, unknown> = {
  item_1: [
    { Monster: 'WolfMonster', Source: 'Loot' },
    { Interactor: 'Jakob', Source: 'Vendor' },
    { Recipe: 'SmeltIron', Source: 'Recipe' },
    { Quest: 'Q1', Source: 'Quest' },
  ],
};
const npcs: Record<string, unknown> = {
  npc_42: { InternalName: 'Jakob', AreaName: 'Serbule' },
};
const recipes: Record<string, unknown> = {
  recipe_5: { InternalName: 'SmeltIron', Skill: 'Blacksmithing' },
};
const quests: Record<string, unknown> = {
  quest_9: { InternalName: 'Q1', FavorNpc: 'Marna', Area: 'Serbule' },
};
const strings_all: Record<string, unknown> = { npc_42_Name: 'Jakob the Smith' };

describe('runItemSources', () => {
  it('rejects when neither internal_name nor item_id is provided', () => {
    assert.throws(() => ItemSourcesInput.parse({}), /exactly one/i);
  });
  it('rejects when both are provided', () => {
    assert.throws(() => ItemSourcesInput.parse({ internal_name: 'X', item_id: 1 }), /exactly one/i);
  });

  it('returns found:false for an unknown item', async () => {
    const m = primeManager({ items, sources_items, npcs, recipes, quests, strings_all });
    const out = await runItemSources({ internal_name: 'Nope' } as never, m);
    assert.equal(out.found, false);
  });

  it('augments NPC, recipe, and quest references and keeps raw context', async () => {
    const m = primeManager({ items, sources_items, npcs, recipes, quests, strings_all });
    const out = await runItemSources({ internal_name: 'IronOre' } as never, m);
    assert.equal(out.found, true);
    assert.equal(out.internal_name, 'IronOre');
    const augmented = out.sources!;
    assert.equal(augmented.length, 4);

    // Monster row keeps raw Monster context (not dropped, per the .NET-improvement note).
    const monster = augmented[0] as { raw: { Monster: string } };
    assert.equal(monster.raw.Monster, 'WolfMonster');

    const npcRow = augmented[1] as { raw: unknown; npc_display_name?: string; npc_key?: string };
    assert.equal(npcRow.npc_display_name, 'Jakob the Smith');
    assert.equal(npcRow.npc_key, 'npc_42');

    const recipeRow = augmented[2] as { recipe_internal_name?: string };
    assert.equal(recipeRow.recipe_internal_name, 'SmeltIron');

    const questRow = augmented[3] as { quest_internal_name?: string };
    assert.equal(questRow.quest_internal_name, 'Q1');
  });
});
