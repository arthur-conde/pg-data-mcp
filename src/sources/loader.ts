import { fetchSource } from '../cdn/fetcher.js';
import type { ServerConfig } from '../config.js';
import type { SourceName } from './registry.js';

/**
 * Lazy-loads each source on first access and keeps the parsed JSON in memory
 * keyed by `{version, source}`. Subsequent queries against the same version
 * hit memory; no re-fetch unless the caller explicitly refreshes.
 *
 * The shape of each loaded source is `{ "key_N": object }` for almost every
 * file (items, recipes, npcs, quests, effects, ...). `strings_all.json` is
 * a flat string -> string map. We type both as `Record<string, unknown>`
 * here and let the tool layer narrow it.
 */
export interface LoadedSource {
  version: string;
  source: SourceName;
  url: string;
  fetchedAt: Date;
  data: Record<string, unknown>;
}

export class SourceLoader {
  private readonly cache = new Map<string, LoadedSource>();

  constructor(private readonly config: ServerConfig) {}

  cacheKey(version: string, source: SourceName): string {
    return `${version}::${source}`;
  }

  async get(version: string, source: SourceName): Promise<LoadedSource> {
    const key = this.cacheKey(version, source);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const fetched = await fetchSource({
      cdnRoot: this.config.cdnRoot,
      version,
      source,
      timeoutMs: this.config.fetchTimeoutMs,
    });
    const parsed = JSON.parse(fetched.body.toString('utf8')) as Record<string, unknown>;
    const loaded: LoadedSource = {
      version: fetched.version,
      source,
      url: fetched.url,
      fetchedAt: fetched.fetchedAt,
      data: parsed,
    };
    this.cache.set(key, loaded);
    return loaded;
  }

  /** Returns the in-memory loaded source if present, without fetching. */
  peek(version: string, source: SourceName): LoadedSource | undefined {
    return this.cache.get(this.cacheKey(version, source));
  }

  /** Forgets every cached source — used by the future `refresh` tool. */
  clear(): void {
    this.cache.clear();
  }

  loadedSources(): LoadedSource[] {
    return Array.from(this.cache.values());
  }
}
