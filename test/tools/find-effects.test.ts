import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runFindEffects, FindEffectsInput } from '../../src/tools/find-effects.js';
import { primeManager } from '../helpers/prime.js';

const effects: Record<string, unknown> = {
  effect_1: {
    Name: 'NetheriteSpec',
    Desc: 'Boosts mining output',
    Mods: { Mining: 1.2, Damage: 0 },
  },
  effect_2: {
    Name: 'IronGuard',
    Desc: 'Defensive iron buff',
    Mods: { Armor: 5 },
  },
  effect_3: {
    Name: 'Iron Strike',
    Desc: 'Iron-themed melee strike',
    Mods: { Damage: 10 },
  },
};

describe('runFindEffects', () => {
  it('zod refine rejects calls with no filter', () => {
    assert.throws(() => FindEffectsInput.parse({}), /at least one filter/i);
  });

  it('mod_name filter narrows', async () => {
    const m = primeManager({ effects });
    const out = await runFindEffects({ mod_name: 'Damage', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 2);
  });

  it('single-token search uses the token index', async () => {
    const m = primeManager({ effects });
    const out = await runFindEffects({ token: 'mining', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'effect_1');
  });

  it('multi-token search AND-intersects token buckets', async () => {
    const m = primeManager({ effects });
    const out = await runFindEffects({ token: 'iron strike', limit: 50, offset: 0 } as never, m);
    // "iron" matches effect_2 + effect_3; "strike" only matches effect_3 (Desc has neither for #2).
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'effect_3');
  });

  it('field projection trims', async () => {
    const m = primeManager({ effects });
    const out = await runFindEffects(
      { token: 'iron', fields: ['Name'], limit: 50, offset: 0 } as never,
      m,
    );
    for (const r of out.items) assert.deepEqual(Object.keys(r.data), ['Name']);
  });

  it('limit triggers truncated marker', async () => {
    const m = primeManager({ effects });
    const out = await runFindEffects({ token: 'iron', limit: 1, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 2);
    assert.equal(out.summary.returned, 1);
    assert.equal(out.summary.truncated, true);
  });
});
