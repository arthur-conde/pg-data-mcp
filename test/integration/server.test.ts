import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(here, '..', '..', 'src', 'server.js');

interface JsonRpcResponse { id: number; result?: unknown; error?: unknown }

/**
 * Boots the server as a real subprocess, sends initialize + tools/list,
 * collects responses, then closes stdin so it exits cleanly. Pins the
 * stdio handshake and the v0.1 tool surface.
 */
async function rpc(messages: object[]): Promise<JsonRpcResponse[]> {
  const child = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, PG_DATA_FALLBACK_VERSION: 'v0test', PG_DATA_FETCH_TIMEOUT_MS: '250' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const responses: JsonRpcResponse[] = [];
  let buffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length > 0) {
        try { responses.push(JSON.parse(line) as JsonRpcResponse); } catch { /* ignore non-frame lines */ }
      }
      nl = buffer.indexOf('\n');
    }
  });
  for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n');
  // Give the server a moment to flush before closing stdin.
  await new Promise((r) => setTimeout(r, 250));
  child.stdin.end();
  await new Promise((r) => child.once('exit', r));
  return responses;
}

describe('server stdio handshake', () => {
  it('completes initialize and lists the full tool surface', async () => {
    const out = await rpc([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ]);

    const init = out.find((r) => r.id === 1);
    assert.ok(init, 'initialize response missing');
    const list = out.find((r) => r.id === 2);
    assert.ok(list, 'tools/list response missing');
    const tools = (list!.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, [
      'abilities_for_skill',
      'cdn_version',
      'find_abilities',
      'find_abilitydynamicdots',
      'find_abilitydynamicspecialvalues',
      'find_abilitykeywords',
      'find_ai',
      'find_areas',
      'find_attributes',
      'find_directedgoals',
      'find_effects',
      'find_items',
      'find_items_raw',
      'find_itemuses',
      'find_landmarks',
      'find_lorebookinfo',
      'find_lorebooks',
      'find_npcs',
      'find_playertitles',
      'find_quests',
      'find_recipes',
      'find_sources_abilities',
      'find_sources_recipes',
      'find_storagevaults',
      'find_tsysclientinfo',
      'find_tsysprofiles',
      'find_xptables',
      'get_source',
      'item_sources',
      'list_keys',
      'list_sources',
      'quests_in_area',
      'recipes_for_item',
      'refresh',
      'resolve_strings',
      'server_info',
    ]);
  });

  it('every tool inputSchema declares draft-2020-12', async () => {
    const out = await rpc([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ]);
    const list = out.find((r) => r.id === 2);
    const tools = (list!.result as { tools: Array<{ name: string; inputSchema: Record<string, unknown> }> }).tools;
    for (const t of tools) {
      assert.equal(
        t.inputSchema['$schema'],
        'https://json-schema.org/draft/2020-12/schema',
        `tool ${t.name} missing draft-2020-12 $schema`,
      );
    }
  });
});
