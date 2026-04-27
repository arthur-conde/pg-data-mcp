/**
 * Fetches a single source JSON file from the CDN. Pure GET — no caching,
 * no ETag negotiation in v0.1; that lands in v0.2. Errors propagate so the
 * caller can decide between "fail the whole load" and "skip this source".
 *
 * Uses global `fetch` (Node 22+) rather than `undici.request` because the
 * CDN serves gzip-compressed responses and `fetch` decompresses them
 * transparently — `request` returns the raw compressed bytes.
 */
export interface FetchSourceOptions {
  cdnRoot: string;
  version: string;
  source: string;
  timeoutMs: number;
}

export interface FetchedSource {
  url: string;
  version: string;
  body: Buffer;
  fetchedAt: Date;
}

export async function fetchSource(opts: FetchSourceOptions): Promise<FetchedSource> {
  const url = buildSourceUrl(opts);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: ac.signal });
    if (res.status === 404) {
      throw new SourceNotAvailableError(opts.source, opts.version, url);
    }
    if (!res.ok) {
      throw new Error(`CDN ${opts.source}.json returned HTTP ${res.status} from ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { url, version: opts.version, body: buf, fetchedAt: new Date() };
  } finally {
    clearTimeout(timer);
  }
}

export function buildSourceUrl(opts: FetchSourceOptions): string {
  // CDN URL pattern: {root}{version}/data/{source}.json
  // The root constant always ends with a slash, version never carries one.
  const root = opts.cdnRoot.endsWith('/') ? opts.cdnRoot : `${opts.cdnRoot}/`;
  return `${root}${opts.version}/data/${opts.source}.json`;
}

/** A source isn't published in this CDN version. Distinct from network errors. */
export class SourceNotAvailableError extends Error {
  constructor(
    public readonly source: string,
    public readonly version: string,
    public readonly url: string,
  ) {
    super(`Source '${source}' not available at version ${version} (${url})`);
    this.name = 'SourceNotAvailableError';
  }
}
