import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { SourceName } from './registry.js';

/**
 * Opt-in disk cache keyed by `{cacheDir}/{version}/{source}.json` plus a
 * `.meta.json` sidecar. Atomic-write via `{file}.tmp` + rename; sha256 in
 * the sidecar guards against a half-written file from a previous crash.
 *
 * Disabled when `cacheDir` is null — the server is stateless by default.
 */
export interface DiskCacheEntryMeta {
  etag: string | null;
  lastModified: string | null;
  fetchedAt: string;
  sha256: string;
}

export interface DiskCacheEntry {
  body: Buffer;
  meta: DiskCacheEntryMeta;
}

export class DiskCache {
  constructor(private readonly cacheDir: string) {}

  private dataPath(version: string, source: SourceName): string {
    return path.join(this.cacheDir, version, `${source}.json`);
  }

  private metaPath(version: string, source: SourceName): string {
    return path.join(this.cacheDir, version, `${source}.meta.json`);
  }

  async read(version: string, source: SourceName): Promise<DiskCacheEntry | null> {
    let body: Buffer;
    let metaText: string;
    try {
      [body, metaText] = await Promise.all([
        readFile(this.dataPath(version, source)),
        readFile(this.metaPath(version, source), 'utf8'),
      ]);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    let meta: DiskCacheEntryMeta;
    try {
      meta = JSON.parse(metaText) as DiskCacheEntryMeta;
    } catch {
      return null;
    }
    const actual = sha256(body);
    if (actual !== meta.sha256) return null;
    return { body, meta };
  }

  async write(version: string, source: SourceName, body: Buffer, meta: Omit<DiskCacheEntryMeta, 'sha256'>): Promise<void> {
    const dir = path.join(this.cacheDir, version);
    await mkdir(dir, { recursive: true });
    const data = this.dataPath(version, source);
    const metaFile = this.metaPath(version, source);
    const sha = sha256(body);
    const fullMeta: DiskCacheEntryMeta = { ...meta, sha256: sha };
    const dataTmp = `${data}.tmp`;
    const metaTmp = `${metaFile}.tmp`;
    await writeFile(dataTmp, body);
    await writeFile(metaTmp, JSON.stringify(fullMeta), 'utf8');
    await rename(dataTmp, data);
    await rename(metaTmp, metaFile);
  }

  /** Updates only the sidecar — used after a 304 reuse to bump fetchedAt. */
  async touch(version: string, source: SourceName, meta: DiskCacheEntryMeta): Promise<void> {
    const dir = path.join(this.cacheDir, version);
    await mkdir(dir, { recursive: true });
    const metaFile = this.metaPath(version, source);
    const tmp = `${metaFile}.tmp`;
    await writeFile(tmp, JSON.stringify(meta), 'utf8');
    await rename(tmp, metaFile);
  }
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
