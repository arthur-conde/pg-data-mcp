import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindAbilitydynamicdotsInput = z
  .object({
    damage_type: z.string().min(1).optional(),
    req_active_skill: z.string().min(1).optional(),
    req_ability_keyword: z.string().min(1).optional(),
    req_effect_keyword: z.string().min(1).optional(),
    damage_per_tick_min: z.number().optional(),
    damage_per_tick_max: z.number().optional(),
    duration_min: z.number().optional(),
    duration_max: z.number().optional(),
    num_ticks: z.number().int().optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter(
      'damage_type',
      'req_active_skill',
      'req_ability_keyword',
      'req_effect_keyword',
      'damage_per_tick_min',
      'damage_per_tick_max',
      'duration_min',
      'duration_max',
      'num_ticks',
    ),
    { message: 'find_abilitydynamicdots requires at least one filter field' },
  );

export type FindAbilitydynamicdotsArgs = z.infer<typeof FindAbilitydynamicdotsInput>;

export async function runFindAbilitydynamicdots(
  args: FindAbilitydynamicdotsArgs,
  manager: SourceManager,
) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('abilitydynamicdots'));

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

function matchesFilters(entry: Entry, args: FindAbilitydynamicdotsArgs): boolean {
  if (args.damage_type && entry.DamageType !== args.damage_type) return false;
  if (args.req_active_skill && entry.ReqActiveSkill !== args.req_active_skill) return false;
  if (args.req_ability_keyword && !arrayContains(entry.ReqAbilityKeywords, args.req_ability_keyword)) {
    return false;
  }
  if (args.req_effect_keyword && !arrayContains(entry.ReqEffectKeywords, args.req_effect_keyword)) {
    return false;
  }

  if (args.damage_per_tick_min !== undefined || args.damage_per_tick_max !== undefined) {
    const v = readNumber(entry.DamagePerTick);
    if (v === null) return false;
    if (args.damage_per_tick_min !== undefined && v < args.damage_per_tick_min) return false;
    if (args.damage_per_tick_max !== undefined && v > args.damage_per_tick_max) return false;
  }

  if (args.duration_min !== undefined || args.duration_max !== undefined) {
    const v = readNumber(entry.Duration);
    if (v === null) return false;
    if (args.duration_min !== undefined && v < args.duration_min) return false;
    if (args.duration_max !== undefined && v > args.duration_max) return false;
  }

  if (args.num_ticks !== undefined && entry.NumTicks !== args.num_ticks) return false;

  return true;
}

function readNumber(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

function arrayContains(v: unknown, needle: string): boolean {
  return Array.isArray(v) && v.some((x) => x === needle);
}
