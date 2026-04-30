#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { loadConfig } from './config.js';
import { SourceManager } from './sources/manager.js';
import { CdnVersionInput, runCdnVersion } from './tools/cdn-version.js';
import { ListSourcesInput, runListSources } from './tools/list-sources.js';
import { GetSourceInput, runGetSource } from './tools/get-source.js';
import { FindItemsInput, runFindItems } from './tools/find-items.js';
import { FindRecipesInput, runFindRecipes } from './tools/find-recipes.js';
import { FindNpcsInput, runFindNpcs } from './tools/find-npcs.js';
import { FindEffectsInput, runFindEffects } from './tools/find-effects.js';
import { FindQuestsInput, runFindQuests } from './tools/find-quests.js';
import { FindAbilitiesInput, runFindAbilities } from './tools/find-abilities.js';
import {
  FindAbilitydynamicdotsInput,
  runFindAbilitydynamicdots,
} from './tools/find-abilitydynamicdots.js';
import {
  FindAbilitydynamicspecialvaluesInput,
  runFindAbilitydynamicspecialvalues,
} from './tools/find-abilitydynamicspecialvalues.js';
import { FindAbilitykeywordsInput, runFindAbilitykeywords } from './tools/find-abilitykeywords.js';
import { FindAiInput, runFindAi } from './tools/find-ai.js';
import { FindAreasInput, runFindAreas } from './tools/find-areas.js';
import { FindAttributesInput, runFindAttributes } from './tools/find-attributes.js';
import { FindDirectedgoalsInput, runFindDirectedgoals } from './tools/find-directedgoals.js';
import { FindItemsRawInput, runFindItemsRaw } from './tools/find-items-raw.js';
import { FindItemusesInput, runFindItemuses } from './tools/find-itemuses.js';
import { FindLandmarksInput, runFindLandmarks } from './tools/find-landmarks.js';
import { FindLorebookinfoInput, runFindLorebookinfo } from './tools/find-lorebookinfo.js';
import { FindLorebooksInput, runFindLorebooks } from './tools/find-lorebooks.js';
import { FindPlayertitlesInput, runFindPlayertitles } from './tools/find-playertitles.js';
import {
  FindSourcesAbilitiesInput,
  runFindSourcesAbilities,
} from './tools/find-sources-abilities.js';
import {
  FindSourcesRecipesInput,
  runFindSourcesRecipes,
} from './tools/find-sources-recipes.js';
import { FindStoragevaultsInput, runFindStoragevaults } from './tools/find-storagevaults.js';
import { FindTsysclientinfoInput, runFindTsysclientinfo } from './tools/find-tsysclientinfo.js';
import { FindTsysprofilesInput, runFindTsysprofiles } from './tools/find-tsysprofiles.js';
import { FindXptablesInput, runFindXptables } from './tools/find-xptables.js';
import { ListKeysInput, runListKeys } from './tools/list-keys.js';
import { ResolveStringsInput, runResolveStrings } from './tools/resolve-strings.js';
import { ItemSourcesInput, runItemSources } from './tools/item-sources.js';
import { RecipesForItemInput, runRecipesForItem } from './tools/recipes-for-item.js';
import { AbilitiesForSkillInput, runAbilitiesForSkill } from './tools/abilities-for-skill.js';
import { QuestsInAreaInput, runQuestsInArea } from './tools/quests-in-area.js';
import { RefreshInput, runRefresh } from './tools/refresh.js';
import { ServerInfoInput, runServerInfo } from './tools/server-info.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

