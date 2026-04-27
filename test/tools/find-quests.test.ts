import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runFindQuests, FindQuestsInput } from '../../src/tools/find-quests.js';
import { primeManager } from '../helpers/prime.js';

const quests: Record<string, unknown> = {
  quest_1: {
    InternalName: 'Q1',
    FavorNpc: 'Marna',
    Area: 'Serbule',
    Repeatable: false,
    Requirements: { Sword: 5 },
    Rewards: { Combat: 100 },
    Objectives: [{ Target: 'Wolf' }],
  },
  quest_2: {
    InternalName: 'Q2',
    FavorNpc: 'Marna',
    Area: 'Serbule',
    Repeatable: true,
    Rewards: { Cooking: 50 },
    Objectives: [{ Target: 'Mushroom' }, { Target: 'Carrot' }],
  },
  quest_3: {
    InternalName: 'Q3',
    FavorNpc: 'Hulon',
    Area: 'Eltibule',
    Repeatable: false,
    Requirements: { Bow: 10 },
    Rewards: { Combat: 200 },
    Objectives: [{ Target: 'Bear' }],
  },
};

describe('runFindQuests', () => {
  it('zod refine rejects calls with no filter', () => {
    assert.throws(() => FindQuestsInput.parse({}), /at least one filter/i);
  });

  it('area filter narrows via index', async () => {
    const m = primeManager({ quests });
    const out = await runFindQuests({ area: 'Serbule', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 2);
  });

  it('favor_npc filter narrows via index', async () => {
    const m = primeManager({ quests });
    const out = await runFindQuests({ favor_npc: 'Hulon', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'quest_3');
  });

  it('requires_skill matches Requirements key', async () => {
    const m = primeManager({ quests });
    const out = await runFindQuests({ requires_skill: 'Sword', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'quest_1');
  });

  it('repeatable boolean filter narrows', async () => {
    const m = primeManager({ quests });
    const out = await runFindQuests({ repeatable: true, limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'quest_2');
  });

  it('field projection trims', async () => {
    const m = primeManager({ quests });
    const out = await runFindQuests(
      { area: 'Serbule', fields: ['InternalName'], limit: 50, offset: 0 } as never,
      m,
    );
    for (const r of out.items) assert.deepEqual(Object.keys(r.data), ['InternalName']);
  });

  it('limit triggers truncated marker', async () => {
    const m = primeManager({ quests });
    const out = await runFindQuests({ area: 'Serbule', limit: 1, offset: 0 } as never, m);
    assert.equal(out.summary.returned, 1);
    assert.equal(out.summary.truncated, true);
  });
});
