import { z } from 'zod';
import type { Entry, Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { scanAll, streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';
import { requireAtLeastOneFilter } from '../util/zod-helpers.js';

export const FindRecipesInput = z
  .object({
    skill: z.string().optional(),
    min_level: z.number().int().optional(),
    max_level: z.number().int().optional(),
    /** Recipe whose ResultItems / ProtoResultItems contain this item internal_name. */
    result_internal_name: z.string().optional(),
    /** Recipe whose Ingredients[].ItemCode resolves to this item internal_name. */
    ingredient_internal_name: z.string().optional(),
    /** Substring on any of the recipe's result EffectDescs (case-insensitive). */
    effect_desc_contains: z.string().min(1).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    requireAtLeastOneFilter(
      'skill',
      'min_level',
      'max_level',
      'result_internal_name',
      'ingredient_internal_name',
      'effect_desc_contains',
    ),
    { message: 'find_recipes requires at least one filter field' },
  );

export type FindRecipesArgs = z.infer<typeof FindRecipesInput>;

export async function runFindRecipes(args: FindRecipesArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { source, indexes } = await surfaceSourceError(() => manager.recipes());

  let candidates: Iterable<Hit>;
  if (args.result_internal_name) {
    candidates = indexes.byResultInternalName.get(args.result_internal_name) ?? [];
  } else if (args.ingredient_internal_name) {
    candidates = indexes.byIngredientInternalName.get(args.ingredient_internal_name) ?? [];
  } else if (args.skill) {
    candidates = indexes.bySkill.get(args.skill) ?? [];
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

function matchesFilters(entry: Entry, args: FindRecipesArgs): boolean {
  if (args.skill && entry.Skill !== args.skill) return false;
  if (args.min_level !== undefined || args.max_level !== undefined) {
    const lvl = readNumber(entry.SkillLevelReq) ?? readNumber(entry.MinLevel);
    if (lvl === null) return false;
    if (args.min_level !== undefined && lvl < args.min_level) return false;
    if (args.max_level !== undefined && lvl > args.max_level) return false;
  }
  if (args.effect_desc_contains) {
    const needle = args.effect_desc_contains.toLowerCase();
    const descs = collectStrings(entry.ResultEffectDescs);
    if (!descs.some((d) => d.toLowerCase().includes(needle))) return false;
  }
  return true;
}

function readNumber(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

function collectStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
