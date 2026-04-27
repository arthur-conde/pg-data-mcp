import { detectCdnVersion } from '../cdn/version-detector.js';
import type { ServerConfig } from '../config.js';
import { buildItemIndexes, type ItemIndexes } from './indexes.js';
import { SourceLoader, type LoadedSource } from './loader.js';
import type { SourceName } from './registry.js';

/**
 * Top-level coordinator: detects the CDN version once per process, hands it
 * to the loader for every fetch, and lazily builds the indexes the tool
 * layer needs. Tools talk to this; the loader and indexes stay private.
 */
export class SourceManager {
  private readonly loader: SourceLoader;
  private detectedVersion: string | null = null;
  private readonly itemIndexCache = new Map<string, ItemIndexes>();

  constructor(private readonly config: ServerConfig) {
    this.loader = new SourceLoader(config);
  }

  async resolveVersion(): Promise<string> {
    if (this.detectedVersion) return this.detectedVersion;
    const detected = await detectCdnVersion({
      cdnRoot: this.config.cdnRoot,
      timeoutMs: this.config.fetchTimeoutMs,
    });
    this.detectedVersion = detected ?? this.config.fallbackVersion;
    return this.detectedVersion;
  }

  /** Force re-detection on the next call. Use after the user knows a patch landed. */
  forgetVersion(): void {
    this.detectedVersion = null;
    this.loader.clear();
    this.itemIndexCache.clear();
  }

  async load(source: SourceName): Promise<LoadedSource> {
    const version = await this.resolveVersion();
    return this.loader.get(version, source);
  }

  loaded(): LoadedSource[] {
    return this.loader.loadedSources();
  }

  async items(): Promise<{ source: LoadedSource; indexes: ItemIndexes }> {
    const source = await this.load('items');
    const cacheKey = `${source.version}::items`;
    let indexes = this.itemIndexCache.get(cacheKey);
    if (!indexes) {
      indexes = buildItemIndexes(source.data);
      this.itemIndexCache.set(cacheKey, indexes);
    }
    return { source, indexes };
  }

  /** Whether a version was detected from the CDN (vs falling back). Useful for diagnostics. */
  detectedFromCdn(): boolean {
    return this.detectedVersion !== null && this.detectedVersion !== this.config.fallbackVersion;
  }
}
