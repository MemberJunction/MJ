/**
 * @fileoverview Type definitions for the MCP Client package
 *
 * Defines interfaces for MCP server connections, tools, authentication,
 * rate limiting, logging, and execution results.
 *
 * @module @memberjunction/ai-mcp-client/types
 */

import type { UserInfo } from '@memberjunction/core';

/**
 * Supported MCP transport types
 */
export type MCPTransportType = 'StreamableHTTP' | 'SSE' | 'Stdio' | 'WebSocket';

/**
 * Supported authentication types for MCP connections
 */
export type MCPAuthType = 'None' | 'Bearer' | 'APIKey' | 'OAuth2' | 'Basic' | 'Custom';

/**
 * Status values for MCP servers
 */
export type MCPServerStatus = 'Active' | 'Inactive' | 'Deprecated';

/**
 * Status values for MCP connections
 */
export type MCPConnectionStatus = 'Active' | 'Inactive' | 'Error';

/**
 * Status values for MCP tools
 */
export type MCPToolStatus = 'Active' | 'Inactive' | 'Deprecated';

/**
 * Configuration for connecting to an MCP server
 */
export interface MCPServerConfig {
    /** Unique identifier for the server */
    ID: string;
    /** Display name */
    Name: string;
    /** Server description */
    Description?: string;
    /** Server URL for HTTP/SSE/WebSocket transports */
    ServerURL?: string;
    /** Command for Stdio transport */
    Command?: string;
    /** Command arguments as JSON array string */
    CommandArgs?: string;
    /** Transport type to use */
    TransportType: MCPTransportType;
    /** Default authentication type */
    DefaultAuthType: MCPAuthType;
    /** Expected credential type ID */
    CredentialTypeID?: string;
    /** Server status */
    Status: MCPServerStatus;
    /** Rate limit per minute (null = unlimited) */
    RateLimitPerMinute?: number;
    /** Rate limit per hour (null = unlimited) */
    RateLimitPerHour?: number;
    /** Connection timeout in milliseconds */
    ConnectionTimeoutMs?: number;
    /** Request timeout in milliseconds */
    RequestTimeoutMs?: number;
}

/**
 * Configuration for a specific MCP connection
 */
export interface MCPConnectionConfig {
    /** Unique identifier for the connection */
    ID: string;
    /** Reference to the MCP server */
    MCPServerID: string;
    /** Connection name */
    Name: string;
    /** Connection description */
    Description?: string;
    /** Credential ID for authentication */
    CredentialID?: string;
    /** Custom header name for API key auth */
    CustomHeaderName?: string;
    /** Company ID for multi-tenancy */
    CompanyID: string;
    /** Connection status */
    Status: MCPConnectionStatus;
    /** Auto-sync tools on connect */
    AutoSyncTools: boolean;
    /** Auto-generate MJ Actions from tools */
    AutoGenerateActions: boolean;
    /** Log all tool calls */
    LogToolCalls: boolean;
    /** Include input parameters in logs */
    LogInputParameters: boolean;
    /** Include output content in logs */
    LogOutputContent: boolean;
    /** Maximum output size to log in bytes */
    MaxOutputLogSize?: number;
    /** Environment variables for Stdio transport (JSON object) */
    EnvironmentVars?: string;
}

/**
 * MCP tool definition discovered from server
 */
export interface MCPToolDefinition {
    /** Unique identifier */
    ID: string;
    /** Reference to the MCP server */
    MCPServerID: string;
    /** Tool name (unique per server) */
    ToolName: string;
    /** Human-readable title */
    ToolTitle?: string;
    /** Tool description */
    ToolDescription?: string;
    /** JSON Schema for input parameters */
    InputSchema: string;
    /** JSON Schema for output (if provided) */
    OutputSchema?: string;
    /** Tool annotations/hints as JSON */
    Annotations?: string;
    /** Tool status */
    Status: MCPToolStatus;
}

/**
 * Tool annotations from MCP spec
 */
export interface MCPToolAnnotations {
    /** Display name for the tool */
    title?: string;
    /** Tool doesn't modify state */
    readOnlyHint?: boolean;
    /** Tool can delete/modify data */
    destructiveHint?: boolean;
    /** Safe to repeat the operation */
    idempotentHint?: boolean;
    /** Interacts with external entities */
    openWorldHint?: boolean;
}

/**
 * Connection tool configuration
 */
