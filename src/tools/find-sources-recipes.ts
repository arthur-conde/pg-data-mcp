import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

/**
 * Searches the raw `sources_recipes.json` table. For the joined "where do I
 * learn this recipe" view (NPC names, areas, prices) use `recipes_for_item`
 * or the existing `item_sources` tool.
 */
export const FindSourcesRecipesInput = z
  .object({
    /** Match within entry.entries[].npc. */
    npc: z.string().min(1).optional(),
    /** Match within entry.entries[].type (e.g. "Training", "Effect"). */
    type: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('npc', 'type'), {
    message: 'find_sources_recipes requires at least one filter field',
  });

export type FindSourcesRecipesArgs = z.infer<typeof FindSourcesRecipesInput>;

export async function runFindSourcesRecipes(
  args: FindSourcesRecipesArgs,
  manager: SourceManager,
) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('sources_recipes'));

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

function matchesFilters(entry: Entry, args: FindSourcesRecipesArgs): boolean {
  if (args.npc && !entryArrayHas(entry, 'npc', args.npc)) return false;
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
