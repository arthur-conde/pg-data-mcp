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
import { ResolveStringsInput, runResolveStrings } from './tools/resolve-strings.js';

const SERVER_NAME = 'pg-data';
const SERVER_VERSION = '0.1.0';

const TOOLS = [
  {
    name: 'cdn_version',
    description:
      'Returns the CDN version this server is currently using (auto-detected from cdn.projectgorgon.com, ' +
      'or the configured fallback).',
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
      "to return aggregate stats only. v0.1 supports items, recipes, npcs, strings_all.",
    inputSchema: zodToJsonSchema(GetSourceInput),
  },
  {
    name: 'find_items',
    description:
      'Filter items by InternalName, IconId, EquipSlot, Keyword, EffectDescs substring, SkillReqs, ' +
      'or Value range. Returns a paginated list of full raw item records (or projected fields). ' +
      'Replaces grepping items.json directly.',
    inputSchema: zodToJsonSchema(FindItemsInput),
  },
  {
    name: 'resolve_strings',
    description:
      "Bulk lookup over the game's flat string table (strings_all.json). Pass an array of keys like " +
      '["item_5538_Name", "effect_25538_Name"]; returns each key with its display string (or null if missing).',
    inputSchema: zodToJsonSchema(ResolveStringsInput),
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
        case 'cdn_version': {
          const args = CdnVersionInput.parse(rawArgs ?? {});
          const result = await runCdnVersion(args, manager);
          return contentJson(result);
        }
        case 'list_sources': {
          const args = ListSourcesInput.parse(rawArgs ?? {});
          const result = await runListSources(args, manager);
          return contentJson(result);
        }
        case 'get_source': {
          const args = GetSourceInput.parse(rawArgs ?? {});
          const result = await runGetSource(args, manager);
          return contentJson(result);
        }
        case 'find_items': {
          const args = FindItemsInput.parse(rawArgs ?? {});
          const result = await runFindItems(args, manager);
          return contentJson(result);
        }
        case 'resolve_strings': {
          const args = ResolveStringsInput.parse(rawArgs ?? {});
          const result = await runResolveStrings(args, manager);
          return contentJson(result);
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
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return describe(schema);
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
      return { type: 'array', items: def.items.map((i: z.ZodType) => describe(i)) };
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
