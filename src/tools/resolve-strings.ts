import { z } from 'zod';
import type { SourceManager } from '../sources/manager.js';

export const ResolveStringsInput = z.object({
  keys: z.array(z.string().min(1)).min(1).max(500),
});

export type ResolveStringsArgs = z.infer<typeof ResolveStringsInput>;

export async function runResolveStrings(args: ResolveStringsArgs, manager: SourceManager) {
  const loaded = await manager.load('strings_all');
  const out: Record<string, string | null> = {};
  for (const k of args.keys) {
    const v = loaded.data[k];
    out[k] = typeof v === 'string' ? v : null;
  }
  return {
    version: loaded.version,
    resolved: out,
    missing: Object.entries(out)
      .filter(([, v]) => v === null)
      .map(([k]) => k),
  };
}
