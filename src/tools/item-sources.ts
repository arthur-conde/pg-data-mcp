import { z } from 'zod';
import type { Entry } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { surfaceSourceError } from '../util/source-errors.js';

export const ItemSourcesInput = z
  .object({
    internal_name: z.string().min(1).optional(),
    item_id: z.number().int().optional(),
  })
  .refine((v) => (v.internal_name !== undefined) !== (v.item_id !== undefined), {
    message: 'item_sources requires exactly one of internal_name or item_id',
  });

export type ItemSourcesArgs = z.infer<typeof ItemSourcesInput>;

export async function runItemSources(args: ItemSourcesArgs, manager: SourceManager) {
  const { source: itemsSource, indexes: itemIx } = await surfaceSourceError(() => manager.items());

  let itemKey: string | null = null;
  let itemEntry: Entry | null = null;
  if (args.internal_name !== undefined) {
    const hit = itemIx.byInternalName.get(args.internal_name);
    if (hit) [itemKey, itemEntry] = hit;
  } else if (args.item_id !== undefined) {
    const hit = itemIx.byItemKey.get(`item_${args.item_id}`);
    if (hit) [itemKey, itemEntry] = hit;
  }

  if (!itemKey || !itemEntry) {
    return {
      version: itemsSource.version,
      found: false,
      reason: args.internal_name
        ? `no item with InternalName='${args.internal_name}'`
        : `no item with id=${args.item_id}`,
    };
  }

  const sourcesItems = await surfaceSourceError(() => manager.load('sources_items'));
  const raw = sourcesItems.data[itemKey];
  const sourceList = Array.isArray(raw) ? raw : [];

  const { indexes: npcIx } = await surfaceSourceError(() => manager.npcs());
  const { indexes: recipeIx } = await surfaceSourceError(() => manager.recipes());
  const { indexes: questIx } = await surfaceSourceError(() => manager.quests());
  const stringsLoaded = await surfaceSourceError(() => manager.load('strings_all'));

  const augmented = sourceList.map((slot) => augment(slot, npcIx, recipeIx, questIx, stringsLoaded.data));

  return {
    version: itemsSource.version,
    found: true,
    internal_name: typeof itemEntry.InternalName === 'string' ? itemEntry.InternalName : null,
    item_key: itemKey,
    sources: augmented,
  };
}

function augment(
  slot: unknown,
  npcIx: { byInternalName: Map<string, [string, Entry]> },
  recipeIx: { byInternalName: Map<string, [string, Entry]> },
  questIx: { byInternalName: Map<string, [string, Entry]> },
  strings: Record<string, unknown>,
) {
  const out: Record<string, unknown> = { raw: slot };
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return out;
  const obj = slot as Record<string, unknown>;

  // Project Gorgon's sources_items entries usually carry one of:
  //  - Monster / MonsterInternalName
  //  - Source / SourceInternalName  (NPC, recipe, quest internal names live here)
  //  - Interactor                   (NPC internal name)
  // Keep all of them — the .NET projection drops two of three; we don't.
  for (const npcKey of ['Interactor', 'NpcInternalName']) {
    const v = obj[npcKey];
    if (typeof v === 'string') {
      const hit = npcIx.byInternalName.get(v);
      if (hit) {
        const npcKeyStr = hit[0];
        const display = strings[`${npcKeyStr}_Name`];
        out.npc_display_name = typeof display === 'string' ? display : null;
        out.npc_key = npcKeyStr;
      }
    }
  }
  for (const recipeKey of ['Recipe', 'RecipeInternalName']) {
    const v = obj[recipeKey];
    if (typeof v === 'string' && recipeIx.byInternalName.has(v)) {
      out.recipe_internal_name = v;
    }
  }
  for (const questKey of ['Quest', 'QuestInternalName']) {
    const v = obj[questKey];
    if (typeof v === 'string' && questIx.byInternalName.has(v)) {
      out.quest_internal_name = v;
    }
  }
  return out;
}
