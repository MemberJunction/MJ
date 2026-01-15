import { Client } from './node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { SSEClientTransport } from './node_modules/@modelcontextprotocol/sdk/dist/esm/client/sse.js';

async function main() {
  console.log('Creating SSE transport...');
  const transport = new SSEClientTransport(new URL('http://localhost:3100/mcp'));
  
  console.log('Creating client...');
  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  console.log('Connecting to MCP server...');
  await client.connect(transport);
  console.log('Connected!');
  
  // List available tools
  console.log('Listing tools...');
  const tools = await client.listTools();
  console.log('Available tools:', JSON.stringify(tools, null, 2));
  
  // Find agent tools
  const agentTools = tools.tools.filter(t => t.name.includes('Agent') || t.name.includes('Skip'));
  console.log('\nAgent-related tools:', agentTools.map(t => t.name));
  
  await client.close();
}

main().catch(console.error);
