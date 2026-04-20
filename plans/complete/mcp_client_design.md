# MCP Client Integration Design for MemberJunction

## Overview

This document outlines the design for MemberJunction to act as an **MCP Client**, enabling MJ agents and workflows to consume tools from external MCP-enabled servers.

### Goals
- Connect to external MCP servers (Claude Desktop, custom MCP servers, third-party integrations)
- Discover and cache available tools from connected servers
- Expose MCP tools to MJ agents through the Action system
- Support multiple transport protocols (HTTP, SSE, Stdio, WebSocket)

### Non-Goals (Phase 1)
- Bidirectional MCP (MJ acting as both client and server simultaneously)
- MCP Prompts and Resources (focus on Tools first)
- Real-time streaming of tool outputs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MemberJunction                               │
│  ┌───────────────┐    ┌────────────────┐    ┌───────────────┐  │
│  │   MJ Agents   │───▶│  Action Engine │───▶│ Execute MCP   │  │
│  │               │    │                │    │  Tool Action  │  │
│  └───────────────┘    └────────────────┘    └───────┬───────┘  │
│                                                      │          │
│  ┌──────────────────────────────────────────────────▼────────┐ │
│  │                   MCPClientManager                         │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │ │
│  │  │   Client 1  │  │   Client 2  │  │   Client N  │       │ │
│  │  │ (HTTP/SSE)  │  │   (Stdio)   │  │ (WebSocket) │       │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │ │
│  └─────────┼────────────────┼────────────────┼───────────────┘ │
└────────────┼────────────────┼────────────────┼─────────────────┘
             │                │                │
             ▼                ▼                ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │  MCP Server  │ │  MCP Server  │ │  MCP Server  │
      │  (External)  │ │   (Local)    │ │  (Cloud)     │
      └──────────────┘ └──────────────┘ └──────────────┘
