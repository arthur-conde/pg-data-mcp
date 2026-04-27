import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runQuestsInArea } from '../../src/tools/quests-in-area.js';
import { primeManager } from '../helpers/prime.js';

const quests: Record<string, unknown> = {
  q1: { InternalName: 'Q1', Area: 'Serbule', Repeatable: false, Requirements: { Sword: 5 } },
  q2: { InternalName: 'Q2', Area: 'Serbule', Repeatable: true },
  q3: { InternalName: 'Q3', Area: 'Eltibule', Repeatable: false },
};

describe('runQuestsInArea', () => {
  it('returns quests in the named area', async () => {
    const m = primeManager({ quests });
    const out = await runQuestsInArea({ area: 'Serbule', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 2);
  });

  it('repeatable filter narrows', async () => {
    const m = primeManager({ quests });
    const out = await runQuestsInArea(
      { area: 'Serbule', repeatable: false, limit: 50, offset: 0 } as never,
      m,
    );
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'q1');
  });

  it('requires_skill filter narrows', async () => {
    const m = primeManager({ quests });
    const out = await runQuestsInArea(
      { area: 'Serbule', requires_skill: 'Sword', limit: 50, offset: 0 } as never,
      m,
    );
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'q1');
  });
});