export interface MCPConnectionToolConfig {
    /** Unique identifier */
    ID: string;
    /** Reference to the connection */
    MCPServerConnectionID: string;
    /** Reference to the tool */
    MCPServerToolID: string;
    /** Whether this tool is enabled */
    IsEnabled: boolean;
    /** Default input values as JSON */
    DefaultInputValues?: string;
    /** Per-tool rate limit override */
    MaxCallsPerMinute?: number;
}

/**
 * Permission entry for a connection
 */
export interface MCPConnectionPermission {
    /** Unique identifier */
    ID: string;
    /** Reference to the connection */
    MCPServerConnectionID: string;
    /** User ID (mutually exclusive with RoleID) */
    UserID?: string;
    /** Role ID (mutually exclusive with UserID) */
    RoleID?: string;
    /** Can invoke tools via this connection */
    CanExecute: boolean;
    /** Can modify connection settings */
    CanModify: boolean;
    /** Can view (not decrypt) credential info */
    CanViewCredentials: boolean;
}

/**
 * Credential data for MCP authentication
 */
export interface MCPCredentialData {
    /** API key for Bearer/APIKey/Custom auth */
    apiKey?: string;
    /** Username for Basic auth */
    username?: string;
    /** Password for Basic auth */
    password?: string;
    /** Client ID for OAuth2 */
    clientId?: string;
    /** Client secret for OAuth2 */
    clientSecret?: string;
    /** Token URL for OAuth2 */
    tokenUrl?: string;
    /** OAuth2 scopes (space-separated) */
    scope?: string;
}

/**
 * Options for calling an MCP tool
 */
export interface MCPCallToolOptions {
    /** Tool input parameters */
    arguments: Record<string, unknown>;
    /** Request timeout override in milliseconds */
    timeout?: number;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Progress callback */
    onProgress?: (progress: MCPProgressInfo) => void;
}

/**
 * Progress information during tool execution
 */
export interface MCPProgressInfo {
    /** Progress value (0-100) */
    progress?: number;
    /** Total expected value */
    total?: number;
    /** Status message */
    message?: string;
}

/**
 * Result from calling an MCP tool
 */
export interface MCPToolCallResult {
    /** Whether the call succeeded */
    success: boolean;
    /** Unstructured content from the tool */
    content: MCPContentBlock[];
    /** Structured result (if provided by tool) */
    structuredContent?: Record<string, unknown>;
    /** Error message if failed */
    error?: string;
    /** Error code if failed */
    errorCode?: number;
    /** Execution duration in milliseconds */
    durationMs: number;
    /** Whether the tool indicated an error */
    isToolError: boolean;
}

/**
 * Content block returned by an MCP tool
 */
export interface MCPContentBlock {
    /** Content type */
    type: 'text' | 'image' | 'audio' | 'resource';
    /** Text content */
    text?: string;
    /** MIME type for binary content */
    mimeType?: string;
    /** Base64-encoded data for binary content */
    data?: string;
    /** Resource URI */
    uri?: string;
}

/**
 * Result from listing tools
 */
export interface MCPListToolsResult {
    /** Whether the list succeeded */
    success: boolean;
    /** Available tools */
    tools: MCPToolInfo[];
    /** Error message if failed */
    error?: string;
}

/**
 * Tool information returned from list
 */
export interface MCPToolInfo {
    /** Tool name */
    name: string;
    /** Tool description */
    description?: string;
    /** JSON Schema for input */
    inputSchema: Record<string, unknown>;
    /** JSON Schema for output */
    outputSchema?: Record<string, unknown>;
    /** Tool annotations */
    annotations?: MCPToolAnnotations;
}

/**
 * Result from syncing tools
 */
export interface MCPSyncToolsResult {
    /** Whether the sync succeeded */
    success: boolean;
    /** Number of tools added */
    added: number;
    /** Number of tools updated */
    updated: number;
    /** Number of tools marked deprecated */
    deprecated: number;
    /** Total tools after sync */
    total: number;
    /** Error message if failed */
    error?: string;
}

/**
 * Result from testing a connection
 */
export interface MCPTestConnectionResult {
    /** Whether the test passed */
    success: boolean;
    /** Server name reported by server */
    serverName?: string;
    /** Server version reported by server */
    serverVersion?: string;
    /** Server capabilities */
    capabilities?: MCPServerCapabilities;
    /** Connection latency in milliseconds */
    latencyMs?: number;
    /** Error message if failed */
    error?: string;
}

