/**
 * @fileoverview MCP Client package for MemberJunction
 *
 * This package provides a comprehensive MCP (Model Context Protocol) client
 * implementation for MemberJunction, enabling MJ agents, actions, and services
 * to consume tools from external MCP servers.
 *
 * @module @memberjunction/ai-mcp-client
 *
 * @example
 * ```typescript
 * import { MCPClientManager } from '@memberjunction/ai-mcp-client';
 *
 * // Get the singleton instance
 * const manager = MCPClientManager.Instance;
 *
 * // Initialize (once at startup)
 * await manager.initialize(contextUser);
 *
 * // Connect to an MCP server
 * await manager.connect('connection-id', { contextUser });
 *
 * // Call a tool
 * const result = await manager.callTool('connection-id', 'tool-name', {
 *     arguments: { param1: 'value1' }
 * }, { contextUser });
 *
 * // List available tools
 * const tools = await manager.listTools('connection-id', { contextUser });
 *
 * // Sync tools to database
 * await manager.syncTools('connection-id', { contextUser });
 *
 * // Disconnect
 * await manager.disconnect('connection-id', { contextUser });
 * ```
 */

// Main client manager
export { MCPClientManager } from './MCPClientManager.js';

// Rate limiting utilities
export { RateLimiter, RateLimiterRegistry } from './RateLimiter.js';

// Execution logging
export {
    ExecutionLogger,
    type MCPExecutionLogSummary,
    type MCPExecutionStats,
    type MCPToolStats
} from './ExecutionLogger.js';

// Agent integration
export {
    AgentToolAdapter,
    createAgentToolAdapter,
    LoadAgentToolAdapter,
    type OpenAIFunctionDefinition,
    type AnthropicToolDefinition,
    type AgentToolDefinition,
    type AgentToolResult,
    type ToolDiscoveryOptions
} from './AgentToolAdapter.js';

// Type definitions
export type {
    // Transport and auth types
    MCPTransportType,
    MCPAuthType,
    MCPServerStatus,
    MCPConnectionStatus,
    MCPToolStatus,

    // Configuration types
    MCPServerConfig,
    MCPConnectionConfig,
    MCPToolDefinition,
    MCPToolAnnotations,
    MCPConnectionToolConfig,
    MCPConnectionPermission,
    MCPCredentialData,

    // Operation options
    MCPCallToolOptions,
    MCPClientOptions,
    MCPConnectOptions,
    MCPDisconnectOptions,

    // Result types
    MCPProgressInfo,
    MCPToolCallResult,
    MCPContentBlock,
    MCPListToolsResult,
    MCPToolInfo,
    MCPSyncToolsResult,
    MCPTestConnectionResult,
    MCPServerCapabilities,

    // Internal types
    MCPActiveConnection,
    MCPLoggingConfig,
    MCPExecutionLogEntry,

    // Rate limiting types
    RateLimitConfig,
    RateLimitState,
    QueuedRequest,

    // Event types
    MCPClientEventType,
    MCPClientEvent,
    MCPClientEventListener
} from './types.js';

// OAuth 2.1 module for MCP server authentication
export {
    // Core classes
    OAuthManager,
    AuthServerDiscovery,
    ClientRegistration,
    TokenManager,
    PKCEGenerator,
    OAuthErrorMessages,
    OAuthAuditLogger,
    getOAuthAuditLogger,

    // Error classes
    OAuthAuthorizationRequiredError,
    OAuthReauthorizationRequiredError,

    // Tree-shaking prevention
    LoadOAuthModule,

    // Type re-exports
    type AuthServerMetadata,
    type CachedAuthServerMetadata,
    type DCRRequest,
    type DCRResponse,
    type PKCEChallenge,
    type OAuthTokenResponse,
    type OAuthTokenSet,
    type OAuth2AuthCodeCredentialValues,
    type OAuthAuthorizationState,
    type OAuthAuthorizationStatus,
    type OAuthClientRegistration,
    type OAuthClientRegistrationStatus,
    type OAuthErrorResponse,
    type InitiateAuthorizationResult,
    type CompleteAuthorizationResult,
    type TokenRefreshResult,
    type OAuthConnectionStatus,
    type OAuthEventType,
    type OAuthEventData,
    type MCPServerOAuthConfig,

    // Audit logging types
    type AuthorizationInitiatedDetails,
    type AuthorizationCompletedDetails,
    type AuthorizationFailedDetails,
    type TokenRefreshDetails,
    type TokenRefreshFailedDetails,
    type CredentialsRevokedDetails
} from './oauth/index.js';

/**
 * Tree-shaking prevention function.
 * Call this from application initialization to ensure the package is loaded.
 */
export function LoadMCPClient(): void {
    // This function exists to prevent tree-shaking
    // and ensure the MCPClientManager singleton is available
}
