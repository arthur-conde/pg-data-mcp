import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildSourceUrl } from '../../src/cdn/fetcher.js';

describe('buildSourceUrl', () => {
  it('joins root + version + source with the canonical /data/ path', () => {
    const url = buildSourceUrl({
      cdnRoot: 'https://cdn.projectgorgon.com/',
      version: 'v469',
      source: 'items',
      timeoutMs: 30_000,
    });
    assert.equal(url, 'https://cdn.projectgorgon.com/v469/data/items.json');
  });

  it('adds a trailing slash to the root if missing', () => {
    const url = buildSourceUrl({
      cdnRoot: 'https://cdn.projectgorgon.com',
      version: 'v470',
      source: 'recipes',
      timeoutMs: 30_000,
    });
    assert.equal(url, 'https://cdn.projectgorgon.com/v470/data/recipes.json');
  });
});
