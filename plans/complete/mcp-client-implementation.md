# MCP Client Implementation Plan

## Overview

This document details the implementation plan for MemberJunction to act as an **MCP Client**, enabling MJ agents, actions, and code-level consumers to invoke tools from external MCP-enabled servers.

### Design Philosophy

1. **Code-First, Actions Optional**: `MCPClientManager` provides first-class methods for direct code consumption. Actions wrap these methods for workflow/agent integration but are not required.

2. **Credential Integration**: Uses MJ's existing `CredentialEngine` with existing credential types (API Key, OAuth2, Basic Auth, etc.) - no new credential types needed.

3. **Connection-Based Model**: Separates server definitions (templates) from configured connections (use cases with specific credentials and enabled tools).

4. **Multi-Tenancy Native**: Connections are scoped to organizations with granular user permissions.

5. **Strongly-Typed Actions**: Auto-generates and maintains MJ Actions from MCP tool definitions for discoverability and ease of use.

6. **Comprehensive Logging**: All MCP tool calls are logged to a dedicated table for debugging, analytics, and audit.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MemberJunction                                  │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐ │
│  │   MJ Agents     │    │   MJ Actions    │    │   Direct Code Callers   │ │
│  │                 │    │                 │    │   (Services, APIs)      │ │
│  └────────┬────────┘    └────────┬────────┘    └───────────┬─────────────┘ │
│           │                      │                         │               │
│           └──────────────────────┼─────────────────────────┘               │
│                                  ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      MCPClientManager (Singleton)                      │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Core Methods:                                                   │  │ │
│  │  │  • connect(connectionId) → Client                               │  │ │
│  │  │  • disconnect(connectionId)                                      │  │ │
│  │  │  • callTool(connectionId, toolName, params) → Result            │  │ │
│  │  │  • listTools(connectionId) → Tool[]                             │  │ │
│  │  │  • syncTools(connectionId) → SyncResult                         │  │ │
│  │  │  • testConnection(connectionId) → TestResult                    │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                       │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │ │
│  │  │   Client Pool   │  │  Rate Limiter   │  │  Execution      │       │ │
│  │  │   (per conn)    │  │  (per server)   │  │  Logger         │       │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                  │                                         │
│  ┌───────────────────────────────┼───────────────────────────────────────┐ │
│  │                    CredentialEngine                                    │ │
│  │  • Uses EXISTING credential types (API Key, OAuth2, Basic Auth)      │ │
│  │  • No new credential types needed                                     │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
  │  MCP Server  │         │  MCP Server  │         │  MCP Server  │
  │  (External)  │         │   (Local)    │         │   (Cloud)    │
  │ StreamableHTTP│         │    Stdio     │         │     SSE      │
  └──────────────┘         └──────────────┘         └──────────────┘
```

---

## Entity Model

### Entity Relationship Diagram

```
┌─────────────────────────┐
│    MJ: MCP Servers      │ ─────────────────────────────────────────┐
│  (Server Definitions)   │                                          │
├─────────────────────────┤                                          │
│ ID                      │                                          │
│ Name                    │                                          │
│ Description             │                                          │
│ ServerURL               │                                          │
│ Command/CommandArgs     │                                          │
│ TransportType           │◄────────────────────────────┐            │
│ DefaultAuthType         │                             │            │
│ Status                  │                             │            │
│ LastSyncAt              │                             │            │
│ RateLimitPerMinute      │                             │            │
│ RateLimitPerHour        │                             │            │
└───────────┬─────────────┘                             │            │
            │                                           │            │
            │ 1:N                                        │            │
            ▼                                           │            │
┌─────────────────────────┐                             │            │
│  MJ: MCP Server Tools   │                             │            │
│   (Discovered Tools)    │                             │            │
├─────────────────────────┤                             │            │
│ ID                      │                             │            │
│ MCPServerID (FK)        │                             │            │
│ ToolName                │                             │            │
│ ToolTitle               │                             │            │
│ ToolDescription         │                             │            │
│ InputSchema (JSON)      │                             │            │
│ OutputSchema (JSON)     │                             │            │
│ Annotations (JSON)      │◄───────────┐                │            │
│ Status                  │            │                │            │
│ DiscoveredAt            │            │                │            │
│ LastSeenAt              │            │                │            │
│ GeneratedActionID (FK)  │────────────┼───────►Actions │            │
└─────────────────────────┘            │                │            │
                                       │                │            │
