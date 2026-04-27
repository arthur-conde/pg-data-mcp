import type { Entry, Hit } from '../sources/indexes.js';

/**
 * Byte-budgeted result accumulator shared by every list-shaped tool. Caps
 * the encoded JSON of returned records at `MAX_RESPONSE_BYTES` and emits a
 * `truncated: true` flag — without this, a wide query against effects.json
 * or items.json would overflow the MCP response.
 *
 * Responsibility split:
 *   - The caller picks the cheapest index, decides which entries match.
 *   - This helper handles paging, projection, byte budget, truncation flag.
 */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export interface StreamOptions {
  limit: number;
  offset: number;
  fields?: string[] | undefined;
  maxBytes?: number;
}

export interface StreamSummary {
  matched: number;
  returned: number;
  truncated: boolean;
}

export interface StreamResult {
  items: Array<{ key: string; data: Entry }>;
  summary: StreamSummary;
}

/**
 * Iterate `candidates` (index hits) applying `matches`, then page + project
 * + budget. The `matches` callback is run in caller-provided cheapest order.
 */
export function streamHits(
  candidates: Iterable<Hit>,
  matches: (entry: Entry) => boolean,
  opts: StreamOptions,
): StreamResult {
  const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES;
  const items: Array<{ key: string; data: Entry }> = [];
  let matched = 0;
  let skipped = 0;
  let truncated = false;
  let bytesEmitted = 0;

  for (const [key, entry] of candidates) {
    if (!matches(entry)) continue;
    matched += 1;
    if (skipped < opts.offset) {
      skipped += 1;
      continue;
    }
    if (items.length >= opts.limit) {
      truncated = true;
      continue;
    }
    const projected = opts.fields ? projectFields(entry, opts.fields) : entry;
    const encoded = JSON.stringify(projected);
    if (bytesEmitted + encoded.length > maxBytes) {
      truncated = true;
      break;
    }
    items.push({ key, data: projected });
    bytesEmitted += encoded.length + 2;
  }

  return { items, summary: { matched, returned: items.length, truncated } };
}

export function projectFields(entry: Entry, fields: string[]): Entry {
  const out: Entry = {};
  for (const f of fields) if (f in entry) out[f] = entry[f];
  return out;
}

/**
 * Yields `[key, entry]` for every object-valued top-level entry in `data`.
 * Skips primitives and arrays (matches existing `find-items` scanAll).
 */
export function* scanAll(data: Record<string, unknown>): IterableIterator<Hit> {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      yield [k, v as Entry];
    }
  }
}
