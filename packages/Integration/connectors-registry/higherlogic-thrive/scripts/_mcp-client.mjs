#!/usr/bin/env node
// Minimal MCP stdio client for invoking mj-metadata tools from Bash. Ad hoc tooling script (not
// part of the connector's own extraction pipeline) used to drive the mj-metadata MCP server the
// same way any MCP-aware agent client would, from a plain Bash subprocess.
// Usage: node _mcp-client.mjs <toolName> <jsonArgsFile>
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';

const [, , toolName, argsFile] = process.argv;
if (!toolName || !argsFile) {
    console.error('Usage: node _mcp-client.mjs <toolName> <jsonArgsFile>');
    process.exit(1);
}
const args = JSON.parse(readFileSync(argsFile, 'utf-8'));

const transport = new StdioClientTransport({
    command: 'node',
    args: ['/Users/bcladmin/Projects/MemberJunction/MJ/packages/MCP/mj-metadata/dist/server.js'],
    env: { ...process.env },
});
const client = new Client({ name: 'metadata-writer-cli', version: '1.0' }, { capabilities: {} });
await client.connect(transport);
try {
    const result = await client.callTool({ name: toolName, arguments: args });
    console.log(JSON.stringify(result, null, 2));
    if (result.isError) process.exitCode = 1;
} finally {
    await client.close();
}
