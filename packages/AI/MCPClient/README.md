# @memberjunction/ai-mcp-client

MemberJunction MCP (Model Context Protocol) Client implementation for consuming tools from external MCP servers.

## Overview

This package provides a comprehensive MCP client implementation that enables MemberJunction agents, actions, and services to invoke tools from external MCP-enabled servers. It supports multiple transport types, authentication methods, rate limiting, and execution logging.

## Features

- **Multiple Transport Types**: StreamableHTTP, SSE, Stdio, and WebSocket
- **Flexible Authentication**: None, Bearer, APIKey, OAuth2, Basic, and Custom
- **Credential Integration**: Seamless integration with MJ's CredentialEngine for secure secret storage
- **Rate Limiting**: Per-minute and per-hour limits with request queuing
- **Execution Logging**: Comprehensive logging to database for debugging and audit
- **Permission System**: Connection-level permissions with user and role support
- **Multi-Tenancy**: Company-scoped connections for organization isolation
- **Event System**: Subscribe to connection and tool execution events

## Installation

```bash
npm install @memberjunction/ai-mcp-client
```

## Quick Start

```typescript
import { MCPClientManager } from '@memberjunction/ai-mcp-client';

// Get the singleton instance
const manager = MCPClientManager.Instance;

// Initialize (once at application startup)
await manager.initialize(contextUser);

// Connect to an MCP server (using a pre-configured connection)
await manager.connect('connection-id', { contextUser });

// Call a tool
const result = await manager.callTool('connection-id', 'search_documents', {
    arguments: { query: 'MemberJunction documentation', maxResults: 10 }
}, { contextUser });

if (result.success) {
    console.log('Tool output:', result.content);
} else {
    console.error('Tool error:', result.error);
}

// List available tools
const tools = await manager.listTools('connection-id', { contextUser });
console.log('Available tools:', tools.tools.map(t => t.name));

// Sync tools to database
await manager.syncTools('connection-id', { contextUser });

// Disconnect
await manager.disconnect('connection-id', { contextUser });
```

## Configuration

### MCP Server Configuration

MCP servers are defined in the `MJ: MCP Servers` entity with the following key fields:

| Field | Description |
|-------|-------------|
| `Name` | Display name for the server |
| `ServerURL` | Endpoint URL (for HTTP/SSE/WebSocket) |
| `Command` | Executable path (for Stdio transport) |
| `CommandArgs` | Command arguments as JSON array |
| `TransportType` | `StreamableHTTP`, `SSE`, `Stdio`, or `WebSocket` |
| `DefaultAuthType` | `None`, `Bearer`, `APIKey`, `OAuth2`, `Basic`, or `Custom` |
| `RateLimitPerMinute` | Max requests per minute |
| `RateLimitPerHour` | Max requests per hour |

### MCP Connection Configuration

Connections are defined in the `MJ: MCP Server Connections` entity:

| Field | Description |
|-------|-------------|
| `Name` | Connection name |
| `MCPServerID` | Reference to the server definition |
| `CredentialID` | Reference to stored credential |
| `CompanyID` | Company for multi-tenancy |
| `AutoSyncTools` | Auto-sync tools on connect |
| `LogToolCalls` | Enable execution logging |
| `LogInputParameters` | Log input params |
| `LogOutputContent` | Log output content |

## Transport Types

### StreamableHTTP (Recommended)

The default and recommended transport for most use cases:

```typescript
// Server configuration
{
    TransportType: 'StreamableHTTP',
    ServerURL: 'https://api.example.com/mcp'
}
```

### SSE (Server-Sent Events)

Legacy HTTP-based transport using Server-Sent Events:

```typescript
{
    TransportType: 'SSE',
    ServerURL: 'https://api.example.com/mcp'
}
```

### Stdio

For local server processes launched as child processes:

```typescript
{
    TransportType: 'Stdio',
    Command: '/usr/bin/mcp-server',
    CommandArgs: '["--port", "3000"]'
}
```

### WebSocket

For persistent bidirectional communication:

```typescript
{
    TransportType: 'WebSocket',
    ServerURL: 'wss://api.example.com/mcp'
}
```

## Authentication

### None

No authentication required:

```typescript
{
    DefaultAuthType: 'None'
}
```

### Bearer Token

Standard Bearer token authentication:

```typescript
{
    DefaultAuthType: 'Bearer',
    // Credential with apiKey field used as Bearer token
}
```

### API Key

API key in header (default: `X-API-Key`):

