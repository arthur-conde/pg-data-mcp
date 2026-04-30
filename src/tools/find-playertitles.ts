import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindPlayertitlesInput = z
  .object({
    /** Exact match for Title. */
    title: z.string().min(1).optional(),
    /** Case-insensitive substring on Title. */
    title_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('title', 'title_contains'), {
    message: 'find_playertitles requires at least one filter field',
  });

export type FindPlayertitlesArgs = z.infer<typeof FindPlayertitlesInput>;

export async function runFindPlayertitles(args: FindPlayertitlesArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('playertitles'));

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

function matchesFilters(entry: Entry, args: FindPlayertitlesArgs): boolean {
  if (args.title && entry.Title !== args.title) return false;
  if (args.title_contains) {
    const needle = args.title_contains.toLowerCase();
    if (typeof entry.Title !== 'string' || !entry.Title.toLowerCase().includes(needle)) {
      return false;
    }
  }
  return true;
}
