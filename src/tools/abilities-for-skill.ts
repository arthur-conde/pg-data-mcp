import { z } from 'zod';
import type { Entry, Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';

export const AbilitiesForSkillInput = z.object({
  skill: z.string().min(1),
  min_level: z.number().int().optional(),
  max_level: z.number().int().optional(),
  fields: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export type AbilitiesForSkillArgs = z.infer<typeof AbilitiesForSkillInput>;

export async function runAbilitiesForSkill(args: AbilitiesForSkillArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { source, indexes } = await surfaceSourceError(() => manager.abilities());
  const candidates: Hit[] = indexes.bySkill.get(args.skill) ?? [];

  const stream = streamHits(
    candidates,
    (entry) => withinLevel(entry, args.min_level, args.max_level),
    { limit: args.limit, offset: args.offset, fields: args.fields },
  );

  const skillsLoaded = await surfaceSourceError(() => manager.load('skills'));
  const skill = lookupSkill(skillsLoaded.data, args.skill);

  // advancementtables is bundled but optional — surface a soft null if it 404s.
  let advancement: unknown = null;
  try {
    const advLoaded = await manager.load('advancementtables');
    advancement = filterAdvancement(advLoaded.data, args.skill, args.min_level, args.max_level);
  } catch {
    advancement = null;
  }

  const elapsedMs = Math.round(performance.now() - t0);
  return {
    summary: { version: source.version, skill: args.skill, ...stream.summary, elapsedMs },
    skill,
    advancement,
    abilities: stream.items,
  };
}

function withinLevel(entry: Entry, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true;
  const lvl = typeof entry.Level === 'number' ? entry.Level : null;
  if (lvl === null) return false;
  if (min !== undefined && lvl < min) return false;
  if (max !== undefined && lvl > max) return false;
  return true;
}

function lookupSkill(data: Record<string, unknown>, skill: string): Entry | null {
  for (const v of Object.values(data)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const e = v as Entry;
    if (e.Id === skill || e.InternalName === skill) return e;
  }
  return null;
}

function filterAdvancement(
  data: Record<string, unknown>,
  skill: string,
  min?: number,
  max?: number,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const v of Object.values(data)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const e = v as Entry;
    if (e.Skill !== skill) continue;
    const lvl = typeof e.Level === 'number' ? e.Level : null;
    if (lvl === null) continue;
    if (min !== undefined && lvl < min) continue;
    if (max !== undefined && lvl > max) continue;
    out.push(e);
  }
  return out;
}
