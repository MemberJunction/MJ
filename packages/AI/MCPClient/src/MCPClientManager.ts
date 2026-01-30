/**
 * @fileoverview MCP Client Manager for MemberJunction
 *
 * Provides a singleton manager for connecting to and interacting with
 * external MCP servers. Supports multiple transport types, authentication
 * methods, rate limiting, and execution logging.
 *
 * @module @memberjunction/ai-mcp-client/MCPClientManager
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import { Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import {
    MCPServerEntity,
    MCPServerConnectionEntity,
    MCPServerToolEntity,
    ActionEntity,
    ActionCategoryEntity,
    ActionParamEntity,
    ActionResultCodeEntity
} from '@memberjunction/core-entities';

import { RateLimiterRegistry, RateLimiter } from './RateLimiter.js';
import { ExecutionLogger } from './ExecutionLogger.js';
import { OAuthManager } from './oauth/OAuthManager.js';
import { OAuthAuthorizationRequiredError, OAuthReauthorizationRequiredError } from './oauth/types.js';
import type { MCPServerOAuthConfig } from './oauth/types.js';
import type {
    MCPServerConfig,
    MCPConnectionConfig,
    MCPToolDefinition,
    MCPConnectionToolConfig,
    MCPConnectionPermission,
    MCPCredentialData,
    MCPCallToolOptions,
    MCPToolCallResult,
    MCPListToolsResult,
    MCPToolInfo,
    MCPSyncToolsResult,
    MCPSyncActionsResult,
    MCPTestConnectionResult,
    MCPServerCapabilities,
    MCPActiveConnection,
    MCPTransportType,
    MCPAuthType,
    MCPLoggingConfig,
    MCPClientOptions,
    MCPConnectOptions,
    MCPDisconnectOptions,
    MCPClientEvent,
    MCPClientEventListener,
    MCPClientEventType,
    MCPContentBlock,
    JSONSchemaProperties,
    JSONSchemaProperty
} from './types.js';

/**
 * MCPClientManager is a singleton that manages connections to external MCP servers.
 *
 * Features:
 * - Support for all MCP transport types (StreamableHTTP, SSE, Stdio, WebSocket)
 * - Multiple authentication methods (None, Bearer, APIKey, OAuth2, Basic, Custom)
 * - Integration with MJ CredentialEngine for secure credential storage
 * - Rate limiting with request queuing
 * - Comprehensive execution logging
 * - Permission-based access control
 *
 * @example
 * ```typescript
 * const manager = MCPClientManager.Instance;
 *
 * // Connect to an MCP server
 * await manager.connect('connection-id', { contextUser });
 *
 * // Call a tool
 * const result = await manager.callTool('connection-id', 'tool-name', {
 *     arguments: { param1: 'value1' }
 * }, { contextUser });
 *
 * // Disconnect
 * await manager.disconnect('connection-id', { contextUser });
 * ```
 */
export class MCPClientManager {
    /** Singleton instance */
    private static _instance: MCPClientManager | null = null;

    /** Active connections */
    private readonly connections: Map<string, MCPActiveConnection> = new Map();

    /** Rate limiters per connection */
    private readonly rateLimiters: RateLimiterRegistry = new RateLimiterRegistry();

    /** Execution logger */
    private readonly logger: ExecutionLogger = new ExecutionLogger();

    /** Event listeners */
    private readonly eventListeners: Map<MCPClientEventType, Set<MCPClientEventListener>> = new Map();

    /** OAuth manager for OAuth2 authentication */
    private readonly oauthManager: OAuthManager = new OAuthManager();

    /** Whether the manager has been initialized */
    private initialized = false;

    /** Public URL for OAuth callbacks (set during initialization) */
    private publicUrl: string = '';

    /** Client name for MCP handshake */
    private static readonly CLIENT_NAME = 'MemberJunction';

    /** Client version for MCP handshake */
    private static readonly CLIENT_VERSION = '3.3.0';

    /** Default connection timeout */
    private static readonly DEFAULT_CONNECTION_TIMEOUT = 30000;

    /** Default request timeout */
    private static readonly DEFAULT_REQUEST_TIMEOUT = 60000;

    /** Entity names */
    private static readonly ENTITY_MCP_SERVERS = 'MJ: MCP Servers';
    private static readonly ENTITY_MCP_CONNECTIONS = 'MJ: MCP Server Connections';
    private static readonly ENTITY_MCP_TOOLS = 'MJ: MCP Server Tools';
    private static readonly ENTITY_MCP_CONNECTION_TOOLS = 'MJ: MCP Server Connection Tools';
    private static readonly ENTITY_MCP_PERMISSIONS = 'MJ: MCP Server Connection Permissions';

    /**
     * Private constructor for singleton pattern
     */
    private constructor() {
        // Initialize event listener maps
        const eventTypes: MCPClientEventType[] = [
            'connected', 'disconnected', 'toolCalled', 'toolCallCompleted',
            'toolsSynced', 'connectionError', 'rateLimitExceeded'
        ];
        for (const eventType of eventTypes) {
            this.eventListeners.set(eventType, new Set());
        }
    }

    /**
     * Gets the singleton instance of MCPClientManager
     */
    public static get Instance(): MCPClientManager {
        if (!MCPClientManager._instance) {
            MCPClientManager._instance = new MCPClientManager();
        }
        return MCPClientManager._instance;
    }

    /**
     * Initializes the manager. Should be called once at application startup.
     *
     * @param contextUser - User context for initialization
     * @param options - Optional initialization options
     */
    public async initialize(
        contextUser: UserInfo,
        options?: { publicUrl?: string }
    ): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Ensure CredentialEngine is configured
            await CredentialEngine.Instance.Config(false, contextUser);

            // Store public URL for OAuth callbacks
            if (options?.publicUrl) {
                this.publicUrl = options.publicUrl;
            }