```

---

## New Entities

### MCP Servers

Stores configuration for external MCP servers that MJ connects to.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ID | uniqueidentifier | Yes | Primary key |
| Name | nvarchar(255) | Yes | Display name for the server |
| Description | nvarchar(max) | No | What this server provides |
| ServerURL | nvarchar(1000) | Yes* | Endpoint URL (for HTTP/SSE/WebSocket) |
| Command | nvarchar(500) | No* | Executable path (for Stdio transport) |
| CommandArgs | nvarchar(max) | No | Command arguments JSON array (for Stdio) |
| TransportType | nvarchar(50) | Yes | `StreamableHTTP`, `SSE`, `Stdio`, `WebSocket` |
| AuthType | nvarchar(50) | Yes | `None`, `Bearer`, `APIKey`, `OAuth`, `Custom` |
| AuthConfigEncrypted | nvarchar(max) | No | Encrypted auth configuration JSON |
| Status | nvarchar(50) | Yes | `Active`, `Inactive`, `Error` |
| LastSyncAt | datetimeoffset | No | When tools were last refreshed |
| LastErrorMessage | nvarchar(max) | No | Last connection/sync error |
| ConnectionTimeoutMs | int | No | Connection timeout (default: 30000) |
| RequestTimeoutMs | int | No | Request timeout (default: 60000) |

*ServerURL required for HTTP/SSE/WebSocket; Command required for Stdio

### MCP Server Tools

Caches discovered tools from MCP servers.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ID | uniqueidentifier | Yes | Primary key |
| MCPServerID | uniqueidentifier | Yes | FK to MCP Servers |
| ToolName | nvarchar(255) | Yes | Tool identifier from server |
| ToolTitle | nvarchar(255) | No | Human-readable title |
| ToolDescription | nvarchar(max) | No | What the tool does |
| InputSchema | nvarchar(max) | Yes | JSON Schema for input parameters |
| OutputSchema | nvarchar(max) | No | JSON Schema for output (if provided) |
| Annotations | nvarchar(max) | No | JSON with hints (readOnlyHint, destructiveHint, etc.) |
| IsPromotedToAction | bit | Yes | Whether promoted to a full MJ Action |
| PromotedActionID | uniqueidentifier | No | FK to Actions (if promoted) |
| Status | nvarchar(50) | Yes | `Active`, `Inactive`, `Deprecated` |
| DiscoveredAt | datetimeoffset | Yes | When first discovered |
| LastSeenAt | datetimeoffset | Yes | When last seen during sync |

---

## Core Components

### MCPClientManager

Singleton service for managing MCP client connections.

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPClientManager {
    private static _instance: MCPClientManager;
    private clients: Map<string, Client> = new Map();
    private connectionPromises: Map<string, Promise<Client>> = new Map();

    public static get Instance(): MCPClientManager {
        if (!this._instance) {
            this._instance = new MCPClientManager();
        }
        return this._instance;
    }

    /**
     * Connect to an MCP server. Returns existing connection if already connected.
     */
    async connect(server: MCPServerEntity): Promise<Client> {
        // Return existing connection
        if (this.clients.has(server.ID)) {
            return this.clients.get(server.ID)!;
        }

        // Return in-progress connection
        if (this.connectionPromises.has(server.ID)) {
            return this.connectionPromises.get(server.ID)!;
        }

        // Create new connection
        const connectPromise = this.createConnection(server);
        this.connectionPromises.set(server.ID, connectPromise);

        try {
            const client = await connectPromise;
            this.clients.set(server.ID, client);
            return client;
        } finally {
            this.connectionPromises.delete(server.ID);
        }
    }

    private async createConnection(server: MCPServerEntity): Promise<Client> {
        const transport = this.createTransport(server);

        const client = new Client(
            { name: "MemberJunction", version: "3.2.0" },
            { capabilities: { tools: {} } }
        );

        await client.connect(transport);

        // Set up disconnect handler
        transport.onclose = () => {
            this.clients.delete(server.ID);
            console.log(`[MCP] Disconnected from ${server.Name}`);
        };

        return client;
    }

    private createTransport(server: MCPServerEntity): Transport {
        switch (server.TransportType) {
            case 'StreamableHTTP':
                return new StreamableHTTPClientTransport(
                    new URL(server.ServerURL),
                    { requestInit: { headers: this.buildAuthHeaders(server) } }
                );

            case 'SSE':
                return new SSEClientTransport(
                    new URL(server.ServerURL),
                    { requestInit: { headers: this.buildAuthHeaders(server) } }
                );

            case 'Stdio':
                return new StdioClientTransport({
                    command: server.Command,
                    args: JSON.parse(server.CommandArgs || '[]'),
                    env: this.buildEnvVars(server)
                });

            default:
                throw new Error(`Unsupported transport: ${server.TransportType}`);
        }
    }

    private buildAuthHeaders(server: MCPServerEntity): Record<string, string> {
        const config = this.decryptAuthConfig(server);

        switch (server.AuthType) {
            case 'Bearer':
                return { 'Authorization': `Bearer ${config.token}` };
            case 'APIKey':
                return { [config.headerName || 'X-API-Key']: config.apiKey };
            case 'Custom':
                return config.headers || {};
            default:
                return {};
        }
    }

    /**
     * Discover tools from an MCP server
     */
    async discoverTools(serverId: string): Promise<MCPTool[]> {
        const client = this.clients.get(serverId);
        if (!client) {
            throw new Error(`Not connected to MCP server: ${serverId}`);
        }

        const result = await client.listTools();
        return result.tools;
    }

    /**
     * Execute a tool on an MCP server
     */
    async callTool(
        serverId: string,
        toolName: string,
        params: Record<string, unknown>
    ): Promise<MCPToolResult> {
        const client = this.clients.get(serverId);
        if (!client) {
            throw new Error(`Not connected to MCP server: ${serverId}`);
        }

        const result = await client.callTool({
            name: toolName,
            arguments: params
        });

        return {
            success: !result.isError,
            content: result.content,
            structuredContent: result.structuredContent
        };
    }

    /**
     * Disconnect from an MCP server
     */
    async disconnect(serverId: string): Promise<void> {
        const client = this.clients.get(serverId);
        if (client) {
            await client.close();
            this.clients.delete(serverId);
        }
    }

    /**
     * Check if connected to a server
     */
    isConnected(serverId: string): boolean {
        return this.clients.has(serverId);
    }
}
```

### MCPToolSyncService

Service for syncing tools from MCP servers to the local cache.

