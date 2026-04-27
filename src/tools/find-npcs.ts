import { z } from 'zod';
import type { Entry, Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindNpcsInput = z
  .object({
    /** Match against `AreaName` (exact). */
    area: z.string().optional(),
    /** NPC must Like this gift keyword. */
    likes: z.string().optional(),
    /** NPC must Love this gift keyword. */
    loves: z.string().optional(),
    /** NPC must Dislike this gift keyword. */
    dislikes: z.string().optional(),
    /** NPC must Hate this gift keyword. */
    hates: z.string().optional(),
    /** Substring across the NPC's AvailableServices. */
    service: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter('area', 'likes', 'loves', 'dislikes', 'hates', 'service'),
    { message: 'find_npcs requires at least one filter field' },
  );

export type FindNpcsArgs = z.infer<typeof FindNpcsInput>;

export async function runFindNpcs(args: FindNpcsArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { source, indexes } = await surfaceSourceError(() => manager.npcs());

  let candidates: Iterable<Hit>;
  if (args.area) {
    candidates = indexes.byArea.get(args.area) ?? [];
  } else {
    const giftFilter = pickGiftFilter(args);
    if (giftFilter) {
      const sentiment = giftFilter.sentiment;
      const keyword = giftFilter.keyword;
      const npcKeys = (indexes.byGiftKeyword.get(keyword) ?? [])
        .filter(([, s]) => s === sentiment)
        .map(([k]) => k);
      candidates = npcKeys
        .map((k): Hit | null => {
          const e = source.data[k];
          return e && typeof e === 'object' && !Array.isArray(e) ? [k, e as Entry] : null;
        })
        .filter((x): x is Hit => x !== null);
    } else {
      candidates = scanAll(source.data);
    }
  }

  const stream = streamHits(candidates, (entry) => matchesFilters(entry, args), {
    limit: args.limit,
    offset: args.offset,
    fields: args.fields,
  });

  const elapsedMs = Math.round(performance.now() - t0);
  return {
    summary: { version: source.version, ...stream.summary, elapsedMs },
    items: stream.items,
  };
}

function pickGiftFilter(args: FindNpcsArgs): { sentiment: string; keyword: string } | null {
  if (args.loves) return { sentiment: 'Loves', keyword: args.loves };
  if (args.likes) return { sentiment: 'Likes', keyword: args.likes };
  if (args.dislikes) return { sentiment: 'Dislikes', keyword: args.dislikes };
  if (args.hates) return { sentiment: 'Hates', keyword: args.hates };
  return null;
}

function matchesFilters(entry: Entry, args: FindNpcsArgs): boolean {
  if (args.area && entry.AreaName !== args.area) return false;
  if (args.likes && !hasGift(entry.Likes, args.likes)) return false;
  if (args.loves && !hasGift(entry.Loves, args.loves)) return false;
  if (args.dislikes && !hasGift(entry.Dislikes, args.dislikes)) return false;
  if (args.hates && !hasGift(entry.Hates, args.hates)) return false;
  if (args.service) {
    const services = entry.AvailableServices;
    if (!Array.isArray(services)) return false;
    const needle = args.service.toLowerCase();
    if (!services.some((s) => typeof s === 'string' && s.toLowerCase().includes(needle))) {
      return false;
    }
  }
  return true;
}

function hasGift(list: unknown, keyword: string): boolean {
  return Array.isArray(list) && list.some((k) => k === keyword);
}
