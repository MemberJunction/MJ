import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function main() {
  const transport = new SSEClientTransport(new URL('http://localhost:3100/mcp'));
  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  await client.connect(transport);
  console.log('Connected to MCP server');
  
  // List available tools
  const tools = await client.listTools();
  console.log('Available tools:', JSON.stringify(tools, null, 2));
  
  await client.close();
}

main().catch(console.error);
