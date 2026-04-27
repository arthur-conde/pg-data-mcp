import { z } from 'zod';
import { allSources } from '../sources/registry.js';
import type { SourceManager } from '../sources/manager.js';

export const ListSourcesInput = z.object({
  /** When true, only return sources actually loaded into memory. */
  loaded_only: z.boolean().optional().default(false),
});

export type ListSourcesArgs = z.infer<typeof ListSourcesInput>;

export async function runListSources(args: ListSourcesArgs, manager: SourceManager) {
  const loaded = manager.loaded();
  const loadedMap = new Map(loaded.map((s) => [s.source, s]));

  const list = args.loaded_only ? loaded.map((s) => s.source) : allSources;
  const version = await manager.resolveVersion();

  return {
    version,
    sources: list.map((name) => {
      const l = loadedMap.get(name);
      return {
        name,
        loaded: l !== undefined,
        ...(l
          ? {
              entryCount: Object.keys(l.data).length,
              fetchedAt: l.fetchedAt.toISOString(),
              etag: l.etag,
              url: l.url,
            }
          : {}),
      };
    }),
  };
}