```typescript
export class MCPToolSyncService {
    /**
     * Sync tools from all active MCP servers
     */
    async syncAllServers(contextUser: UserInfo): Promise<SyncResult[]> {
        const rv = new RunView();
        const servers = await rv.RunView<MCPServerEntity>({
            EntityName: 'MCP Servers',
            ExtraFilter: "Status = 'Active'",
            ResultType: 'entity_object'
        }, contextUser);

        const results: SyncResult[] = [];
        for (const server of servers.Results) {
            try {
                const result = await this.syncServer(server, contextUser);
                results.push(result);
            } catch (error) {
                results.push({
                    serverId: server.ID,
                    serverName: server.Name,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Sync tools from a single MCP server
     */
    async syncServer(server: MCPServerEntity, contextUser: UserInfo): Promise<SyncResult> {
        const manager = MCPClientManager.Instance;

        // Connect if needed
        if (!manager.isConnected(server.ID)) {
            await manager.connect(server);
        }

        // Discover tools
        const remoteTools = await manager.discoverTools(server.ID);

        // Load existing cached tools
        const rv = new RunView();
        const existingTools = await rv.RunView<MCPServerToolEntity>({
            EntityName: 'MCP Server Tools',
            ExtraFilter: `MCPServerID = '${server.ID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        const existingMap = new Map(
            existingTools.Results.map(t => [t.ToolName, t])
        );

        const md = new Metadata();
        let added = 0, updated = 0, removed = 0;

        // Update or create tools
        for (const remoteTool of remoteTools) {
            const existing = existingMap.get(remoteTool.name);

            if (existing) {
                // Update existing
                existing.ToolDescription = remoteTool.description || '';
                existing.InputSchema = JSON.stringify(remoteTool.inputSchema);
                existing.OutputSchema = remoteTool.outputSchema
                    ? JSON.stringify(remoteTool.outputSchema)
                    : null;
                existing.Annotations = remoteTool.annotations
                    ? JSON.stringify(remoteTool.annotations)
                    : null;
                existing.LastSeenAt = new Date();
                await existing.Save();
                updated++;
                existingMap.delete(remoteTool.name);
            } else {
                // Create new
                const newTool = await md.GetEntityObject<MCPServerToolEntity>(
                    'MCP Server Tools',
                    contextUser
                );
                newTool.MCPServerID = server.ID;
                newTool.ToolName = remoteTool.name;
                newTool.ToolTitle = remoteTool.title || remoteTool.name;
                newTool.ToolDescription = remoteTool.description || '';
                newTool.InputSchema = JSON.stringify(remoteTool.inputSchema);
                newTool.OutputSchema = remoteTool.outputSchema
                    ? JSON.stringify(remoteTool.outputSchema)
                    : null;
                newTool.Annotations = remoteTool.annotations
                    ? JSON.stringify(remoteTool.annotations)
                    : null;
                newTool.Status = 'Active';
                newTool.DiscoveredAt = new Date();
                newTool.LastSeenAt = new Date();
                await newTool.Save();
                added++;
            }
        }

        // Mark removed tools as deprecated (don't delete - may be promoted to actions)
        for (const [, tool] of existingMap) {
            tool.Status = 'Deprecated';
            await tool.Save();
            removed++;
        }

        // Update server sync timestamp
        server.LastSyncAt = new Date();
        server.LastErrorMessage = null;
        await server.Save();

        return {
            serverId: server.ID,
            serverName: server.Name,
            success: true,
            added,
            updated,
            removed
        };
    }
}
```

---

## Actions

### Execute MCP Tool Action

Generic action for calling any tool on any registered MCP server.

```typescript
@RegisterClass(BaseAction, "Execute MCP Tool")
export class ExecuteMCPToolAction extends BaseAction {
    protected async InternalRunAction(
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        // Extract parameters
        const serverName = this.getParamValue(params.Params, 'ServerName');
        const toolName = this.getParamValue(params.Params, 'ToolName');
        const toolInputRaw = this.getParamValue(params.Params, 'ToolInput');

        if (!serverName || !toolName) {
            return {
                Success: false,
                ResultCode: 'INVALID_PARAMS',
                Message: 'ServerName and ToolName are required'
            };
        }

        // Parse tool input
        let toolInput: Record<string, unknown> = {};
        if (toolInputRaw) {
            try {
                toolInput = typeof toolInputRaw === 'string'
                    ? JSON.parse(toolInputRaw)
                    : toolInputRaw;
            } catch {
                return {
                    Success: false,
                    ResultCode: 'INVALID_PARAMS',
                    Message: 'ToolInput must be valid JSON'
                };
            }
        }

        // Find server
        const rv = new RunView();
        const servers = await rv.RunView<MCPServerEntity>({
            EntityName: 'MCP Servers',
            ExtraFilter: `Name = '${serverName.replace(/'/g, "''")}' AND Status = 'Active'`,
            ResultType: 'entity_object'
        }, params.ContextUser);

        if (!servers.Results.length) {
            return {
                Success: false,
                ResultCode: 'SERVER_NOT_FOUND',
                Message: `MCP Server '${serverName}' not found or inactive`
            };
        }

        const server = servers.Results[0];
        const manager = MCPClientManager.Instance;

        try {
            // Connect if needed
            if (!manager.isConnected(server.ID)) {
                await manager.connect(server);
            }

            // Call the tool
            const result = await manager.callTool(server.ID, toolName, toolInput);

            // Extract text content for message
            const textContent = result.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n');

            return {
                Success: result.success,
                ResultCode: result.success ? 'SUCCESS' : 'TOOL_ERROR',
                Message: textContent,
                Params: [
                    {
                        Name: 'Output',
                        Value: result.content,
                        Type: 'Output'
                    },
                    {
                        Name: 'StructuredOutput',
                        Value: result.structuredContent,
                        Type: 'Output'
                    }
                ]
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'CONNECTION_ERROR',
                Message: `Failed to execute MCP tool: ${error.message}`
            };
        }
    }

