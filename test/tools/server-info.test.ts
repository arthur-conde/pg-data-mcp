import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runServerInfo } from '../../src/tools/server-info.js';
import { SERVER_VERSION } from '../../src/version.js';
import { primeManager } from '../helpers/prime.js';

describe('runServerInfo', () => {
  it('returns the package version + reference-data version', async () => {
    const m = primeManager({});
    const out = await runServerInfo({}, m);
    assert.equal(out.server.name, 'pg-data');
    assert.equal(out.server.version, SERVER_VERSION);
    assert.equal(typeof out.server.version, 'string');
    assert.match(out.server.version, /^\d+\.\d+\.\d+/);
    assert.equal(out.referenceData.version, 'v0test');
    assert.equal(out.referenceData.detected, false);
  });
});
