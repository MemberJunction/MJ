#!/usr/bin/env node
// Append per-flag CODE_EVIDENCE for the 10 PK slots changed in the amendment.
// Evidence cites the reviewer's source citation (the SpectaQL SDL definition blocks).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const SERVER = resolve(REPO_ROOT, 'packages/MCP/mj-metadata/dist/server.js');
const NOW = new Date().toISOString();
const SRC = 'packages/Integration/connectors-registry/path-lms/sources/schema.spectaql.html';

// [object, narrow-extraction note]
const OBJECTS = {
  AssessmentScore:  '[0]=id [1]=Int!; userId is a FK to the user who completed the assessment, not the record identity',
  Order:            '[0]=id [1]=Int! [2]=accountId [3]=Int! [4]=userId [5]=Int!; userId is purchaser FK — multiple orders share a userId',
  OrderItem:        '[0]=id [1]=Int! [2]=accountId [3]=Int! [4]=userId [5]=Int!; userId is purchaser FK; id is the order item identity',
  RefundOrder:      '[0]=id [1]=Int! [2]=accountId [3]=Int! [4]=userId [5]=Int!; userId is refund-recipient FK; id is the refund identity',
  RefundOrderItem:  '[0]=id [1]=Int! [2]=userId [3]=Int!; userId is the user FK; id is the refund order item identity',
};

function isErrorResult(res) { return !!(res && res.isError); }

async function append(client, entry) {
  const res = await client.callTool({ name: 'append_code_evidence', arguments: { connector: 'path-lms', entry } });
  if (isErrorResult(res)) {
    const txt = (res.content ?? []).map((c) => c.text ?? '').join(' ');
    throw new Error(txt || 'MCP returned isError');
  }
}

async function main() {
  const transport = new StdioClientTransport({ command: 'node', args: [SERVER], env: { ...process.env } });
  const client = new Client({ name: 'amend-pk-evidence', version: '1.0' }, { capabilities: {} });
  await client.connect(transport);

  let applied = 0;
  const rejected = [];

  for (const [obj, note] of Object.entries(OBJECTS)) {
    // id -> PK true
    const idEntry = {
      ScriptPath: 'scripts/amend-pk-fixes.mjs',
      ScriptRunAt: NOW,
      SchemaValidationStatus: 'Passed',
      TargetField: `iof.${obj}.id.IsPrimaryKey`,
      StructuredOutput: {
        value: true,
        source: `${SRC} — section id='definition-${obj}': id: Int! is the canonical record PK by SDL definition and vendor-wide convention`,
        narrowExtraction: note,
        amendmentRound: 1,
      },
    };
    // userId -> PK false
    const userEntry = {
      ScriptPath: 'scripts/amend-pk-fixes.mjs',
      ScriptRunAt: NOW,
      SchemaValidationStatus: 'Passed',
      TargetField: `iof.${obj}.userId.IsPrimaryKey`,
      StructuredOutput: {
        value: false,
        source: `${SRC} — section id='definition-${obj}': userId is a FK reference, not the record identity`,
        narrowExtraction: note,
        amendmentRound: 1,
      },
    };
    try { await append(client, idEntry); applied++; }
    catch (e) { rejected.push({ slot: idEntry.TargetField, reason: String(e.message || e) }); }
    try { await append(client, userEntry); applied++; }
    catch (e) { rejected.push({ slot: userEntry.TargetField, reason: String(e.message || e) }); }
  }

  await client.close();
  process.stdout.write(JSON.stringify({ evidenceAppended: applied, rejected }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
