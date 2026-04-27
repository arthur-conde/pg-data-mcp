import { z } from 'zod';
import type { SourceManager } from '../sources/manager.js';
import { PACKAGE_NAME, SERVER_NAME, SERVER_VERSION } from '../version.js';

export const ServerInfoInput = z.object({});

export type ServerInfoArgs = z.infer<typeof ServerInfoInput>;

export async function runServerInfo(_args: ServerInfoArgs, manager: SourceManager) {
  const referenceDataVersion = await manager.resolveVersion();
  return {
    server: {
      name: SERVER_NAME,
      package: PACKAGE_NAME,
      version: SERVER_VERSION,
    },
    referenceData: {
      version: referenceDataVersion,
      detected: manager.detectedFromCdn(),
    },
  };
}
