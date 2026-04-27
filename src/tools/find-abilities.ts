import { z } from 'zod';
import type { Entry, Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindAbilitiesInput = z
  .object({
    skill: z.string().optional(),
    min_level: z.number().int().optional(),
    max_level: z.number().int().optional(),
    keyword: z.string().optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(requireAtLeastOneFilter('skill', 'min_level', 'max_level', 'keyword'), {
    message: 'find_abilities requires at least one filter field',
  });

export type FindAbilitiesArgs = z.infer<typeof FindAbilitiesInput>;

export async function runFindAbilities(args: FindAbilitiesArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { source, indexes } = await surfaceSourceError(() => manager.abilities());

  let candidates: Iterable<Hit>;
  if (args.skill) {
    candidates = indexes.bySkill.get(args.skill) ?? [];
  } else if (args.keyword) {
    candidates = indexes.byKeyword.get(args.keyword) ?? [];
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

function matchesFilters(entry: Entry, args: FindAbilitiesArgs): boolean {
  if (args.skill && entry.Skill !== args.skill) return false;
  if (args.keyword) {
    const kws = Array.isArray(entry.Keywords) ? entry.Keywords : [];
    const has = kws.some((k) => {
      if (typeof k !== 'string') return false;
      const eq = k.indexOf('=');
      const name = eq > 0 ? k.slice(0, eq) : k;
      return name === args.keyword;
    });
    if (!has) return false;
  }
  if (args.min_level !== undefined || args.max_level !== undefined) {
    const lvl = typeof entry.Level === 'number' ? entry.Level : null;
    if (lvl === null) return false;
    if (args.min_level !== undefined && lvl < args.min_level) return false;
    if (args.max_level !== undefined && lvl > args.max_level) return false;
  }
  return true;
}
