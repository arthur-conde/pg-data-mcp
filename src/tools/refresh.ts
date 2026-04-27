import { z } from 'zod';
import { allSources, type SourceName } from '../sources/registry.js';
import type { SourceManager } from '../sources/manager.js';
import { surfaceSourceError } from '../util/source-errors.js';

export const RefreshInput = z.object({
  /** Source to refresh. Omit to forget the detected version + clear all loaded sources. */
  source: z.enum(allSources as unknown as [SourceName, ...SourceName[]]).optional(),
});

export type RefreshArgs = z.infer<typeof RefreshInput>;

export async function runRefresh(args: RefreshArgs, manager: SourceManager) {
  if (!args.source) {
    const before = await manager.resolveVersion();
    manager.forgetVersion();
    const after = await manager.resolveVersion();
    return {
      scope: 'all',
      before: { version: before },
      after: { version: after },
      changed: before !== after,
    };
  }

  const before = manager.loaded().find((s) => s.source === args.source) ?? null;
  const beforeFreshness = before
    ? { version: before.version, fetchedAt: before.fetchedAt.toISOString(), etag: before.etag }
    : null;

  const reloaded = await surfaceSourceError(() => manager.revalidate(args.source!));
  const afterFreshness = {
    version: reloaded.version,
    fetchedAt: reloaded.fetchedAt.toISOString(),
    etag: reloaded.etag,
  };

  const changed =
    !before ||
    before.etag !== reloaded.etag ||
    before.fetchedAt.getTime() !== reloaded.fetchedAt.getTime();

  return {
    scope: 'source',
    source: args.source,
    before: beforeFreshness,
    after: afterFreshness,
    changed,
  };
}