/**
 * Server capabilities from MCP handshake
 */
export interface MCPServerCapabilities {
    /** Supports logging */
    logging?: boolean;
    /** Supports completions */
    completions?: boolean;
    /** Supports prompts */
    prompts?: {
        listChanged?: boolean;
    };
    /** Supports resources */
    resources?: {
        subscribe?: boolean;
        listChanged?: boolean;
    };
    /** Supports tools */
    tools?: {
        listChanged?: boolean;
    };
}

/**
 * Active client connection state
 */
export interface MCPActiveConnection {
    /** Connection ID */
    connectionId: string;
    /** Server config */
    serverConfig: MCPServerConfig;
    /** Connection config */
    connectionConfig: MCPConnectionConfig;
    /** MCP Client instance */
    client: unknown; // Client from MCP SDK
    /** Transport instance */
    transport: unknown; // Transport from MCP SDK
    /** When connected */
    connectedAt: Date;
    /** Last activity time */
    lastActivityAt: Date;
    /** Cached server capabilities */
    capabilities?: MCPServerCapabilities;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
    /** Maximum requests per minute */
    perMinute?: number;
    /** Maximum requests per hour */
    perHour?: number;
}

/**
 * Rate limit state for tracking
 */
export interface RateLimitState {
    /** Timestamps of requests in current minute window */
    minuteRequests: number[];
    /** Timestamps of requests in current hour window */
    hourRequests: number[];
}

/**
 * Queued request waiting for rate limit
 */
export interface QueuedRequest {
    /** Unique request ID */
    id: string;
    /** Resolve function to call when request can proceed */
    resolve: () => void;
    /** Reject function to call if request times out */
    reject: (error: Error) => void;
    /** When the request was queued */
    queuedAt: Date;
    /** Maximum time to wait in queue */
    maxWaitMs: number;
}

/**
 * Execution log entry for tool calls
 */
export interface MCPExecutionLogEntry {
    /** Connection ID */
    connectionId: string;
    /** Tool ID (if cached) */
    toolId?: string;
    /** Tool name */
    toolName: string;
    /** User who initiated the call */
    userId: string;
    /** When execution started */
    startedAt: Date;
    /** When execution ended */
    endedAt?: Date;
    /** Duration in milliseconds */
    durationMs?: number;
    /** Whether execution succeeded */
    success: boolean;
    /** Error message if failed */
    errorMessage?: string;
    /** Input parameters (if logging enabled) */
    inputParameters?: Record<string, unknown>;
    /** Output content (if logging enabled) */
    outputContent?: Record<string, unknown>;
    /** Whether output was truncated */
    outputTruncated: boolean;
}

/**
 * Logging configuration for a connection
 */
export interface MCPLoggingConfig {
    /** Log all tool calls */
    logToolCalls: boolean;
    /** Include input parameters in logs */
    logInputParameters: boolean;
    /** Include output content in logs */
    logOutputContent: boolean;
    /** Maximum output size to log in bytes */
    maxOutputLogSize: number;
}

/**
 * Options for MCPClientManager methods
 */
export interface MCPClientOptions {
    /** User context for permissions and logging */
    contextUser: UserInfo;
    /** Skip permission validation (internal use only) */
    skipPermissionCheck?: boolean;
}

/**
 * Options for connecting to an MCP server
 */
export interface MCPConnectOptions extends MCPClientOptions {
    /** Force reconnect even if already connected */
    forceReconnect?: boolean;
    /** Skip auto-sync of tools */
    skipAutoSync?: boolean;
}

/**
 * Options for disconnecting from an MCP server
 */
export interface MCPDisconnectOptions extends MCPClientOptions {
    /** Force disconnect even if operations pending */
    force?: boolean;
}

/**
 * Event types emitted by MCPClientManager
 */
export type MCPClientEventType =
    | 'connected'
    | 'disconnected'
    | 'toolCalled'
    | 'toolCallCompleted'
    | 'toolsSynced'
    | 'connectionError'
    | 'rateLimitExceeded';

/**
 * Event data for MCPClientManager events
 */
export interface MCPClientEvent {
    /** Event type */
    type: MCPClientEventType;
    /** Connection ID */
    connectionId: string;
    /** Timestamp */
    timestamp: Date;
    /** Additional event data */
    data?: Record<string, unknown>;
}

/**
 * Event listener function type
 */
export type MCPClientEventListener = (event: MCPClientEvent) => void;
