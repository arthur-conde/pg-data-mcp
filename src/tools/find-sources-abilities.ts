import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

/**
 * Searches the raw `sources_abilities.json` table — each entry has an
 * `entries` array describing where the ability appears (skill / type pair).
 * For ability records themselves use `find_abilities`.
 */
export const FindSourcesAbilitiesInput = z
  .object({
    /** Match within entry.entries[].skill. */
    skill: z.string().min(1).optional(),
    /** Match within entry.entries[].type (e.g. "Skill"). */
    type: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('skill', 'type'), {
    message: 'find_sources_abilities requires at least one filter field',
  });

export type FindSourcesAbilitiesArgs = z.infer<typeof FindSourcesAbilitiesInput>;

export async function runFindSourcesAbilities(
  args: FindSourcesAbilitiesArgs,
  manager: SourceManager,
) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('sources_abilities'));

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

function matchesFilters(entry: Entry, args: FindSourcesAbilitiesArgs): boolean {
  if (args.skill && !entryArrayHas(entry, 'skill', args.skill)) return false;
  if (args.type && !entryArrayHas(entry, 'type', args.type)) return false;
  return true;
}

function entryArrayHas(entry: Entry, key: string, value: string): boolean {
  const entries = entry.entries;
  if (!Array.isArray(entries)) return false;
  return entries.some((e) => {
    if (!e || typeof e !== 'object') return false;
    return (e as Record<string, unknown>)[key] === value;
  });
}
