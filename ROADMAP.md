# pg-data-mcp roadmap

This is a hand-off doc for an agent picking up where v0.1 left off. Read it top-to-bottom before writing code — the conventions and trade-offs encoded below are the result of design choices already made with the project owner, not defaults to revisit.

## What v0.1 ships

Wired and live in production via `npx -y github:arthur-conde/pg-data-mcp` from project-gorgon's `.mcp.json`:

- CDN version auto-detection (`src/cdn/version-detector.ts`) — mirrors the .NET app's meta-refresh regex `/(v\d+)/` over `https://cdn.projectgorgon.com/`. Falls back to `PG_DATA_FALLBACK_VERSION` (default `v469`).
- HTTP fetcher (`src/cdn/fetcher.ts`) — uses global `fetch()` (Node 22+), **not** `undici.request`. Reason: `fetch` auto-decompresses gzip; `undici.request` returns the compressed bytes and a previous attempt with it shipped gzip garbage to the parser.
- Lazy in-memory loader (`src/sources/loader.ts`) keyed by `{version, source}`. No disk cache yet.
- Top-level [`SourceManager`](src/sources/manager.ts) — single per-process version detection, lazy index build, exposes `.items()` to tools.
- Item indexes (`src/sources/indexes.ts`): `byInternalName`, `byIconId`, `byEffectDescToken`, `byKeyword`. Built on first `manager.items()` call.
- Five MCP tools, all live and registered in [`server.ts`](src/server.ts):
  - `cdn_version` — current detected version + diagnostics.
  - `list_sources` — enumerate all 28 declared sources, mark which are loaded.
  - `get_source` — raw `(source, key)` lookup; v0.1 only routes items/recipes/npcs/strings_all.
  - `find_items` — filtered item search with `internal_name(_contains)`, `name_contains`, `icon_id`, `equip_slot`, `keyword`, `effect_desc_contains`, `skill_prereq`, `value_min/max`, plus `fields` projection and `limit/offset` paging.
  - `resolve_strings` — bulk lookup over `strings_all.json` (flat `key -> display string` map).
- Test suite: 23 tests / 7 files via `node:test`. `npm test` runs `tsc && node --test ...`.

The full 28-source enum already lives in [`src/sources/registry.ts`](src/sources/registry.ts) — `allSources` is the target; `v01Sources` is the four v0.1 actually loads. v0.2 doesn't add to the enum, it just stops gating on it.

## Conventions to keep

If you find yourself wanting to deviate from any of these, stop and ask the owner — they exist for reasons that came up in v0.1.

- **Raw passthrough, no typed shapes.** Sources are parsed once and kept as `Record<string, unknown>`. Don't build TS interfaces for items / recipes / etc. — every CDN field stays addressable, and the .NET app's narrow projections (which drop `Description`, `PrefaceText`, raw effect templates, etc.) are exactly the shapes we *don't* want to repeat. Tools narrow with property checks at the read site.
- **`zod` validation at every tool entry.** Each tool exports `XxxInput` (the schema) and `runXxx(args, manager)` (the handler). The server calls `XxxInput.parse(rawArgs ?? {})` before invoking the handler — this is what enforces refinements like "find_items requires at least one filter field." Tests must exercise the schema, not the handler directly, when checking input validation (an earlier test bypassed the refine and silently passed).
- **Byte-budgeted output.** Every tool that streams records (currently only `find_items`) caps output at `MAX_RESPONSE_BYTES = 5 * 1024 * 1024` and emits a `truncated: true` flag. Keep this pattern for new filter/join tools — without it a wide query against `effects.json` will overflow the MCP response.
- **`fields` projection on every list-shaped tool.** Callers should be able to ask for `["IconId", "EffectDescs"]` instead of the full 30-field item record. v0.1 implements `projectFields` inline in `find-items.ts`; if a second tool needs it, lift to `src/util/`.
- **Refuse unfiltered queries.** Every filter tool's zod refine must require at least one substantive filter. Without it, callers will accidentally pull whole sources and trip the byte cap. See `find-items.ts:27-40` for the pattern.
- **Indexes live in `src/sources/indexes.ts`, built lazily, cached on `SourceManager`.** Don't build them in tools and don't build them eagerly. The manager owns the cache (one keyed-by-version map per indexed source) so re-building only happens on `forgetVersion()`.
- **`zodToJsonSchema` is a hand-rolled shim in `server.ts`.** It only handles the zod constructs we actually use. If a new tool adds a construct (lazy, intersection, discriminated union, etc.), extend the `describe()` switch — don't reach for `zod-to-json-schema` the package; v0.1 deliberately avoids the dep.
- **CommonJS-incompatible imports — every relative import ends in `.js`.** ES module resolution under `"type": "module"` requires the extension; `tsc` does not add it. Lint-style: every import from `./` or `../` must end `.js` even though the source is `.ts`.
- **No `console.log` from the server — only `console.error`.** stdout is the MCP transport; anything written there breaks the protocol. Logs go to stderr.
- **`prepare: tsc` stays in package.json.** That script is what makes `npx -y github:arthur-conde/pg-data-mcp` work — npx clones, runs `npm install`, and `prepare` produces `dist/` which `bin` points at. Don't switch to `postinstall`; npm does not run `postinstall` in workspace-style installs.

