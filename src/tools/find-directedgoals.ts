import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindDirectedgoalsInput = z
  .object({
    label: z.string().min(1).optional(),
    label_contains: z.string().min(1).optional(),
    zone: z.string().min(1).optional(),
    zone_contains: z.string().min(1).optional(),
    is_category_gate: z.boolean().optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter('label', 'label_contains', 'zone', 'zone_contains', 'is_category_gate'),
    { message: 'find_directedgoals requires at least one filter field' },
  );

export type FindDirectedgoalsArgs = z.infer<typeof FindDirectedgoalsInput>;

export async function runFindDirectedgoals(args: FindDirectedgoalsArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('directedgoals'));

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

function matchesFilters(entry: Entry, args: FindDirectedgoalsArgs): boolean {
  if (args.label && entry.Label !== args.label) return false;
  if (args.label_contains) {
    const needle = args.label_contains.toLowerCase();
    if (typeof entry.Label !== 'string' || !entry.Label.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (args.zone && entry.Zone !== args.zone) return false;
  if (args.zone_contains) {
    const needle = args.zone_contains.toLowerCase();
    if (typeof entry.Zone !== 'string' || !entry.Zone.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (args.is_category_gate !== undefined && entry.IsCategoryGate !== args.is_category_gate) {
    return false;
  }
  return true;
}