```typescript
{
    DefaultAuthType: 'APIKey',
    // Connection can override header with CustomHeaderName
}
```

### OAuth2 Client Credentials

OAuth2 client credentials flow:

```typescript
{
    DefaultAuthType: 'OAuth2',
    // Credential with clientId, clientSecret, tokenUrl, scope
}
```

### Basic Auth

HTTP Basic authentication:

```typescript
{
    DefaultAuthType: 'Basic',
    // Credential with username and password
}
```

### Custom

Custom header with API key:

```typescript
{
    DefaultAuthType: 'Custom',
    // Connection specifies CustomHeaderName
}
```

## Rate Limiting

Rate limiting is configured per-server and enforced per-connection:

```typescript
// Server configuration
{
    RateLimitPerMinute: 60,  // Max 60 requests per minute
    RateLimitPerHour: 1000   // Max 1000 requests per hour
}
```

When limits are exceeded, requests are queued (not rejected) and processed when capacity becomes available.

### Checking Rate Limit Status

```typescript
const rateLimiter = manager.getRateLimiter('connection-id');
const status = rateLimiter.getStatus();

console.log(`Minute usage: ${status.minuteUsage}/${status.minuteLimit}`);
console.log(`Queue length: ${status.queueLength}`);
console.log(`Estimated wait: ${rateLimiter.getEstimatedWaitMs()}ms`);
```

## Execution Logging

All tool calls can be logged to the `MJ: MCP Tool Execution Logs` entity:

### Configuration

```typescript
// Connection configuration
{
    LogToolCalls: true,        // Enable logging
    LogInputParameters: true,  // Log input params
    LogOutputContent: true,    // Log output content
    MaxOutputLogSize: 102400   // Truncate output at 100KB
}
```

### Accessing Logs

```typescript
const logger = manager.ExecutionLogger;

// Get recent logs
const logs = await logger.getRecentLogs('connection-id', 50, contextUser);

// Get statistics
const stats = await logger.getStats('connection-id', 30, contextUser);
console.log(`Success rate: ${stats.successfulCalls / stats.totalCalls * 100}%`);

// Cleanup old logs
const deleted = await logger.cleanup('connection-id', 90, contextUser);
```

## Events

Subscribe to events for monitoring and debugging:

```typescript
manager.addEventListener('connected', (event) => {
    console.log(`Connected to ${event.data?.serverName}`);
});

manager.addEventListener('toolCalled', (event) => {
    console.log(`Calling tool: ${event.data?.toolName}`);
});

manager.addEventListener('toolCallCompleted', (event) => {
    console.log(`Tool completed in ${event.data?.durationMs}ms`);
});

manager.addEventListener('rateLimitExceeded', (event) => {
    console.warn(`Rate limit exceeded for ${event.connectionId}`);
});
```

### Event Types

| Event | Description |
|-------|-------------|
| `connected` | Client connected to server |
| `disconnected` | Client disconnected |
| `toolCalled` | Tool call initiated |
| `toolCallCompleted` | Tool call completed (success or error) |
| `toolsSynced` | Tools synchronized to database |
| `connectionError` | Connection error occurred |
| `rateLimitExceeded` | Rate limit queue timeout |

## API Reference

### MCPClientManager

Main singleton class for managing MCP connections.

#### Properties

- `Instance`: Static property to get singleton instance
- `ExecutionLogger`: Access to the execution logger

#### Methods

| Method | Description |
|--------|-------------|
| `initialize(contextUser)` | Initialize the manager |
| `connect(connectionId, options)` | Connect to an MCP server |
| `disconnect(connectionId, options)` | Disconnect from a server |
| `callTool(connectionId, toolName, toolOptions, options)` | Call a tool |
| `listTools(connectionId, options)` | List available tools |
| `syncTools(connectionId, options)` | Sync tools to database |
| `testConnection(connectionId, options)` | Test a connection |
| `isConnected(connectionId)` | Check if connected |
| `getActiveConnections()` | Get list of active connection IDs |
| `addEventListener(type, listener)` | Add event listener |
| `removeEventListener(type, listener)` | Remove event listener |

### RateLimiter

Manages rate limiting for connections.

#### Methods

| Method | Description |
|--------|-------------|
| `acquire(maxWaitMs)` | Acquire a slot (queues if at limit) |
| `canProceed()` | Check if request can proceed immediately |
| `getStatus()` | Get current usage and limits |
| `getEstimatedWaitMs()` | Get estimated wait time |
| `reset()` | Clear all state |
| `updateConfig(config)` | Update rate limits |

