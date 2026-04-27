import { SourceNotAvailableError } from '../cdn/fetcher.js';

/**
 * Re-throws `SourceNotAvailableError` as a friendly "source 'X' is not
 * available in version V" tool error and lets every other error propagate.
 * Six tools use this; lifted out of `get-source.ts` so the wording stays
 * consistent.
 */
export async function surfaceSourceError<T>(thunk: () => Promise<T>): Promise<T> {
  try {
    return await thunk();
  } catch (err) {
    if (err instanceof SourceNotAvailableError) {
      throw new Error(
        `source '${err.source}' is not available in version ${err.version} (${err.url})`,
      );
    }
    throw err;
  }
}