const TOOLS = [
  {
    name: 'server_info',
    description:
      'Returns the pg-data-mcp package version and the current reference-data (CDN) version, ' +
      'with a flag for whether the version was detected from the CDN or fell back to the configured default.',
    inputSchema: zodToJsonSchema(ServerInfoInput),
  },
  {
    name: 'cdn_version',
    description:
      'Returns the CDN version this server is currently using. Pass include_loaded=true to also ' +
      'list every loaded source with its fetchedAt + etag.',
    inputSchema: zodToJsonSchema(CdnVersionInput),
  },
  {
    name: 'list_sources',
    description:
      'Lists every reference-data source the server can request. Pass loaded_only=true to ' +
      'see only sources currently in memory (with entry counts and fetched timestamps).',
    inputSchema: zodToJsonSchema(ListSourcesInput),
  },
  {
    name: 'get_source',
    description:
      'Fetches the raw JSON entry for one (source, key) tuple — e.g. (items, item_5538). Omit the key ' +
      'to return aggregate stats only. Supports every source listed by list_sources.',
    inputSchema: zodToJsonSchema(GetSourceInput),
  },
  {
    name: 'list_keys',
    description:
      'Paged enumeration of every key in one source, with optional prefix filter. The discovery ' +
      'primitive for join tools — cheaper than dumping a whole source via get_source.',
    inputSchema: zodToJsonSchema(ListKeysInput),
  },
  {
    name: 'find_items',
    description:
      'Filter items by InternalName, IconId, EquipSlot, Keyword, EffectDescs substring, SkillReqs, ' +
      'or Value range. Returns a paginated list of full raw item records (or projected fields).',
    inputSchema: zodToJsonSchema(FindItemsInput),
  },
  {
    name: 'find_recipes',
    description:
      'Filter recipes by Skill, level range, result item internal_name, ingredient item internal_name, ' +
      'or substring across the recipe result EffectDescs.',
    inputSchema: zodToJsonSchema(FindRecipesInput),
  },
  {
    name: 'find_npcs',
    description:
      'Filter NPCs by area, gift preference (likes/loves/dislikes/hates a keyword), or available ' +
      'service substring.',
    inputSchema: zodToJsonSchema(FindNpcsInput),
  },
  {
    name: 'find_effects',
    description:
      'Filter effects by token (substring on Name + Desc, multi-token AND-intersect) or referenced ' +
      'attribute name in the Mods map. The headline tool — replaces grepping multi-MB effects.json.',
    inputSchema: zodToJsonSchema(FindEffectsInput),
  },
  {
    name: 'find_quests',
    description:
      'Filter quests by FavorNpc, Area, requires_skill, reward_skill, objective target substring, ' +
      'or repeatable flag.',
    inputSchema: zodToJsonSchema(FindQuestsInput),
  },
  {
    name: 'find_abilities',
    description:
      'Filter abilities by Skill, level range, or Keyword. Use abilities_for_skill if you want a ' +
      'skill-scoped ability list joined with the skill record + advancement table.',
    inputSchema: zodToJsonSchema(FindAbilitiesInput),
  },
  {
    name: 'find_abilitydynamicdots',
    description:
      'Filter ability dynamic-DoT records by DamageType, ReqActiveSkill, ReqAbilityKeywords, ' +
      'ReqEffectKeywords, or numeric ranges on DamagePerTick / Duration / NumTicks.',
    inputSchema: zodToJsonSchema(FindAbilitydynamicdotsInput),
  },
  {
    name: 'find_abilitydynamicspecialvalues',
    description:
      'Filter ability dynamic-special-value rows by Label (exact / contains) or by ' +
      'ReqAbilityKeywords / ReqEffectKeywords array membership.',
    inputSchema: zodToJsonSchema(FindAbilitydynamicspecialvaluesInput),
  },
  {
    name: 'find_abilitykeywords',
    description:
      'Substring search across the AttributesThatDeltaCritChance / AttributesThatModCritDamage / ' +
      'MustHaveAbilityKeywords arrays in abilitykeywords.json.',
    inputSchema: zodToJsonSchema(FindAbilitykeywordsInput),
  },
  {
    name: 'find_ai',
    description:
      'Filter AI definitions by MobilityType, UncontrolledPet flag, or substring on the keys of ' +
      'the entry Abilities map.',
    inputSchema: zodToJsonSchema(FindAiInput),
  },
  {
    name: 'find_areas',
    description:
      'Filter area definitions by FriendlyName / ShortFriendlyName (exact or case-insensitive ' +
      'substring).',
    inputSchema: zodToJsonSchema(FindAreasInput),
  },
  {
    name: 'find_attributes',
    description:
      "Filter attributes.json rows by Label (exact or case-insensitive substring).",
    inputSchema: zodToJsonSchema(FindAttributesInput),
  },
  {
    name: 'find_directedgoals',
    description:
      'Filter directed-goal records by Label, Zone, or IsCategoryGate flag (exact or substring ' +
      'where applicable).',
    inputSchema: zodToJsonSchema(FindDirectedgoalsInput),
  },
  {
    name: 'find_items_raw',
    description:
      'Filter the un-merged items_raw.json (per-entry fields only — no parent inheritance). For ' +
      'resolved item values, prefer find_items, which works against the merged items.json.',
    inputSchema: zodToJsonSchema(FindItemsRawInput),
  },
  {
    name: 'find_itemuses',
    description:
      'Filter itemuses.json entries by recipe_id (matched against entry.RecipesThatUseItem).',
    inputSchema: zodToJsonSchema(FindItemusesInput),
  },
  {
    name: 'find_landmarks',
    description:
      'Filter landmarks (per-area arrays in landmarks.json) by Name, Description substring, or ' +
      'Type. Result keys are synthesised as "<areaKey>__<index>" because one source key holds ' +
      'multiple landmark records.',
    inputSchema: zodToJsonSchema(FindLandmarksInput),
  },
  {
    name: 'find_lorebookinfo',
    description:
      'Filter the Categories map in lorebookinfo.json by Title (exact / contains) or SubTitle ' +
      'substring.',
    inputSchema: zodToJsonSchema(FindLorebookinfoInput),
  },
  {
    name: 'find_lorebooks',
    description:
      'Filter lorebook entries by Title, InternalName, Category, or Keywords substring.',
    inputSchema: zodToJsonSchema(FindLorebooksInput),
  },
  {
    name: 'find_playertitles',
    description:
      'Filter playertitles.json by Title (exact or case-insensitive substring).',
    inputSchema: zodToJsonSchema(FindPlayertitlesInput),
  },
  {
    name: 'find_sources_abilities',
    description:
      'Searches the raw sources_abilities.json table by inner skill / type. For ability records ' +
      'themselves use find_abilities.',
    inputSchema: zodToJsonSchema(FindSourcesAbilitiesInput),
  },
  {
    name: 'find_sources_recipes',
    description:
      'Searches the raw sources_recipes.json table by inner npc / type. For the joined "where do ' +
      'I learn this recipe" view, use recipes_for_item or item_sources.',
    inputSchema: zodToJsonSchema(FindSourcesRecipesInput),
  },
  {
    name: 'find_storagevaults',
    description:
      'Filter storagevaults.json by NpcFriendlyName, Area, or Grouping (each supports exact and ' +
      'case-insensitive substring).',
    inputSchema: zodToJsonSchema(FindStoragevaultsInput),
  },
  {
    name: 'find_tsysclientinfo',
    description:
      'Filter tsysclientinfo.json by InternalName or Skill (exact and case-insensitive substring).',
    inputSchema: zodToJsonSchema(FindTsysclientinfoInput),
  },
  {
    name: 'find_tsysprofiles',
    description:
      'Substring search over the effect strings inside each tsysprofiles.json entry.',
    inputSchema: zodToJsonSchema(FindTsysprofilesInput),
  },
  {
    name: 'find_xptables',
    description:
      'Filter xptables.json by InternalName (exact or case-insensitive substring).',
    inputSchema: zodToJsonSchema(FindXptablesInput),
  },
  {
    name: 'item_sources',
    description:
      'Resolve where an item drops or is sold from. Joins items + sources_items and augments each ' +
      'source with NPC display names + recipe / quest internal names. Keeps every Monster/Source/Interactor ' +
      "context (the .NET app drops two of three).",
    inputSchema: zodToJsonSchema(ItemSourcesInput),
  },
  {
    name: 'recipes_for_item',
    description:
      'Every recipe that produces or consumes the given item. role=result | ingredient | any (default any).',
    inputSchema: zodToJsonSchema(RecipesForItemInput),
  },
  {
    name: 'abilities_for_skill',
    description:
      'Joins abilities + skills + advancement tables for one skill, filtered by level range. The ' +
      '"what unlocks at level X in skill Y" query.',
    inputSchema: zodToJsonSchema(AbilitiesForSkillInput),
  },
  {
    name: 'quests_in_area',
    description:
      'Quests in the named area, optionally filtered by repeatable flag and required skill.',
    inputSchema: zodToJsonSchema(QuestsInAreaInput),
  },
  {
    name: 'resolve_strings',
    description:
      "Bulk lookup over the game's flat string table (strings_all.json). Pass an array of keys like " +
      '["item_5538_Name", "effect_25538_Name"]; returns each key with its display string (or null if missing).',
    inputSchema: zodToJsonSchema(ResolveStringsInput),
  },
  {
    name: 'refresh',
    description:
      'Force re-fetch one source (or all if omitted). Returns a before/after snapshot + a `changed` ' +
      'flag derived from etag + fetchedAt comparison.',
    inputSchema: zodToJsonSchema(RefreshInput),
  },
] as const;