    private getParamValue(params: ActionParam[], name: string): unknown {
        return params.find(p => p.Name === name)?.Value;
    }
}
```

### Action Parameters (Metadata)

| Name | Type | Direction | Required | Description |
|------|------|-----------|----------|-------------|
| ServerName | string | Input | Yes | Name of the MCP server to use |
| ToolName | string | Input | Yes | Name of the tool to execute |
| ToolInput | JSON | Input | No | Input parameters for the tool |
| Output | JSON | Output | - | Raw content array from tool |
| StructuredOutput | JSON | Output | - | Structured content (if provided) |

---

## Action Promotion

Admins can "promote" frequently-used MCP tools to first-class MJ Actions.

### Promotion Process

1. Admin selects an MCP Server Tool in the UI
2. System generates a new Action record:
   - Name: `{ServerName}: {ToolName}`
   - Description: Tool description
   - Category: "MCP Tools" or custom
   - Type: "Custom" (code-based)
3. System generates Action Parameters from InputSchema
4. System creates a thin wrapper Action class
5. Tool record is marked as `IsPromotedToAction = true`

### Generated Wrapper Action

```typescript
// Auto-generated wrapper for promoted MCP tool
@RegisterClass(BaseAction, "Perplexity: Search")
export class PerplexitySearchMCPAction extends BaseAction {
    private readonly mcpServerId = 'abc-123';
    private readonly mcpToolName = 'search';

    protected async InternalRunAction(
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        // Map MJ Action params to MCP tool input
        const toolInput = {
            query: this.getParamValue(params.Params, 'Query'),
            maxResults: this.getParamValue(params.Params, 'MaxResults') || 10
        };

        const manager = MCPClientManager.Instance;
        const result = await manager.callTool(
            this.mcpServerId,
            this.mcpToolName,
            toolInput
        );

        return {
            Success: result.success,
            ResultCode: result.success ? 'SUCCESS' : 'ERROR',
            Message: this.extractTextContent(result),
            Params: [
                { Name: 'Results', Value: result.content, Type: 'Output' }
            ]
        };
    }
}
```

---

## Transport Support

### StreamableHTTP (Recommended)

Modern HTTP-based transport with SSE for server-to-client messages.

```typescript
const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.example.com/mcp'),
    {
        requestInit: {
            headers: { 'Authorization': 'Bearer token' }
        },
        reconnectionOptions: {
            maxRetries: 3,
            initialReconnectionDelay: 1000,
            maxReconnectionDelay: 30000
        }
    }
);
```

### SSE (Legacy)

Deprecated but still supported for older servers.

```typescript
const transport = new SSEClientTransport(
    new URL('https://mcp.example.com/sse'),
    {
        requestInit: {
            headers: { 'X-API-Key': 'key' }
        }
    }
);
```

### Stdio (Local Processes)

For running local MCP server processes.

```typescript
const transport = new StdioClientTransport({
    command: '/usr/local/bin/my-mcp-server',
    args: ['--port', '0'],
    env: { 'API_KEY': process.env.API_KEY }
});
```

### WebSocket (Future)

Real-time bidirectional communication.

```typescript
// Phase 3 implementation
const transport = new WebSocketClientTransport(
    new URL('wss://mcp.example.com/ws')
);
```

---

## Authentication

### Supported Auth Types

| Type | Config Fields | Use Case |
|------|--------------|----------|
| None | - | Local/trusted servers |
| Bearer | `token` | OAuth/JWT tokens |
| APIKey | `apiKey`, `headerName` | API key auth |
| OAuth | `clientId`, `clientSecret`, `tokenUrl`, `scopes` | Full OAuth flow |
| Custom | `headers` | Custom header auth |

### Auth Config Schema

```typescript
interface AuthConfig {
    // Bearer
    token?: string;

    // API Key
    apiKey?: string;
    headerName?: string;  // Default: 'X-API-Key'

    // OAuth
    clientId?: string;
    clientSecret?: string;
    tokenUrl?: string;
    authorizationUrl?: string;
    scopes?: string[];
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;