## v0.2 — full source coverage + filter tools

Goal: every source listed in `allSources` is loadable, and the four most-asked-after non-item filter tools land. This is the biggest token-savings unlock — `effects.json` and `abilities.json` are the heaviest files and are completely opaque to the .NET app today.

### Tasks

1. **Drop the v0.1 source gate.** `src/tools/get-source.ts` (and any other site that switches on `args.source`) currently rejects sources outside `v01Sources`. After loader-level coverage is verified, remove that gate. The gate is the only reason v0.1 doesn't already serve all 28; the loader / fetcher are source-agnostic.
2. **First-touch 404 handling.** Some files in `allSources` may not exist on every CDN version. In `cdn/fetcher.ts`, on a 404 surface a clean error like `"source 'lorebookinfo' is not available in version v470"` and have `SourceManager.load` throw it through. Don't retry. Don't silently swap to a previous version. The owner has explicitly asked for "clear missing-file errors over silent omission."
3. **`find_recipes`.** Filter on `Skill`, `MinLevel`/`MaxLevel`, `ResultItems` containing internal_name, `Ingredients[].ItemCode` containing internal_name, result `EffectDescs` substring. Need new indexes in `indexes.ts`:
   - `recipes.bySkill: Map<string, Array<[key, entry]>>`
   - `recipes.byResultInternalName: Map<string, Array<[key, entry]>>` (resolved against the items source — this is the first cross-source index; build it on first call to `manager.recipes()` and have that method `await this.items()` first)
   - `recipes.byIngredientInternalName: Map<string, Array<[key, entry]>>` — same as above
4. **`find_npcs`.** Filter on area, gift-keyword preference (`Likes`/`Loves`/`Dislikes`/`Hates`), available services. Index `npcs.byArea`. Gift preferences are inverted (NPC -> keyword[]), so the index is built from that direction.
5. **`find_effects`.** Filter on token (substring on `Name`/`Desc`), referenced attribute (effects often reference `Mods` keyed by attribute name). Token index on `name + desc`, mod-name index. This is the headline v0.2 tool — today an "every effect that grants NetheriteSpec" question forces a Read of multi-MB JSON.
6. **`find_quests`.** Filter on `FavorNpc`, `Area`, `RequirementsToSneak[Skill]`, `Reward[Skill]`, `Objectives[].Target`, `Repeatable`. The quest data is the second-richest after items/effects.
7. **`find_abilities`.** Filter on `Skill`, level range, `Keywords`. Ability data is necessary for any "what's available at level X in skill Y" reasoning.
8. **`list_keys`.** Paged enumeration for any source — `{ source, prefix?, limit, offset }` -> `{ keys[], total, truncated }`. Currently the only way to discover keys is `get_source` with no key, which dumps the whole source's stat block. `list_keys` is the discovery primitive for the join tools in v0.3.
9. **ETag / If-Modified-Since on the fetcher.** Store the ETag and Last-Modified per `{version, source}`. On second fetch, send `If-None-Match`/`If-Modified-Since`; on 304, reuse the in-memory entry but bump `fetchedAt`. Wire only matters once `refresh` lands in v0.3 — but build it now so v0.3 is short.
10. **Opt-in disk cache.** Activated by `PG_DATA_CACHE_DIR` env var. Layout: `{cacheDir}/{version}/{source}.json` + `{source}.meta.json` sidecar (`{ etag, lastModified, fetchedAt, sha256 }`). On loader miss, check disk first; on miss-miss, fetch and atomically write (write to `{file}.tmp` then rename). Disabled by default — the server is stateless by design.

### Where to look in the .NET app

The .NET reference data service in the gorgon repo (`Mithril.Shared/Reference/`) has battle-tested implementations of most of the above. Cross-reference:

- `ReferenceDataService.RefreshFileAsync` — the canonical fetch-then-swap dance; informs the fetcher's atomic-write pattern for the disk cache.
- `ReferenceDataService.Keys` — what the .NET app actually loads (a strict subset of `allSources`); useful for ground-truth on which files definitely exist on the CDN.
- `CdnVersionDetector` — already mirrored in `src/cdn/version-detector.ts:11-30`.

The .NET parsers themselves (`ParseAndSwapItems`, `ParseAndSwapRecipes`, etc.) project narrow shapes — those are what we are *not* doing here. Do not port the projection logic.

### Tests v0.2 needs

