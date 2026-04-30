import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

const SEARCHABLE_FIELDS = [
  'AttributesThatDeltaCritChance',
  'AttributesThatModCritDamage',
  'MustHaveAbilityKeywords',
] as const;

export const FindAbilitykeywordsInput = z
  .object({
    /** Case-insensitive substring; matched across the searchable string-array fields. */
    keyword_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('keyword_contains'), {
    message: 'find_abilitykeywords requires at least one filter field',
  });

export type FindAbilitykeywordsArgs = z.infer<typeof FindAbilitykeywordsInput>;

export async function runFindAbilitykeywords(args: FindAbilitykeywordsArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('abilitykeywords'));

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

function matchesFilters(entry: Entry, args: FindAbilitykeywordsArgs): boolean {
  if (args.keyword_contains) {
    const needle = args.keyword_contains.toLowerCase();
    const found = SEARCHABLE_FIELDS.some((field) => {
      const arr = entry[field];
      if (!Array.isArray(arr)) return false;
      return arr.some((item) => typeof item === 'string' && item.toLowerCase().includes(needle));
    });
    if (!found) return false;
  }
  return true;
}
