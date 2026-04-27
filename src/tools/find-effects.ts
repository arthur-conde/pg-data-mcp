import { z } from 'zod';
import { tokenize, type Entry, type Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindEffectsInput = z
  .object({
    /** Substring across Name + Desc; multi-token AND-intersects token buckets. */
    token: z.string().min(1).optional(),
    /** Effect must reference this attribute name in its Mods map. */
    mod_name: z.string().optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('token', 'mod_name'), {
    message: 'find_effects requires at least one filter field',
  });

export type FindEffectsArgs = z.infer<typeof FindEffectsInput>;

export async function runFindEffects(args: FindEffectsArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { source, indexes } = await surfaceSourceError(() => manager.effects());

  let candidates: Iterable<Hit>;
  if (args.mod_name) {
    candidates = indexes.byModName.get(args.mod_name) ?? [];
  } else if (args.token) {
    const tokens = tokenize(args.token);
    if (tokens.length === 0) {
      candidates = [];
    } else if (tokens.length === 1) {
      candidates = indexes.byToken.get(tokens[0]!) ?? [];
    } else {
      candidates = intersectByToken(indexes.byToken, tokens);
    }
  } else {
    candidates = scanAll(source.data);
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

function intersectByToken(byToken: Map<string, Hit[]>, tokens: string[]): Hit[] {
  // Pick the smallest bucket as the seed; AND-filter against every other token.
  const buckets = tokens.map((t) => byToken.get(t) ?? []);
  buckets.sort((a, b) => a.length - b.length);
  if (buckets.length === 0 || buckets[0]!.length === 0) return [];
  const [seed, ...rest] = buckets;
  const restKeys = rest.map((b) => new Set(b.map(([k]) => k)));
  return seed!.filter(([k]) => restKeys.every((s) => s.has(k)));
}

function matchesFilters(entry: Entry, args: FindEffectsArgs): boolean {
  if (args.mod_name) {
    const mods = entry.Mods;
    if (!mods || typeof mods !== 'object' || Array.isArray(mods)) return false;
    if (!(args.mod_name in (mods as Record<string, unknown>))) return false;
  }
  if (args.token) {
    const needle = args.token.toLowerCase();
    const haystack = `${str(entry.Name)} ${str(entry.Desc)}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
