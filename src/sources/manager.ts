import { detectCdnVersion } from '../cdn/version-detector.js';
import type { ServerConfig } from '../config.js';
import {
  buildAbilityIndexes,
  buildEffectIndexes,
  buildItemIndexes,
  buildNpcIndexes,
  buildQuestIndexes,
  buildRecipeIndexes,
  type AbilityIndexes,
  type EffectIndexes,
  type ItemIndexes,
  type NpcIndexes,
  type QuestIndexes,
  type RecipeIndexes,
} from './indexes.js';
import { SourceLoader, type LoadedSource } from './loader.js';
import type { SourceName } from './registry.js';

/**
 * Top-level coordinator: detects the CDN version once per process, hands it
 * to the loader for every fetch, and lazily builds the indexes the tool
 * layer needs. Tools talk to this; the loader and indexes stay private.
 *
 * Per-source index builders are wired through `indexed<T>()` so a single
 * cache map covers items / recipes / npcs / effects / quests / abilities.
 * Recipes need items as a join input — `recipes()` awaits `items()` first,
 * so the first recipe query against a fresh server fetches *two* sources.
 */
export class SourceManager {
  private readonly loader: SourceLoader;
  private detectedVersion: string | null = null;
  private readonly indexCache = new Map<string, unknown>();

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
    this.indexCache.clear();
  }

  /** Drop a single source from memory (and any cached indexes for it). */
  evict(source: SourceName): void {
    if (!this.detectedVersion) return;
    this.loader.evict(this.detectedVersion, source);
    this.indexCache.delete(`${this.detectedVersion}::${source}`);
  }

  async load(source: SourceName): Promise<LoadedSource> {
    const version = await this.resolveVersion();
    return this.loader.get(version, source);
  }

  /** Re-fetch a single source with revalidation. Returns the new (or 304-bumped) entry. */
  async revalidate(source: SourceName): Promise<LoadedSource> {
    const version = await this.resolveVersion();
    this.indexCache.delete(`${version}::${source}`);
    return this.loader.revalidate(version, source);
  }

  loaded(): LoadedSource[] {
    return this.loader.loadedSources();
  }

  private async indexed<T>(
    source: SourceName,
    build: (loaded: LoadedSource) => Promise<T> | T,
  ): Promise<{ source: LoadedSource; indexes: T }> {
    const loaded = await this.load(source);
    const key = `${loaded.version}::${source}`;
    let indexes = this.indexCache.get(key) as T | undefined;
    if (!indexes) {
      indexes = await build(loaded);
      this.indexCache.set(key, indexes);
    }
    return { source: loaded, indexes };
  }

  items(): Promise<{ source: LoadedSource; indexes: ItemIndexes }> {
    return this.indexed('items', (l) => buildItemIndexes(l.data));
  }

  recipes(): Promise<{ source: LoadedSource; indexes: RecipeIndexes }> {
    return this.indexed('recipes', async (l) => {
      const { indexes: items } = await this.items();
      return buildRecipeIndexes(l.data, items);
    });
  }

  npcs(): Promise<{ source: LoadedSource; indexes: NpcIndexes }> {
    return this.indexed('npcs', (l) => buildNpcIndexes(l.data));
  }

  effects(): Promise<{ source: LoadedSource; indexes: EffectIndexes }> {
    return this.indexed('effects', (l) => buildEffectIndexes(l.data));
  }

  quests(): Promise<{ source: LoadedSource; indexes: QuestIndexes }> {
    return this.indexed('quests', (l) => buildQuestIndexes(l.data));
  }

  abilities(): Promise<{ source: LoadedSource; indexes: AbilityIndexes }> {
    return this.indexed('abilities', (l) => buildAbilityIndexes(l.data));
  }

  /** Whether a version was detected from the CDN (vs falling back). Useful for diagnostics. */
  detectedFromCdn(): boolean {
    return this.detectedVersion !== null && this.detectedVersion !== this.config.fallbackVersion;
  }
}
