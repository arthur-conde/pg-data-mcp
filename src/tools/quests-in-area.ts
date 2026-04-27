import { z } from 'zod';
import type { Entry, Hit } from '../sources/indexes.js';
import type { SourceManager } from '../sources/manager.js';
import { streamHits } from '../util/result-stream.js';
import { surfaceSourceError } from '../util/source-errors.js';

export const QuestsInAreaInput = z.object({
  area: z.string().min(1),
  repeatable: z.boolean().optional(),
  requires_skill: z.string().optional(),
  fields: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
});

export type QuestsInAreaArgs = z.infer<typeof QuestsInAreaInput>;

export async function runQuestsInArea(args: QuestsInAreaArgs, manager: SourceManager) {
  const t0 = performance.now();
  const { source, indexes } = await surfaceSourceError(() => manager.quests());
  const candidates: Hit[] = indexes.byArea.get(args.area) ?? [];

  const stream = streamHits(candidates, (entry) => matches(entry, args), {
    limit: args.limit,
    offset: args.offset,
    fields: args.fields,
  });

  const elapsedMs = Math.round(performance.now() - t0);
  return {
    summary: { version: source.version, area: args.area, ...stream.summary, elapsedMs },
    items: stream.items,
  };
}

function matches(entry: Entry, args: QuestsInAreaArgs): boolean {
  if (args.repeatable !== undefined) {
    const r = entry.Repeatable;
    if (typeof r !== 'boolean' || r !== args.repeatable) return false;
  }
  if (args.requires_skill) {
    const reqsToSneak = asRecord(entry.RequirementsToSneak);
    const reqs = asRecord(entry.Requirements);
    const has =
      (reqsToSneak !== null && args.requires_skill in reqsToSneak) ||
      (reqs !== null && args.requires_skill in reqs);
    if (!has) return false;
  }
  return true;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
