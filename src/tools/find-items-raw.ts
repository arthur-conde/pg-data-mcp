import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

/**
 * Searches `items_raw.json` — the un-merged item table where each entry
 * carries only its own fields (no inherited values from parent items). Use
 * this to inspect raw inheritance; for resolved values prefer `find_items`,
 * which works against the merged `items.json`.
 */
export const FindItemsRawInput = z
  .object({
    /** Exact match for InternalName. */
    internal_name: z.string().min(1).optional(),
    /** Case-insensitive substring on InternalName. */
    internal_name_contains: z.string().min(1).optional(),
    /** Exact match for display Name. */
    name: z.string().min(1).optional(),
    /** Case-insensitive substring on display Name. */
    name_contains: z.string().min(1).optional(),
    icon_id: z.number().int().optional(),
    /** Item must carry this keyword (e.g. "Equipment", "Loot", "Food"). */
    keyword: z.string().optional(),
    value_min: z.number().optional(),
    value_max: z.number().optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter(
      'internal_name',
      'internal_name_contains',
      'name',
      'name_contains',
      'icon_id',
      'keyword',
      'value_min',
      'value_max',
    ),
    { message: 'find_items_raw requires at least one filter field' },
  );

export type FindItemsRawArgs = z.infer<typeof FindItemsRawInput>;

export async function runFindItemsRaw(args: FindItemsRawArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('items_raw'));

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

function matchesFilters(entry: Entry, args: FindItemsRawArgs): boolean {
  if (args.internal_name && entry.InternalName !== args.internal_name) return false;
  if (args.internal_name_contains) {
    const n = typeof entry.InternalName === 'string' ? entry.InternalName.toLowerCase() : '';
    if (!n.includes(args.internal_name_contains.toLowerCase())) return false;
  }
  if (args.name && entry.Name !== args.name) return false;
  if (args.name_contains) {
    const n = typeof entry.Name === 'string' ? entry.Name.toLowerCase() : '';
    if (!n.includes(args.name_contains.toLowerCase())) return false;
  }
  if (args.icon_id !== undefined && entry.IconId !== args.icon_id) return false;
  if (args.keyword) {
    const kws = Array.isArray(entry.Keywords) ? entry.Keywords : [];
    const found = kws.some((k) => {
      if (typeof k !== 'string') return false;
      const eq = k.indexOf('=');
      const name = eq > 0 ? k.slice(0, eq) : k;
      return name === args.keyword;
    });
    if (!found) return false;
  }
  if (args.value_min !== undefined || args.value_max !== undefined) {
    const v = typeof entry.Value === 'number' ? entry.Value : null;
    if (v === null) return false;
    if (args.value_min !== undefined && v < args.value_min) return false;
    if (args.value_max !== undefined && v > args.value_max) return false;
  }
  return true;
}