┌─────────────────────────┐            │                │            │
│ MJ: MCP Server          │            │                │            │
│     Connections         │────────────┼────────────────┘            │
│  (Configured Use Cases) │            │                             │
├─────────────────────────┤            │                             │
│ ID                      │            │                             │
│ MCPServerID (FK)        │────────────┼─────────────────────────────┘
│ Name                    │            │
│ Description             │            │
│ CredentialID (FK)       │───────────►Credentials (existing types)
│ CustomHeaderName        │            │ (for API Key header override)
│ CompanyID (FK)          │───────────►Companies
│ Status                  │
│ AutoSyncTools           │
│ AutoGenerateActions     │
│ LogToolCalls            │  ◄── Logging config
│ LogInputParameters      │
│ LogOutputContent        │
│ MaxOutputLogSize        │
│ LastConnectedAt         │
│ LastErrorMessage        │
└───────────┬─────────────┘
            │
            │ 1:N
            ▼
┌─────────────────────────┐
│ MJ: MCP Server          │
│   Connection Tools      │
│ (Enabled Tools/Config)  │
├─────────────────────────┤
│ ID                      │
│ MCPServerConnectionID   │
│ MCPServerToolID (FK)    │────────────┘
│ IsEnabled               │
│ DefaultInputValues(JSON)│
└─────────────────────────┘

┌─────────────────────────┐
│ MJ: MCP Server          │
│ Connection Permissions  │
├─────────────────────────┤
│ ID                      │
│ MCPServerConnectionID   │
│ UserID (FK)             │
│ RoleID (FK)             │
│ CanExecute              │
│ CanModify               │
│ CanViewCredentials      │
└─────────────────────────┘

