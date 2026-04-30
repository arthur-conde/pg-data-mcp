import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindAreasInput = z
  .object({
    /** Exact match for FriendlyName or ShortFriendlyName. */
    name: z.string().min(1).optional(),
    /** Case-insensitive substring on FriendlyName or ShortFriendlyName. */
    name_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('name', 'name_contains'), {
    message: 'find_areas requires at least one filter field',
  });

export type FindAreasArgs = z.infer<typeof FindAreasInput>;

export async function runFindAreas(args: FindAreasArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('areas'));

  const stream = streamHits(scanAll(loaded.data), (entry) => matchesFilters(entry, args), {
    limit: args.limit,
    offset: args.offset,
    fields: args.fields,
  });

  const elapsedMs = Math.round(performance.now() - t0);
  return {
    summary: { version: loaded.version, ...stream.summary, elapsedMs },
    items: stream.items,
  };
}

function matchesFilters(entry: Entry, args: FindAreasArgs): boolean {
  if (args.name) {
    if (entry.FriendlyName !== args.name && entry.ShortFriendlyName !== args.name) return false;
  }
  if (args.name_contains) {
    const needle = args.name_contains.toLowerCase();
    const friendly = typeof entry.FriendlyName === 'string' ? entry.FriendlyName.toLowerCase() : '';
    const short =
      typeof entry.ShortFriendlyName === 'string' ? entry.ShortFriendlyName.toLowerCase() : '';
    if (!friendly.includes(needle) && !short.includes(needle)) return false;
  }
  return true;
}
