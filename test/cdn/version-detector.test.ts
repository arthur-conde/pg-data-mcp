import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { detectCdnVersion } from '../../src/cdn/version-detector.js';

describe('detectCdnVersion', () => {
  it('extracts vNNN from a meta-refresh URL', async () => {
    const body = '<html><meta http-equiv="refresh" content="2; URL=http://cdn.projectgorgon.com/v469/data/index.html"></html>';
    const got = await detectCdnVersion({ cdnRoot: 'unused', timeoutMs: 0, bodyOverride: body });
    assert.equal(got, 'v469');
  });

  it('handles a higher version number', async () => {
    const body = 'whatever ... /v1234/ ... noise';
    const got = await detectCdnVersion({ cdnRoot: 'unused', timeoutMs: 0, bodyOverride: body });
    assert.equal(got, 'v1234');
  });

  it('returns null when no version segment is present', async () => {
    const body = '<html>hello world</html>';
    const got = await detectCdnVersion({ cdnRoot: 'unused', timeoutMs: 0, bodyOverride: body });
    assert.equal(got, null);
  });

  it('returns the first match when multiple candidates exist', async () => {
    const body = '/v100/ ... /v200/';
    const got = await detectCdnVersion({ cdnRoot: 'unused', timeoutMs: 0, bodyOverride: body });
    assert.equal(got, 'v100');
  });
});
