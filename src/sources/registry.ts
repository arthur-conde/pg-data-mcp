/**
 * Single source of truth for which CDN files this server can request.
 * Mirrors `ReferenceDataService.Keys` (11 sources the .NET app loads) plus
 * the additional ~17 files present in `Mithril.Shared/Reference/BundledData/`
 * that the .NET app doesn't currently parse — these are the biggest
 * token-savings wins for ad-hoc reasoning.
 *
 * v0.1 only loads `v01Sources`. The full list is here so v0.2 can flip a
 * single flag.
 */
export const allSources = [
  // .NET app loads these (ReferenceDataService.Keys):
  'items',
  'recipes',
  'skills',
  'xptables',
  'npcs',
  'areas',
  'sources_items',
  'sources_recipes',
  'attributes',
  'tsysclientinfo',
  'tsysprofiles',
  'quests',
  // .NET app bundles but doesn't load:
  'effects',
  'abilities',
  'abilitykeywords',
  'abilitydynamicdots',
  'abilitydynamicspecialvalues',
  'advancementtables',
  'ai',
  'directedgoals',
  'items_raw',
  'itemuses',
  'landmarks',
  'lorebookinfo',
  'lorebooks',
  'playertitles',
  'sources_abilities',
  'storagevaults',
  'strings_all',
] as const;

export type SourceName = (typeof allSources)[number];

export const v01Sources: readonly SourceName[] = ['items', 'recipes', 'npcs', 'strings_all'];

export function isKnownSource(name: string): name is SourceName {
  return (allSources as readonly string[]).includes(name);
}
