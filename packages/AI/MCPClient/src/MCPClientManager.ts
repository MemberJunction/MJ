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
import { MCPServerEntity, MCPServerConnectionEntity, MCPServerToolEntity } from '@memberjunction/core-entities';

import { RateLimiterRegistry, RateLimiter } from './RateLimiter.js';
import { ExecutionLogger } from './ExecutionLogger.js';
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
    MCPContentBlock
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

    /** Whether the manager has been initialized */
    private initialized = false;

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
     */
    public async initialize(contextUser: UserInfo): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Ensure CredentialEngine is configured
            await CredentialEngine.Instance.Config(false, contextUser);
            this.initialized = true;
            LogStatus('[MCPClient] Manager initialized');
        } catch (error) {
            LogError(`[MCPClient] Failed to initialize: ${error}`);
            throw error;
        }
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
            if (connectionConfig.CredentialID && serverConfig.DefaultAuthType !== 'None') {
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
