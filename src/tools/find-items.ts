import { z } from 'zod';
import type { SourceManager } from '../sources/manager.js';

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
    (v) =>
      v.internal_name !== undefined ||
      v.internal_name_contains !== undefined ||
      v.name_contains !== undefined ||
      v.icon_id !== undefined ||
      v.equip_slot !== undefined ||
      v.keyword !== undefined ||
      v.effect_desc_contains !== undefined ||
      v.skill_prereq !== undefined ||
      v.value_min !== undefined ||
      v.value_max !== undefined,
    { message: 'find_items requires at least one filter field' },
  );

export type FindItemsArgs = z.infer<typeof FindItemsInput>;

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export async function runFindItems(args: FindItemsArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { source, indexes } = await manager.items();

  // Pick the cheapest index that narrows the candidate set, then scan-filter
  // the rest. For the v0.1 surface, exact internal_name and icon_id and
  // keyword each map to a precomputed bucket; the rest fall through to a
  // full data scan.
  let candidates: Array<[string, Record<string, unknown>]>;
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
    if (tokens.length === 1) {
      const hits = indexes.byEffectDescToken.get(tokens[0]!) ?? [];
      candidates = hits;
    } else {
      candidates = scanAll(source.data);
    }
  } else {
    candidates = scanAll(source.data);
  }

  const results: Array<{ key: string; data: Record<string, unknown> }> = [];
  let matched = 0;
  let skipped = 0;
  let truncated = false;
  let bytesEmitted = 0;

  for (const [key, entry] of candidates) {
    if (!matchesFilters(entry, args)) continue;
    matched += 1;
    if (skipped < args.offset) {
      skipped += 1;
      continue;
    }
    if (results.length >= args.limit) {
      truncated = true;
      continue;
    }
    const projected = args.fields ? projectFields(entry, args.fields) : entry;
    const encoded = JSON.stringify(projected);
    if (bytesEmitted + encoded.length > MAX_RESPONSE_BYTES) {
      truncated = true;
      break;
    }
    results.push({ key, data: projected });
    bytesEmitted += encoded.length + 2;
  }

  const elapsedMs = Math.round(performance.now() - t0);
  return {
    summary: {
      version: source.version,
      matched,
      returned: results.length,
      truncated,
      elapsedMs,
    },
    items: results,
  };
}

function scanAll(data: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const out: Array<[string, Record<string, unknown>]> = [];
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push([k, v as Record<string, unknown>]);
    }
  }
  return out;
}

function matchesFilters(entry: Record<string, unknown>, args: FindItemsArgs): boolean {
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

function projectFields(entry: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in entry) out[f] = entry[f];
  return out;
}
