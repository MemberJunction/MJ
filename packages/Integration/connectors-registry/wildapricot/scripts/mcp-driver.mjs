import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/MCP/mj-metadata/dist/server.js';

export async function withMCPClient(fn) {
    const transport = new StdioClientTransport({
        command: 'node',
        args: [SERVER_PATH],
        env: {
            ...process.env,
            MJ_CONNECTORS_REGISTRY: '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry',
            MJ_METADATA_ROOT: '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations',
        },
    });
    const client = new Client({ name: 'wa-driver', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    try {
        return await fn(client);
    } finally {
        await client.close();
    }
}

export async function callTool(client, name, args) {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    if (res.isError) throw new Error(`Tool ${name} failed: ${text}`);
    return text;
}
