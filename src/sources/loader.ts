import { fetchSource } from '../cdn/fetcher.js';
import type { ServerConfig } from '../config.js';
import { DiskCache } from './disk-cache.js';
import type { SourceName } from './registry.js';

/**
 * Lazy-loads each source on first access and keeps the parsed JSON in memory
 * keyed by `{version, source}`. Subsequent queries against the same version
 * hit memory; no re-fetch unless the caller explicitly refreshes.
 *
 * When `PG_DATA_CACHE_DIR` is set, the loader also reads/writes a disk cache
 * — memory miss falls back to disk before reaching the CDN, and any CDN
 * fetch is mirrored to disk via atomic write.
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
  etag: string | null;
  lastModified: string | null;
  data: Record<string, unknown>;
}

export class SourceLoader {
  private readonly cache = new Map<string, LoadedSource>();
  private readonly disk: DiskCache | null;

  constructor(private readonly config: ServerConfig) {
    this.disk = config.cacheDir ? new DiskCache(config.cacheDir) : null;
  }

  cacheKey(version: string, source: SourceName): string {
    return `${version}::${source}`;
  }

  async get(version: string, source: SourceName): Promise<LoadedSource> {
    const key = this.cacheKey(version, source);
    const cached = this.cache.get(key);
    if (cached) return cached;

    if (this.disk) {
      const onDisk = await this.disk.read(version, source);
      if (onDisk) {
        const parsed = JSON.parse(onDisk.body.toString('utf8')) as Record<string, unknown>;
        const loaded: LoadedSource = {
          version,
          source,
          url: buildLoadedUrl(this.config.cdnRoot, version, source),
          fetchedAt: new Date(onDisk.meta.fetchedAt),
          etag: onDisk.meta.etag,
          lastModified: onDisk.meta.lastModified,
          data: parsed,
        };
        this.cache.set(key, loaded);
        return loaded;
      }
    }

    return this.fetchAndStore(version, source);
  }

  /**
   * Re-fetch the source from the CDN, sending If-None-Match / If-Modified-Since
   * if we already have it cached. On 304 the in-memory entry is reused and
   * its fetchedAt is bumped. Used by the v0.3 `refresh` tool.
   */
  async revalidate(version: string, source: SourceName): Promise<LoadedSource> {
    const key = this.cacheKey(version, source);
    const cached = this.cache.get(key);
    const fetched = await fetchSource({
      cdnRoot: this.config.cdnRoot,
      version,
      source,
      timeoutMs: this.config.fetchTimeoutMs,
      ifNoneMatch: cached?.etag ?? null,
      ifModifiedSince: cached?.lastModified ?? null,
    });
    if (fetched.notModified && cached) {
      const bumped: LoadedSource = { ...cached, fetchedAt: fetched.fetchedAt };
      this.cache.set(key, bumped);
      if (this.disk) {
        await this.disk.touch(version, source, {
          etag: cached.etag,
          lastModified: cached.lastModified,
          fetchedAt: bumped.fetchedAt.toISOString(),
          // sha256 unchanged — read it from the existing on-disk entry; if
          // it's missing, write() will recompute on the next miss.
          sha256: (await this.disk.read(version, source))?.meta.sha256 ?? '',
        });
      }
      return bumped;
    }
    return this.storeFetched(version, source, fetched);
  }

  private async fetchAndStore(version: string, source: SourceName): Promise<LoadedSource> {
    const fetched = await fetchSource({
      cdnRoot: this.config.cdnRoot,
      version,
      source,
      timeoutMs: this.config.fetchTimeoutMs,
    });
    return this.storeFetched(version, source, fetched);
  }

  private async storeFetched(
    version: string,
    source: SourceName,
    fetched: Awaited<ReturnType<typeof fetchSource>>,
  ): Promise<LoadedSource> {
    const parsed = JSON.parse(fetched.body.toString('utf8')) as Record<string, unknown>;
    const loaded: LoadedSource = {
      version: fetched.version,
      source,
      url: fetched.url,
      fetchedAt: fetched.fetchedAt,
      etag: fetched.etag,
      lastModified: fetched.lastModified,
      data: parsed,
    };
    this.cache.set(this.cacheKey(version, source), loaded);
    if (this.disk) {
      await this.disk.write(version, source, fetched.body, {
        etag: fetched.etag,
        lastModified: fetched.lastModified,
        fetchedAt: fetched.fetchedAt.toISOString(),
      });
    }
    return loaded;
  }

  /** Returns the in-memory loaded source if present, without fetching. */
  peek(version: string, source: SourceName): LoadedSource | undefined {
    return this.cache.get(this.cacheKey(version, source));
  }

  /** Drop a single in-memory entry — disk cache (if any) is untouched. */
  evict(version: string, source: SourceName): void {
    this.cache.delete(this.cacheKey(version, source));
  }

  /** Forgets every cached source — used by the future `refresh` tool. */
  clear(): void {
    this.cache.clear();
  }

  loadedSources(): LoadedSource[] {
    return Array.from(this.cache.values());
  }
}

function buildLoadedUrl(cdnRoot: string, version: string, source: SourceName): string {
  const root = cdnRoot.endsWith('/') ? cdnRoot : `${cdnRoot}/`;
  return `${root}${version}/data/${source}.json`;
}
