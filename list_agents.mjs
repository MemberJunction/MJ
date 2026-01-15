import { Client } from './node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { SSEClientTransport } from './node_modules/@modelcontextprotocol/sdk/dist/esm/client/sse.js';

async function main() {
  console.log('Connecting to MCP server...');
  const transport = new SSEClientTransport(new URL('http://localhost:3100/mcp'));
  
  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  try {
    await Promise.race([
      client.connect(transport),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 30000))
    ]);
    console.log('Connected!');
    
    // List available tools
    const tools = await client.listTools();
    console.log('Total tools:', tools.tools.length);
    
    // Find agent tools
    const agentTools = tools.tools.filter(t => 
      t.name.includes('Agent') || 
      t.name.includes('Discover') ||
      t.name.includes('Skip')
    );
    
    console.log('\n=== Agent Tools ===');
    for (const tool of agentTools) {
      const desc = tool.description ? tool.description.substring(0, 100) : 'No description';
      console.log('- ' + tool.name + ': ' + desc);
    }
    
    // Call Discover_Agents if available
    const discoverTool = agentTools.find(t => t.name === 'Discover_Agents');
    if (discoverTool) {
      console.log('\n=== Discovering Agents ===');
      const result = await client.callTool({ name: 'Discover_Agents', arguments: { pattern: '*' } });
      console.log('Agents:', result);
    }
    
    await client.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