async function main(): Promise<void> {
  const config = loadConfig();
  const manager = new SourceManager(config);
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOLS] }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params;
    try {
      switch (name) {
        case 'server_info': {
          const args = ServerInfoInput.parse(rawArgs ?? {});
          return contentJson(await runServerInfo(args, manager));
        }
        case 'cdn_version': {
          const args = CdnVersionInput.parse(rawArgs ?? {});
          return contentJson(await runCdnVersion(args, manager));
        }
        case 'list_sources': {
          const args = ListSourcesInput.parse(rawArgs ?? {});
          return contentJson(await runListSources(args, manager));
        }
        case 'get_source': {
          const args = GetSourceInput.parse(rawArgs ?? {});
          return contentJson(await runGetSource(args, manager));
        }
        case 'list_keys': {
          const args = ListKeysInput.parse(rawArgs ?? {});
          return contentJson(await runListKeys(args, manager));
        }
        case 'find_items': {
          const args = FindItemsInput.parse(rawArgs ?? {});
          return contentJson(await runFindItems(args, manager));
        }
        case 'find_recipes': {
          const args = FindRecipesInput.parse(rawArgs ?? {});
          return contentJson(await runFindRecipes(args, manager));
        }
        case 'find_npcs': {
          const args = FindNpcsInput.parse(rawArgs ?? {});
          return contentJson(await runFindNpcs(args, manager));
        }
        case 'find_effects': {
          const args = FindEffectsInput.parse(rawArgs ?? {});
          return contentJson(await runFindEffects(args, manager));
        }
        case 'find_quests': {
          const args = FindQuestsInput.parse(rawArgs ?? {});
          return contentJson(await runFindQuests(args, manager));
        }
        case 'find_abilities': {
          const args = FindAbilitiesInput.parse(rawArgs ?? {});
          return contentJson(await runFindAbilities(args, manager));
        }
        case 'find_abilitydynamicdots': {
          const args = FindAbilitydynamicdotsInput.parse(rawArgs ?? {});
          return contentJson(await runFindAbilitydynamicdots(args, manager));
        }
        case 'find_abilitydynamicspecialvalues': {
          const args = FindAbilitydynamicspecialvaluesInput.parse(rawArgs ?? {});
          return contentJson(await runFindAbilitydynamicspecialvalues(args, manager));
        }
        case 'find_abilitykeywords': {
          const args = FindAbilitykeywordsInput.parse(rawArgs ?? {});
          return contentJson(await runFindAbilitykeywords(args, manager));
        }
        case 'find_ai': {
          const args = FindAiInput.parse(rawArgs ?? {});
          return contentJson(await runFindAi(args, manager));
        }
        case 'find_areas': {
          const args = FindAreasInput.parse(rawArgs ?? {});
          return contentJson(await runFindAreas(args, manager));
        }
        case 'find_attributes': {
          const args = FindAttributesInput.parse(rawArgs ?? {});
          return contentJson(await runFindAttributes(args, manager));
        }
        case 'find_directedgoals': {
          const args = FindDirectedgoalsInput.parse(rawArgs ?? {});
          return contentJson(await runFindDirectedgoals(args, manager));
        }
        case 'find_items_raw': {
          const args = FindItemsRawInput.parse(rawArgs ?? {});
          return contentJson(await runFindItemsRaw(args, manager));
        }
        case 'find_itemuses': {
          const args = FindItemusesInput.parse(rawArgs ?? {});
          return contentJson(await runFindItemuses(args, manager));
        }
        case 'find_landmarks': {
          const args = FindLandmarksInput.parse(rawArgs ?? {});
          return contentJson(await runFindLandmarks(args, manager));
        }
        case 'find_lorebookinfo': {
          const args = FindLorebookinfoInput.parse(rawArgs ?? {});
          return contentJson(await runFindLorebookinfo(args, manager));
        }
        case 'find_lorebooks': {
          const args = FindLorebooksInput.parse(rawArgs ?? {});
          return contentJson(await runFindLorebooks(args, manager));
        }
        case 'find_playertitles': {
          const args = FindPlayertitlesInput.parse(rawArgs ?? {});
          return contentJson(await runFindPlayertitles(args, manager));
        }
        case 'find_sources_abilities': {
          const args = FindSourcesAbilitiesInput.parse(rawArgs ?? {});
          return contentJson(await runFindSourcesAbilities(args, manager));
        }
        case 'find_sources_recipes': {
          const args = FindSourcesRecipesInput.parse(rawArgs ?? {});
          return contentJson(await runFindSourcesRecipes(args, manager));
        }
        case 'find_storagevaults': {
          const args = FindStoragevaultsInput.parse(rawArgs ?? {});
          return contentJson(await runFindStoragevaults(args, manager));
        }
        case 'find_tsysclientinfo': {
          const args = FindTsysclientinfoInput.parse(rawArgs ?? {});
          return contentJson(await runFindTsysclientinfo(args, manager));
        }
        case 'find_tsysprofiles': {
          const args = FindTsysprofilesInput.parse(rawArgs ?? {});
          return contentJson(await runFindTsysprofiles(args, manager));
        }
        case 'find_xptables': {
          const args = FindXptablesInput.parse(rawArgs ?? {});
          return contentJson(await runFindXptables(args, manager));
        }
        case 'item_sources': {
          const args = ItemSourcesInput.parse(rawArgs ?? {});
          return contentJson(await runItemSources(args, manager));
        }
        case 'recipes_for_item': {
          const args = RecipesForItemInput.parse(rawArgs ?? {});
          return contentJson(await runRecipesForItem(args, manager));
        }
        case 'abilities_for_skill': {
          const args = AbilitiesForSkillInput.parse(rawArgs ?? {});
          return contentJson(await runAbilitiesForSkill(args, manager));
        }
        case 'quests_in_area': {
          const args = QuestsInAreaInput.parse(rawArgs ?? {});
          return contentJson(await runQuestsInArea(args, manager));
        }
        case 'resolve_strings': {
          const args = ResolveStringsInput.parse(rawArgs ?? {});
          return contentJson(await runResolveStrings(args, manager));
        }
        case 'refresh': {
          const args = RefreshInput.parse(rawArgs ?? {});
          return contentJson(await runRefresh(args, manager));
        }
        default:
          return errorResult(`Unknown tool: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`${name} failed: ${message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] connected via stdio (cdn=${config.cdnRoot}, fallback=${config.fallbackVersion})`);
}

function contentJson(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Minimal Zod -> JSON Schema bridge — same shim as MithrilLogMcp uses. The
 * real validation happens in zod at call time; this is just the description
 * the MCP client sees.
 *
 * Output conforms to JSON Schema draft-2020-12: the top-level schema carries
 * `$schema`, and `ZodTuple` lowers to `prefixItems` (the 2020-12 replacement
 * for the legacy tuple-shaped `items`).
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', ...describe(schema) };
}

function describe(schema: z.ZodType): Record<string, unknown> {
  const def = (schema as any)._def;
  if (!def) return { type: 'object' };
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        properties[k] = describe(v as z.ZodType);
        if (!isOptional(v as z.ZodType)) required.push(k);
      }
      return { type: 'object', properties, ...(required.length ? { required } : {}) };
    }
    case 'ZodEffects':
      return describe(def.schema);
    case 'ZodArray':
      return { type: 'array', items: describe(def.type) };
    case 'ZodTuple':
      return { type: 'array', prefixItems: def.items.map((i: z.ZodType) => describe(i)) };
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodOptional':
    case 'ZodDefault':
      return describe(def.innerType);
    case 'ZodUnion':
      return { anyOf: def.options.map((o: z.ZodType) => describe(o)) };
    case 'ZodRecord':
      return { type: 'object', additionalProperties: describe(def.valueType) };
    default:
      return {};
  }
}

function isOptional(schema: z.ZodType): boolean {
  const def = (schema as any)._def;
  return def?.typeName === 'ZodOptional' || def?.typeName === 'ZodDefault';
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] fatal:`, err);
  process.exit(1);
});