            this.initialized = true;
            LogStatus('[MCPClient] Manager initialized');
        } catch (error) {
            LogError(`[MCPClient] Failed to initialize: ${error}`);
            throw error;
        }
    }

    /**
     * Sets the public URL for OAuth callbacks.
     *
     * @param publicUrl - The public URL (e.g., https://api.example.com)
     */
    public setPublicUrl(publicUrl: string): void {
        this.publicUrl = publicUrl;
    }

    /**
     * Checks if a connection is currently active
     *
     * @param connectionId - Connection ID to check
     * @returns true if connected
     */
    public isConnected(connectionId: string): boolean {
        return this.connections.has(connectionId);
    }

    /**
     * Gets the list of active connection IDs
     *
     * @returns Array of active connection IDs
     */
    public getActiveConnections(): string[] {
        return Array.from(this.connections.keys());
    }

    // ========================================
    // Connection Management
    // ========================================

    /**
     * Connects to an MCP server using a configured connection
     *
     * @param connectionId - The connection ID to use
     * @param options - Connection options
     * @returns Connection info on success
     */
    public async connect(
        connectionId: string,
        options: MCPConnectOptions
    ): Promise<MCPActiveConnection> {
        const { contextUser, forceReconnect = false, skipAutoSync = false } = options;

        // Check for existing connection
        if (this.connections.has(connectionId) && !forceReconnect) {
            return this.connections.get(connectionId)!;
        }

        // Disconnect existing if forcing reconnect
        if (this.connections.has(connectionId) && forceReconnect) {
            await this.disconnect(connectionId, { contextUser, force: true });
        }

        try {
            // Load connection configuration
            const connectionConfig = await this.loadConnectionConfig(connectionId, contextUser);
            if (!connectionConfig) {
                throw new Error(`Connection not found: ${connectionId}`);
            }

            // Check permissions
            if (!options.skipPermissionCheck) {
                const hasPermission = await this.checkPermission(connectionId, contextUser, 'execute');
                if (!hasPermission) {
                    throw new Error(`Permission denied for connection: ${connectionId}`);
                }
            }

            // Load server configuration
            const serverConfig = await this.loadServerConfig(connectionConfig.MCPServerID, contextUser);
            if (!serverConfig) {
                throw new Error(`Server not found for connection: ${connectionId}`);
            }

            // Get credentials if needed
            let credentials: MCPCredentialData | undefined;
            const authType = serverConfig.DefaultAuthType as MCPAuthType;

            if (authType === 'OAuth2') {
                // Handle OAuth2 authentication
                credentials = await this.getOAuth2Credentials(connectionId, serverConfig, contextUser);
            } else if (connectionConfig.CredentialID && authType !== 'None') {
                try {
                    credentials = await this.getCredentials(connectionConfig.CredentialID, contextUser);
                } catch (error) {
                    // Log warning but proceed without credentials if auth isn't strictly required
                    LogStatus(`[MCPClient] Warning: Could not load credentials for connection ${connectionId}. Proceeding without authentication.`);
                }
            }

            // Create transport
            const transport = await this.createTransport(
                serverConfig,
                connectionConfig,
                credentials
            );

            // Create MCP client
            const client = new Client({
                name: MCPClientManager.CLIENT_NAME,
                version: MCPClientManager.CLIENT_VERSION
            });

            // Connect
            await client.connect(transport);

            // Get server capabilities
            const capabilities = this.mapServerCapabilities(client.getServerCapabilities());

            // Create active connection record
            const activeConnection: MCPActiveConnection = {
                connectionId,
                serverConfig,
                connectionConfig,
                client,
                transport,
                connectedAt: new Date(),
                lastActivityAt: new Date(),
                capabilities
            };

            // Store connection
            this.connections.set(connectionId, activeConnection);

            // Set up rate limiter
            this.rateLimiters.getOrCreate(connectionId, {
                perMinute: serverConfig.RateLimitPerMinute,
                perHour: serverConfig.RateLimitPerHour
            });

            // Update connection status in database
            await this.updateConnectionStatus(connectionId, 'Active', contextUser);

            // Emit connected event
            this.emitEvent({
                type: 'connected',
                connectionId,
                timestamp: new Date(),
                data: { serverName: serverConfig.Name }
            });

            // Auto-sync tools if enabled
            if (connectionConfig.AutoSyncTools && !skipAutoSync) {
                try {
                    await this.syncTools(connectionId, { contextUser });
                } catch (syncError) {
                    // Don't fail connection for sync errors
                    LogError(`[MCPClient] Auto-sync failed for ${connectionId}: ${syncError}`);
                }
            }

            LogStatus(`[MCPClient] Connected to ${serverConfig.Name} via ${serverConfig.TransportType}`);
            return activeConnection;

        } catch (error) {
            // Update connection status to Error
            await this.updateConnectionStatus(connectionId, 'Error', contextUser, error);

            // Emit error event
            this.emitEvent({
                type: 'connectionError',
                connectionId,
                timestamp: new Date(),
                data: { error: error instanceof Error ? error.message : String(error) }
            });

            throw error;
        }
    }

    /**
     * Disconnects from an MCP server
     *
     * @param connectionId - The connection ID to disconnect
     * @param options - Disconnect options
     */
    public async disconnect(
        connectionId: string,
        options: MCPDisconnectOptions
    ): Promise<void> {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            return; // Already disconnected
        }

        try {
            // Close the transport
            const transport = connection.transport as Transport;
            await transport.close();

            // Remove from active connections
            this.connections.delete(connectionId);

            // Clean up rate limiter
            this.rateLimiters.remove(connectionId);

            // Update connection status
            await this.updateConnectionStatus(connectionId, 'Inactive', options.contextUser);

            // Emit disconnected event
            this.emitEvent({
                type: 'disconnected',
                connectionId,
                timestamp: new Date()
            });

            LogStatus(`[MCPClient] Disconnected from ${connection.serverConfig.Name}`);

        } catch (error) {
            if (options.force) {
                // Force remove even on error
                this.connections.delete(connectionId);
                this.rateLimiters.remove(connectionId);
            }
            throw error;
        }
    }

    // ========================================
    // Tool Operations
    // ========================================

    /**
     * Calls a tool on an MCP server
     *
     * @param connectionId - The connection ID to use
     * @param toolName - Name of the tool to call
     * @param toolOptions - Tool call options including arguments
     * @param options - Client options
     * @returns Tool call result
     */
    public async callTool(
        connectionId: string,
        toolName: string,
        toolOptions: MCPCallToolOptions,
        options: MCPClientOptions
    ): Promise<MCPToolCallResult> {
        const startTime = Date.now();
        const { contextUser } = options;

        LogStatus(`[MCPClient] callTool started for ${toolName} on connection ${connectionId}`);

        // Get active connection
        const connection = this.connections.get(connectionId);
        if (!connection) {
            LogError(`[MCPClient] Not connected: ${connectionId}`);
            throw new Error(`Not connected: ${connectionId}`);
        }
        LogStatus(`[MCPClient] [${toolName}] Got connection (${Date.now() - startTime}ms)`);

        // Check permissions
        if (!options.skipPermissionCheck) {
            LogStatus(`[MCPClient] [${toolName}] Checking permissions...`);
            const hasPermission = await this.checkPermission(connectionId, contextUser, 'execute');
            if (!hasPermission) {
                LogError(`[MCPClient] [${toolName}] Permission denied`);
                throw new Error(`Permission denied for connection: ${connectionId}`);
            }
            LogStatus(`[MCPClient] [${toolName}] Permission check passed (${Date.now() - startTime}ms)`);
        }

        // Get logging config
        const loggingConfig = this.getLoggingConfig(connection.connectionConfig);
        LogStatus(`[MCPClient] [${toolName}] Got logging config (${Date.now() - startTime}ms)`);

        // Get tool ID for logging
        LogStatus(`[MCPClient] [${toolName}] Getting tool ID...`);
        const toolId = await this.getToolId(connection.serverConfig.ID, toolName, contextUser);
        LogStatus(`[MCPClient] [${toolName}] Got tool ID: ${toolId} (${Date.now() - startTime}ms)`);

        // Start logging
        LogStatus(`[MCPClient] [${toolName}] Starting execution log...`);
        const logId = await this.logger.startLog(
            connectionId,
            toolId,
            toolName,
            toolOptions.arguments,
            loggingConfig,
            contextUser
        );
        LogStatus(`[MCPClient] [${toolName}] Execution log started: ${logId} (${Date.now() - startTime}ms)`);

        // Emit tool called event
        this.emitEvent({
            type: 'toolCalled',
            connectionId,
            timestamp: new Date(),
            data: { toolName }
        });

        try {
            // Acquire rate limit slot
            const rateLimiter = this.rateLimiters.get(connectionId);
            if (rateLimiter) {
                LogStatus(`[MCPClient] [${toolName}] Acquiring rate limit slot...`);
                try {
                    await rateLimiter.acquire();
                    LogStatus(`[MCPClient] [${toolName}] Rate limit slot acquired (${Date.now() - startTime}ms)`);
                } catch (rateLimitError) {
                    LogError(`[MCPClient] [${toolName}] Rate limit exceeded: ${rateLimitError}`);
                    this.emitEvent({
                        type: 'rateLimitExceeded',
                        connectionId,
                        timestamp: new Date(),
                        data: { toolName, error: rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError) }
                    });
                    throw rateLimitError;
                }
            }

            // Update last activity time
            connection.lastActivityAt = new Date();

            // Call the tool
            const client = connection.client as Client;
            const timeout = toolOptions.timeout ?? connection.serverConfig.RequestTimeoutMs ?? MCPClientManager.DEFAULT_REQUEST_TIMEOUT;
            LogStatus(`[MCPClient] [${toolName}] Calling MCP tool with timeout ${timeout}ms...`);
            LogStatus(`[MCPClient] [${toolName}] Arguments: ${JSON.stringify(toolOptions.arguments).substring(0, 200)}`);

            const mcpResult = await client.callTool({
                name: toolName,
                arguments: toolOptions.arguments
            }, undefined, {
                timeout,
                signal: toolOptions.signal,
                onprogress: toolOptions.onProgress ? (progress) => {
                    LogStatus(`[MCPClient] [${toolName}] Progress: ${progress.progress}/${progress.total}`);
                    toolOptions.onProgress?.({
                        progress: progress.progress,
                        total: progress.total
                    });
                } : undefined
            }) as CallToolResult;

            LogStatus(`[MCPClient] [${toolName}] MCP tool call returned (${Date.now() - startTime}ms)`);
            LogStatus(`[MCPClient] [${toolName}] Result isError: ${mcpResult.isError}, content length: ${mcpResult.content?.length || 0}`);

            // Map result
            const result = this.mapToolCallResult(mcpResult, Date.now() - startTime);
            LogStatus(`[MCPClient] [${toolName}] Result mapped (${Date.now() - startTime}ms)`);

            // Complete logging
            LogStatus(`[MCPClient] [${toolName}] Completing execution log...`);
            await this.logger.completeLog(logId, result, loggingConfig, contextUser);
            LogStatus(`[MCPClient] [${toolName}] Execution log completed (${Date.now() - startTime}ms)`);

            // Emit completion event
            this.emitEvent({
                type: 'toolCallCompleted',
                connectionId,
                timestamp: new Date(),
                data: { toolName, success: result.success, durationMs: result.durationMs }
            });

            LogStatus(`[MCPClient] [${toolName}] callTool completed successfully (${Date.now() - startTime}ms)`);
            return result;

        } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : '';
            LogError(`[MCPClient] [${toolName}] Error after ${durationMs}ms: ${errorMsg}`);
            LogError(`[MCPClient] [${toolName}] Stack: ${stack}`);

            // Fail logging
            await this.logger.failLog(logId, error instanceof Error ? error : String(error), durationMs, contextUser);

            // Emit completion event with error
            this.emitEvent({
                type: 'toolCallCompleted',
                connectionId,
                timestamp: new Date(),
                data: { toolName, success: false, durationMs, error: errorMsg }
            });

            return {
                success: false,
                content: [],
                error: errorMsg,
                durationMs,
                isToolError: false
            };
        }
    }

    /**
     * Lists available tools from an MCP server
     *
     * @param connectionId - The connection ID to use
     * @param options - Client options
     * @returns List of available tools
     */
    public async listTools(
        connectionId: string,
        options: MCPClientOptions
    ): Promise<MCPListToolsResult> {
        const { contextUser } = options;

        // Get active connection
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new Error(`Not connected: ${connectionId}`);
        }

        // Check permissions
        if (!options.skipPermissionCheck) {
            const hasPermission = await this.checkPermission(connectionId, contextUser, 'execute');
            if (!hasPermission) {
                throw new Error(`Permission denied for connection: ${connectionId}`);
            }
        }

        try {
            const client = connection.client as Client;
            const result = await client.listTools();

            const tools: MCPToolInfo[] = (result.tools || []).map((tool: Tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema as Record<string, unknown>,
                outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
                annotations: tool.annotations ? {
                    title: tool.annotations.title,
                    readOnlyHint: tool.annotations.readOnlyHint,
                    destructiveHint: tool.annotations.destructiveHint,
                    idempotentHint: tool.annotations.idempotentHint,
                    openWorldHint: tool.annotations.openWorldHint
                } : undefined
            }));

            return {
                success: true,
                tools
            };

        } catch (error) {
            return {
                success: false,
                tools: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Syncs tool definitions from the MCP server to the database
     *
     * @param connectionId - The connection ID to use
     * @param options - Client options
     * @returns Sync result
     */
    public async syncTools(
        connectionId: string,
        options: MCPClientOptions
    ): Promise<MCPSyncToolsResult> {
        const { contextUser } = options;

        // Get active connection
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new Error(`Not connected: ${connectionId}`);
        }

        try {
            // List tools from server
            const listResult = await this.listTools(connectionId, options);
            if (!listResult.success) {
                return {
                    success: false,
                    added: 0,
                    updated: 0,
                    deprecated: 0,
                    total: 0,
                    error: listResult.error
                };
            }

            // Load existing tools from database
            const existingTools = await this.loadServerTools(connection.serverConfig.ID, contextUser);
            const existingToolMap = new Map(existingTools.map(t => [t.ToolName, t]));

            let added = 0;
            let updated = 0;
            const seenToolNames = new Set<string>();

            const md = new Metadata();

            // Process each tool from server
            for (const tool of listResult.tools) {
                seenToolNames.add(tool.name);
                const existing = existingToolMap.get(tool.name);

                if (existing) {
                    // Update existing tool
                    const toolEntity = await md.GetEntityObject<MCPServerToolEntity>(
                        MCPClientManager.ENTITY_MCP_TOOLS,
                        contextUser
                    );
                    const loaded = await toolEntity.Load(existing.ID);
                    if (loaded) {
                        toolEntity.ToolTitle = tool.annotations?.title ?? tool.name;
                        toolEntity.ToolDescription = tool.description ?? null;
                        toolEntity.InputSchema = JSON.stringify(tool.inputSchema);
                        toolEntity.OutputSchema = tool.outputSchema ? JSON.stringify(tool.outputSchema) : null;
                        toolEntity.Annotations = tool.annotations ? JSON.stringify(tool.annotations) : null;
                        toolEntity.Status = 'Active';
                        toolEntity.LastSeenAt = new Date();
                        await toolEntity.Save();
                        updated++;
                    }
                } else {
                    // Add new tool
                    const toolEntity = await md.GetEntityObject<MCPServerToolEntity>(
                        MCPClientManager.ENTITY_MCP_TOOLS,
                        contextUser
                    );
                    toolEntity.NewRecord();
                    toolEntity.MCPServerID = connection.serverConfig.ID;
                    toolEntity.ToolName = tool.name;
                    toolEntity.ToolTitle = tool.annotations?.title ?? tool.name;
                    toolEntity.ToolDescription = tool.description ?? null;
                    toolEntity.InputSchema = JSON.stringify(tool.inputSchema);
                    toolEntity.OutputSchema = tool.outputSchema ? JSON.stringify(tool.outputSchema) : null;
                    toolEntity.Annotations = tool.annotations ? JSON.stringify(tool.annotations) : null;
                    toolEntity.Status = 'Active';
                    toolEntity.DiscoveredAt = new Date();
                    toolEntity.LastSeenAt = new Date();
                    await toolEntity.Save();
                    added++;
                }
            }

            // Mark tools not seen as deprecated
            let deprecated = 0;
            for (const existing of existingTools) {
                if (!seenToolNames.has(existing.ToolName) && existing.Status === 'Active') {
                    const toolEntity = await md.GetEntityObject<MCPServerToolEntity>(
                        MCPClientManager.ENTITY_MCP_TOOLS,
                        contextUser
                    );
                    const loaded = await toolEntity.Load(existing.ID);
                    if (loaded) {
                        toolEntity.Status = 'Deprecated';
                        await toolEntity.Save();
                        deprecated++;
                    }
                }
            }

            // Update server LastSyncAt
            await this.updateServerLastSync(connection.serverConfig.ID, contextUser);

            // Sync Actions for the tools (creates Actions in System/MCP/{ServerName})
            const actionsResult = await this.syncActionsForServer(connection.serverConfig.ID, contextUser);
            if (!actionsResult.success) {
                LogError(`Warning: Tool sync succeeded but Actions sync failed: ${actionsResult.error}`);
            }

            // Emit sync event
            this.emitEvent({
                type: 'toolsSynced',
                connectionId,
                timestamp: new Date(),
                data: { added, updated, deprecated, total: listResult.tools.length }
            });

            return {
                success: true,
                added,
                updated,
                deprecated,
                total: listResult.tools.length
            };

        } catch (error) {
            return {
                success: false,
                added: 0,
                updated: 0,
                deprecated: 0,
                total: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Syncs MCP Server Tools to MJ Actions.
     * Creates the category hierarchy System/MCP/{ServerName} and an Action for each tool.
     *
     * @param serverId - The MCP Server ID to sync actions for
     * @param contextUser - The user context for database operations
     * @returns Sync result with counts of created/updated actions and params
     */
    public async syncActionsForServer(
        serverId: string,
        contextUser: UserInfo
    ): Promise<MCPSyncActionsResult> {
        try {
            const rv = new RunView();

            // Load the server
            const serverResult = await rv.RunView<MCPServerEntity>({
                EntityName: MCPClientManager.ENTITY_MCP_SERVERS,
                ExtraFilter: `ID='${serverId}'`,
                ResultType: 'entity_object'
            }, contextUser);

            if (!serverResult.Success || serverResult.Results.length === 0) {
                return {
                    success: false,
                    actionsCreated: 0,
                    actionsUpdated: 0,
                    paramsCreated: 0,
                    paramsUpdated: 0,
                    paramsDeleted: 0,
                    error: `Server not found: ${serverId}`
                };
            }

            const server = serverResult.Results[0];

            // Get or create the server's category under System/MCP/{ServerName}
            const serverCategoryId = await this.getOrCreateServerCategory(server.Name, contextUser);
            if (!serverCategoryId) {
                return {
                    success: false,
                    actionsCreated: 0,
                    actionsUpdated: 0,
                    paramsCreated: 0,
                    paramsUpdated: 0,
                    paramsDeleted: 0,
                    error: 'Failed to create server category'
                };
            }

            // Load all tools for this server
            const toolsResult = await rv.RunView<MCPServerToolEntity>({
                EntityName: MCPClientManager.ENTITY_MCP_TOOLS,
                ExtraFilter: `MCPServerID='${serverId}' AND Status='Active'`,
                ResultType: 'entity_object'
            }, contextUser);

            if (!toolsResult.Success) {
                return {
                    success: false,
                    actionsCreated: 0,
                    actionsUpdated: 0,
                    paramsCreated: 0,
                    paramsUpdated: 0,
                    paramsDeleted: 0,
                    error: `Failed to load tools: ${toolsResult.ErrorMessage}`
                };
            }

            let actionsCreated = 0;
            let actionsUpdated = 0;
            let paramsCreated = 0;
            let paramsUpdated = 0;
            let paramsDeleted = 0;

            // Process each tool
            for (const tool of toolsResult.Results) {
                const result = await this.syncActionForTool(tool, serverCategoryId, contextUser);
                if (result.created) {
                    actionsCreated++;
                } else {
                    actionsUpdated++;
                }
                paramsCreated += result.paramsCreated;
                paramsUpdated += result.paramsUpdated;
                paramsDeleted += result.paramsDeleted;
            }

            LogStatus(`Synced actions for MCP Server '${server.Name}': ${actionsCreated} created, ${actionsUpdated} updated`);

            return {
                success: true,
                actionsCreated,
                actionsUpdated,
                paramsCreated,
                paramsUpdated,
                paramsDeleted,
                serverCategoryId
            };

        } catch (error) {
            LogError(`Error syncing actions for server ${serverId}: ${error}`);
            return {
                success: false,
                actionsCreated: 0,
                actionsUpdated: 0,
                paramsCreated: 0,
                paramsUpdated: 0,
                paramsDeleted: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Gets or creates the category hierarchy: System/MCP/{ServerName}
     *
     * @param serverName - The MCP Server name to create category for
     * @param contextUser - The user context
     * @returns The server category ID or null if failed
     */
    private async getOrCreateServerCategory(
        serverName: string,
        contextUser: UserInfo
    ): Promise<string | null> {
        try {
            // Step 1: Find or create "System" category (root)
            const systemCategoryId = await this.findOrCreateCategory(
                'System',
                null,
                'Core system actions and utilities',
                contextUser
            );
            if (!systemCategoryId) {
                LogError('Failed to find or create System category');
                return null;
            }

            // Step 2: Find or create "MCP" category under System
            const mcpCategoryId = await this.findOrCreateCategory(
                'MCP',
                systemCategoryId,
                'Model Context Protocol (MCP) server tools exposed as Actions',
                contextUser
            );
            if (!mcpCategoryId) {
                LogError('Failed to find or create MCP category');
                return null;
            }

            // Step 3: Find or create server-specific category under MCP
            const serverCategoryId = await this.findOrCreateCategory(
                serverName,
                mcpCategoryId,
                `Tools from MCP Server: ${serverName}`,
                contextUser
            );
            if (!serverCategoryId) {
                LogError(`Failed to find or create category for server: ${serverName}`);
                return null;
            }

            return serverCategoryId;

        } catch (error) {
            LogError(`Error creating category hierarchy for server ${serverName}: ${error}`);
            return null;
        }
    }

    /**
     * Finds or creates an ActionCategory with the given name and parent.
     *
     * @param name - Category name
     * @param parentId - Parent category ID (null for root)
     * @param description - Category description
     * @param contextUser - User context
     * @returns The category ID or null if failed
     */
    private async findOrCreateCategory(
        name: string,
        parentId: string | null,
        description: string,
        contextUser: UserInfo
    ): Promise<string | null> {
        const md = new Metadata();
        const rv = new RunView();

        // Build filter based on parent
        const parentFilter = parentId
            ? `ParentID='${parentId}'`
            : 'ParentID IS NULL';

        // Try to find existing category
        const existingResult = await rv.RunView<ActionCategoryEntity>({
            EntityName: 'Action Categories',
            ExtraFilter: `Name='${name}' AND ${parentFilter}`,
            ResultType: 'entity_object'
        }, contextUser);

        if (existingResult.Success && existingResult.Results.length > 0) {
            return existingResult.Results[0].ID;
        }

        // Create new category
        const category = await md.GetEntityObject<ActionCategoryEntity>('Action Categories', contextUser);
        category.NewRecord();
        category.Name = name;
        category.Description = description;
        category.ParentID = parentId;
        category.Status = 'Active';

        const saved = await category.Save();
        if (!saved) {
            LogError(`Failed to create category '${name}': ${category.LatestResult?.Message}`);
            return null;
        }

        LogStatus(`Created Action Category: ${name}`);
        return category.ID;
    }

    /**
     * Syncs a single MCP Server Tool to an Action.
     *
     * @param tool - The MCPServerTool entity
     * @param categoryId - The server category ID
     * @param contextUser - User context
     * @returns Result with created flag and param counts
     */
    private async syncActionForTool(
        tool: MCPServerToolEntity,
        categoryId: string,
        contextUser: UserInfo
    ): Promise<{ created: boolean; paramsCreated: number; paramsUpdated: number; paramsDeleted: number }> {
        const md = new Metadata();
        const rv = new RunView();

        let action: ActionEntity;
        let created = false;

        // Check if tool already has a linked action
        if (tool.GeneratedActionID) {
            const actionEntity = await md.GetEntityObject<ActionEntity>('Actions', contextUser);
            const loaded = await actionEntity.Load(tool.GeneratedActionID);
            if (loaded) {
                action = actionEntity;
            } else {
                // Action was deleted, create new one
                action = await this.createActionForTool(tool, categoryId, contextUser);
                created = true;
            }
        } else {
            // Check if an action with this name already exists in the category
            const existingResult = await rv.RunView<ActionEntity>({
                EntityName: 'Actions',
                ExtraFilter: `Name='${tool.ToolName.replace(/'/g, "''")}' AND CategoryID='${categoryId}'`,
                ResultType: 'entity_object'
            }, contextUser);

            if (existingResult.Success && existingResult.Results.length > 0) {
                action = existingResult.Results[0];
            } else {
                action = await this.createActionForTool(tool, categoryId, contextUser);
                created = true;
            }
        }

        // Update action properties
        action.Description = tool.ToolDescription || `MCP Tool: ${tool.ToolName}`;
        action.CategoryID = categoryId;

        // Save action if dirty
        if (action.Dirty) {
            await action.Save();
        }

        // Update the tool's GeneratedActionID and GeneratedActionCategoryID if needed
        if (tool.GeneratedActionID !== action.ID || tool.GeneratedActionCategoryID !== categoryId) {
            const toolEntity = await md.GetEntityObject<MCPServerToolEntity>(
                MCPClientManager.ENTITY_MCP_TOOLS,
                contextUser
            );
            await toolEntity.Load(tool.ID);
            toolEntity.GeneratedActionID = action.ID;
            toolEntity.GeneratedActionCategoryID = categoryId;
            await toolEntity.Save();
        }

        // Sync action params from tool's InputSchema (input params)
        const paramResult = await this.syncActionParamsFromSchema(action.ID, tool.InputSchema, contextUser);

        // Sync standard output params for MCP tools
        const outputParamResult = await this.syncMCPOutputParams(action.ID, contextUser);

        // Sync standard result codes for MCP tools
        await this.syncMCPResultCodes(action.ID, contextUser);

        return {
            created,
            paramsCreated: paramResult.created + outputParamResult.created,
            paramsUpdated: paramResult.updated + outputParamResult.updated,
            paramsDeleted: paramResult.deleted
        };
    }

    /**
     * Creates a new Action for an MCP Server Tool.
     *
     * @param tool - The MCPServerTool entity
     * @param categoryId - The category ID
     * @param contextUser - User context
     * @returns The created Action entity
     */
    private async createActionForTool(
        tool: MCPServerToolEntity,
        categoryId: string,
        contextUser: UserInfo
    ): Promise<ActionEntity> {
        const md = new Metadata();

        const action = await md.GetEntityObject<ActionEntity>('Actions', contextUser);
        action.NewRecord();
        action.Name = tool.ToolName;
        action.Description = tool.ToolDescription || `MCP Tool: ${tool.ToolName}`;
        action.CategoryID = categoryId;
        action.Type = 'Custom';
        action.DriverClass = 'MCPToolAction';  // Special driver class for MCP tools
        action.Status = 'Active';
        action.CodeApprovalStatus = 'Approved';  // MCP tools are pre-approved
        action.CodeLocked = true;  // Prevent code generation

        await action.Save();
        LogStatus(`Created Action for MCP Tool: ${tool.ToolName}`);

        return action;
    }

    /**
     * Syncs ActionParams from a tool's InputSchema JSON Schema.
     *
     * @param actionId - The Action ID
     * @param inputSchemaJson - The JSON Schema string for input parameters
     * @param contextUser - User context
     * @returns Counts of created, updated, and deleted params
     */
    private async syncActionParamsFromSchema(
        actionId: string,
        inputSchemaJson: string,
        contextUser: UserInfo
    ): Promise<{ created: number; updated: number; deleted: number }> {
        const md = new Metadata();
        const rv = new RunView();

        let created = 0;
        let updated = 0;
        let deleted = 0;

        // Parse the input schema
        let schema: JSONSchemaProperties;
        try {
            schema = JSON.parse(inputSchemaJson);
        } catch {
            LogError(`Failed to parse InputSchema for action ${actionId}`);
            return { created, updated, deleted };
        }

        // Get existing params for this action
        const existingResult = await rv.RunView<ActionParamEntity>({
            EntityName: 'Action Params',
            ExtraFilter: `ActionID='${actionId}'`,
            ResultType: 'entity_object'
        }, contextUser);

        const existingParams = existingResult.Success ? existingResult.Results : [];
        const existingParamMap = new Map(existingParams.map(p => [p.Name, p]));
        const seenParamNames = new Set<string>();

        // Process schema properties
        const properties = schema.properties || {};
        const required = new Set(schema.required || []);

        for (const [paramName, paramDef] of Object.entries(properties)) {
            seenParamNames.add(paramName);
            const existing = existingParamMap.get(paramName);
            const paramDefinition = paramDef as JSONSchemaProperty;

            if (existing) {
                // Update existing param
                existing.Description = paramDefinition.description || null;
                existing.IsRequired = required.has(paramName);
                existing.ValueType = this.mapJsonSchemaTypeToValueType(paramDefinition.type);
                existing.IsArray = paramDefinition.type === 'array';
                existing.DefaultValue = paramDefinition.default !== undefined
                    ? JSON.stringify(paramDefinition.default)
                    : null;

                if (existing.Dirty) {
                    await existing.Save();
                    updated++;
                }
            } else {
                // Create new param
                const param = await md.GetEntityObject<ActionParamEntity>('Action Params', contextUser);
                param.NewRecord();
                param.ActionID = actionId;
                param.Name = paramName;
                param.Description = paramDefinition.description || null;
                param.Type = 'Input';
                param.IsRequired = required.has(paramName);
                param.ValueType = this.mapJsonSchemaTypeToValueType(paramDefinition.type);
                param.IsArray = paramDefinition.type === 'array';
                param.DefaultValue = paramDefinition.default !== undefined
                    ? JSON.stringify(paramDefinition.default)
                    : null;

                await param.Save();
                created++;
            }
        }

        // Delete params that no longer exist in schema
        for (const existing of existingParams) {
            if (!seenParamNames.has(existing.Name)) {
                await existing.Delete();
                deleted++;
            }
        }

        return { created, updated, deleted };
    }

    /**
     * Maps JSON Schema type to ActionParam ValueType.
     *
     * @param jsonType - The JSON Schema type
     * @returns The corresponding ActionParam ValueType
     */
    private mapJsonSchemaTypeToValueType(
        jsonType: string | string[] | undefined
    ): 'Scalar' | 'Simple Object' | 'Other' {
        const type = Array.isArray(jsonType) ? jsonType[0] : jsonType;

        switch (type) {
            case 'string':
            case 'number':
            case 'integer':
            case 'boolean':
                return 'Scalar';
            case 'object':
                return 'Simple Object';
            case 'array':
                return 'Scalar';  // Array flag is set separately
            default:
                return 'Other';
        }
    }

    /**
     * Standard output parameters for all MCP tool actions.
     */
    private static readonly MCP_OUTPUT_PARAMS = [
        { Name: 'ToolOutput', ValueType: 'Other' as const, IsArray: false, Description: 'Raw output content from the MCP tool' },
        { Name: 'StructuredOutput', ValueType: 'Simple Object' as const, IsArray: false, Description: 'Parsed/structured output if available' },
        { Name: 'DurationMs', ValueType: 'Scalar' as const, IsArray: false, Description: 'Tool execution duration in milliseconds' },
        { Name: 'IsToolError', ValueType: 'Scalar' as const, IsArray: false, Description: 'Whether the tool returned an error response' }
    ];

    /**
     * Standard result codes for all MCP tool actions.
     */
    private static readonly MCP_RESULT_CODES = [
        { ResultCode: 'SUCCESS', IsSuccess: true, Description: 'Tool executed successfully' },
        { ResultCode: 'TOOL_NOT_FOUND', IsSuccess: false, Description: 'No MCP Server Tool linked to this action' },
        { ResultCode: 'NO_CONNECTION', IsSuccess: false, Description: 'No active connection available for the MCP server' },
        { ResultCode: 'TOOL_ERROR', IsSuccess: false, Description: 'Tool executed but returned an error response' },
        { ResultCode: 'EXECUTION_FAILED', IsSuccess: false, Description: 'Protocol or transport error during tool execution' },
        { ResultCode: 'UNEXPECTED_ERROR', IsSuccess: false, Description: 'Unhandled exception during action execution' }
    ];

    /**
     * Syncs standard output parameters for MCP tool actions.
     *
     * @param actionId - The Action ID
     * @param contextUser - User context
     * @returns Counts of created and updated params
     */
    private async syncMCPOutputParams(
        actionId: string,
        contextUser: UserInfo
    ): Promise<{ created: number; updated: number }> {
        const md = new Metadata();
        const rv = new RunView();

        let created = 0;
        let updated = 0;

        // Get existing output params for this action
        const existingResult = await rv.RunView<ActionParamEntity>({
            EntityName: 'Action Params',
            ExtraFilter: `ActionID='${actionId}' AND Type='Output'`,
            ResultType: 'entity_object'
        }, contextUser);

        const existingParams = existingResult.Success ? existingResult.Results : [];
        const existingParamMap = new Map(existingParams.map(p => [p.Name, p]));

        // Process standard MCP output params
        for (const paramDef of MCPClientManager.MCP_OUTPUT_PARAMS) {
            const existing = existingParamMap.get(paramDef.Name);

            if (existing) {
                // Update existing param if needed
                let dirty = false;
                if (existing.Description !== paramDef.Description) {
                    existing.Description = paramDef.Description;
                    dirty = true;
                }
                if (existing.ValueType !== paramDef.ValueType) {
                    existing.ValueType = paramDef.ValueType;
                    dirty = true;
                }
                if (existing.IsArray !== paramDef.IsArray) {
                    existing.IsArray = paramDef.IsArray;
                    dirty = true;
                }
                if (dirty) {
                    await existing.Save();
                    updated++;
                }
            } else {
                // Create new output param
                const param = await md.GetEntityObject<ActionParamEntity>('Action Params', contextUser);
                param.NewRecord();
                param.ActionID = actionId;
                param.Name = paramDef.Name;
                param.Type = 'Output';
                param.ValueType = paramDef.ValueType;
                param.IsArray = paramDef.IsArray;
                param.IsRequired = false;
                param.Description = paramDef.Description;

                await param.Save();
                created++;
            }
        }

        return { created, updated };
    }

    /**
     * Syncs standard result codes for MCP tool actions.
     *
     * @param actionId - The Action ID
     * @param contextUser - User context
     */
    private async syncMCPResultCodes(
        actionId: string,
        contextUser: UserInfo
    ): Promise<void> {
        const md = new Metadata();
        const rv = new RunView();

        // Get existing result codes for this action
        const existingResult = await rv.RunView<ActionResultCodeEntity>({
            EntityName: 'Action Result Codes',
            ExtraFilter: `ActionID='${actionId}'`,
            ResultType: 'entity_object'
        }, contextUser);

        const existingCodes = existingResult.Success ? existingResult.Results : [];
        const existingCodeMap = new Map(existingCodes.map(c => [c.ResultCode, c]));

        // Process standard MCP result codes
        for (const codeDef of MCPClientManager.MCP_RESULT_CODES) {
            const existing = existingCodeMap.get(codeDef.ResultCode);

            if (existing) {
                // Update existing code if needed
                let dirty = false;
                if (existing.IsSuccess !== codeDef.IsSuccess) {
                    existing.IsSuccess = codeDef.IsSuccess;
                    dirty = true;
                }
                if (existing.Description !== codeDef.Description) {
                    existing.Description = codeDef.Description;
                    dirty = true;
                }
                if (dirty) {
                    await existing.Save();
                }
            } else {
                // Create new result code
                const code = await md.GetEntityObject<ActionResultCodeEntity>('Action Result Codes', contextUser);
                code.NewRecord();
                code.ActionID = actionId;
                code.ResultCode = codeDef.ResultCode;
                code.IsSuccess = codeDef.IsSuccess;
                code.Description = codeDef.Description;

                await code.Save();
            }
        }
    }

    /**
     * Tests a connection to an MCP server
     *
     * @param connectionId - The connection ID to test
     * @param options - Client options
     * @returns Test result
     */
    public async testConnection(
        connectionId: string,
        options: MCPClientOptions
    ): Promise<MCPTestConnectionResult> {
        const startTime = Date.now();

        try {
            // Try to connect
            const wasConnected = this.isConnected(connectionId);
            if (!wasConnected) {
                await this.connect(connectionId, { ...options, skipAutoSync: true });
            }

            const connection = this.connections.get(connectionId);
            if (!connection) {
                throw new Error('Failed to establish connection');
            }

            const client = connection.client as Client;
            const serverInfo = client.getServerVersion();

            const result: MCPTestConnectionResult = {
                success: true,
                serverName: serverInfo?.name,
                serverVersion: serverInfo?.version,
                capabilities: connection.capabilities,
                latencyMs: Date.now() - startTime
            };

            // Disconnect if we connected just for the test
            if (!wasConnected) {
                await this.disconnect(connectionId, options);
            }

            return result;

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                latencyMs: Date.now() - startTime
            };
        }
    }

    // ========================================
    // Event Handling
    // ========================================

    /**
     * Adds an event listener
     *
     * @param eventType - Event type to listen for
     * @param listener - Listener function
     */
    public addEventListener(eventType: MCPClientEventType, listener: MCPClientEventListener): void {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            listeners.add(listener);
        }
    }

    /**
     * Removes an event listener
     *
     * @param eventType - Event type
     * @param listener - Listener function to remove
     */
    public removeEventListener(eventType: MCPClientEventType, listener: MCPClientEventListener): void {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            listeners.delete(listener);
        }
    }

    /**
     * Gets the execution logger for accessing log data
     */
    public get ExecutionLogger(): ExecutionLogger {
        return this.logger;
    }

    /**
     * Gets information about an active connection
     *
     * @param connectionId - Connection ID
     * @returns Connection info or null if not connected
     */
    public getConnectionInfo(connectionId: string): { serverName: string; connectionName: string; connectedAt: Date } | null {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            return null;
        }
        return {
            serverName: connection.serverConfig.Name,
            connectionName: connection.connectionConfig.Name,
            connectedAt: connection.connectedAt
        };
    }

    // ========================================
    // Private Helper Methods
    // ========================================

    /**
     * Loads connection configuration from database
     */
    private async loadConnectionConfig(connectionId: string, contextUser: UserInfo): Promise<MCPConnectionConfig | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MCPConnectionConfig>({
                EntityName: MCPClientManager.ENTITY_MCP_CONNECTIONS,
                ExtraFilter: `ID = '${connectionId}'`,
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return null;
            }

            return result.Results[0];
        } catch (error) {
            LogError(`[MCPClient] Failed to load connection config: ${error}`);
            return null;
        }
    }

    /**
     * Loads server configuration from database
     */
    private async loadServerConfig(serverId: string, contextUser: UserInfo): Promise<MCPServerConfig | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MCPServerConfig>({
                EntityName: MCPClientManager.ENTITY_MCP_SERVERS,
                ExtraFilter: `ID = '${serverId}'`,
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return null;
            }

            return result.Results[0];
        } catch (error) {
            LogError(`[MCPClient] Failed to load server config: ${error}`);
            return null;
        }
    }

    /**
     * Loads tools for a server from database
     */
    private async loadServerTools(serverId: string, contextUser: UserInfo): Promise<MCPToolDefinition[]> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MCPToolDefinition>({
                EntityName: MCPClientManager.ENTITY_MCP_TOOLS,
                ExtraFilter: `MCPServerID = '${serverId}'`,
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success) {
                return [];
            }

            return result.Results ?? [];
        } catch (error) {
            LogError(`[MCPClient] Failed to load server tools: ${error}`);
            return [];
        }
    }

    /**
     * Gets tool ID by server ID and tool name
     */
    private async getToolId(serverId: string, toolName: string, contextUser: UserInfo): Promise<string | undefined> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string }>({
                EntityName: MCPClientManager.ENTITY_MCP_TOOLS,
                ExtraFilter: `MCPServerID = '${serverId}' AND ToolName = '${toolName}'`,
                ResultType: 'simple',
                Fields: ['ID']
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return undefined;
            }

            return result.Results[0].ID;
        } catch {
            return undefined;
        }
    }

    /**
     * Gets credentials from CredentialEngine
     */
    private async getCredentials(credentialId: string, contextUser: UserInfo): Promise<MCPCredentialData> {
        try {
            const credential = CredentialEngine.Instance.getCredentialById(credentialId);
            if (!credential) {
                throw new Error(`Credential not found: ${credentialId}`);
            }

            // Get decrypted values
            const resolved = await CredentialEngine.Instance.getCredential(credential.Name, {
                contextUser,
                credentialId,
                subsystem: 'MCPClient'
            });

            return resolved.values as MCPCredentialData;
        } catch (error) {
            LogError(`[MCPClient] Failed to get credentials: ${error}`);
            throw error;
        }
    }

    /**
     * Gets OAuth2 access token for an MCP server connection.
     *
     * Uses OAuthManager to get a valid access token, refreshing if needed.
     * If authorization is required, throws OAuthAuthorizationRequiredError.
     *
     * @param connectionId - MCP Server Connection ID
     * @param serverConfig - Server configuration with OAuth settings
     * @param contextUser - User context
     * @returns Credential data with the access token
     * @throws OAuthAuthorizationRequiredError if user authorization is needed
     * @throws OAuthReauthorizationRequiredError if re-authorization is needed
     */
    private async getOAuth2Credentials(
        connectionId: string,
        serverConfig: MCPServerConfig,
        contextUser: UserInfo
    ): Promise<MCPCredentialData> {
        if (!this.publicUrl) {
            throw new Error(
                'Public URL not configured. Call MCPClientManager.Instance.setPublicUrl() or ' +
                'initialize with publicUrl option before using OAuth2 authentication.'
            );
        }

        // Build OAuth config from server settings
        const oauthConfig: MCPServerOAuthConfig = {
            OAuthIssuerURL: serverConfig.OAuthIssuerURL,
            OAuthScopes: serverConfig.OAuthScopes,
            OAuthMetadataCacheTTLMinutes: serverConfig.OAuthMetadataCacheTTLMinutes,
            OAuthClientID: serverConfig.OAuthClientID,
            OAuthClientSecretEncrypted: serverConfig.OAuthClientSecretEncrypted,
            OAuthRequirePKCE: serverConfig.OAuthRequirePKCE
        };

        // Get a valid access token (may throw OAuthAuthorizationRequiredError)
        const accessToken = await this.oauthManager.getAccessToken(
            connectionId,
            serverConfig.ID,
            oauthConfig,
            this.publicUrl,
            contextUser
        );

        // Return credentials in the expected format
        return {
            apiKey: accessToken  // OAuth2 uses Bearer token in Authorization header
        };
    }

    /**
     * Gets the OAuth connection status for a connection.
     *
     * @param connectionId - MCP Server Connection ID
     * @param contextUser - User context
     * @returns OAuth connection status or null if not an OAuth2 connection
     */
    public async getOAuthConnectionStatus(
        connectionId: string,
        contextUser: UserInfo
    ): Promise<{
        isOAuthEnabled: boolean;
        hasValidTokens: boolean;
        requiresReauthorization: boolean;
        reauthorizationReason?: string;
        tokenExpiresAt?: Date;
    } | null> {
        try {
            // Load connection and server config
            const connectionConfig = await this.loadConnectionConfig(connectionId, contextUser);
            if (!connectionConfig) {
                return null;
            }

            const serverConfig = await this.loadServerConfig(connectionConfig.MCPServerID, contextUser);
            if (!serverConfig || serverConfig.DefaultAuthType !== 'OAuth2') {
                return { isOAuthEnabled: false, hasValidTokens: false, requiresReauthorization: false };
            }

            const oauthConfig: MCPServerOAuthConfig = {
                OAuthIssuerURL: serverConfig.OAuthIssuerURL,
                OAuthScopes: serverConfig.OAuthScopes,
                OAuthMetadataCacheTTLMinutes: serverConfig.OAuthMetadataCacheTTLMinutes,
                OAuthClientID: serverConfig.OAuthClientID,
                OAuthClientSecretEncrypted: serverConfig.OAuthClientSecretEncrypted,
                OAuthRequirePKCE: serverConfig.OAuthRequirePKCE
            };

            const status = await this.oauthManager.getConnectionStatus(connectionId, oauthConfig, contextUser);
            return {
                isOAuthEnabled: status.isOAuthEnabled,
                hasValidTokens: status.hasValidTokens,
                requiresReauthorization: status.requiresReauthorization,
                reauthorizationReason: status.reauthorizationReason,
                tokenExpiresAt: status.tokenExpiresAt
            };
        } catch (error) {
            LogError(`[MCPClient] Failed to get OAuth status: ${error}`);
            return null;
        }
    }

    /**
     * Creates the appropriate transport based on configuration
     */
    private async createTransport(
        serverConfig: MCPServerConfig,
        connectionConfig: MCPConnectionConfig,
        credentials?: MCPCredentialData
    ): Promise<Transport> {
        const transportType = serverConfig.TransportType as MCPTransportType;
        const authType = serverConfig.DefaultAuthType as MCPAuthType;

        switch (transportType) {
            case 'StreamableHTTP':
                return this.createStreamableHTTPTransport(serverConfig, connectionConfig, authType, credentials);

            case 'SSE':
                return this.createSSETransport(serverConfig, connectionConfig, authType, credentials);

            case 'Stdio':
                return this.createStdioTransport(serverConfig, connectionConfig);

            case 'WebSocket':
                return this.createWebSocketTransport(serverConfig, connectionConfig, authType, credentials);

            default:
                throw new Error(`Unsupported transport type: ${transportType}`);
        }
    }

    /**
     * Creates a StreamableHTTP transport
     */
    private createStreamableHTTPTransport(
        serverConfig: MCPServerConfig,
        connectionConfig: MCPConnectionConfig,
        authType: MCPAuthType,
        credentials?: MCPCredentialData
    ): Transport {
        if (!serverConfig.ServerURL) {
            throw new Error('ServerURL is required for StreamableHTTP transport');
        }

        const headers = this.buildAuthHeaders(authType, credentials, connectionConfig.CustomHeaderName);

        return new StreamableHTTPClientTransport(new URL(serverConfig.ServerURL), {
            requestInit: headers ? { headers } : undefined
        });
    }

    /**
     * Creates an SSE transport
     */
    private createSSETransport(
        serverConfig: MCPServerConfig,
        connectionConfig: MCPConnectionConfig,
        authType: MCPAuthType,
        credentials?: MCPCredentialData
    ): Transport {
        if (!serverConfig.ServerURL) {
            throw new Error('ServerURL is required for SSE transport');
        }

        const headers = this.buildAuthHeaders(authType, credentials, connectionConfig.CustomHeaderName);

        return new SSEClientTransport(new URL(serverConfig.ServerURL), {
            requestInit: headers ? { headers } : undefined
        });
    }

    /**
     * Creates a Stdio transport
     */
    private createStdioTransport(
        serverConfig: MCPServerConfig,
        connectionConfig: MCPConnectionConfig
    ): Transport {
        if (!serverConfig.Command) {
            throw new Error('Command is required for Stdio transport');
        }

        let args: string[] = [];
        if (serverConfig.CommandArgs) {
            try {
                args = JSON.parse(serverConfig.CommandArgs);
            } catch {
                LogError('[MCPClient] Failed to parse command args');
            }
        }

        let env: Record<string, string> = { ...process.env } as Record<string, string>;
        if (connectionConfig.EnvironmentVars) {
            try {
                const customEnv = JSON.parse(connectionConfig.EnvironmentVars);
                env = { ...env, ...customEnv };
            } catch {
                LogError('[MCPClient] Failed to parse environment vars');
            }
        }

        return new StdioClientTransport({
            command: serverConfig.Command,
            args,
            env
        });
    }

    /**
     * Creates a WebSocket transport
     */
    private createWebSocketTransport(
        serverConfig: MCPServerConfig,
        _connectionConfig: MCPConnectionConfig,
        authType: MCPAuthType,
        credentials?: MCPCredentialData
    ): Transport {
        if (!serverConfig.ServerURL) {
            throw new Error('ServerURL is required for WebSocket transport');
        }

        // For WebSocket, credentials are typically passed in the URL or via protocol headers
        let wsUrl = serverConfig.ServerURL;

        // Add auth to URL if using Bearer or APIKey
        if (authType === 'Bearer' && credentials?.apiKey) {
            const url = new URL(wsUrl);
            url.searchParams.set('token', credentials.apiKey);
            wsUrl = url.toString();
        } else if (authType === 'APIKey' && credentials?.apiKey) {
            const url = new URL(wsUrl);
            url.searchParams.set('api_key', credentials.apiKey);
            wsUrl = url.toString();
        }

        return new WebSocketClientTransport(new URL(wsUrl));
    }

    /**
     * Builds authentication headers based on auth type
     */
    private buildAuthHeaders(
        authType: MCPAuthType,
        credentials?: MCPCredentialData,
        customHeaderName?: string
    ): Record<string, string> | undefined {
        if (authType === 'None' || !credentials) {
            return undefined;
        }

        const headers: Record<string, string> = {};

        switch (authType) {
            case 'Bearer':
                if (credentials.apiKey) {
                    headers['Authorization'] = `Bearer ${credentials.apiKey}`;
                }
                break;

            case 'APIKey':
                if (credentials.apiKey) {
                    const headerName = customHeaderName || 'X-API-Key';
                    headers[headerName] = credentials.apiKey;
                }
                break;

            case 'Basic':
                if (credentials.username && credentials.password) {
                    const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
                    headers['Authorization'] = `Basic ${encoded}`;
                }
                break;

            case 'Custom':
                if (credentials.apiKey && customHeaderName) {
                    headers[customHeaderName] = credentials.apiKey;
                }
                break;

            case 'OAuth2':
                // OAuth2 would typically use a token obtained from the token endpoint
                // For now, use the apiKey field as the access token
                if (credentials.apiKey) {
                    headers['Authorization'] = `Bearer ${credentials.apiKey}`;
                }
                break;
        }

        return Object.keys(headers).length > 0 ? headers : undefined;
    }

    /**
     * Maps MCP server capabilities to our interface
     */
    private mapServerCapabilities(capabilities: ReturnType<Client['getServerCapabilities']>): MCPServerCapabilities | undefined {
        if (!capabilities) {
            return undefined;
        }

        return {
            logging: !!capabilities.logging,
            completions: !!capabilities.completions,
            prompts: capabilities.prompts ? {
                listChanged: !!capabilities.prompts.listChanged
            } : undefined,
            resources: capabilities.resources ? {
                subscribe: !!capabilities.resources.subscribe,
                listChanged: !!capabilities.resources.listChanged
            } : undefined,
            tools: capabilities.tools ? {
                listChanged: !!capabilities.tools.listChanged
            } : undefined
        };
    }

    /**
     * Maps MCP tool call result to our interface
     */
    private mapToolCallResult(result: CallToolResult, durationMs: number): MCPToolCallResult {
        const content: MCPContentBlock[] = (result.content || []).map(block => {
            if (block.type === 'text') {
                return { type: 'text' as const, text: block.text };
            } else if (block.type === 'image') {
                return {
                    type: 'image' as const,
                    mimeType: block.mimeType,
                    data: block.data
                };
            } else if (block.type === 'audio') {
                return {
                    type: 'audio' as const,
                    mimeType: block.mimeType,
                    data: block.data
                };
            } else if (block.type === 'resource') {
                return {
                    type: 'resource' as const,
                    uri: block.resource?.uri
                };
            }
            return { type: 'text' as const, text: JSON.stringify(block) };
        });

        return {
            success: !result.isError,
            content,
            structuredContent: result.structuredContent as Record<string, unknown> | undefined,
            isToolError: !!result.isError,
            durationMs
        };
    }

    /**
     * Gets logging configuration from connection config
     */
    private getLoggingConfig(connectionConfig: MCPConnectionConfig): MCPLoggingConfig {
        return {
            logToolCalls: connectionConfig.LogToolCalls,
            logInputParameters: connectionConfig.LogInputParameters,
            logOutputContent: connectionConfig.LogOutputContent,
            maxOutputLogSize: connectionConfig.MaxOutputLogSize ?? 102400
        };
    }

    /**
     * Checks if user has permission for a connection.
     *
     * Permission logic:
     * 1. If NO permission records exist for this connection, it's "open" - anyone can use it
     * 2. If permission records exist, user must have an explicit grant (direct or via role)
     * 3. Admins always have access
     */
    private async checkPermission(
        connectionId: string,
        contextUser: UserInfo,
        permission: 'execute' | 'modify' | 'viewCredentials'
    ): Promise<boolean> {
        try {
            // Admins always have access
            const hasAdminRole = contextUser.UserRoles?.some(
                role => role.Role?.toLowerCase() === 'admin' || role.Role?.toLowerCase() === 'administrator'
            ) ?? false;
            if (hasAdminRole) {
                return true;
            }

            const rv = new RunView();

            // First, check if ANY permissions exist for this connection
            const allPermissions = await rv.RunView<MCPConnectionPermission>({
                EntityName: MCPClientManager.ENTITY_MCP_PERMISSIONS,
                ExtraFilter: `MCPServerConnectionID = '${connectionId}'`,
                ResultType: 'simple'
            }, contextUser);

            // If no permissions are configured for this connection, it's open to all
            if (!allPermissions.Success || !allPermissions.Results || allPermissions.Results.length === 0) {
                return true;
            }

            // Permissions exist - check if user has explicit access
            const md = new Metadata();
            const userRolesSchema = md.EntityByName("User Roles")?.SchemaName ?? '__mj';
            const userPermissions = await rv.RunView<MCPConnectionPermission>({
                EntityName: MCPClientManager.ENTITY_MCP_PERMISSIONS,
                ExtraFilter: `MCPServerConnectionID = '${connectionId}' AND (UserID = '${contextUser.ID}' OR RoleID IN (SELECT RoleID FROM [${userRolesSchema}].vwUserRoles WHERE UserID = '${contextUser.ID}'))`,
                ResultType: 'simple'
            }, contextUser);

            if (!userPermissions.Success || !userPermissions.Results || userPermissions.Results.length === 0) {
                // Permissions exist but user doesn't have any
                return false;
            }

            // Check if any permission grants the requested access
            for (const perm of userPermissions.Results) {
                switch (permission) {
                    case 'execute':
                        if (perm.CanExecute) return true;
                        break;
                    case 'modify':
                        if (perm.CanModify) return true;
                        break;
                    case 'viewCredentials':
                        if (perm.CanViewCredentials) return true;
                        break;
                }
            }

            return false;
        } catch (error) {
            LogError(`[MCPClient] Permission check failed: ${error}`);
            return false;
        }
    }

    /**
     * Updates connection status in database
     */
    private async updateConnectionStatus(
        connectionId: string,
        status: 'Active' | 'Inactive' | 'Error',
        contextUser: UserInfo,
        error?: unknown
    ): Promise<void> {
        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<MCPServerConnectionEntity>(
                MCPClientManager.ENTITY_MCP_CONNECTIONS,
                contextUser
            );
            const loaded = await entity.Load(connectionId);
            if (loaded) {
                entity.Status = status;
                if (status === 'Active') {
                    entity.LastConnectedAt = new Date();
                    entity.LastErrorMessage = null;
                } else if (status === 'Error' && error) {
                    entity.LastErrorMessage = error instanceof Error ? error.message : String(error);
                }
                await entity.Save();
            }
        } catch (e) {
            LogError(`[MCPClient] Failed to update connection status: ${e}`);
        }
    }

    /**
     * Updates server LastSyncAt in database
     */
    private async updateServerLastSync(serverId: string, contextUser: UserInfo): Promise<void> {
        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<MCPServerEntity>(
                MCPClientManager.ENTITY_MCP_SERVERS,
                contextUser
            );
            const loaded = await entity.Load(serverId);
            if (loaded) {
                entity.LastSyncAt = new Date();
                await entity.Save();
            }
        } catch (e) {
            LogError(`[MCPClient] Failed to update server last sync: ${e}`);
        }
    }

    /**
     * Emits an event to all listeners
     */
    private emitEvent(event: MCPClientEvent): void {
        const listeners = this.eventListeners.get(event.type);
        if (listeners) {
            for (const listener of listeners) {
                try {
                    listener(event);
                } catch (e) {
                    LogError(`[MCPClient] Event listener error: ${e}`);
                }
            }
        }
    }
}
