import { z } from 'zod';
import { isKnownSource, v01Sources, type SourceName } from '../sources/registry.js';
import { SourceNotAvailableError } from '../cdn/fetcher.js';
import type { SourceManager } from '../sources/manager.js';

const v01Set = new Set<string>(v01Sources);

export const GetSourceInput = z.object({
  source: z.string().min(1),
  /** Specific entry key, e.g. "item_5538". Omit to return aggregate stats only. */
  key: z.string().min(1).optional(),
  /** When set, only these top-level fields are returned. */
  fields: z.array(z.string()).optional(),
});

export type GetSourceArgs = z.infer<typeof GetSourceInput>;

export async function runGetSource(args: GetSourceArgs, manager: SourceManager) {
  if (!isKnownSource(args.source)) {
    throw new Error(`Unknown source '${args.source}'. Use list_sources to see what's available.`);
  }
  if (!v01Set.has(args.source)) {
    throw new Error(
      `Source '${args.source}' is registered but not yet enabled in this build. ` +
        `v0.1 supports: ${[...v01Sources].join(', ')}.`,
    );
  }

  let loaded;
  try {
    loaded = await manager.load(args.source as SourceName);
  } catch (err) {
    if (err instanceof SourceNotAvailableError) {
      throw new Error(
        `Source '${args.source}' is not published at version ${err.version}. (${err.url})`,
      );
    }
    throw err;
  }

  const envelope = {
    source: args.source,
    version: loaded.version,
    fetchedAt: loaded.fetchedAt.toISOString(),
    entryCount: Object.keys(loaded.data).length,
  };

  if (!args.key) {
    return envelope;
  }

  const raw = loaded.data[args.key];
  if (raw === undefined) {
    return { ...envelope, key: args.key, found: false };
  }

  const data = args.fields ? projectFields(raw, args.fields) : raw;
  return { ...envelope, key: args.key, found: true, data };
}

function projectFields(raw: unknown, fields: string[]): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in (raw as Record<string, unknown>)) out[f] = (raw as Record<string, unknown>)[f];
  }
  return out;
}
