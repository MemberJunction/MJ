#!/usr/bin/env node
// Targeted amendment: flip PK from userId -> id on 5 order/score objects.
// The MCP validates each `iof` against the FULL IntegrationObjectFieldSchema
// (Name + Type required), so we read the current full field object, override
// ONLY IsPrimaryKey, and pass it through. Server merges {...existing, ...iof},
// so no sibling attribute is lost. We inspect each callTool result for isError.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const REPO_ROOT = resolve(process.cwd());
const SERVER = resolve(REPO_ROOT, 'packages/MCP/mj-metadata/dist/server.js');
const META_FILE = resolve(REPO_ROOT, 'metadata/integrations/path-lms/.path-lms.integration.json');

const OBJECTS = ['AssessmentScore', 'Order', 'OrderItem', 'RefundOrder', 'RefundOrderItem'];

function loadFields() {
  const data = JSON.parse(readFileSync(META_FILE, 'utf8'));
  const ios = data[0].relatedEntities['MJ: Integration Objects'];
  const byObj = {};
  for (const io of ios) {
    const name = io.fields?.Name;
    if (!OBJECTS.includes(name)) continue;
    const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    byObj[name] = {
      id: iofs.find((f) => f.fields.Name === 'id')?.fields,
      userId: iofs.find((f) => f.fields.Name === 'userId')?.fields,
    };
  }
  return byObj;
}

function isErrorResult(res) {
  // MCP tool errors return { isError: true, content: [...] } rather than throwing.
  return !!(res && res.isError);
}

async function callField(client, ioName, fields, overridePK) {
  const iof = { ...fields, IsPrimaryKey: overridePK };
  const res = await client.callTool({
    name: 'upsert_integration_object_field',
    arguments: { connector: 'path-lms', ioName, iof },
  });
  if (isErrorResult(res)) {
    const txt = (res.content ?? []).map((c) => c.text ?? '').join(' ');
    throw new Error(txt || 'MCP returned isError');
  }
  return res;
}

async function main() {
  const byObj = loadFields();

  const transport = new StdioClientTransport({ command: 'node', args: [SERVER], env: { ...process.env } });
  const client = new Client({ name: 'amend-pk-fixes', version: '1.0' }, { capabilities: {} });
  await client.connect(transport);

  let applied = 0;
  const rejected = [];

  for (const ioName of OBJECTS) {
    const cur = byObj[ioName];
    if (!cur || !cur.id || !cur.userId) {
      rejected.push({ slot: `iof.${ioName}`, reason: 'id or userId field not found in metadata' });
      continue;
    }
    // userId -> not PK
    try { await callField(client, ioName, cur.userId, false); applied++; }
    catch (e) { rejected.push({ slot: `iof.${ioName}.userId.IsPrimaryKey`, reason: String(e.message || e) }); }
    // id -> PK
    try { await callField(client, ioName, cur.id, true); applied++; }
    catch (e) { rejected.push({ slot: `iof.${ioName}.id.IsPrimaryKey`, reason: String(e.message || e) }); }
  }

  await client.close();
  process.stdout.write(JSON.stringify({ applied, rejected }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
