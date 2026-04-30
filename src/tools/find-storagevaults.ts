import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindStoragevaultsInput = z
  .object({
    /** Exact match for NpcFriendlyName. */
    npc_name: z.string().min(1).optional(),
    /** Case-insensitive substring on NpcFriendlyName. */
    npc_name_contains: z.string().min(1).optional(),
    /** Exact match for Area. */
    area: z.string().min(1).optional(),
    /** Case-insensitive substring on Area. */
    area_contains: z.string().min(1).optional(),
    /** Exact match for Grouping. */
    grouping: z.string().min(1).optional(),
    /** Case-insensitive substring on Grouping. */
    grouping_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter(
      'npc_name',
      'npc_name_contains',
      'area',
      'area_contains',
      'grouping',
      'grouping_contains',
    ),
    { message: 'find_storagevaults requires at least one filter field' },
  );

export type FindStoragevaultsArgs = z.infer<typeof FindStoragevaultsInput>;

export async function runFindStoragevaults(args: FindStoragevaultsArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('storagevaults'));

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

function matchesFilters(entry: Entry, args: FindStoragevaultsArgs): boolean {
  if (args.npc_name && entry.NpcFriendlyName !== args.npc_name) return false;
  if (args.npc_name_contains) {
    const needle = args.npc_name_contains.toLowerCase();
    if (
      typeof entry.NpcFriendlyName !== 'string' ||
      !entry.NpcFriendlyName.toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  if (args.area && entry.Area !== args.area) return false;
  if (args.area_contains) {
    const needle = args.area_contains.toLowerCase();
    if (typeof entry.Area !== 'string' || !entry.Area.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (args.grouping && entry.Grouping !== args.grouping) return false;
  if (args.grouping_contains) {
    const needle = args.grouping_contains.toLowerCase();
    if (typeof entry.Grouping !== 'string' || !entry.Grouping.toLowerCase().includes(needle)) {
      return false;
    }
  }
  return true;
}