    // Custom
    headers?: Record<string, string>;
}
```

### Encryption

Auth config is encrypted using MJ's existing encryption infrastructure:

```typescript
import { EncryptionEngine } from '@memberjunction/encryption';

// Encrypt before saving
const encrypted = EncryptionEngine.Encrypt(JSON.stringify(authConfig));
server.AuthConfigEncrypted = encrypted;

// Decrypt when connecting
const decrypted = EncryptionEngine.Decrypt(server.AuthConfigEncrypted);
const authConfig = JSON.parse(decrypted);
```

---

## Agent Integration

### Discovery

MJ Agents discover MCP tools through:

1. **Generic Action**: "Execute MCP Tool" always available
2. **Promoted Actions**: Individual actions for promoted tools
3. **Tool Listing**: Agent can list available tools per server

### Example Agent Interaction

```
User: "Search for information about TypeScript best practices"

Agent thinking:
1. Need to search the web for information
2. Available actions include "Execute MCP Tool"
3. Check MCP servers for search capabilities
4. Found "Perplexity" server with "search" tool

Agent action:
- Execute "Execute MCP Tool"
- ServerName: "Perplexity"
- ToolName: "search"
- ToolInput: { "query": "TypeScript best practices 2024" }

Tool returns search results...

Agent: "Based on my search, here are the TypeScript best practices..."
```

### Providing Tool Context to Agents

Agents can be given context about available MCP tools:

```typescript
// In agent initialization
const mcpContext = await buildMCPToolContext(contextUser);

// Results in agent system prompt including:
// "You have access to the following external MCP servers and their tools:
//  - Perplexity (search): Web search with AI summarization
//  - GitHub (create_issue, list_repos): GitHub operations
//  - Slack (send_message, list_channels): Slack integration"
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (2-3 weeks)

- [ ] Create database migration for MCP Servers entity
- [ ] Create database migration for MCP Server Tools entity
- [ ] Run CodeGen to generate entity classes
- [ ] Implement MCPClientManager with StreamableHTTP and SSE transports
- [ ] Implement basic "Execute MCP Tool" action
- [ ] Basic connection testing (curl/Postman equivalent)

### Phase 2: Tool Discovery & Admin UI (2 weeks)

- [ ] Implement MCPToolSyncService
- [ ] Create admin UI for managing MCP servers
- [ ] Create tool browser UI (view discovered tools)
- [ ] Tool testing UI (execute tools manually)
- [ ] Scheduled sync job for tool discovery

### Phase 3: Action Promotion (1-2 weeks)

- [ ] "Promote to Action" functionality
- [ ] Action parameter generation from JSON Schema
- [ ] Wrapper action code generation
- [ ] Promoted action management UI

### Phase 4: Advanced Auth (1 week)

- [ ] OAuth flow implementation
- [ ] Token refresh handling
- [ ] Per-user authentication contexts
- [ ] API key rotation support

### Phase 5: Additional Transports (1-2 weeks)

- [ ] Stdio transport for local MCP processes
- [ ] Process lifecycle management
- [ ] WebSocket transport (if needed)

### Phase 6: Agent Enhancements (1 week)

- [ ] MCP tool context injection for agents
- [ ] Tool recommendation based on agent task
- [ ] Usage analytics and optimization

---

## Security Considerations

### Authentication Storage
- All credentials encrypted at rest using MJ's encryption engine
- No plaintext secrets in database or logs
- Per-environment encryption keys

### Access Control
- MCP Server management requires admin permissions
- Tool execution respects MJ's action permission system
- Audit logging for all MCP tool calls

### Input Validation
- Validate tool inputs against declared JSON schemas
- Sanitize outputs before storing/displaying
- Rate limiting on tool calls

### Network Security
- TLS required for all HTTP-based transports
- Certificate validation enabled by default
- Configurable timeout limits

---

## Open Questions

1. **Connection Pooling**: Should we maintain persistent connections or connect on-demand?
   - Recommendation: Persistent with heartbeat for frequently-used servers

2. **Caching**: Should we cache tool outputs?
   - Recommendation: No caching by default (tools may have side effects)

3. **Rate Limiting**: How to handle MCP servers with rate limits?
   - Recommendation: Configurable per-server rate limits in MCP Servers entity

4. **Error Handling**: How to handle intermittent connection failures?
   - Recommendation: Exponential backoff with configurable retries

5. **Multi-tenancy**: Should MCP server configs be organization-specific?
   - Recommendation: Yes, add OrganizationID FK to MCP Servers

---

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MemberJunction Actions Documentation](../packages/Actions/CLAUDE.md)
- [MemberJunction MCP Server Implementation](../packages/AI/MCPServer/)
