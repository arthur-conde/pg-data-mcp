import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

/**
 * Single source of truth for the server's own package version. Read once
 * at module load from package.json so we don't have to bump the constant
 * in two places on every release.
 *
 * Path math: this file compiles to `dist/src/version.js`; the repo-root
 * `package.json` is two levels up from there. The same is true at source
 * (`src/version.ts` → `../package.json`), but `tsc` mirrors the source
 * tree under `dist/`, so we resolve via `../../` to land at the root in
 * both source and compiled forms.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(here, '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name: string; version: string };

export const SERVER_NAME = 'pg-data';
export const SERVER_VERSION: string = pkg.version;
export const PACKAGE_NAME: string = pkg.name;
