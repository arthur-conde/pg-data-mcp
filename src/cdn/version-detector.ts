import { request } from 'undici';

/**
 * Detects the current CDN version. The CDN root returns an HTML meta-refresh
 * page like:
 *
 *     <meta http-equiv="refresh" content="2; URL=http://cdn.projectgorgon.com/v469/data/index.html">
 *
 * — we GET the body and pull the version segment out via regex. Mirrors
 * `Mithril.Shared.Reference.CdnVersionDetector.cs` exactly.
 */
const VERSION_RE = /\/(v\d+)\//;

export interface DetectVersionOptions {
  cdnRoot: string;
  timeoutMs: number;
  /** Override response text for tests. When set, no HTTP call is made. */
  bodyOverride?: string;
}

export async function detectCdnVersion(opts: DetectVersionOptions): Promise<string | null> {
  if (opts.bodyOverride !== undefined) {
    return matchVersion(opts.bodyOverride);
  }
  try {
    const res = await request(opts.cdnRoot, {
      method: 'GET',
      headersTimeout: opts.timeoutMs,
      bodyTimeout: opts.timeoutMs,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) return null;
    const body = await res.body.text();
    return matchVersion(body);
  } catch {
    return null;
  }
}

function matchVersion(body: string): string | null {
  const m = VERSION_RE.exec(body);
  return m ? m[1]! : null;
}
