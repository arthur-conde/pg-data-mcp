import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runFindNpcs, FindNpcsInput } from '../../src/tools/find-npcs.js';
import { primeManager } from '../helpers/prime.js';

const npcs: Record<string, unknown> = {
  npc_1: {
    InternalName: 'Jakob',
    AreaName: 'Serbule',
    Likes: ['BeerKeyword'],
    Loves: ['MeatKeyword'],
    Dislikes: [],
    Hates: ['FishKeyword'],
    AvailableServices: ['Trade', 'Recipes'],
  },
  npc_2: {
    InternalName: 'Marna',
    AreaName: 'Serbule',
    Likes: ['BookKeyword'],
    Loves: [],
    Dislikes: ['MeatKeyword'],
    Hates: [],
    AvailableServices: ['Trade'],
  },
  npc_3: {
    InternalName: 'Sir Coth',
    AreaName: 'EltibuleCastle',
    Likes: [],
    Loves: ['FishKeyword'],
    Dislikes: [],
    Hates: [],
    AvailableServices: ['Trade'],
  },
};

describe('runFindNpcs', () => {
  it('zod refine rejects calls with no filter', () => {
    assert.throws(() => FindNpcsInput.parse({}), /at least one filter/i);
  });

  it('area filter narrows via index', async () => {
    const m = primeManager({ npcs });
    const out = await runFindNpcs({ area: 'Serbule', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 2);
  });

  it('loves filter buckets through gift index and partitions by sentiment', async () => {
    const m = primeManager({ npcs });
    const out = await runFindNpcs({ loves: 'FishKeyword', limit: 50, offset: 0 } as never, m);
    // Sir Coth loves fish; Jakob hates fish — only Sir Coth matches the loves filter.
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'npc_3');
  });

  it('service substring filter works', async () => {
    const m = primeManager({ npcs });
    const out = await runFindNpcs({ service: 'recipe', limit: 50, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 1);
    assert.equal(out.items[0]?.key, 'npc_1');
  });

  it('field projection trims', async () => {
    const m = primeManager({ npcs });
    const out = await runFindNpcs(
      { area: 'Serbule', fields: ['InternalName'], limit: 50, offset: 0 } as never,
      m,
    );
    for (const r of out.items) assert.deepEqual(Object.keys(r.data), ['InternalName']);
  });

  it('limit triggers truncated marker', async () => {
    const m = primeManager({ npcs });
    const out = await runFindNpcs({ area: 'Serbule', limit: 1, offset: 0 } as never, m);
    assert.equal(out.summary.matched, 2);
    assert.equal(out.summary.returned, 1);
    assert.equal(out.summary.truncated, true);
  });
});