### ExecutionLogger

Handles logging of tool executions.

#### Methods

| Method | Description |
|--------|-------------|
| `startLog(...)` | Start a log entry |
| `completeLog(...)` | Complete a log entry |
| `failLog(...)` | Mark log as failed |
| `getRecentLogs(connectionId, limit, contextUser)` | Get recent logs |
| `getStats(connectionId, sinceDays, contextUser)` | Get execution stats |
| `cleanup(connectionId, olderThanDays, contextUser)` | Delete old logs |

## AI Agent Integration

The `AgentToolAdapter` provides a high-level interface for AI agents to discover and use MCP tools.

### Basic Usage

```typescript
import { AgentToolAdapter, createAgentToolAdapter } from '@memberjunction/ai-mcp-client';

// Create an adapter instance
const adapter = createAgentToolAdapter(contextUser);

// Discover all available tools
const tools = await adapter.discoverTools();
console.log('Available tools:', tools.map(t => t.name));

// Get tools in OpenAI function calling format
const openAITools = await adapter.getToolsForOpenAI();

// Get tools in Anthropic format
const anthropicTools = await adapter.getToolsForAnthropic();

// Execute a tool by name
const result = await adapter.executeTool('search_documents', {
    query: 'MemberJunction documentation',
    maxResults: 10
});

if (result.success) {
    console.log('Result:', result.content);
}
```

### Tool Discovery Options

```typescript
// Filter by connection
const tools = await adapter.discoverTools({
    connectionIds: ['connection-1', 'connection-2']
});

// Filter by name pattern
const searchTools = await adapter.discoverTools({
    namePattern: 'search.*'
});

// Get only read-only tools (safe for exploration)
const safeTools = await adapter.discoverTools({
    readOnlyOnly: true
});

// Exclude destructive tools
const nonDestructive = await adapter.discoverTools({
    excludeDestructive: true
});

// Limit results
const topTools = await adapter.discoverTools({
    limit: 10
});
```

### OpenAI Integration

```typescript
import { OpenAI } from 'openai';

const adapter = createAgentToolAdapter(contextUser);
const tools = await adapter.getToolsForOpenAI();

const openai = new OpenAI();
const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Search for MJ documentation' }],
    tools: tools
});

// Handle tool calls
for (const toolCall of response.choices[0].message.tool_calls || []) {
    const result = await adapter.executeTool(
        toolCall.function.name,
        JSON.parse(toolCall.function.arguments)
    );
    console.log('Tool result:', result);
}
```

### Anthropic Integration

```typescript
import Anthropic from '@anthropic-ai/sdk';

const adapter = createAgentToolAdapter(contextUser);
const tools = await adapter.getToolsForAnthropic();

const anthropic = new Anthropic();
const response = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Search for MJ documentation' }],
    tools: tools
});

// Handle tool use blocks
for (const block of response.content) {
    if (block.type === 'tool_use') {
        const result = await adapter.executeTool(
            block.name,
            block.input as Record<string, unknown>
        );
        console.log('Tool result:', result);
    }
}
```

### AgentToolAdapter Methods

| Method | Description |
|--------|-------------|
| `discoverTools(options)` | Discover available tools with filtering |
| `getToolsForOpenAI(options)` | Get tools in OpenAI function format |
| `getToolsForAnthropic(options)` | Get tools in Anthropic format |
| `executeTool(toolId, args, connectionId?)` | Execute a tool |
| `getTool(toolIdOrName)` | Get a specific tool definition |
| `hasToolAvailable(toolIdOrName)` | Check if a tool is available |
| `refreshCache()` | Force refresh of tool cache |

## Database Entities

This package uses the following MemberJunction entities:

| Entity | Description |
|--------|-------------|
| `MJ: MCP Servers` | Server definitions |
| `MJ: MCP Server Tools` | Discovered tools |
| `MJ: MCP Server Connections` | Configured connections |
| `MJ: MCP Server Connection Tools` | Enabled tools per connection |
| `MJ: MCP Server Connection Permissions` | Access permissions |
| `MJ: MCP Tool Execution Logs` | Execution logs |

## Related Packages

- [@memberjunction/ai-mcp-server](../MCPServer) - MCP Server implementation
- [@memberjunction/credentials](../../Credentials) - Credential management
- [@memberjunction/core](../../MJCore) - Core MemberJunction framework

## License

ISC
