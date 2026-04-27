/**
 * Server configuration. Defaults match the .NET ReferenceDataService:
 *  - CDN root: https://cdn.projectgorgon.com/
 *  - Fallback version: v469 (same constant as ReferenceDataService.FallbackCdnVersion)
 * Each value is overridable by an env var so callers can point the server
 * at a staging CDN or pin to an older version for patch-day analysis.
 */
export interface ServerConfig {
  cdnRoot: string;
  fallbackVersion: string;
  fetchTimeoutMs: number;
  cacheDir: string | null;
}

export function loadConfig(): ServerConfig {
  return {
    cdnRoot: process.env.PG_DATA_CDN_ROOT ?? 'https://cdn.projectgorgon.com/',
    fallbackVersion: process.env.PG_DATA_FALLBACK_VERSION ?? 'v469',
    fetchTimeoutMs: Number.parseInt(process.env.PG_DATA_FETCH_TIMEOUT_MS ?? '30000', 10),
    cacheDir: process.env.PG_DATA_CACHE_DIR || null,
  };
}
