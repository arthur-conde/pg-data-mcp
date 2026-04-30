import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindLorebooksInput = z
  .object({
    /** Exact match for Title. */
    title: z.string().min(1).optional(),
    /** Case-insensitive substring on Title. */
    title_contains: z.string().min(1).optional(),
    /** Exact match for InternalName. */
    internal_name: z.string().min(1).optional(),
    /** Case-insensitive substring on InternalName. */
    internal_name_contains: z.string().min(1).optional(),
    /** Exact match for Category. */
    category: z.string().min(1).optional(),
    /** Case-insensitive substring matched against any element of Keywords. */
    keyword_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter(
      'title',
      'title_contains',
      'internal_name',
      'internal_name_contains',
      'category',
      'keyword_contains',
    ),
    { message: 'find_lorebooks requires at least one filter field' },
  );

export type FindLorebooksArgs = z.infer<typeof FindLorebooksInput>;

export async function runFindLorebooks(args: FindLorebooksArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('lorebooks'));

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

function matchesFilters(entry: Entry, args: FindLorebooksArgs): boolean {
  if (args.title && entry.Title !== args.title) return false;
  if (args.title_contains) {
    const needle = args.title_contains.toLowerCase();
    if (typeof entry.Title !== 'string' || !entry.Title.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (args.internal_name && entry.InternalName !== args.internal_name) return false;
  if (args.internal_name_contains) {
    const needle = args.internal_name_contains.toLowerCase();
    if (typeof entry.InternalName !== 'string' || !entry.InternalName.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (args.category && entry.Category !== args.category) return false;
  if (args.keyword_contains) {
    const needle = args.keyword_contains.toLowerCase();
    const kws = Array.isArray(entry.Keywords) ? entry.Keywords : [];
    if (!kws.some((k) => typeof k === 'string' && k.toLowerCase().includes(needle))) return false;
  }
  return true;
}
