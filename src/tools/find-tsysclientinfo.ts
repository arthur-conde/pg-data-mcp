import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindTsysclientinfoInput = z
  .object({
    /** Exact match for InternalName. */
    internal_name: z.string().min(1).optional(),
    /** Case-insensitive substring on InternalName. */
    internal_name_contains: z.string().min(1).optional(),
    /** Exact match for Skill. */
    skill: z.string().min(1).optional(),
    /** Case-insensitive substring on Skill. */
    skill_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter('internal_name', 'internal_name_contains', 'skill', 'skill_contains'),
    { message: 'find_tsysclientinfo requires at least one filter field' },
  );

export type FindTsysclientinfoArgs = z.infer<typeof FindTsysclientinfoInput>;

export async function runFindTsysclientinfo(args: FindTsysclientinfoArgs, manager: SourceManager) {
  const t0 = performance.now();
  const loaded = await surfaceSourceError(() => manager.load('tsysclientinfo'));

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

function matchesFilters(entry: Entry, args: FindTsysclientinfoArgs): boolean {
  if (args.internal_name && entry.InternalName !== args.internal_name) return false;
  if (args.internal_name_contains) {
    const needle = args.internal_name_contains.toLowerCase();
    if (
      typeof entry.InternalName !== 'string' ||
      !entry.InternalName.toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  if (args.skill && entry.Skill !== args.skill) return false;
  if (args.skill_contains) {
    const needle = args.skill_contains.toLowerCase();
    if (typeof entry.Skill !== 'string' || !entry.Skill.toLowerCase().includes(needle)) {
      return false;
    }
  }
  return true;
}
