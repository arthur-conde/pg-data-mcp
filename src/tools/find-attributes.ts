import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindAttributesInput = z
  .object({
    /** Exact match for the attribute's Label. */
    label: z.string().min(1).optional(),
    /** Case-insensitive substring on the attribute's Label. */
    label_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('label', 'label_contains'), {
    message: 'find_attributes requires at least one filter field',
  });

export type FindAttributesArgs = z.infer<typeof FindAttributesInput>;

export async function runFindAttributes(args: FindAttributesArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('attributes'));

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

function matchesFilters(entry: Entry, args: FindAttributesArgs): boolean {
  if (args.label && entry.Label !== args.label) return false;
  if (args.label_contains) {
    const needle = args.label_contains.toLowerCase();
    if (typeof entry.Label !== 'string' || !entry.Label.toLowerCase().includes(needle)) {
      return false;
    }
  }
  return true;
}
