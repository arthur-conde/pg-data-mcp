import { z } from 'zod';
import type { Entry, Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindItemsInput = z
  .object({
    /** Case-insensitive substring on InternalName. */
    internal_name_contains: z.string().min(1).optional(),
    /** Exact InternalName match (uses the byInternalName index). */
    internal_name: z.string().min(1).optional(),
    /** Case-insensitive substring on display Name. */
    name_contains: z.string().min(1).optional(),
    icon_id: z.number().int().optional(),
    equip_slot: z.string().optional(),
    /** Item must carry this keyword (e.g. "Equipment", "Loot", "Food"). */
    keyword: z.string().optional(),
    /** Substring on any EffectDescs entry; tokenised, case-insensitive. */
    effect_desc_contains: z.string().min(1).optional(),
    /** Item must require this skill. */
    skill_prereq: z.string().optional(),
    value_min: z.number().optional(),
    value_max: z.number().optional(),
    /** Top-level fields to keep on each result. Default returns the full record. */
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter(
      'internal_name',
      'internal_name_contains',
      'name_contains',
      'icon_id',
      'equip_slot',
      'keyword',
      'effect_desc_contains',
      'skill_prereq',
      'value_min',
      'value_max',
    ),
    { message: 'find_items requires at least one filter field' },
  );

export type FindItemsArgs = z.infer<typeof FindItemsInput>;

export async function runFindItems(args: FindItemsArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { source, indexes } = await surfaceSourceError(() => manager.items());

  // Pick the cheapest index that narrows the candidate set, then scan-filter
  // the rest. For the v0.1 surface, exact internal_name and icon_id and
  // keyword each map to a precomputed bucket; the rest fall through to a
  // full data scan.
  let candidates: Iterable<Hit>;
  if (args.internal_name) {
    const hit = indexes.byInternalName.get(args.internal_name);
    candidates = hit ? [hit] : [];
  } else if (args.icon_id !== undefined) {
    candidates = indexes.byIconId.get(args.icon_id) ?? [];
  } else if (args.keyword) {
    candidates = indexes.byKeyword.get(args.keyword) ?? [];
  } else if (args.effect_desc_contains) {
    // Use the token index when a single token is searched; fall through to scan otherwise.
    const tokens = args.effect_desc_contains.toLowerCase().split(/[^a-z0-9_]+/i).filter(Boolean);
    candidates =
      tokens.length === 1 ? indexes.byEffectDescToken.get(tokens[0]!) ?? [] : scanAll(source.data);
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
    summary: {
      version: source.version,
      ...stream.summary,
      elapsedMs,
    },
    items: stream.items,
  };
}

function matchesFilters(entry: Entry, args: FindItemsArgs): boolean {
  if (args.internal_name && entry.InternalName !== args.internal_name) return false;
  if (args.internal_name_contains) {
    const n = String(entry.InternalName ?? '').toLowerCase();
    if (!n.includes(args.internal_name_contains.toLowerCase())) return false;
  }
  if (args.name_contains) {
    const n = String(entry.Name ?? '').toLowerCase();
    if (!n.includes(args.name_contains.toLowerCase())) return false;
  }
  if (args.icon_id !== undefined && entry.IconId !== args.icon_id) return false;
  if (args.equip_slot && entry.EquipSlot !== args.equip_slot) return false;
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
  if (args.effect_desc_contains) {
    const needle = args.effect_desc_contains.toLowerCase();
    const descs = Array.isArray(entry.EffectDescs) ? entry.EffectDescs : [];
    const found = descs.some((d) => typeof d === 'string' && d.toLowerCase().includes(needle));
    if (!found) return false;
  }
  if (args.skill_prereq) {
    const reqs = entry.SkillReqs;
    if (!reqs || typeof reqs !== 'object') return false;
    if (!(args.skill_prereq in (reqs as Record<string, unknown>))) return false;
  }
  if (args.value_min !== undefined || args.value_max !== undefined) {
    const v = typeof entry.Value === 'number' ? entry.Value : null;
    if (v === null) return false;
    if (args.value_min !== undefined && v < args.value_min) return false;
    if (args.value_max !== undefined && v > args.value_max) return false;
  }
  return true;
}
