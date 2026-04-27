import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runFindAbilities, FindAbilitiesInput } from '../../src/tools/find-abilities.js';
import { primeManager } from '../helpers/prime.js';

const abilities: Record<string, unknown> = {
  ability_1: { InternalName: 'SwordSlash1', Skill: 'Sword', Level: 1, Keywords: ['Melee'] },
  ability_2: { InternalName: 'SwordSlash2', Skill: 'Sword', Level: 10, Keywords: ['Melee'] },
  ability_3: { InternalName: 'SwordSlash3', Skill: 'Sword', Level: 25, Keywords: ['Melee', 'Special'] },
  ability_4: { InternalName: 'BowShot', Skill: 'Bow', Level: 5, Keywords: ['Ranged'] },
};

describe('runFindAbilities', () => {
  it('zod refine rejects calls with no filter', () => {
    assert.throws(() => FindAbilitiesInput.parse({}), /at least one filter/i);
  });

  it('skill filter buckets via index', async () => {
    const m = primeManager({ abilities });
    const out = await runFindAbilities({ skill: 'Sword', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 3);
  });

  it('level range narrows', async () => {
    const m = primeManager({ abilities });
    const out = await runFindAbilities(
      { skill: 'Sword', min_level: 5, max_level: 20, limit: 50, offset: 0 } as never,
      m,
    );
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'ability_2');
  });

  it('keyword filter narrows', async () => {
    const m = primeManager({ abilities });
    const out = await runFindAbilities({ keyword: 'Special', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'ability_3');
  });

  it('field projection trims', async () => {
    const m = primeManager({ abilities });
    const out = await runFindAbilities(
      { skill: 'Sword', fields: ['InternalName'], limit: 50, offset: 0 } as never,
      m,
    );
    for (const r of out.items) assert.deepEqual(Object.keys(r.data), ['InternalName']);
  });

  it('limit triggers truncated marker', async () => {
    const m = primeManager({ abilities });
    const out = await runFindAbilities({ skill: 'Sword', limit: 1, offset: 0 } as never, m);
    assert.equal(out.summary.returned, 1);
    assert.equal(out.summary.truncated, true);
  });
});
