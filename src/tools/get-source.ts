import { z } from 'zod';
import { isKnownSource, type SourceName } from '../sources/registry.js';
import { surfaceSourceError } from '../util/source-errors.js';
import type { SourceManager } from '../sources/manager.js';

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

  const loaded = await surfaceSourceError(() => manager.load(args.source as SourceName));

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
