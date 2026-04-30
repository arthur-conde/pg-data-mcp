import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindItemusesInput = z
  .object({
    /** Numeric recipe ID; matched against entry.RecipesThatUseItem. */
    recipe_id: z.number().int().min(0).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('recipe_id'), {
    message: 'find_itemuses requires at least one filter field',
  });

export type FindItemusesArgs = z.infer<typeof FindItemusesInput>;

export async function runFindItemuses(args: FindItemusesArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('itemuses'));

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

function matchesFilters(entry: Entry, args: FindItemusesArgs): boolean {
  if (args.recipe_id !== undefined) {
    const recipes = entry.RecipesThatUseItem;
    if (!Array.isArray(recipes)) return false;
    if (!recipes.some((r) => r === args.recipe_id)) return false;
  }
  return true;
}