┌─────────────────────────┐
│ MJ: MCP Tool Execution  │
│        Logs             │  ◄── NEW: Granular logging
├─────────────────────────┤
│ ID                      │
│ MCPServerConnectionID   │
│ MCPServerToolID         │
│ UserID                  │
│ StartedAt               │
│ EndedAt                 │
│ DurationMs              │
│ Success                 │
│ ErrorMessage            │
│ InputParameters (JSON)  │
│ OutputContent (JSON)    │
│ OutputTruncated         │
└─────────────────────────┘
```

---

### Entity Definitions

#### MJ: MCP Servers

Base definition of an MCP server (template). Does NOT contain credentials.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ID | uniqueidentifier | Yes | Primary key |
| Name | nvarchar(255) | Yes | Display name (unique) |
| Description | nvarchar(max) | No | What this server provides |
| ServerURL | nvarchar(1000) | No* | Endpoint URL (HTTP/SSE/WebSocket) |
| Command | nvarchar(500) | No* | Executable path (Stdio transport) |
| CommandArgs | nvarchar(max) | No | Command arguments JSON array |
| TransportType | nvarchar(50) | Yes | `StreamableHTTP`, `SSE`, `Stdio`, `WebSocket` |
| DefaultAuthType | nvarchar(50) | Yes | `None`, `Bearer`, `APIKey`, `OAuth2`, `Basic`, `Custom` |
| CredentialTypeID | uniqueidentifier | No | FK to Credential Types - expected credential type |
| Status | nvarchar(50) | Yes | `Active`, `Inactive`, `Deprecated` |
| LastSyncAt | datetimeoffset | No | When tools were last synced (any connection) |
| RateLimitPerMinute | int | No | Max requests per minute (null = unlimited) |
| RateLimitPerHour | int | No | Max requests per hour (null = unlimited) |
| ConnectionTimeoutMs | int | No | Connection timeout (default: 30000) |
| RequestTimeoutMs | int | No | Request timeout (default: 60000) |
| DocumentationURL | nvarchar(1000) | No | Link to server documentation |
| IconClass | nvarchar(100) | No | Font Awesome icon class |

*ServerURL required for HTTP/SSE/WebSocket; Command required for Stdio

---

#### MJ: MCP Server Tools

Cached tool definitions discovered from MCP servers.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ID | uniqueidentifier | Yes | Primary key |
| MCPServerID | uniqueidentifier | Yes | FK to MCP Servers |
| ToolName | nvarchar(255) | Yes | Tool identifier from server |
| ToolTitle | nvarchar(255) | No | Human-readable title |
| ToolDescription | nvarchar(max) | No | What the tool does |
| InputSchema | nvarchar(max) | Yes | JSON Schema for input parameters |
| OutputSchema | nvarchar(max) | No | JSON Schema for output (if provided) |
| Annotations | nvarchar(max) | No | JSON with hints (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) |
| Status | nvarchar(50) | Yes | `Active`, `Inactive`, `Deprecated` |
| DiscoveredAt | datetimeoffset | Yes | When first discovered |
| LastSeenAt | datetimeoffset | Yes | When last seen during sync |
| GeneratedActionID | uniqueidentifier | No | FK to Actions (if auto-generated) |
| GeneratedActionCategoryID | uniqueidentifier | No | FK to Action Categories |

**Unique Constraint**: (MCPServerID, ToolName)

---

#### MJ: MCP Server Connections

Configured "use case" for a server - combines server with credentials and enabled tools.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ID | uniqueidentifier | Yes | Primary key |
| MCPServerID | uniqueidentifier | Yes | FK to MCP Servers |
| Name | nvarchar(255) | Yes | Connection name (unique per company) |
| Description | nvarchar(max) | No | Purpose of this connection |
| CredentialID | uniqueidentifier | No | FK to Credentials (uses existing types) |
| CustomHeaderName | nvarchar(100) | No | Custom header name for API key (default: X-API-Key) |
| CompanyID | uniqueidentifier | Yes | FK to Companies (multi-tenancy) |
| Status | nvarchar(50) | Yes | `Active`, `Inactive`, `Error` |
| AutoSyncTools | bit | Yes | Auto-sync tools on connect (default: true) |
| AutoGenerateActions | bit | Yes | Auto-generate Actions from tools (default: false) |
| LogToolCalls | bit | Yes | Log all tool calls (default: true) |
| LogInputParameters | bit | Yes | Include input params in logs (default: true) |
| LogOutputContent | bit | Yes | Include output in logs (default: true) |
| MaxOutputLogSize | int | No | Max output size to log in bytes (default: 102400) |
| LastConnectedAt | datetimeoffset | No | Last successful connection |
| LastErrorMessage | nvarchar(max) | No | Last connection error |
| EnvironmentVars | nvarchar(max) | No | JSON object of env vars (for Stdio) |

**Unique Constraint**: (CompanyID, Name)

---

#### MJ: MCP Server Connection Tools

Which tools are enabled for a specific connection, with optional defaults.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ID | uniqueidentifier | Yes | Primary key |
| MCPServerConnectionID | uniqueidentifier | Yes | FK to MCP Server Connections |
| MCPServerToolID | uniqueidentifier | Yes | FK to MCP Server Tools |
| IsEnabled | bit | Yes | Whether this tool is enabled (default: true) |
| DefaultInputValues | nvarchar(max) | No | JSON default values for tool inputs |
| MaxCallsPerMinute | int | No | Override rate limit for this specific tool |

**Unique Constraint**: (MCPServerConnectionID, MCPServerToolID)

---

#### MJ: MCP Server Connection Permissions

Who can use or modify a connection.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ID | uniqueidentifier | Yes | Primary key |
| MCPServerConnectionID | uniqueidentifier | Yes | FK to MCP Server Connections |
| UserID | uniqueidentifier | No* | FK to Users |
| RoleID | uniqueidentifier | No* | FK to Roles |
| CanExecute | bit | Yes | Can invoke tools via this connection |
| CanModify | bit | Yes | Can modify connection settings |
| CanViewCredentials | bit | Yes | Can see (but not decrypt) credential info |

*Either UserID or RoleID required, not both

**Unique Constraint**: (MCPServerConnectionID, UserID) or (MCPServerConnectionID, RoleID)

---

#### MJ: MCP Tool Execution Logs

Granular logging of all MCP tool calls for debugging, analytics, and audit.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ID | uniqueidentifier | Yes | Primary key |
| MCPServerConnectionID | uniqueidentifier | Yes | FK to MCP Server Connections |
| MCPServerToolID | uniqueidentifier | No | FK to MCP Server Tools (null if tool not cached) |
| ToolName | nvarchar(255) | Yes | Tool name (stored directly for resilience) |
| UserID | uniqueidentifier | Yes | FK to Users - who initiated the call |
| StartedAt | datetimeoffset | Yes | When execution started |
| EndedAt | datetimeoffset | No | When execution completed |
| DurationMs | int | No | Execution duration in milliseconds |
| Success | bit | Yes | Whether the call succeeded |
| ErrorMessage | nvarchar(max) | No | Error details if failed |
| InputParameters | nvarchar(max) | No | JSON of input params (if logging enabled) |
| OutputContent | nvarchar(max) | No | JSON of output content (if logging enabled) |
| OutputTruncated | bit | Yes | Whether output was truncated due to size |

---

## Credential Strategy

### Use Existing Credential Types

MJ already has all needed credential types. The connection's `DefaultAuthType` determines which type to use:

| Auth Type | Use Credential Type | Fields Used |
|-----------|---------------------|-------------|
| None | (no credential) | - |
| Bearer | API Key | `apiKey` as token |
| APIKey | API Key | `apiKey` |
| OAuth2 | OAuth2 Client Credentials | `clientId`, `clientSecret`, `tokenUrl`, `scope` |
| Basic | Basic Auth | `username`, `password` |
| Custom | API Key | `apiKey` + custom headers via `CustomHeaderName` |

### Header Customization

The `CustomHeaderName` field on connections allows overriding the default `X-API-Key` header for servers that expect different header names (e.g., `Authorization`, `x-mcp-key`, etc.).

---

## Package Structure

```
packages/AI/MCPClient/                    # Peer to MCPServer
├── src/
│   ├── MCPClientManager.ts              # Core singleton
│   ├── RateLimiter.ts                   # Rate limiting utility
│   ├── ActionGenerator.ts               # Auto-generate actions
│   ├── ExecutionLogger.ts               # Tool call logging
│   ├── types.ts                         # Interfaces and types
│   └── index.ts                         # Public API
├── package.json                         # @memberjunction/ai-mcp-client
├── tsconfig.json
└── README.md

