import { z } from 'zod';
import type { SourceManager } from '../sources/manager.js';

export const CdnVersionInput = z.object({});

export type CdnVersionArgs = z.infer<typeof CdnVersionInput>;

export async function runCdnVersion(_args: CdnVersionArgs, manager: SourceManager) {
  const version = await manager.resolveVersion();
  return {
    version,
    detected: manager.detectedFromCdn(),
  };
}
