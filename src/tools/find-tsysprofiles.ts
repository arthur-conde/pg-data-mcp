import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

/**
 * `tsysprofiles.json` entries either are themselves an array of effect
 * strings, or an object whose `effects` field holds that array. Both shapes
 * appear in the bundled data, so we accept either.
 */
export const FindTsysprofilesInput = z
  .object({
    /** Case-insensitive substring matched against any element of the entry's effect array. */
    effect_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('effect_contains'), {
    message: 'find_tsysprofiles requires at least one filter field',
  });

export type FindTsysprofilesArgs = z.infer<typeof FindTsysprofilesInput>;

export async function runFindTsysprofiles(args: FindTsysprofilesArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('tsysprofiles'));

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

function matchesFilters(entry: Entry, args: FindTsysprofilesArgs): boolean {
  if (args.effect_contains) {
    const needle = args.effect_contains.toLowerCase();
    const effects = readEffects(entry);
    if (!effects.some((e) => e.toLowerCase().includes(needle))) return false;
  }
  return true;
}

function readEffects(entry: Entry): string[] {
  const direct = (entry as unknown as { effects?: unknown }).effects;
  const arr = Array.isArray(direct) ? direct : [];
  return arr.filter((x): x is string => typeof x === 'string');
}
