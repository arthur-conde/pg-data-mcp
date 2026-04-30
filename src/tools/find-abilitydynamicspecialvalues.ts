import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindAbilitydynamicspecialvaluesInput = z
  .object({
    /** Exact match for Label. */
    label: z.string().min(1).optional(),
    /** Case-insensitive substring on Label. */
    label_contains: z.string().min(1).optional(),
    /** Filter by ReqAbilityKeywords array. */
    req_ability_keyword: z.string().min(1).optional(),
    /** Filter by ReqEffectKeywords array. */
    req_effect_keyword: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter('label', 'label_contains', 'req_ability_keyword', 'req_effect_keyword'),
    { message: 'find_abilitydynamicspecialvalues requires at least one filter field' },
  );

export type FindAbilitydynamicspecialvaluesArgs = z.infer<
  typeof FindAbilitydynamicspecialvaluesInput
>;

export async function runFindAbilitydynamicspecialvalues(
  args: FindAbilitydynamicspecialvaluesArgs,
  manager: SourceManager,
) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('abilitydynamicspecialvalues'));

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

function matchesFilters(entry: Entry, args: FindAbilitydynamicspecialvaluesArgs): boolean {
  if (args.label && entry.Label !== args.label) return false;
  if (args.label_contains) {
    const needle = args.label_contains.toLowerCase();
    if (typeof entry.Label !== 'string' || !entry.Label.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (args.req_ability_keyword && !arrayContains(entry.ReqAbilityKeywords, args.req_ability_keyword)) {
    return false;
  }
  if (args.req_effect_keyword && !arrayContains(entry.ReqEffectKeywords, args.req_effect_keyword)) {
    return false;
  }
  return true;
}

function arrayContains(v: unknown, needle: string): boolean {
  return Array.isArray(v) && v.some((x) => x === needle);
}
