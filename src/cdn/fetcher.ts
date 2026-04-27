/**
 * Fetches a single source JSON file from the CDN. Honours `If-None-Match` /
 * `If-Modified-Since` so the loader can revalidate without paying the full
 * download on unchanged sources. Errors propagate so the caller can decide
 * between "fail the whole load" and "skip this source".
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
  /** Sent as `If-None-Match`; on 304 the caller reuses the cached body. */
  ifNoneMatch?: string | null;
  /** Sent as `If-Modified-Since`; on 304 the caller reuses the cached body. */
  ifModifiedSince?: string | null;
}

export interface FetchedSource {
  url: string;
  version: string;
  /** Empty buffer when `notModified` is true. */
  body: Buffer;
  fetchedAt: Date;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}

export async function fetchSource(opts: FetchSourceOptions): Promise<FetchedSource> {
  const url = buildSourceUrl(opts);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch;
    if (opts.ifModifiedSince) headers['If-Modified-Since'] = opts.ifModifiedSince;
    const res = await fetch(url, { method: 'GET', signal: ac.signal, headers });
    if (res.status === 304) {
      return {
        url,
        version: opts.version,
        body: Buffer.alloc(0),
        fetchedAt: new Date(),
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        notModified: true,
      };
    }
    if (res.status === 404) {
      throw new SourceNotAvailableError(opts.source, opts.version, url);
    }
    if (!res.ok) {
      throw new Error(`CDN ${opts.source}.json returned HTTP ${res.status} from ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      url,
      version: opts.version,
      body: buf,
      fetchedAt: new Date(),
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      notModified: false,
    };
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
    super(`source '${source}' is not available in version ${version} (${url})`);
    this.name = 'SourceNotAvailableError';
  }
}
