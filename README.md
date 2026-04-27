# pg-data-mcp

MCP server exposing **Project Gorgon** reference data — items, recipes, NPCs, effects, ability tables, strings, etc. — to Claude Code as typed queries against the **live CDN** (`cdn.projectgorgon.com`). Replaces the high-token `Read`/`Grep` workflow over multi-MB JSON dumps with focused tool calls that return parsed records.

This is a personal-tooling MCP server. It has no relationship to any specific PG client app — it just consumes the public CDN.

## Status

- **v0.1** — version detection + CDN fetcher (no cache) + items/recipes/npcs/strings sources + 5 tools (`cdn_version`, `list_sources`, `get_source`, `find_items`, `resolve_strings`).
- **v0.2** — full 28-source coverage; `find_recipes`, `find_npcs`, `find_effects`, `find_quests`, `find_abilities`; ETag/If-Modified-Since; opt-in disk cache.
- **v0.3** — cross-source joins (`item_sources`, `recipes_for_item`, `abilities_for_skill`); `refresh` tool; per-source freshness reporting.

## Building & running

```bash
npm install
npm run build
npm test
```

## Wiring into Claude Code (user scope)

Edit `~/.claude.json` at the top-level `mcpServers` (NOT inside a per-project block):

```jsonc
{
  "mcpServers": {
    "pg-data": {
      "command": "node",
      "args": ["C:/Users/arthu/src/pg-data-mcp/dist/src/server.js"]
    }
  }
}
```

Restart Claude Code; `mcp__pg-data__*` tools become available across every workspace.

## Architecture

`src/cdn/` handles CDN access — version detection (HTML meta-refresh regex), fetching, in-memory caching keyed by `{version, source}`. `src/sources/` lazy-loads each source into a `Map<key, raw>` and builds secondary indexes on first query. `src/tools/` are the user-facing MCP tools, validated by `zod`.

The CDN URL pattern is `https://cdn.projectgorgon.com/{version}/data/{source}.json`. Version is detected by GETting the CDN root and extracting the version from a `<meta http-equiv="refresh" ...>` tag (mirrors what the in-game launcher does).

## Env vars

| Var | Purpose |
|---|---|
| `PG_DATA_FALLBACK_VERSION` | Version to use if detection fails (default `v469`). |
| `PG_DATA_CACHE_DIR` | Optional disk cache root. When set, fetched JSON is written under `{dir}/{version}/{source}.json` with a `.meta.json` sidecar for cache reuse across server restarts. Disabled by default. |
| `PG_DATA_FETCH_TIMEOUT_MS` | HTTP fetch timeout (default 30000). |
