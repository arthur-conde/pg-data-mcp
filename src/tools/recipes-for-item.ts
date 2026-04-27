import { z } from 'zod';
import type { Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';

export const RecipesForItemInput = z
  .object({
    internal_name: z.string().min(1).optional(),
    item_id: z.number().int().optional(),
    role: z.enum(['result', 'ingredient', 'any']).default('any'),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .refine((v) => (v.internal_name !== undefined) !== (v.item_id !== undefined), {
    message: 'recipes_for_item requires exactly one of internal_name or item_id',
  });

export type RecipesForItemArgs = z.infer<typeof RecipesForItemInput>;

export async function runRecipesForItem(args: RecipesForItemArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { indexes: itemIx } = await surfaceSourceError(() => manager.items());

  let internalName: string | null = null;
  if (args.internal_name !== undefined) {
    internalName = itemIx.byInternalName.has(args.internal_name) ? args.internal_name : null;
  } else if (args.item_id !== undefined) {
    const hit = itemIx.byItemKey.get(`item_${args.item_id}`);
    internalName = hit && typeof hit[1].InternalName === 'string' ? hit[1].InternalName : null;
  }
  if (!internalName) {
    return {
      version: (await manager.items()).source.version,
      role: args.role,
      found: false,
      reason: args.internal_name
        ? `no item with InternalName='${args.internal_name}'`
        : `no item with id=${args.item_id} or item lacks InternalName`,
    };
  }

  const { source, indexes: recipeIx } = await surfaceSourceError(() => manager.recipes());

  const seen = new Map<string, Hit>();
  const collect = (bucket: Hit[] | undefined) => {
    if (!bucket) return;
    for (const hit of bucket) if (!seen.has(hit[0])) seen.set(hit[0], hit);
  };
  if (args.role === 'result' || args.role === 'any') {
    collect(recipeIx.byResultInternalName.get(internalName));
  }
  if (args.role === 'ingredient' || args.role === 'any') {
    collect(recipeIx.byIngredientInternalName.get(internalName));
  }

  const stream = streamHits(seen.values(), () => true, {
    limit: args.limit,
    offset: args.offset,
    fields: args.fields,
  });

  const elapsedMs = Math.round(performance.now() - t0);
  return {
    summary: {
      version: source.version,
      role: args.role,
      internal_name: internalName,
      ...stream.summary,
      elapsedMs,
    },
    items: stream.items,
  };
}
