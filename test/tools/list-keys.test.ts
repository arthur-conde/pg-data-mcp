import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runListKeys } from '../../src/tools/list-keys.js';
import { primeManager } from '../helpers/prime.js';

const items: Record<string, unknown> = {
  item_1: {},
  item_2: {},
  item_3: {},
  weapon_1: {},
  weapon_2: {},
};

describe('runListKeys', () => {
  it('returns every key when no prefix is given', async () => {
    const m = primeManager({ items });
    const out = await runListKeys({ source: 'items', limit: 200, offset: 0 }, m);
    assert.equal(out.total, 5);
    assert.equal(out.returned, 5);
    assert.equal(out.truncated, false);
  });

  it('prefix filter narrows the keys', async () => {
    const m = primeManager({ items });
    const out = await runListKeys({ source: 'items', prefix: 'weapon_', limit: 200, offset: 0 }, m);
    assert.equal(out.total, 2);
    assert.deepEqual(out.keys.sort(), ['weapon_1', 'weapon_2']);
  });

  it('paging: limit + offset', async () => {
    const m = primeManager({ items });
    const out = await runListKeys({ source: 'items', prefix: 'item_', limit: 1, offset: 1 }, m);
    assert.equal(out.total, 3);
    assert.equal(out.returned, 1);
    assert.equal(out.truncated, true);
    assert.deepEqual(out.keys, ['item_2']);
  });
});
