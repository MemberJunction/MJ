import http from 'http';

// Send a JSON-RPC request to the MCP server via POST
async function callMCP(method, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: method,
      params: params
    });

    const options = {
      hostname: 'localhost',
      port: 3100,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Call Run_Agent via tools/call method
async function main() {
  try {
    // First, list available tools
    console.log('Listing tools...');
    const listResult = await callMCP('tools/list', {});
    console.log('Tools available:', JSON.stringify(listResult, null, 2));
  } catch(err) {
    console.error('Error:', err.message);
  }
}

main();