packages/Actions/CoreActions/src/custom/mcp/
├── ExecuteMCPToolAction.ts              # Generic execute action
├── MCPToolWrapperAction.ts              # Smart wrapper for generated actions
├── SyncMCPToolsAction.ts                # Trigger tool sync
├── TestMCPConnectionAction.ts           # Test connection
└── index.ts

migrations/v2/
└── V202501271200__mcp_client_entities.sql  # Database migration
```

---

## Implementation Phases

### Phase 1: Core Infrastructure ✅ COMPLETED
- [x] Create database migration for all 7 entities (including MCP Tool Execution Logs)
- [x] Run CodeGen to generate entity classes
- [x] Create `@memberjunction/ai-mcp-client` package
- [x] Implement `MCPClientManager` core methods
  - [x] connect/disconnect
  - [x] callTool
  - [x] listTools
- [x] Implement all transport types (StreamableHTTP, SSE, Stdio)
- [x] Implement all auth types using existing credential types
- [x] Integrate with CredentialEngine for secret retrieval
- [x] Implement RateLimiter class
- [x] Implement ExecutionLogger for tool call logging
- [x] Unit tests for MCPClientManager
- [x] README for new package

### Phase 2: Tool Sync & Actions ⏳ IN PROGRESS
- [x] Implement `syncTools` method (implemented in MCPClientManager)
- [x] Implement `testConnection` method (implemented in MCPClientManager)
- [ ] Create `ExecuteMCPToolAction` action
- [ ] Implement Action auto-generation
  - [ ] Category hierarchy creation
  - [ ] Action parameter generation from JSON Schema
  - [ ] `MCPToolWrapperAction` smart executor
- [ ] Create supporting actions (SyncMCPTools, TestMCPConnection)
- [ ] Integration tests

### Phase 3: Permission System
- [ ] Implement permission validation in MCPClientManager
- [ ] Connection-level permissions (execute, modify, view credentials)
- [ ] Role-based permission support
- [ ] Multi-tenancy via CompanyID scoping

### Phase 4: Admin UI
- [ ] MCP Servers list and detail components
- [ ] MCP Connections list and detail components
- [ ] MCP Tool Browser component
- [ ] MCP Tool Tester (interactive testing)
- [ ] Permission management UI
- [ ] Credential selection/creation integration

### Phase 5: Agent Integration & Documentation
- [ ] MCP tool context injection for agents
- [ ] Documentation and examples
- [ ] Performance optimization
- [ ] Production hardening
- [ ] Update existing READMEs for modified packages

---

## Security Considerations

### Credential Protection

- All credentials stored via CredentialEngine (AES-256-GCM encrypted)
- Uses EXISTING credential types - no new types needed
- OAuth tokens cached in memory only (not persisted)
- Audit logging on credential access
- `CanViewCredentials` permission controls visibility

### Access Control

- Multi-tenant isolation via CompanyID
- User/Role permissions on connections
- All operations require `contextUser`
- Permission validation before tool execution

### Network Security

- TLS required for HTTP-based transports
- Certificate validation enabled
- Configurable timeouts to prevent hanging
- Rate limiting to prevent abuse

### Logging & Audit

- All tool calls logged to `MJ: MCP Tool Execution Logs`
- Configurable per-connection: inputs, outputs, truncation
- PII mitigation via logging config options
- Retention policy can be applied via scheduled cleanup

### Input Validation

- Tool inputs validated against JSON Schema
- SQL injection prevention in all queries
- Sanitized error messages (no credential leakage)

---

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MemberJunction Actions](../packages/Actions/CLAUDE.md)
- [MemberJunction Credentials](../packages/Credentials/)
- [MemberJunction MCP Server](../packages/AI/MCPServer/)
