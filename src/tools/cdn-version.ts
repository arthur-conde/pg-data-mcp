import { z } from 'zod';
import type { SourceManager } from '../sources/manager.js';

export const CdnVersionInput = z.object({
  /** When true, also returns per-source `{ source, fetchedAt, etag, entryCount }` for every loaded source. */
  include_loaded: z.boolean().optional().default(false),
});

export type CdnVersionArgs = z.infer<typeof CdnVersionInput>;

export async function runCdnVersion(args: CdnVersionArgs, manager: SourceManager) {
  const version = await manager.resolveVersion();
  const base = {
    version,
    detected: manager.detectedFromCdn(),
  };
  if (!args.include_loaded) return base;
  const loaded = manager.loaded().map((s) => ({
    source: s.source,
    fetchedAt: s.fetchedAt.toISOString(),
    etag: s.etag,
    entryCount: Object.keys(s.data).length,
  }));
  return { ...base, loaded };
}
