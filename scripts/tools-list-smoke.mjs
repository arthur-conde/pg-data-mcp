#!/usr/bin/env node
// Boots the built server, sends initialize + tools/list, and asserts:
//   1. The handshake completes.
//   2. At least the expected number of tools is enumerated.
//   3. Every tool's inputSchema declares JSON Schema draft-2020-12.
//
// Used by .github/workflows/tools-list-smoke.yml. Stays under scripts/ rather
// than test/ so it's clearly a CI smoke (live-binary), not a unit test.

import { spawn } from 'node:child_process';
import * as path from 'node:path';

const EXPECTED_MIN_TOOLS = 36;
const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const SERVER_ENTRY = path.resolve('dist/src/server.js');
const STARTUP_GRACE_MS = Number(process.env.SMOKE_STARTUP_GRACE_MS ?? 1500);

function run() {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      PG_DATA_FALLBACK_VERSION: process.env.PG_DATA_FALLBACK_VERSION ?? 'v0smoke',
      PG_DATA_FETCH_TIMEOUT_MS: process.env.PG_DATA_FETCH_TIMEOUT_MS ?? '500',
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  return new Promise((resolve, reject) => {
    const responses = [];
    let buf = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.length > 0) {
          try {
            responses.push(JSON.parse(line));
          } catch {
            // ignore non-JSON-RPC frames
          }
        }
        nl = buf.indexOf('\n');
      }
    });

    const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n');
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'tools-list-smoke', version: '0' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

    setTimeout(() => {
      child.stdin.end();
    }, STARTUP_GRACE_MS);

    child.once('exit', () => resolve(responses));
    child.once('error', reject);
  });
}

const responses = await run();

const init = responses.find((r) => r.id === 1);
if (!init || init.error) {
  console.error('FAIL: initialize did not return cleanly');
  console.error(JSON.stringify(init, null, 2));
  process.exit(1);
}

const list = responses.find((r) => r.id === 2);
if (!list || !list.result || !Array.isArray(list.result.tools)) {
  console.error('FAIL: tools/list did not return a tools array');
  console.error(JSON.stringify(list, null, 2));
  process.exit(1);
}

const tools = list.result.tools;
if (tools.length < EXPECTED_MIN_TOOLS) {
  console.error(`FAIL: expected at least ${EXPECTED_MIN_TOOLS} tools, got ${tools.length}`);
  console.error(tools.map((t) => t.name).sort());
  process.exit(1);
}

const missingSchema = tools.filter((t) => t.inputSchema?.$schema !== DRAFT_2020_12);
if (missingSchema.length > 0) {
  console.error(`FAIL: ${missingSchema.length} tool(s) missing draft-2020-12 $schema`);
  for (const t of missingSchema) {
    console.error(`  - ${t.name}: $schema=${t.inputSchema?.$schema ?? '(undefined)'}`);
  }
  process.exit(1);
}

console.log(`OK: ${tools.length} tools enumerated, all declare draft-2020-12.`);
console.log(tools.map((t) => t.name).sort().join('\n'));
