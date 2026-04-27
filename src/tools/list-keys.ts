import { z } from 'zod';
import { allSources, type SourceName } from '../sources/registry.js';
import type { SourceManager } from '../sources/manager.js';
import { surfaceSourceError } from '../util/source-errors.js';

export const ListKeysInput = z.object({
  source: z.enum(allSources as unknown as [SourceName, ...SourceName[]]),
  /** Optional case-sensitive prefix filter (e.g. "item_"). */
  prefix: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(200),
  offset: z.number().int().min(0).default(0),
});

export type ListKeysArgs = z.infer<typeof ListKeysInput>;

export async function runListKeys(args: ListKeysArgs, manager: SourceManager) {
  const loaded = await surfaceSourceError(() => manager.load(args.source));
  const allKeys = Object.keys(loaded.data);
  const filtered = args.prefix ? allKeys.filter((k) => k.startsWith(args.prefix!)) : allKeys;
  const total = filtered.length;
  const slice = filtered.slice(args.offset, args.offset + args.limit);
  return {
    source: args.source,
    version: loaded.version,
    total,
    returned: slice.length,
    truncated: args.offset + slice.length < total,
    keys: slice,
  };
}
