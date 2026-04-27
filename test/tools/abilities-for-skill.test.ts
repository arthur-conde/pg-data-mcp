import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runAbilitiesForSkill } from '../../src/tools/abilities-for-skill.js';
import { primeManager } from '../helpers/prime.js';

const abilities: Record<string, unknown> = {
  ability_1: { InternalName: 'SwordSlash1', Skill: 'Sword', Level: 1 },
  ability_2: { InternalName: 'SwordSlash2', Skill: 'Sword', Level: 10 },
  ability_3: { InternalName: 'BowShot', Skill: 'Bow', Level: 5 },
};
const skills: Record<string, unknown> = {
  skill_a: { Id: 'Sword', Name: 'Sword Skill' },
  skill_b: { Id: 'Bow', Name: 'Bow Skill' },
};
const advancementtables: Record<string, unknown> = {
  adv_1: { Skill: 'Sword', Level: 5, Reward: 'Bonus' },
  adv_2: { Skill: 'Sword', Level: 50, Reward: 'BigBonus' },
  adv_3: { Skill: 'Bow', Level: 5, Reward: 'BowBonus' },
};

describe('runAbilitiesForSkill', () => {
  it('returns abilities for the given skill', async () => {
    const m = primeManager({ abilities, skills, advancementtables });
    const out = await runAbilitiesForSkill({ skill: 'Sword', limit: 100, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 2);
  });

  it('level range narrows abilities and advancement rows', async () => {
    const m = primeManager({ abilities, skills, advancementtables });
    const out = await runAbilitiesForSkill(
      { skill: 'Sword', min_level: 1, max_level: 5, limit: 100, offset: 0 } as never,
      m,
    );
    assert.equal(out.summary.matched, 1);
    assert.equal(out.abilities[0]?.key, 'ability_1');
    const adv = out.advancement as Array<{ Level: number }>;
    assert.equal(adv.length, 1);
    assert.equal(adv[0]?.Level, 5);
  });

  it('joins the matching skill record', async () => {
    const m = primeManager({ abilities, skills, advancementtables });
    const out = await runAbilitiesForSkill({ skill: 'Sword', limit: 100, offset: 0 } as never, m);
    assert.equal((out.skill as { Name: string } | null)?.Name, 'Sword Skill');
  });
});