- `cdn/fetcher.test.ts` — extend with a 304 round-trip fixture and a 404 fixture.
- `sources/loader.test.ts` — disk cache hit / miss / atomic-write-on-miss.
- `tools/find-recipes.test.ts`, `find-npcs.test.ts`, `find-effects.test.ts`, `find-quests.test.ts`, `find-abilities.test.ts` — one per new tool, each covering: zod refine rejects unfiltered, single-filter happy path, byte-cap truncation, `fields` projection.
- `tools/list-keys.test.ts` — prefix filter, paging.

## v0.3 — joins + freshness controls

Goal: cross-source queries that today require manual JSON munging become single tool calls. The two biggest wins are recipe-back-references and item-source resolution; the .NET app already does both internally and they're the most requested ad-hoc operations.

### Tasks

1. **`item_sources(internal_name | item_id)`.** Mirrors the .NET `ResolveSourceContext` join logic. Joins items + `sources_items.json` and adds NPC display names, recipe internal names, and quest internal names. The .NET implementation drops most context (only one of `Monster`/`Source`/`Interactor` survives); ours should keep all of them — that's a stated improvement target.
2. **`recipes_for_item(internal_name | item_id, role: "result" | "ingredient" | "any")`.** Indexes from v0.2 (`recipes.byResultInternalName`, `recipes.byIngredientInternalName`) make this trivial; just need the discriminating role param and the union case. Add `ProtoResultItems` to the result-side index — recipes occasionally encode results there instead.
3. **`abilities_for_skill(skill, min_level?, max_level?)`.** Joins abilities + skills + advancement tables. Useful for "what unlocks at the next level" reasoning.
4. **`quests_in_area(area, repeatable?, requires_skill?)`.** Filter+join over quests using the quest indexes from v0.2.
5. **`refresh(source?)`.** Force re-fetch of one source (or all if omitted). Returns `{ before: { version, fetchedAt }, after: { version, fetchedAt }, changed: bool }`. The server should call `manager.forgetVersion()` when `source` is omitted; per-source refresh just deletes the loader cache entry and re-fetches.
6. **Per-source freshness reporting.** Extend `cdn_version` to optionally include `{ source: { fetchedAt, etag } }[]` for every loaded source. Surfaces "this source is from before the patch" without requiring a manual `list_sources`.
7. **Stretch: live-vs-bundled diff.** A read-only tool that diffs the live CDN against the .NET app's bundled snapshot for a given source. Shape: `{ added: key[], removed: key[], changed: key[] }`. Useful on patch day. **Out of scope unless explicitly asked** — pulls a dependency on the gorgon repo's bundled data path (`Mithril.Shared/Reference/BundledData/`) which this repo deliberately does not have.

## Things that are out of scope — do not add without owner approval

- **TypeScript shapes for any source.** See conventions; raw passthrough is intentional.
- **Mutation tools.** Read-only by design. No POSTs to the CDN.
- **Authentication.** The CDN is public.
- **Game wire protocol / Player.log overlap.** That's `MithrilLogMcp`'s territory (sibling MCP server in the gorgon repo at `tools/MithrilLogMcp/`).
- **Switching the bin/main path back to `dist/server.js`.** TS preserves the source tree, so `dist/src/server.js` is correct and locked in by `package.json`.
- **Replacing `fetch()` with `undici.request`.** The `fetch` choice is load-bearing for gzip; v0.1 hit this exact bug. `undici.fetch` (the named export) would be acceptable but global `fetch` is simpler and identical at runtime in Node 22+.

## How to ship a v0.2/v0.3 change

1. Branch the repo. Build out the loader/index/tool. Tests next to the existing ones in `test/`.
2. `npm test` — must be green. `npm run build` — must produce no errors and no warnings.
3. Bump version in `package.json` (`0.1.0` -> `0.2.0` for the v0.2 batch). Tag the commit `v0.2.0`.
4. Push to `arthur-conde/pg-data-mcp`. The npx-from-github wiring in project-gorgon's `.mcp.json` resolves whatever's on `main`, so a push is the deploy.
5. Restart Claude Code in the gorgon workspace. New tools appear under `mcp__pg-data__*`.

There is no separate publish step. There is no npm registry. The repo *is* the deployment.

## Quick reference

- Repo: `arthur-conde/pg-data-mcp` (this repo, standalone — not under `project-gorgon/tools/`)
- Wired into: project-gorgon's [`.mcp.json`](../project%20gorgon/.mcp.json) under `mcpServers.pg-data` via npx-from-github
- CDN URL pattern: `https://cdn.projectgorgon.com/{version}/data/{source}.json`
- Version detection: regex `/\/(v\d+)\//` over the HTML body of `https://cdn.projectgorgon.com/`
- Sibling MCP: `mithril-logs` (in-tree at `project-gorgon/tools/MithrilLogMcp/`) — same MCP/zod/node:test conventions; useful as a reference for tool patterns this repo hasn't established yet
