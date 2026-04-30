import { z } from 'zod';
import type { Entry, Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

/**
 * `lorebookinfo.json` is wrapped in a top-level `Categories` object — the
 * actual category records live one level down. We unwrap that here so the
 * standard `[key, entry]` contract still applies.
 */
export const FindLorebookinfoInput = z
  .object({
    /** Exact match for Title. */
    title: z.string().min(1).optional(),
    /** Case-insensitive substring on Title. */
    title_contains: z.string().min(1).optional(),
    /** Case-insensitive substring on SubTitle. */
    subtitle_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('title', 'title_contains', 'subtitle_contains'), {
    message: 'find_lorebookinfo requires at least one filter field',
  });

export type FindLorebookinfoArgs = z.infer<typeof FindLorebookinfoInput>;

export async function runFindLorebookinfo(args: FindLorebookinfoArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('lorebookinfo'));

  const stream = streamHits(scanCategories(loaded.data), (entry) => matchesFilters(entry, args), {
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

function* scanCategories(data: Record<string, unknown>): IterableIterator<Hit> {
  const categories = data.Categories;
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) return;
  for (const [k, v] of Object.entries(categories as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) yield [k, v as Entry];
  }
}

function matchesFilters(entry: Entry, args: FindLorebookinfoArgs): boolean {
  if (args.title && entry.Title !== args.title) return false;
  if (args.title_contains) {
    const needle = args.title_contains.toLowerCase();
    if (typeof entry.Title !== 'string' || !entry.Title.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (args.subtitle_contains) {
    const needle = args.subtitle_contains.toLowerCase();
    if (typeof entry.SubTitle !== 'string' || !entry.SubTitle.toLowerCase().includes(needle)) {
      return false;
    }
  }
  return true;
}
