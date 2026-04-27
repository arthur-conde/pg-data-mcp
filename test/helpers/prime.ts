import { SourceManager } from '../../src/sources/manager.js';
import type { LoadedSource } from '../../src/sources/loader.js';
import type { SourceName } from '../../src/sources/registry.js';

/**
 * Builds a SourceManager with its loader cache pre-populated. Lets tool
 * tests avoid the CDN entirely. Same pattern as the existing
 * find-items.test.ts / resolve-strings.test.ts helpers.
 */
export function primeManager(
  payloads: Partial<Record<SourceName, Record<string, unknown>>>,
): SourceManager {
  const manager = new SourceManager({
    cdnRoot: 'http://127.0.0.1:1/',
    fallbackVersion: 'v0test',
    fetchTimeoutMs: 250,
    cacheDir: null,
  });
  const loader = (manager as unknown as { loader: { cache: Map<string, LoadedSource> } }).loader;
  for (const [source, data] of Object.entries(payloads) as Array<[SourceName, Record<string, unknown>]>) {
    loader.cache.set(`v0test::${source}`, {
      version: 'v0test',
      source,
      url: `http://test/${source}.json`,
      fetchedAt: new Date(0),
      etag: null,
      lastModified: null,
      data,
    });
  }
  (manager as unknown as { detectedVersion: string }).detectedVersion = 'v0test';
  return manager;
}
