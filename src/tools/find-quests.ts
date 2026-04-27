import { z } from 'zod';
import type { Entry, Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindQuestsInput = z
  .object({
    favor_npc: z.string().optional(),
    area: z.string().optional(),
    /** Key in `RequirementsToSneak` (or top-level Requirements). */
    requires_skill: z.string().optional(),
    /** Key in `Rewards`. */
    reward_skill: z.string().optional(),
    /** Substring across any Objectives[].Target. */
    objective_target: z.string().min(1).optional(),
    repeatable: z.boolean().optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter(
      'favor_npc',
      'area',
      'requires_skill',
      'reward_skill',
      'objective_target',
      'repeatable',
    ),
    { message: 'find_quests requires at least one filter field' },
  );

export type FindQuestsArgs = z.infer<typeof FindQuestsInput>;

export async function runFindQuests(args: FindQuestsArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { source, indexes } = await surfaceSourceError(() => manager.quests());

  let candidates: Iterable<Hit>;
  if (args.area) {
    candidates = indexes.byArea.get(args.area) ?? [];
  } else if (args.favor_npc) {
    candidates = indexes.byFavorNpc.get(args.favor_npc) ?? [];
  } else if (args.objective_target) {
    candidates = indexes.byObjectiveTarget.get(args.objective_target) ?? [];
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

function matchesFilters(entry: Entry, args: FindQuestsArgs): boolean {
  if (args.favor_npc && entry.FavorNpc !== args.favor_npc) return false;
  if (args.area && entry.Area !== args.area) return false;
  if (args.requires_skill) {
    const reqsToSneak = asRecord(entry.RequirementsToSneak);
    const reqs = asRecord(entry.Requirements);
    const has =
      (reqsToSneak !== null && args.requires_skill in reqsToSneak) ||
      (reqs !== null && args.requires_skill in reqs);
    if (!has) return false;
  }
  if (args.reward_skill) {
    const rewards = asRecord(entry.Rewards);
    if (rewards === null) return false;
    if (!(args.reward_skill in rewards)) return false;
  }
  if (args.objective_target) {
    const needle = args.objective_target.toLowerCase();
    const objs = Array.isArray(entry.Objectives) ? entry.Objectives : [];
    const has = objs.some((o) => {
      if (!o || typeof o !== 'object') return false;
      const t = (o as Record<string, unknown>).Target;
      return typeof t === 'string' && t.toLowerCase().includes(needle);
    });
    if (!has) return false;
  }
  if (args.repeatable !== undefined) {
    const r = entry.Repeatable;
    if (typeof r !== 'boolean' || r !== args.repeatable) return false;
  }
  return true;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
