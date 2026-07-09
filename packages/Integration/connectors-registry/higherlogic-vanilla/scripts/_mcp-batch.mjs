#!/usr/bin/env node
// Batch MCP stdio client for mj-metadata: invokes the SAME tool repeatedly (once per array entry)
// over a single server connection, so N provenance/code-evidence entries don't pay N server
// startup costs. Ad hoc tooling script (not part of the connector's own extraction pipeline).
// Usage: node _mcp-batch.mjs <toolName> <jsonArrayFile>
//   Each element of the array is the "entry" (for append_provenance/append_code_evidence) or the
//   full arguments object (for other tools) -- see the per-tool branch below.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';

const [, , toolName, itemsFile] = process.argv;
if (!toolName || !itemsFile) {
    console.error('Usage: node _mcp-batch.mjs <toolName> <jsonArrayFile>');
    process.exit(1);
}
const items = JSON.parse(readFileSync(itemsFile, 'utf-8'));
const connector = 'higherlogic-vanilla';

const transport = new StdioClientTransport({
    command: 'node',
    args: ['/Users/bcladmin/Projects/MemberJunction/MJ/packages/MCP/mj-metadata/dist/server.js'],
    env: { ...process.env },
});
const client = new Client({ name: 'metadata-writer-batch-cli', version: '1.0' }, { capabilities: {} });
await client.connect(transport);

let okCount = 0;
let errCount = 0;
try {
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let args;
        if (toolName === 'append_provenance' || toolName === 'append_code_evidence') {
            args = { connector, entry: item };
        } else {
            args = { connector, ...item };
        }
        const result = await client.callTool({ name: toolName, arguments: args });
        const text = result.content?.[0]?.text ?? '';
        if (result.isError) {
            errCount++;
            console.error(`[${i}] ERROR: ${text}`);
        } else {
            okCount++;
            console.log(`[${i}] OK: ${text}`);
        }
    }
} finally {
    await client.close();
}
console.log(`\nDone. ok=${okCount} err=${errCount} total=${items.length}`);
if (errCount > 0) process.exitCode = 1;
