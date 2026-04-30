import { z } from 'zod';
import type { Entry, Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

/**
 * `landmarks.json` shape is `{ <areaKey>: Landmark[] }`. We synthesise a
 * unique key per landmark as `${areaKey}__${index}` so the standard
 * `streamHits` `[key, entry]` contract still applies.
 */
export const FindLandmarksInput = z
  .object({
    /** Exact match for Name. */
    name: z.string().min(1).optional(),
    /** Case-insensitive substring on Name. */
    name_contains: z.string().min(1).optional(),
    /** Case-insensitive substring on Description. */
    desc_contains: z.string().min(1).optional(),
    /** Exact match for Type. */
    type: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('name', 'name_contains', 'desc_contains', 'type'), {
    message: 'find_landmarks requires at least one filter field',
  });

export type FindLandmarksArgs = z.infer<typeof FindLandmarksInput>;

export async function runFindLandmarks(args: FindLandmarksArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('landmarks'));

  const stream = streamHits(flattenLandmarks(loaded.data), (entry) => matchesFilters(entry, args), {
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

function* flattenLandmarks(data: Record<string, unknown>): IterableIterator<Hit> {
  for (const [areaKey, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        yield [`${areaKey}__${i}`, item as Entry];
      }
    }
  }
}

function matchesFilters(entry: Entry, args: FindLandmarksArgs): boolean {
  if (args.name && entry.Name !== args.name) return false;
  if (args.name_contains) {
    const n = typeof entry.Name === 'string' ? entry.Name.toLowerCase() : '';
    if (!n.includes(args.name_contains.toLowerCase())) return false;
  }
  if (args.desc_contains) {
    const d = typeof entry.Description === 'string' ? entry.Description.toLowerCase() : '';
    if (!d.includes(args.desc_contains.toLowerCase())) return false;
  }
  if (args.type && entry.Type !== args.type) return false;
  return true;
}
