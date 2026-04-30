import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindAiInput = z
  .object({
    mobility_type: z.string().min(1).optional(),
    uncontrolled_pet: z.boolean().optional(),
    /** Case-insensitive substring on the keys of the entry's Abilities map. */
    ability_name_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('mobility_type', 'uncontrolled_pet', 'ability_name_contains'), {
    message: 'find_ai requires at least one filter field',
  });

export type FindAiArgs = z.infer<typeof FindAiInput>;

export async function runFindAi(args: FindAiArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('ai'));

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

function matchesFilters(entry: Entry, args: FindAiArgs): boolean {
  if (args.mobility_type && entry.MobilityType !== args.mobility_type) return false;
  if (args.uncontrolled_pet !== undefined && entry.UncontrolledPet !== args.uncontrolled_pet) {
    return false;
  }
  if (args.ability_name_contains) {
    const needle = args.ability_name_contains.toLowerCase();
    const abilities = entry.Abilities;
    if (!abilities || typeof abilities !== 'object' || Array.isArray(abilities)) return false;
    const keys = Object.keys(abilities as Record<string, unknown>);
    if (!keys.some((k) => k.toLowerCase().includes(needle))) return false;
  }
  return true;
}
