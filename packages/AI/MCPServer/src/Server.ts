/**
 * @fileoverview MemberJunction MCP Server
 *
 * This module implements a Model Context Protocol (MCP) server that exposes MemberJunction
 * entities, agents, and actions as tools that can be consumed by AI models and other MCP clients.
 *
 * Key features:
 * - API key authentication with user context
 * - Dynamic tool generation from entity metadata
 * - Agent discovery and execution
 * - Configurable tool filtering
 *
 * @module @memberjunction/ai-mcp-server
 */

import { BaseEntity, CompositeKey, EntityFieldInfo, EntityInfo, Metadata, RunView, RunQuery, UserInfo } from "@memberjunction/core";
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from "@memberjunction/sqlserver-dataprovider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response, NextFunction } from 'express';
import sql from "mssql";
import { z } from "zod";
import { initConfig, ConfigInfo, MCPServerActionToolInfo, MCPServerPromptToolInfo, MCPServerAgentToolInfo, MCPServerEntityToolInfo } from './config.js';
import { AgentRunner } from "@memberjunction/ai-agents";
import { AIAgentEntityExtended, AIAgentRunEntityExtended, AIAgentRunStepEntityExtended, AIPromptEntityExtended } from "@memberjunction/ai-core-plus";
import * as fs from 'fs/promises';
import * as path from 'path';
import { AIEngine } from "@memberjunction/aiengine";
import { ChatMessage } from "@memberjunction/ai";
import { CredentialEngine } from "@memberjunction/credentials";
import { EncryptionEngine } from "@memberjunction/encryption";
import * as http from 'http';
import { ActionEntityExtended, RunActionParams } from "@memberjunction/actions-base";
import { ActionEngineServer } from "@memberjunction/actions";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import { ActionParamEntity } from "@memberjunction/core-entities";

/*******************************************************************************
 * TYPES AND INTERFACES
 ******************************************************************************/

/**
 * Options for filtering which tools are exposed by the MCP server.
 * Supports glob-style patterns for flexible tool selection.
 */
export interface ToolFilterOptions {
    /** Patterns that tools must match to be included (supports wildcards: *, prefix*, *suffix, *contains*) */
    includePatterns?: string[];
    /** Patterns that exclude matching tools (supports wildcards: *, prefix*, *suffix, *contains*) */
    excludePatterns?: string[];
}

/**
 * Session context stored for each authenticated MCP connection.
 * Contains the API key information and the authenticated user.
 */
interface MCPSessionContext {
    /** The raw API key used for authentication */
    apiKey: string;
    /** The database ID of the API key record */
    apiKeyId: string;
    /** The MemberJunction user associated with the API key */
    user: UserInfo;
}

/*******************************************************************************
 * MODULE STATE
 ******************************************************************************/

/** Registry of all tool names (used for --list-tools CLI option) */
const registeredToolNames: string[] = [];

/** Currently active filter options for tool registration */
let activeFilterOptions: ToolFilterOptions = {};

/** Configuration loaded from initConfig() - populated in initializeServer()
 * Uses definite assignment assertion (!) because it's assigned before use in initializeServer() */
let _config!: ConfigInfo;

/** MCP server port - populated after config is loaded */
let mcpServerPort!: number;

/** Map of SSE transports keyed by session ID for message endpoint routing */
const transports: Map<string, SSEServerTransport> = new Map();

/*******************************************************************************
 * DATABASE CONFIGURATION
 ******************************************************************************/

/**
 * Builds the SQL Server connection pool configuration from the loaded config.
 * @returns The mssql connection pool configuration object
 */
function buildPoolConfig(): sql.config {
    const config: sql.config = {
        server: _config.dbHost,
        port: _config.dbPort,
        user: _config.dbUsername,
        password: _config.dbPassword,
        database: _config.dbDatabase,
        requestTimeout: _config.databaseSettings.requestTimeout,
        connectionTimeout: _config.databaseSettings.connectionTimeout,
        options: {
            encrypt: true,
            enableArithAbort: true,
            trustServerCertificate: _config.dbTrustServerCertificate === 'Y'
        },
    };

    if (_config.dbInstanceName !== null && _config.dbInstanceName !== undefined && _config.dbInstanceName.trim().length > 0) {
        config.options!.instanceName = _config.dbInstanceName;
    }

    return config;
}

/*******************************************************************************
 * AUTHENTICATION
 ******************************************************************************/

/**
 * Extracts an API key from an incoming HTTP request.
 * Checks multiple sources in order of preference:
 * 1. x-api-key header
 * 2. x-mj-api-key header
 * 3. Authorization: Bearer <token> header
 * 4. URL query parameter (apiKey or api_key)
 *
 * @param request - The incoming HTTP request
 * @returns The extracted API key string, or null if not found
 */
function extractAPIKeyFromRequest(request: Request | http.IncomingMessage): string | null {
    // Check dedicated API key headers first
    let apiKey = request.headers['x-api-key'] as string
        || request.headers['x-mj-api-key'] as string;

    // Check Authorization header (Bearer token format)
    if (!apiKey && request.headers['authorization']) {
        const authHeader = request.headers['authorization'] as string;
        if (authHeader.startsWith('Bearer ')) {
            apiKey = authHeader.substring(7); // Remove "Bearer " prefix
        }
    }

    // Check URL query parameters as fallback
    if (!apiKey && request.url) {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const queryKey = url.searchParams.get('apiKey') || url.searchParams.get('api_key');
        if (queryKey) {
            apiKey = queryKey;
        }
    }

    return apiKey || null;
}

/**
 * Extracts request context from an HTTP request for API key usage logging.
 *
 * @param request - The incoming HTTP request
 * @returns Object containing endpoint, method, IP address, and user agent
 */
function extractRequestContext(request: Request | http.IncomingMessage): {
    endpoint: string;
    method: string;
    ipAddress: string | null;
    userAgent: string | null;
} {
    // Extract endpoint from URL (without query params)
    let endpoint = '/mcp';
    if (request.url) {
        try {
            const url = new URL(request.url, `http://${request.headers.host}`);
            endpoint = url.pathname || '/mcp';
        } catch {
            endpoint = request.url.split('?')[0] || '/mcp';
        }
    }

    // Extract client IP address
    // Check X-Forwarded-For header first (for proxied requests)
    const forwardedFor = request.headers['x-forwarded-for'];
    let ipAddress: string | null = null;
    if (forwardedFor) {
        // X-Forwarded-For can be a comma-separated list; take the first one
        ipAddress = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor).split(',')[0].trim();
    } else if ('socket' in request && request.socket) {
        ipAddress = request.socket.remoteAddress || null;
    }

    return {
        endpoint,
        method: request.method || 'POST',
        ipAddress,
        userAgent: request.headers['user-agent'] as string || null,
    };
}

/**
 * Authenticates an incoming MCP request using API key authentication.
 *
 * Authentication flow:
 * 1. Extract API key from request headers/query params
 * 2. If no key but systemApiKey is configured, use system user (dev mode)
 * 3. Validate the API key against the database
 * 4. Return the session context with the authenticated user
 *
 * @param request - The incoming HTTP request from the MCP client
 * @returns Promise resolving to the session context with authenticated user
 * @throws Error if authentication fails (invalid/missing key, inactive user, etc.)
 */
async function authenticateRequest(request: Request | http.IncomingMessage): Promise<MCPSessionContext> {
    const apiKey = extractAPIKeyFromRequest(request);

    console.log(`[Auth] API key found: ${apiKey ? 'yes' : 'no'}`);

    if (!apiKey) {
        throw new Error('API key required. Provide via x-api-key header.');
    }

    console.log(`[Auth] Validating API key...`);
    try {
        // Use system user as context for the validation query itself
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!systemUser) {
            throw new Error('System user not found in UserCache for API key validation');
        }

        // Extract request context for logging
        const requestContext = extractRequestContext(request);

        const validation = await EncryptionEngine.Instance.ValidateAPIKey(
            {
                rawKey: apiKey,
                endpoint: requestContext.endpoint,
                method: requestContext.method,
                operation: null, // MCP tool name not known at auth time
                statusCode: 200, // Auth succeeded if we get here
                responseTimeMs: null, // Not available at auth time
                ipAddress: requestContext.ipAddress,
                userAgent: requestContext.userAgent,
            },
            systemUser
        );

        console.log(`[Auth] Validation result: isValid=${validation.isValid}, user=${validation.user?.Email}`);

        if (!validation.isValid) {
            console.error(`[Auth] Validation failed: ${validation.error}`);
            throw new Error(validation.error || 'Invalid API key');
        }

        console.log(`Authenticated via API key for user: ${validation.user?.Email}`);
        return { apiKey, apiKeyId: validation.apiKeyId!, user: validation.user! };
    } catch (error) {
        console.error(`[Auth] Exception during validation:`, error);
        throw error;
    }
}

/*******************************************************************************
 * TOOL FILTERING
 ******************************************************************************/

/**
 * Checks if a tool name matches a glob-style pattern.
 *
 * Supported patterns:
 * - `*` - Matches all tools
 * - `prefix*` - Matches tools starting with "prefix"
 * - `*suffix` - Matches tools ending with "suffix"
 * - `*contains*` - Matches tools containing "contains"
 * - `exact` - Exact match (case-insensitive)
 *
 * @param toolName - The tool name to test
 * @param pattern - The glob-style pattern to match against
 * @returns True if the tool name matches the pattern
 *
 * @example
 * matchesPattern("Get_Users_Record", "Get_*") // true
 * matchesPattern("Get_Users_Record", "*_Record") // true
 * matchesPattern("Get_Users_Record", "*Users*") // true
 */
function matchesPattern(toolName: string, pattern: string): boolean {
    const lowerName = toolName.toLowerCase();
    const lowerPattern = pattern.trim().toLowerCase();

    if (lowerPattern === '*') {
        return true;
    }

    const startsWithWildcard = lowerPattern.startsWith('*');
    const endsWithWildcard = lowerPattern.endsWith('*');

    if (startsWithWildcard && endsWithWildcard) {
        // *contains*
        const searchTerm = lowerPattern.slice(1, -1);
        return lowerName.includes(searchTerm);
    } else if (startsWithWildcard) {
        // *suffix
        const suffix = lowerPattern.slice(1);
        return lowerName.endsWith(suffix);
    } else if (endsWithWildcard) {
        // prefix*
        const prefix = lowerPattern.slice(0, -1);
        return lowerName.startsWith(prefix);
    } else {
        // exact match
        return lowerName === lowerPattern;
    }
}

/**
 * Determines if a tool should be included based on the current filter options.
 *
 * Filter logic:
 * 1. If includePatterns are specified, tool must match at least one pattern
 * 2. If excludePatterns are specified, tool must not match any pattern
 * 3. If no patterns are specified, all tools are included
 *
 * @param toolName - The name of the tool to check
 * @param filterOptions - The filter configuration with include/exclude patterns
 * @returns True if the tool should be included, false if it should be filtered out
 */
function shouldIncludeTool(toolName: string, filterOptions: ToolFilterOptions): boolean {
    const { includePatterns, excludePatterns } = filterOptions;

    // If include patterns are specified, tool must match at least one
    if (includePatterns && includePatterns.length > 0) {
        const matchesInclude = includePatterns.some(pattern => matchesPattern(toolName, pattern));
        if (!matchesInclude) {
            return false;
        }
    }

    // If exclude patterns are specified, tool must not match any
    if (excludePatterns && excludePatterns.length > 0) {
        const matchesExclude = excludePatterns.some(pattern => matchesPattern(toolName, pattern));
        if (matchesExclude) {
            return false;
        }
    }

    return true;
}

/**
 * Performs smart text truncation that preserves both the beginning and end of content.
 * This is useful for debugging large I/O data where both the start and end are important.
 *
 * The truncation preserves 70% from the start and 30% from the end, with a clear
 * indicator of how many characters were removed.
 *
 * @param text - The text to truncate (null/undefined returns empty string)
 * @param maxChars - Maximum characters to keep (0 = no truncation)
 * @returns Object with the truncated value and a flag indicating if truncation occurred
 *
 * @example
 * truncateText("Hello World", 5) // { value: "Hel...[4 chars]...ld", truncated: true }
 * truncateText("Hi", 100) // { value: "Hi", truncated: false }
 */
function truncateText(text: string | null | undefined, maxChars: number): { value: string; truncated: boolean } {
    if (!text) {
        return { value: '', truncated: false };
    }

    if (maxChars === 0 || text.length <= maxChars) {
        return { value: text, truncated: false };
    }

    // Keep 70% from start, 30% from end
    const startChars = Math.floor(maxChars * 0.7);
    const endChars = maxChars - startChars;
    const truncatedCount = text.length - startChars - endChars;

    const truncated = text.substring(0, startChars) +
        `\n\n[... ${truncatedCount} characters truncated ...]\n\n` +
        text.substring(text.length - endChars);

    return { value: truncated, truncated: true };
}

/*******************************************************************************
 * TOOL REGISTRATION HELPERS
 ******************************************************************************/

/**
 * Helper type for tool configuration used during registration
 */
interface ToolConfig {
    name: string;
    description: string;
    parameters: z.ZodObject<z.ZodRawShape>;
    execute: (props: Record<string, unknown>, sessionContext: MCPSessionContext) => Promise<string>;
}

/**
 * Registers all tools with the MCP server for a specific authenticated session.
 * This function is called per-connection to create user-scoped tool handlers.
 *
 * @param server - The McpServer instance to register tools on
 * @param sessionContext - The authenticated session context with user info
 * @param systemUser - System user for server initialization tasks
 */
async function registerAllTools(
    server: McpServer,
    sessionContext: MCPSessionContext,
    systemUser: UserInfo
): Promise<void> {
    // Helper to register a tool with filter check
    const addToolWithFilter = (config: ToolConfig): void => {
        registeredToolNames.push(config.name);

        if (!shouldIncludeTool(config.name, activeFilterOptions)) {
            return;
        }

        // Use registerTool with explicit type assertions to avoid infinite type inference
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (server as any).registerTool(
            config.name,
            {
                description: config.description,
                inputSchema: config.parameters.shape
            },
            async (params: Record<string, unknown>) => {
                const result = await config.execute(params, sessionContext);
                return {
                    content: [{ type: "text" as const, text: result }]
                };
            }
        );
    };

    // Register Get_All_Entities tool
    addToolWithFilter({
        name: "Get_All_Entities",
        description: "Retrieves all Entities including entity fields and relationships, from the MemberJunction Metadata",
        parameters: z.object({}),
        async execute() {
            const md = new Metadata();
            const output = JSON.stringify(md.Entities, null, 2);
            return output;
        }
    });

    // Load all tool categories
    await loadEntityTools(addToolWithFilter);
    await loadActionTools(addToolWithFilter, systemUser, sessionContext);
    await loadAgentTools(addToolWithFilter, systemUser, sessionContext);
    loadAgentRunDiagnosticTools(addToolWithFilter, sessionContext);
    loadQueryTools(addToolWithFilter, sessionContext);
    await loadPromptTools(addToolWithFilter, systemUser, sessionContext);
    loadCommunicationTools(addToolWithFilter, sessionContext);
}

/*******************************************************************************
 * SERVER INITIALIZATION
 ******************************************************************************/

/**
 * Initializes and starts the MemberJunction MCP server.
 *
 * This function performs the following setup:
 * 1. Establishes database connection using configured credentials
 * 2. Sets up SQL Server client and MemberJunction metadata
 * 3. Loads API keys into the CredentialEngine cache for fast validation
 * 4. Sets up Express server with SSE transport for MCP protocol
 * 5. Creates per-connection MCP server instances with authenticated user context
 *
 * The server uses API key authentication. Each authenticated request gets a session
 * with the user context from the API key, which is used for all tool executions.
 *
 * @param filterOptions - Optional tool filtering configuration to limit which tools are exposed
 * @throws Error if MCP server is disabled in configuration or database connection fails
 *
 * @example
 * // Start with all tools
 * await initializeServer();
 *
 * @example
 * // Start with filtered tools
 * await initializeServer({
 *   includePatterns: ['Get_*', 'Run_Agent'],
 *   excludePatterns: ['*_AuditLog_*']
 * });
 */
export async function initializeServer(filterOptions: ToolFilterOptions = {}): Promise<void> {
    try {
        // Initialize configuration (loads .env and mj.config.cjs)
        _config = await initConfig();
        mcpServerPort = _config.mcpServerSettings?.port || 3100;

        // Store filter options for use by tool registration
        activeFilterOptions = filterOptions;

        // Clear any previously registered tool names
        registeredToolNames.length = 0;

        if (!_config.mcpServerSettings?.enableMCPServer) {
            console.log("MCP Server is disabled in the configuration.");
            throw new Error("MCP Server is disabled in the configuration.");
        }

        // Initialize database connection
        const poolConfig = buildPoolConfig();
        const pool = new sql.ConnectionPool(poolConfig);
        await pool.connect();

        // Setup SQL Server client
        const sqlConfig = new SQLServerProviderConfigData(pool, _config.mjCoreSchema);
        await setupSQLServerClient(sqlConfig);
        console.log("Database connection setup completed.");

        // Use system user for server initialization tasks (loading credentials, discovering agents)
        // Note: Individual tool executions use the authenticated session user, not this system user
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!systemUser) {
            throw new Error('System user not found in UserCache - required for server initialization');
        }

        // Load API keys into cache for fast validation
        console.log('Loading credentials and API keys into cache...');
        await CredentialEngine.Instance.Config(false, systemUser);
        console.log(`API keys loaded successfully. Count: ${CredentialEngine.Instance.APIKeys.length}`);

        // Create Express app for SSE transport
        const app = express();

        // CORS must be FIRST - browser preflight OPTIONS requests need immediate handling
        // before any other middleware touches the request
        app.use((req: Request, res: Response, next: NextFunction) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-api-key, x-mj-api-key');
            res.header('Access-Control-Expose-Headers', 'Content-Type');

            // Handle preflight requests immediately - don't let other middleware process them
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
                return;
            }
            next();
        });

        // Enable JSON parsing for POST requests EXCEPT /mcp/messages
        // SSEServerTransport.handlePostMessage needs the raw body stream
        app.use((req: Request, res: Response, next: NextFunction) => {
            if (req.path === '/mcp/messages') {
                // Skip JSON parsing - the SSE transport handles it
                next();
            } else {
                express.json()(req, res, next);
            }
        });

        // SSE endpoint for establishing MCP connections
        app.get('/mcp/sse', async (req: Request, res: Response) => {
            console.log('[SSE] New connection request');

            try {
                // Authenticate the request
                const sessionContext = await authenticateRequest(req);
                console.log(`[SSE] Authenticated user: ${sessionContext.user.Email}`);

                // Create a new MCP server for this connection
                const mcpServer = new McpServer({
                    name: "MemberJunction",
                    version: "1.0.0"
                });

                // Register all tools with user-scoped context
                await registerAllTools(mcpServer, sessionContext, systemUser);
                console.log(`[SSE] Tools registered for user: ${sessionContext.user.Email}`);

                // Create SSE transport for this connection
                const transport = new SSEServerTransport('/mcp/messages', res);

                // Store transport for message routing
                const sessionId = transport.sessionId;
                transports.set(sessionId, transport);
                console.log(`[SSE] Transport created with session ID: ${sessionId}`);

                // Clean up on connection close
                res.on('close', () => {
                    console.log(`[SSE] Connection closed for session: ${sessionId}`);
                    transports.delete(sessionId);
                });

                // Connect the server to the transport
                await mcpServer.connect(transport);
                console.log(`[SSE] MCP server connected for session: ${sessionId}`);

            } catch (error) {
                console.error('[SSE] Authentication or connection error:', error);
                if (!res.headersSent) {
                    res.status(401).json({
                        error: error instanceof Error ? error.message : 'Authentication failed'
                    });
                }
            }
        });

        // Message endpoint for receiving MCP messages from clients
        app.post('/mcp/messages', async (req: Request, res: Response) => {
            const sessionId = req.query.sessionId as string;

            if (!sessionId) {
                res.status(400).json({ error: 'Missing sessionId query parameter' });
                return;
            }

            const transport = transports.get(sessionId);
            if (!transport) {
                res.status(404).json({ error: 'Session not found' });
                return;
            }

            try {
                await transport.handlePostMessage(req, res);
            } catch (error) {
                console.error('[Messages] Error handling message:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: error instanceof Error ? error.message : 'Internal server error'
                    });
                }
            }
        });

        // Health check endpoint
        app.get('/health', (_req: Request, res: Response) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // Start the Express server
        app.listen(mcpServerPort, () => {
            console.log(`MemberJunction MCP Server running on port ${mcpServerPort}`);
            console.log(`SSE endpoint: http://localhost:${mcpServerPort}/mcp/sse`);
            console.log(`Messages endpoint: http://localhost:${mcpServerPort}/mcp/messages`);
        });

    } catch (error) {
        console.error("Failed to initialize MCP server:", error);
    }
}

/*******************************************************************************
 * TOOL LOADERS
 ******************************************************************************/

type AddToolFn = (config: ToolConfig) => void;

/**
 * Loads and registers action tools based on configuration.
 *
 * Creates the following tools based on configuration:
 * - `Discover_Actions` - Lists available actions matching a pattern
 * - `Run_Action` - General tool to execute any action by name/ID
 * - `Execute_[ActionName]_Action` - Specific tools for each configured action
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param systemUser - System user for context when discovering and configuring actions
 * @param sessionContext - The authenticated session context
 */
async function loadActionTools(
    addToolWithFilter: AddToolFn,
    systemUser: UserInfo,
    sessionContext: MCPSessionContext
): Promise<void> {
    const actionTools = _config.mcpServerSettings?.actionTools;

    if (actionTools && actionTools.length > 0) {
        // Ensure ActionEngine is configured
        const actionEngine = ActionEngineServer.Instance;
        await actionEngine.Config(false, systemUser);

        // Add discovery tool if any action tool has discover enabled
        const hasDiscovery = actionTools.some((tool: MCPServerActionToolInfo) => tool.discover);
        if (hasDiscovery) {
            addToolWithFilter({
                name: "Discover_Actions",
                description: "List available Actions based on a name pattern and/or category (* for all)",
                parameters: z.object({
                    pattern: z.string().optional().describe("Name pattern to match actions (supports wildcards: *, *Action, Action*, *Action*)"),
                    category: z.string().optional().describe("Category name to filter actions")
                }),
                async execute(props) {
                    const sessionUser = sessionContext.user;
                    const actions = await discoverActions(props.pattern as string || '*', props.category as string | undefined, sessionUser);
                    return JSON.stringify(actions.map(action => ({
                        id: action.ID,
                        name: action.Name,
                        description: action.Description || '',
                        category: action.Category,
                        categoryId: action.CategoryID,
                        type: action.Type,
                        status: action.Status,
                        paramCount: actionEngine.ActionParams.filter((p: ActionParamEntity) => p.ActionID === action.ID).length
                    })));
                }
            });
        }

        // Add general action execution tool if any tool has execute enabled
        const hasExecute = actionTools.some((tool: MCPServerActionToolInfo) => tool.execute);
        if (hasExecute) {
            addToolWithFilter({
                name: "Run_Action",
                description: "Execute any Action by name or ID with the specified parameters",
                parameters: z.object({
                    actionName: z.string().optional().describe("Name of the action to execute"),
                    actionId: z.string().optional().describe("ID of the action to execute"),
                    params: z.record(z.unknown()).optional().describe("Parameters for the action as key-value pairs")
                }),
                async execute(props) {
                    const sessionUser = sessionContext.user;
                    try {
                        const actionEngine = ActionEngineServer.Instance;
                        await actionEngine.Config(false, sessionUser);

                        let action: ActionEntityExtended | null = null;

                        if (props.actionId) {
                            action = actionEngine.Actions.find((a: ActionEntityExtended) => a.ID === props.actionId) || null;
                            if (!action) {
                                return JSON.stringify({
                                    success: false,
                                    error: `Action not found with ID: ${props.actionId}`
                                });
                            }
                        } else if (props.actionName) {
                            action = actionEngine.Actions.find((a: ActionEntityExtended) => a.Name?.toLowerCase() === (props.actionName as string)?.toLowerCase()) || null;
                            if (!action) {
                                return JSON.stringify({
                                    success: false,
                                    error: `Action not found with name: ${props.actionName}`
                                });
                            }
                        } else {
                            return JSON.stringify({
                                success: false,
                                error: "Either actionName or actionId must be provided"
                            });
                        }

                        // Build action params
                        const actionParams = actionEngine.ActionParams.filter((p: ActionParamEntity) => p.ActionID === action!.ID);
                        const paramsRecord = props.params as Record<string, unknown> | undefined;
                        const runParams: RunActionParams = {
                            Action: action,
                            ContextUser: sessionUser,
                            Filters: [],
                            Params: actionParams.map((p: ActionParamEntity) => ({
                                Name: p.Name,
                                Value: paramsRecord?.[p.Name] ?? p.DefaultValue,
                                Type: (p.Type as 'Input' | 'Output' | 'Both') || 'Input'
                            }))
                        };

                        // Execute the action
                        const result = await actionEngine.RunAction(runParams);

                        return JSON.stringify({
                            success: result.Success,
                            resultCode: result.Result?.ResultCode,
                            message: result.Message,
                            runId: result.LogEntry?.ID
                        });
                    } catch (error) {
                        return JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            });

            // Add Get_Action_Params tool to help discover action parameters
            addToolWithFilter({
                name: "Get_Action_Params",
                description: "Get the parameter definitions for a specific action",
                parameters: z.object({
                    actionName: z.string().optional().describe("Name of the action"),
                    actionId: z.string().optional().describe("ID of the action")
                }),
                async execute(props) {
                    const sessionUser = sessionContext.user;
                    const actionEngine = ActionEngineServer.Instance;
                    await actionEngine.Config(false, sessionUser);

                    let action: ActionEntityExtended | null = null;
                    if (props.actionId) {
                        action = actionEngine.Actions.find((a: ActionEntityExtended) => a.ID === props.actionId) || null;
                    } else if (props.actionName) {
                        action = actionEngine.Actions.find((a: ActionEntityExtended) => a.Name?.toLowerCase() === (props.actionName as string)?.toLowerCase()) || null;
                    }

                    if (!action) {
                        return JSON.stringify({ error: "Action not found" });
                    }

                    const params = actionEngine.ActionParams.filter((p: ActionParamEntity) => p.ActionID === action!.ID);
                    return JSON.stringify({
                        actionId: action.ID,
                        actionName: action.Name,
                        description: action.Description,
                        params: params.map((p: ActionParamEntity) => ({
                            name: p.Name,
                            description: p.Description,
                            type: p.Type,
                            isRequired: p.IsRequired,
                            defaultValue: p.DefaultValue
                        }))
                    });
                }
            });
        }

        // Process each action tool configuration for specific action tools
        for (const tool of actionTools) {
            if (tool.execute) {
                const actionPattern = tool.actionName || '*';
                const actions = await discoverActions(actionPattern, tool.actionCategory, systemUser);

                // Add specific execution tools for each matching action
                for (const action of actions) {
                    addActionExecuteTool(addToolWithFilter, action, sessionContext);
                }
            }
        }
    }
}

/**
 * Discovers actions matching a given name pattern and optional category.
 *
 * @param pattern - The name pattern to match (supports wildcards)
 * @param category - Optional category name to filter actions
 * @param userContext - User context for ActionEngine configuration
 * @returns Array of matching action entities
 */
async function discoverActions(pattern: string, category: string | undefined, userContext: UserInfo): Promise<ActionEntityExtended[]> {
    const actionEngine = ActionEngineServer.Instance;
    await actionEngine.Config(false, userContext);

    let actions = actionEngine.Actions.filter((a: ActionEntityExtended) => a.Status === 'Active');

    // Filter by category if specified
    if (category && category !== '*') {
        const categoryLower = category.toLowerCase();
        actions = actions.filter((a: ActionEntityExtended) => a.Category?.toLowerCase().includes(categoryLower));
    }

    // Filter by pattern
    if (pattern === '*') {
        return actions;
    }

    const isWildcardPattern = pattern.includes('*');
    if (!isWildcardPattern) {
        // Exact match
        return actions.filter((a: ActionEntityExtended) => a.Name === pattern);
    }

    // Convert wildcard pattern to regex
    const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
        .replace(/\*/g, '.*'); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return actions.filter((a: ActionEntityExtended) => a.Name && regex.test(a.Name));
}

/**
 * Creates and registers an execution tool for a specific Action.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param action - The action entity to create an execution tool for
 * @param sessionContext - The authenticated session context
 */
function addActionExecuteTool(
    addToolWithFilter: AddToolFn,
    action: ActionEntityExtended,
    sessionContext: MCPSessionContext
): void {
    const actionEngine = ActionEngineServer.Instance;
    const actionParams = actionEngine.ActionParams.filter((p: ActionParamEntity) => p.ActionID === action.ID);

    // Build Zod schema for action parameters
    const paramSchema: Record<string, z.ZodTypeAny> = {};
    for (const param of actionParams) {
        let zodType: z.ZodTypeAny;

        switch (param.Type?.toLowerCase()) {
            case 'int':
            case 'integer':
            case 'number':
            case 'decimal':
            case 'float':
                zodType = z.number();
                break;
            case 'boolean':
            case 'bool':
                zodType = z.boolean();
                break;
            case 'object':
            case 'json':
                zodType = z.record(z.unknown());
                break;
            case 'array':
                zodType = z.array(z.unknown());
                break;
            default:
                zodType = z.string();
        }

        if (!param.IsRequired) {
            zodType = zodType.optional();
        }

        paramSchema[param.Name] = zodType.describe(param.Description || param.Name);
    }

    const safeName = (action.Name || 'Unknown').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

    addToolWithFilter({
        name: `Execute_${safeName}_Action`,
        description: `Execute the ${action.Name || 'Unknown'} action. ${action.Description || ''}`,
        parameters: z.object(paramSchema),
        async execute(props) {
            const sessionUser = sessionContext.user;
            try {
                const runParams: RunActionParams = {
                    Action: action,
                    ContextUser: sessionUser,
                    Filters: [],
                    Params: actionParams.map((p: ActionParamEntity) => ({
                        Name: p.Name,
                        Value: props[p.Name] ?? p.DefaultValue,
                        Type: (p.Type as 'Input' | 'Output' | 'Both') || 'Input'
                    }))
                };

                const result = await ActionEngineServer.Instance.RunAction(runParams);

                return JSON.stringify({
                    success: result.Success,
                    resultCode: result.Result?.ResultCode,
                    message: result.Message,
                    runId: result.LogEntry?.ID
                });
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    });
}

/**
 * Loads and registers agent tools based on configuration.
 *
 * Creates the following tools based on configuration:
 * - `Discover_Agents` - Lists available agents matching a pattern
 * - `Run_Agent` - General tool to execute any agent by name/ID
 * - `Execute_[AgentName]_Agent` - Specific tools for each configured agent
 * - `Get_Agent_Run_Status` - Check status of agent executions
 * - `Cancel_Agent_Run` - Cancel running agent executions
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param systemUser - System user for context when discovering and configuring agents
 * @param sessionContext - The authenticated session context
 */
async function loadAgentTools(
    addToolWithFilter: AddToolFn,
    systemUser: UserInfo,
    sessionContext: MCPSessionContext
): Promise<void> {
    const agentTools = _config.mcpServerSettings?.agentTools;

    if (agentTools && agentTools.length > 0) {
        // Ensure AIEngine is configured
        const aiEngine = AIEngine.Instance;
        await aiEngine.Config(false, systemUser);

        // Add discovery tool if any agent tool has discover enabled
        const hasDiscovery = agentTools.some((tool: MCPServerAgentToolInfo) => tool.discover);
        if (hasDiscovery) {
            addToolWithFilter({
                name: "Discover_Agents",
                description: "List available AI agents based on a name pattern (* for all agents)",
                parameters: z.object({
                    pattern: z.string().describe("Name pattern to match agents (supports wildcards: *, *Agent, Agent*, *Agent*)")
                }),
                async execute(props) {
                    const sessionUser = sessionContext.user;
                    const agents = await discoverAgents(props.pattern as string, sessionUser);
                    return JSON.stringify(agents.map(agent => ({
                        id: agent.ID,
                        name: agent.Name,
                        description: agent.Description || '',
                        typeID: agent.TypeID,
                        parentID: agent.ParentID
                    })));
                }
            });
        }

        // Add general agent execution tool if any tool has execute enabled
        const hasExecute = agentTools.some(tool => tool.execute);
        if (hasExecute) {
            addToolWithFilter({
                name: "Run_Agent",
                description: "Execute any AI agent by name or ID",
                parameters: z.object({
                    agentName: z.string().optional().describe("Name of the agent to execute"),
                    agentId: z.string().optional().describe("ID of the agent to execute"),
                    conversationHistory: z.array(z.object({
                        role: z.enum(['user', 'assistant', 'system']),
                        content: z.string()
                    })).optional().describe("Conversation history for context"),
                    data: z.record(z.unknown()).optional().describe("Template data for the agent"),
                    waitForCompletion: z.boolean().optional().default(true).describe("Wait for agent to complete before returning")
                }),
                async execute(props) {
                    const sessionUser = sessionContext.user;
                    try {
                        // Find the agent
                        const aiEngine = AIEngine.Instance;
                        await aiEngine.Config(false, sessionUser);

                        let agent: AIAgentEntityExtended | null = null;

                        if (props.agentId) {
                            agent = aiEngine.Agents.find(a => a.ID === props.agentId) || null;
                            if (!agent) {
                                return JSON.stringify({
                                    success: false,
                                    error: `Agent not found with ID: ${props.agentId}`
                                });
                            }
                        } else if (props.agentName) {
                            agent = aiEngine.Agents.find(a => a.Name?.toLowerCase() === (props.agentName as string).toLowerCase()) || null;
                            if (!agent) {
                                return JSON.stringify({
                                    success: false,
                                    error: `Agent not found with name: ${props.agentName}`
                                });
                            }
                        } else {
                            return JSON.stringify({
                                success: false,
                                error: "Either agentName or agentId must be provided"
                            });
                        }

                        // Convert conversation history to ChatMessage format
                        const historyArray = props.conversationHistory as Array<{ role: string; content: string }> | undefined;
                        const messages: ChatMessage[] = historyArray?.map((msg) => ({
                            role: msg.role as 'user' | 'assistant' | 'system',
                            content: msg.content
                        })) || [];

                        // Execute the agent
                        const agentRunner = new AgentRunner();
                        const result = await agentRunner.RunAgent({
                            agent,
                            conversationMessages: messages,
                            contextUser: sessionUser,
                            data: props.data as Record<string, unknown>
                        });

                        if (props.waitForCompletion) {
                            // Return the full result
                            return JSON.stringify({
                                success: result.success,
                                runId: result.agentRun?.ID,
                                errorMessage: result.agentRun?.ErrorMessage,
                                finalStep: result.agentRun?.FinalStep,
                                result: result.payload
                            });
                        } else {
                            // Return just the run ID for async checking
                            return JSON.stringify({
                                success: result.success,
                                runId: result.agentRun?.ID,
                                message: "Agent execution started. Use Get_Agent_Run_Status to check progress."
                            });
                        }
                    } catch (error) {
                        return JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            });
        }

        // Process each agent tool configuration for specific agent tools
        for (const tool of agentTools) {
            const agentPattern = tool.agentName || "*";
            const agents = await discoverAgents(agentPattern, systemUser);

            // Add tools for each matching agent
            for (const agent of agents) {
                if (tool.execute) {
                    addAgentExecuteTool(addToolWithFilter, agent, sessionContext);
                }
            }
        }

        // Add status tool if any agent tool has status enabled
        const hasStatus = agentTools.some(tool => tool.status);
        if (hasStatus) {
            addToolWithFilter({
                name: "Get_Agent_Run_Status",
                description: "Get the status of a running or completed agent execution",
                parameters: z.object({
                    runId: z.string().describe("The agent run ID")
                }),
                async execute(props) {
                    const sessionUser = sessionContext.user;
                    const md = new Metadata();
                    const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', sessionUser);
                    const loaded = await agentRun.Load(props.runId as string);

                    if (!loaded) {
                        return JSON.stringify({ error: "Run not found" });
                    }

                    return JSON.stringify({
                        runId: agentRun.ID,
                        agentName: agentRun.Agent,
                        status: agentRun.Status,
                        startTime: agentRun.StartedAt,
                        endTime: agentRun.CompletedAt,
                        errorMessage: agentRun.ErrorMessage,
                        totalTokens: agentRun.TotalTokensUsed
                    });
                }
            });
        }

        // Add cancel tool if any agent tool has cancel enabled
        const hasCancel = agentTools.some(tool => tool.cancel);
        if (hasCancel) {
            addToolWithFilter({
                name: "Cancel_Agent_Run",
                description: "Cancel a running agent execution (Note: cancellation support depends on agent implementation)",
                parameters: z.object({
                    runId: z.string().describe("The run ID of the agent execution to cancel")
                }),
                async execute(props) {
                    const sessionUser = sessionContext.user;
                    // Note: Actual cancellation would require the agent to check the cancellation token
                    // For now, we can update the status to indicate cancellation was requested
                    const md = new Metadata();
                    const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', sessionUser);
                    const loaded = await agentRun.Load(props.runId as string);

                    if (!loaded || agentRun.Status !== 'Running') {
                        return JSON.stringify({ success: false, message: "Run not found or not running" });
                    }

                    // Update status to indicate cancellation requested
                    agentRun.Status = 'Cancelled';
                    agentRun.CompletedAt = new Date();
                    const saved = await agentRun.Save();

                    return JSON.stringify({ success: saved });
                }
            });
        }
    }
}

/**
 * Registers diagnostic tools for debugging and auditing agent executions.
 *
 * Creates the following tools:
 * - `List_Recent_Agent_Runs` - Query recent agent runs with filtering
 * - `Get_Agent_Run_Summary` - Comprehensive summary with step metadata
 * - `Get_Agent_Run_Step_Detail` - Detailed step info with truncated I/O
 * - `Get_Agent_Run_Step_Full_Data` - Export complete step data to file
 *
 * These tools help users debug agent behavior, audit executions, and
 * troubleshoot failures without needing direct database access.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param sessionContext - The authenticated session context
 */
function loadAgentRunDiagnosticTools(addToolWithFilter: AddToolFn, sessionContext: MCPSessionContext): void {
    // Tool 1: List Recent Agent Runs
    addToolWithFilter({
        name: "List_Recent_Agent_Runs",
        description: "Fast query for recent AI agent runs with optional filtering by agent name, status, and date range",
        parameters: z.object({
            agentName: z.string().optional().describe("Filter by agent name (partial match)"),
            status: z.enum(['Success', 'Failed', 'Running', 'Cancelled', 'all']).default('all').describe("Filter by run status"),
            days: z.number().default(7).describe("Number of days to look back"),
            limit: z.number().default(10).describe("Maximum number of runs to return")
        }),
        async execute(props) {
            const sessionUser = sessionContext.user;
            const rv = new RunView();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - (props.days as number));
            const dateFilter = `StartedAt >= '${cutoffDate.toISOString()}'`;

            let filter = dateFilter;
            if (props.agentName) {
                filter += ` AND Agent LIKE '%${props.agentName}%'`;
            }
            if (props.status !== 'all') {
                filter += ` AND Status = '${props.status}'`;
            }

            const result = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: filter,
                OrderBy: 'StartedAt DESC',
                MaxRows: props.limit as number,
                Fields: ['ID', 'AgentID', 'Agent', 'Status', 'StartedAt', 'CompletedAt', 'TotalTokensUsed', 'TotalCost', 'ErrorMessage']
            }, sessionUser);

            if (!result.Success) {
                return JSON.stringify({ error: result.ErrorMessage });
            }

            return JSON.stringify(result.Results);
        }
    });

    // Tool 2: Get Agent Run Summary
    addToolWithFilter({
        name: "Get_Agent_Run_Summary",
        description: "Comprehensive summary of an agent run with step-level metadata (excludes large I/O data)",
        parameters: z.object({
            runId: z.string().describe("The agent run ID to summarize")
        }),
        async execute(props) {
            const sessionUser = sessionContext.user;
            const md = new Metadata();
            const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', sessionUser);
            const loaded = await agentRun.Load(props.runId as string);

            if (!loaded) {
                return JSON.stringify({ error: "Agent run not found" });
            }

            // Load all steps for this run
            const rv = new RunView();
            const stepsResult = await rv.RunView<AIAgentRunStepEntityExtended>({
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `AgentRunID = '${props.runId}'`,
                OrderBy: 'StepNumber',
                Fields: ['ID', 'StepNumber', 'StepName', 'StepType', 'Status', 'StartedAt', 'CompletedAt', 'ErrorMessage'],
                ResultType: 'entity_object'
            }, sessionUser);

            if (!stepsResult.Success) {
                return JSON.stringify({ error: stepsResult.ErrorMessage });
            }

            const steps = stepsResult.Results || [];
            const errorSteps = steps.filter(s => s.ErrorMessage);

            const summary = {
                runId: agentRun.ID,
                agentName: agentRun.Agent,
                agentId: agentRun.AgentID,
                status: agentRun.Status,
                startedAt: agentRun.StartedAt?.toISOString(),
                completedAt: agentRun.CompletedAt?.toISOString(),
                duration: agentRun.CompletedAt && agentRun.StartedAt
                    ? agentRun.CompletedAt.getTime() - agentRun.StartedAt.getTime()
                    : null,
                totalTokens: agentRun.TotalTokensUsed,
                totalCost: agentRun.TotalCost,
                stepCount: steps.length,
                hasErrors: errorSteps.length > 0,
                errorCount: errorSteps.length,
                steps: steps.map(s => ({
                    stepNumber: s.StepNumber,
                    stepId: s.ID,
                    stepName: s.StepName,
                    stepType: s.StepType,
                    status: s.Status,
                    duration: s.CompletedAt && s.StartedAt
                        ? new Date(s.CompletedAt).getTime() - new Date(s.StartedAt).getTime()
                        : null,
                    errorMessage: s.ErrorMessage || undefined
                })),
                firstError: errorSteps.length > 0 ? {
                    stepNumber: errorSteps[0].StepNumber,
                    stepName: errorSteps[0].StepName,
                    message: errorSteps[0].ErrorMessage
                } : undefined
            };

            return JSON.stringify(summary);
        }
    });

    // Tool 3: Get Agent Run Step Detail
    addToolWithFilter({
        name: "Get_Agent_Run_Step_Detail",
        description: "Detailed information about a specific step including input/output data with smart truncation",
        parameters: z.object({
            runId: z.string().describe("The agent run ID"),
            stepNumber: z.number().describe("The step number to retrieve (1-based)"),
            maxChars: z.number().default(5000).describe("Maximum characters for I/O data (0 = no truncation)")
        }),
        async execute(props) {
            const sessionUser = sessionContext.user;
            const rv = new RunView();
            const stepsResult = await rv.RunView<AIAgentRunStepEntityExtended>({
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `AgentRunID = '${props.runId}'`,
                OrderBy: 'StepNumber',
                ResultType: 'entity_object'
            }, sessionUser);

            if (!stepsResult.Success) {
                return JSON.stringify({ error: stepsResult.ErrorMessage });
            }

            const steps = stepsResult.Results || [];
            const stepNumber = props.stepNumber as number;
            if (stepNumber < 1 || stepNumber > steps.length) {
                return JSON.stringify({ error: `Invalid step number. Run has ${steps.length} steps.` });
            }

            const step = steps[stepNumber - 1];
            const inputData = truncateText(step.InputData, props.maxChars as number);
            const outputData = truncateText(step.OutputData, props.maxChars as number);

            const detail = {
                stepNumber: step.StepNumber,
                stepId: step.ID,
                stepName: step.StepName,
                stepType: step.StepType,
                status: step.Status,
                startedAt: step.StartedAt ? new Date(step.StartedAt).toISOString() : null,
                completedAt: step.CompletedAt ? new Date(step.CompletedAt).toISOString() : null,
                duration: step.CompletedAt && step.StartedAt
                    ? new Date(step.CompletedAt).getTime() - new Date(step.StartedAt).getTime()
                    : null,
                input: {
                    data: inputData.value,
                    truncated: inputData.truncated,
                    originalLength: step.InputData?.length || 0
                },
                output: {
                    data: outputData.value,
                    truncated: outputData.truncated,
                    originalLength: step.OutputData?.length || 0
                },
                errorMessage: step.ErrorMessage || undefined
            };

            return JSON.stringify(detail);
        }
    });

    // Tool 4: Get Agent Run Step Full Data
    addToolWithFilter({
        name: "Get_Agent_Run_Step_Full_Data",
        description: "Export complete untruncated step data to JSON file for detailed analysis",
        parameters: z.object({
            runId: z.string().describe("The agent run ID"),
            stepNumber: z.number().describe("The step number to retrieve (1-based)"),
            outputFile: z.string().optional().describe("File path to write JSON output (optional)")
        }),
        async execute(props) {
            const sessionUser = sessionContext.user;
            const rv = new RunView();
            const stepsResult = await rv.RunView<AIAgentRunStepEntityExtended>({
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `AgentRunID = '${props.runId}'`,
                OrderBy: 'StepNumber',
                ResultType: 'entity_object'
            }, sessionUser);

            if (!stepsResult.Success) {
                return JSON.stringify({ error: stepsResult.ErrorMessage });
            }

            const steps = stepsResult.Results || [];
            const stepNumber = props.stepNumber as number;
            if (stepNumber < 1 || stepNumber > steps.length) {
                return JSON.stringify({ error: `Invalid step number. Run has ${steps.length} steps.` });
            }

            const step = steps[stepNumber - 1];
            const stepData = step.GetAll();

            // Determine output file path
            const runIdShort = (props.runId as string).substring(0, 8);
            const defaultFile = `./agent-run-${runIdShort}-step-${stepNumber}.json`;
            const filePath = path.resolve(process.cwd(), (props.outputFile as string) || defaultFile);

            // Write to file
            const jsonContent = JSON.stringify(stepData, null, 2);
            await fs.writeFile(filePath, jsonContent, 'utf-8');

            const response: Record<string, unknown> = {
                success: true,
                message: `Step data exported to file`,
                filePath: filePath,
                fileSize: jsonContent.length,
                stepSummary: {
                    stepNumber: step.StepNumber,
                    stepName: step.StepName,
                    status: step.Status,
                    inputLength: step.InputData?.length || 0,
                    outputLength: step.OutputData?.length || 0
                }
            };

            // Include inline data if small enough
            if (jsonContent.length < 10000) {
                response.inlineData = stepData;
                response.note = "Data included inline (file also saved)";
            }

            return JSON.stringify(response);
        }
    });
}

/*******************************************************************************
 * QUERY TOOLS
 ******************************************************************************/

/**
 * Loads query tools based on configuration.
 *
 * Creates tools for discovering and executing stored MJ Queries:
 * - `Discover_Queries` - List available stored queries
 * - `Run_Query` - Execute a stored query by name or ID
 * - `Get_Database_Schema` - Get schema information for available entities
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param sessionContext - The authenticated session context
 */
function loadQueryTools(addToolWithFilter: AddToolFn, sessionContext: MCPSessionContext): void {
    const queryTools = _config.mcpServerSettings?.queryTools;

    if (queryTools?.enabled) {
        // Add query discovery tool
        addToolWithFilter({
            name: "Discover_Queries",
            description: "List available stored queries that can be executed. Returns query metadata including name, description, and category.",
            parameters: z.object({
                pattern: z.string().optional().describe("Name pattern to match queries (supports wildcards: *, *Query, Query*, *Query*)"),
                category: z.string().optional().describe("Category name or path to filter queries (e.g., 'Reports', '/MJ/AI/')")
            }),
            async execute(props) {
                const sessionUser = sessionContext.user;

                try {
                    const rv = new RunView();
                    const result = await rv.RunView({
                        EntityName: 'Queries',
                        ExtraFilter: `Status = 'Active'`,
                        OrderBy: 'Name',
                        Fields: ['ID', 'Name', 'Description', 'CategoryID', 'Status'],
                        ResultType: 'simple'
                    }, sessionUser);

                    if (!result.Success) {
                        return JSON.stringify({ error: result.ErrorMessage });
                    }

                    let queries = result.Results || [];

                    // Filter by pattern if provided
                    const pattern = (props.pattern as string) || '*';
                    if (pattern !== '*') {
                        if (pattern.includes('*')) {
                            const regexPattern = pattern
                                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                                .replace(/\*/g, '.*');
                            const regex = new RegExp(`^${regexPattern}$`, 'i');
                            queries = queries.filter((q: { Name: string }) => q.Name && regex.test(q.Name));
                        } else {
                            queries = queries.filter((q: { Name: string }) => q.Name === pattern);
                        }
                    }

                    return JSON.stringify(queries.map((q: { ID: string; Name: string; Description?: string; CategoryID?: string; Status: string }) => ({
                        id: q.ID,
                        name: q.Name,
                        description: q.Description || '',
                        categoryId: q.CategoryID,
                        status: q.Status
                    })));
                } catch (error) {
                    return JSON.stringify({
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        });

        // Add stored query execution tool
        addToolWithFilter({
            name: "Run_Query",
            description: "Execute a stored query by name or ID. Stored queries are pre-defined SQL queries managed in MemberJunction.",
            parameters: z.object({
                queryName: z.string().optional().describe("Name of the stored query to execute"),
                queryId: z.string().optional().describe("ID of the stored query to execute"),
                categoryPath: z.string().optional().describe("Category path for disambiguation (e.g., '/MJ/Reports/')"),
                parameters: z.record(z.unknown()).optional().describe("Parameters to pass to parameterized queries"),
                maxRows: z.number().optional().describe("Maximum number of rows to return")
            }),
            async execute(props) {
                const sessionUser = sessionContext.user;

                if (!props.queryName && !props.queryId) {
                    return JSON.stringify({
                        success: false,
                        error: "Either queryName or queryId must be provided"
                    });
                }

                try {
                    const rq = new RunQuery();
                    const result = await rq.RunQuery({
                        QueryID: props.queryId as string | undefined,
                        QueryName: props.queryName as string | undefined,
                        CategoryPath: props.categoryPath as string | undefined,
                        Parameters: props.parameters as Record<string, unknown> | undefined,
                        MaxRows: props.maxRows as number | undefined
                    }, sessionUser);

                    if (!result.Success) {
                        return JSON.stringify({
                            success: false,
                            error: result.ErrorMessage
                        });
                    }

                    return JSON.stringify({
                        success: true,
                        rowCount: result.Results?.length || 0,
                        results: result.Results
                    });
                } catch (error) {
                    return JSON.stringify({
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        });

        // Add schema discovery tool (for understanding available entities)
        addToolWithFilter({
            name: "Get_Database_Schema",
            description: "Get information about available MemberJunction entities and their fields",
            parameters: z.object({
                schemaFilter: z.string().optional().describe("Filter by schema name (e.g., 'dbo', '__mj')"),
                entityFilter: z.string().optional().describe("Filter by entity name pattern")
            }),
            async execute(props) {
                const md = new Metadata();
                let entities = md.Entities;

                // Apply schema filter
                if (props.schemaFilter) {
                    const schemaLower = (props.schemaFilter as string).toLowerCase();
                    entities = entities.filter((e: EntityInfo) => e.SchemaName.toLowerCase() === schemaLower);
                }

                // Apply entity filter
                if (props.entityFilter) {
                    const entityFilter = props.entityFilter as string;
                    if (entityFilter.includes('*')) {
                        const regexPattern = entityFilter
                            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                            .replace(/\*/g, '.*');
                        const regex = new RegExp(`^${regexPattern}$`, 'i');
                        entities = entities.filter((e: EntityInfo) => regex.test(e.Name));
                    } else {
                        const filterLower = entityFilter.toLowerCase();
                        entities = entities.filter((e: EntityInfo) => e.Name.toLowerCase().includes(filterLower));
                    }
                }

                // Apply allowed/blocked schemas from config
                const queryToolsConfig = _config.mcpServerSettings?.queryTools;
                if (queryToolsConfig?.allowedSchemas?.length) {
                    const allowed = queryToolsConfig.allowedSchemas.map((s: string) => s.toLowerCase());
                    entities = entities.filter((e: EntityInfo) => allowed.includes(e.SchemaName.toLowerCase()));
                }
                if (queryToolsConfig?.blockedSchemas?.length) {
                    const blocked = queryToolsConfig.blockedSchemas.map((s: string) => s.toLowerCase());
                    entities = entities.filter((e: EntityInfo) => !blocked.includes(e.SchemaName.toLowerCase()));
                }

                return JSON.stringify(entities.map((e: EntityInfo) => ({
                    schema: e.SchemaName,
                    table: e.BaseTable,
                    entityName: e.Name,
                    description: e.Description,
                    columns: e.Fields.map((f: EntityFieldInfo) => ({
                        name: f.Name,
                        type: f.Type,
                        length: f.Length,
                        nullable: f.AllowsNull,
                        isPrimaryKey: f.IsPrimaryKey,
                        description: f.Description
                    }))
                })));
            }
        });
    }
}

/*******************************************************************************
 * PROMPT TOOLS
 ******************************************************************************/

/**
 * Loads AI Prompt tools based on configuration.
 *
 * Creates tools for discovering and executing AI prompts:
 * - `Discover_Prompts` - Lists available AI prompts
 * - `Run_Prompt` - Execute any prompt by name or ID
 * - `Execute_[PromptName]_Prompt` - Specific tools for each configured prompt
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param systemUser - System user for initialization
 * @param sessionContext - The authenticated session context
 */
async function loadPromptTools(
    addToolWithFilter: AddToolFn,
    systemUser: UserInfo,
    sessionContext: MCPSessionContext
): Promise<void> {
    const promptTools = _config.mcpServerSettings?.promptTools;

    if (promptTools && promptTools.length > 0) {
        // Ensure AIEngine is configured
        const aiEngine = AIEngine.Instance;
        await aiEngine.Config(false, systemUser);

        // Add discovery tool if any prompt tool has discover enabled
        const hasDiscovery = promptTools.some((tool: MCPServerPromptToolInfo) => tool.discover);
        if (hasDiscovery) {
            addToolWithFilter({
                name: "Discover_Prompts",
                description: "List available AI Prompts based on a name pattern and/or category (* for all)",
                parameters: z.object({
                    pattern: z.string().optional().describe("Name pattern to match prompts (supports wildcards)"),
                    category: z.string().optional().describe("Category name to filter prompts")
                }),
                async execute(props) {
                    const sessionUser = sessionContext.user;

                    const aiEngine = AIEngine.Instance;
                    await aiEngine.Config(false, sessionUser);

                    let prompts = aiEngine.Prompts;

                    // Filter by category
                    if (props.category && props.category !== '*') {
                        const categoryLower = (props.category as string).toLowerCase();
                        prompts = prompts.filter((p: AIPromptEntityExtended) => p.Category?.toLowerCase().includes(categoryLower));
                    }

                    // Filter by pattern
                    const pattern = (props.pattern as string) || '*';
                    if (pattern !== '*') {
                        if (pattern.includes('*')) {
                            const regexPattern = pattern
                                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                                .replace(/\*/g, '.*');
                            const regex = new RegExp(`^${regexPattern}$`, 'i');
                            prompts = prompts.filter((p: AIPromptEntityExtended) => p.Name && regex.test(p.Name));
                        } else {
                            prompts = prompts.filter((p: AIPromptEntityExtended) => p.Name === pattern);
                        }
                    }

                    return JSON.stringify(prompts.map((p: AIPromptEntityExtended) => ({
                        id: p.ID,
                        name: p.Name,
                        description: p.Description || '',
                        category: p.Category,
                        templateText: p.TemplateText?.substring(0, 200) + (p.TemplateText && p.TemplateText.length > 200 ? '...' : ''),
                        responseFormat: p.ResponseFormat
                    })));
                }
            });
        }

        // Add general prompt execution tool if any tool has execute enabled
        const hasExecute = promptTools.some((tool: MCPServerPromptToolInfo) => tool.execute);
        if (hasExecute) {
            addToolWithFilter({
                name: "Run_Prompt",
                description: "Execute any AI Prompt by name or ID with the specified data",
                parameters: z.object({
                    promptName: z.string().optional().describe("Name of the prompt to execute"),
                    promptId: z.string().optional().describe("ID of the prompt to execute"),
                    data: z.record(z.unknown()).optional().describe("Data to pass to the prompt template"),
                    modelId: z.string().optional().describe("Optional model ID to use for execution")
                }),
                async execute(props) {
                    const sessionUser = sessionContext.user;

                    try {
                        const aiEngine = AIEngine.Instance;
                        await aiEngine.Config(false, sessionUser);

                        let prompt: AIPromptEntityExtended | undefined;

                        if (props.promptId) {
                            prompt = aiEngine.Prompts.find((p: AIPromptEntityExtended) => p.ID === props.promptId);
                            if (!prompt) {
                                return JSON.stringify({
                                    success: false,
                                    error: `Prompt not found with ID: ${props.promptId}`
                                });
                            }
                        } else if (props.promptName) {
                            prompt = aiEngine.Prompts.find((p: AIPromptEntityExtended) => p.Name?.toLowerCase() === (props.promptName as string)?.toLowerCase());
                            if (!prompt) {
                                return JSON.stringify({
                                    success: false,
                                    error: `Prompt not found with name: ${props.promptName}`
                                });
                            }
                        } else {
                            return JSON.stringify({
                                success: false,
                                error: "Either promptName or promptId must be provided"
                            });
                        }

                        // Execute the prompt
                        const runner = new AIPromptRunner();
                        const promptParams = new AIPromptParams();
                        promptParams.prompt = prompt;
                        promptParams.data = (props.data as Record<string, unknown>) || {};
                        promptParams.contextUser = sessionUser;

                        const result = await runner.ExecutePrompt(promptParams);

                        return JSON.stringify({
                            success: result.success,
                            result: result.result,
                            rawResult: result.rawResult,
                            errorMessage: result.errorMessage
                        });
                    } catch (error) {
                        return JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            });
        }
    }
}

/*******************************************************************************
 * COMMUNICATION TOOLS
 ******************************************************************************/

/**
 * Loads Communication tools based on configuration.
 *
 * Creates tools for sending messages via various communication channels:
 * - `Send_Email` - Send an email via configured provider
 * - `Get_Communication_Providers` - List available communication providers
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param sessionContext - The authenticated session context
 */
function loadCommunicationTools(addToolWithFilter: AddToolFn, sessionContext: MCPSessionContext): void {
    const commTools = _config.mcpServerSettings?.communicationTools;

    if (commTools?.enabled) {
        // Add email sending tool
        addToolWithFilter({
            name: "Send_Email",
            description: "Send an email message. Note: Requires email provider to be configured.",
            parameters: z.object({
                to: z.string().describe("Recipient email address"),
                subject: z.string().describe("Email subject"),
                body: z.string().describe("Email body (can be HTML)"),
                isHtml: z.boolean().optional().default(true).describe("Whether body is HTML (default: true)")
            }),
            async execute(_props) {
                try {
                    // Note: This is a placeholder - actual implementation would use CommunicationEngine
                    // For now, return a message indicating that communication would be sent
                    return JSON.stringify({
                        success: false,
                        error: "Email sending requires CommunicationEngine configuration. Please configure your email provider.",
                        note: "This tool is a placeholder. Full implementation requires proper CommunicationEngine integration."
                    });
                } catch (error) {
                    return JSON.stringify({
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        });

        // Add provider discovery tool
        addToolWithFilter({
            name: "Get_Communication_Providers",
            description: "List available communication providers configured in the system",
            parameters: z.object({}),
            async execute() {
                const sessionUser = sessionContext.user;
                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: 'Communication Providers',
                    OrderBy: 'Name',
                    Fields: ['ID', 'Name', 'Description', 'Status', 'SupportsSending']
                }, sessionUser);

                if (!result.Success) {
                    return JSON.stringify({ error: result.ErrorMessage });
                }

                return JSON.stringify(result.Results || []);
            }
        });
    }
}

/*******************************************************************************
 * AGENT HELPERS
 ******************************************************************************/

/**
 * Discovers AI agents matching a given name pattern.
 *
 * Pattern matching:
 * - `*` - Returns all agents
 * - `exact` - Exact name match (case-sensitive)
 * - `prefix*` - Agents starting with prefix (case-insensitive)
 * - `*suffix` - Agents ending with suffix (case-insensitive)
 * - `*contains*` - Agents containing the text (case-insensitive)
 *
 * @param pattern - The name pattern to match (supports wildcards)
 * @param userContext - Optional user context for AIEngine configuration
 * @returns Array of matching agent entities
 */
async function discoverAgents(pattern: string, userContext?: UserInfo): Promise<AIAgentEntityExtended[]> {
    const aiEngine = AIEngine.Instance;
    await aiEngine.Config(false, userContext);

    const allAgents = aiEngine.Agents;

    if (pattern === '*') {
        return allAgents;
    }

    const isWildcardPattern = pattern.includes('*');
    if (!isWildcardPattern) {
        // Exact match
        return allAgents.filter(a => a.Name === pattern);
    }

    // Convert wildcard pattern to regex
    const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
        .replace(/\*/g, '.*'); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return allAgents.filter(a => a.Name && regex.test(a.Name));
}

/**
 * Creates and registers an execution tool for a specific AI agent.
 *
 * The generated tool allows MCP clients to execute the agent with:
 * - Optional conversation history for context
 * - Optional template data
 * - Synchronous or asynchronous execution modes
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param agent - The agent entity to create an execution tool for
 * @param sessionContext - The authenticated session context
 */
function addAgentExecuteTool(
    addToolWithFilter: AddToolFn,
    agent: AIAgentEntityExtended,
    sessionContext: MCPSessionContext
): void {
    const agentRunner = new AgentRunner();

    addToolWithFilter({
        name: `Execute_${(agent.Name || 'Unknown').replace(/\s+/g, '_')}_Agent`,
        description: `Execute the ${agent.Name || 'Unknown'} agent. ${agent.Description || ''}`,
        parameters: z.object({
            conversationHistory: z.array(z.object({
                role: z.enum(['user', 'assistant', 'system']),
                content: z.string()
            })).optional().describe("Conversation history for context"),
            data: z.record(z.unknown()).optional().describe("Template data for the agent"),
            waitForCompletion: z.boolean().optional().default(true).describe("Wait for agent to complete before returning")
        }),
        async execute(props) {
            const sessionUser = sessionContext.user;
            try {
                // Convert conversation history to ChatMessage format
                const historyArray = props.conversationHistory as Array<{ role: string; content: string }> | undefined;
                const messages: ChatMessage[] = historyArray?.map((msg) => ({
                    role: msg.role as 'user' | 'assistant' | 'system',
                    content: msg.content
                })) || [];

                // Execute the agent
                const result = await agentRunner.RunAgent({
                    agent,
                    conversationMessages: messages,
                    contextUser: sessionUser,
                    data: props.data as Record<string, unknown>
                });

                if (props.waitForCompletion) {
                    // Return the full result
                    return JSON.stringify({
                        success: result.success,
                        runId: result.agentRun?.ID,
                        errorMessage: result.agentRun?.ErrorMessage,
                        finalStep: result.agentRun?.FinalStep,
                        result: result.payload
                    });
                } else {
                    // Return just the run ID for async checking
                    return JSON.stringify({
                        success: result.success,
                        runId: result.agentRun?.ID,
                        message: "Agent execution started. Use Get_Agent_Run_Status to check progress."
                    });
                }
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    });
}

/*******************************************************************************
 * ENTITY TOOLS
 ******************************************************************************/

/**
 * Loads and registers entity tools based on configuration.
 *
 * For each configured entity tool pattern, creates tools for the specified operations:
 * - Get: Retrieve a record by primary key
 * - Create: Create a new record
 * - Update: Update an existing record
 * - Delete: Delete a record
 * - RunView: Query records with filtering and sorting
 *
 * Entity matching supports wildcards in both entityName and schemaName.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 */
async function loadEntityTools(addToolWithFilter: AddToolFn): Promise<void> {
    const entityTools = _config.mcpServerSettings?.entityTools;

    if (entityTools && entityTools.length > 0) {
        const md = new Metadata();

        // Iterate through the tools and add them to the server
        entityTools.forEach((tool) => {
            const matchingEntities = getMatchingEntitiesForTool(md.Entities, tool);
            matchingEntities.forEach((entity) => {
                if (tool.get) {
                    addEntityGetTool(addToolWithFilter, entity);
                }
                if (tool.create) {
                    addEntityCreateTool(addToolWithFilter, entity);
                }
                if (tool.update) {
                    addEntityUpdateTool(addToolWithFilter, entity);
                }
                if (tool.delete) {
                    addEntityDeleteTool(addToolWithFilter, entity);
                }
                if (tool.runView) {
                    addEntityRunViewTool(addToolWithFilter, entity);
                }
            });
        });
    }
}

/**
 * Creates a RunView tool for querying entity records.
 * Allows filtering, sorting, and field selection.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
function addEntityRunViewTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const paramObject = z.object({
        extraFilter: z.string().optional(),
        orderBy: z.string().optional(),
        fields: z.array(z.string()).optional(),
    });

    addToolWithFilter({
        name: `Run_${entity.ClassName}_View`,
        description: `Returns data from the ${entity.Name} entity, optionally filtered by extraFilter and ordered by orderBy`,
        parameters: paramObject,
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: entity.Name,
                ExtraFilter: props.extraFilter ? props.extraFilter as string : undefined,
                OrderBy: props.orderBy ? props.orderBy as string : undefined,
                Fields: props.fields ? props.fields as string[] : undefined,
            }, sessionUser);
            return JSON.stringify(result);
        }
    });
}

/**
 * Creates a tool for creating new records in an entity.
 * Parameters are generated from the entity's non-readonly fields.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
function addEntityCreateTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const paramObject = getEntityParamObject(entity, true, false, false);

    addToolWithFilter({
        name: `Create_${entity.ClassName}_Record`,
        description: `Creates a new record in the ${entity.Name} entity`,
        parameters: z.object(paramObject),
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const md = new Metadata();
            const record = await md.GetEntityObject(entity.Name, sessionUser);
            record.SetMany(props, true);
            const success = await record.Save();
            if (!success) {
                return JSON.stringify({success, record: undefined, errorMessage: record.LatestResult.CompleteMessage });
            }
            else {
                return JSON.stringify({success, record: await convertEntityObjectToJSON(record), errorMessage: undefined });
            }
        }
    });
}

/**
 * Creates a tool for updating existing records in an entity.
 * Requires primary key fields to identify the record, plus optional fields to update.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
function addEntityUpdateTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const paramObject = getEntityParamObject(entity, true, true, true);

    addToolWithFilter({
        name: `Update_${entity.ClassName}_Record`,
        description: `Updates the specified record in the ${entity.Name} entity`,
        parameters: z.object(paramObject),
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const md = new Metadata();
            const record = await md.GetEntityObject(entity.Name, sessionUser);
            const loaded = await record.InnerLoad(new CompositeKey(
                // use the primary keys to load the record
                entity.PrimaryKeys.map((pk) => {
                    return {
                        FieldName: pk.Name,
                        Value: props[pk.Name]
                    };
                })
            ));
            if (loaded) {
                // remove the primary keys from the props so we don't try to update them
                const newProps = { ...props };
                entity.PrimaryKeys.forEach((pk) => {
                    delete newProps[pk.Name];
                });
                record.SetMany(newProps, true);
                const success = await record.Save();
                return JSON.stringify({success, record: await convertEntityObjectToJSON(record), errorMessage: !success ? record.LatestResult.CompleteMessage : undefined });
            }
            else {
                return JSON.stringify({success: false, record: undefined, errorMessage: "Record not found"});
            }
        }
    });
}

/**
 * Creates a tool for deleting records from an entity.
 * Only requires the primary key field(s) to identify the record.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
function addEntityDeleteTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const pkeyParams = getEntityPrimaryKeyParamsObject(entity);

    addToolWithFilter({
        name: `Delete_${entity.ClassName}_Record`,
        description: `Deletes the specified record from the ${entity.Name} entity`,
        parameters: z.object(pkeyParams),
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const md = new Metadata();
            const record = await md.GetEntityObject(entity.Name, sessionUser);
            const loaded = await record.InnerLoad(new CompositeKey(
                // use the primary keys to load the record
                entity.PrimaryKeys.map((pk) => {
                    return {
                        FieldName: pk.Name,
                        Value: props[pk.Name]
                    };
                })
            ));
            if (loaded) {
                const savedRecordJSON = await convertEntityObjectToJSON(record);
                const success = await record.Delete();
                return JSON.stringify({success, record: savedRecordJSON, errorMessage: !success ? record.LatestResult.CompleteMessage : undefined });
            }
            else {
                return JSON.stringify({success: false, record: undefined, errorMessage: "Record not found"});
            }
        }
    });
}


/*******************************************************************************
 * ENTITY HELPER FUNCTIONS
 ******************************************************************************/

/**
 * Converts a BaseEntity object to a JSON representation suitable for API responses.
 *
 * @param record - The entity record to convert
 * @returns JSON string representation of the entity data
 */
async function convertEntityObjectToJSON(record: BaseEntity): Promise<string> {
    const output = await record.GetDataObjectJSON({
        includeRelatedEntityData: false,
        oldValues: false,
        omitEmptyStrings: false,
        omitNullValues: false,
        excludeFields: [],
        relatedEntityList: [],
    });
    return output;
}

/**
 * Builds a Zod parameter object for entity CRUD operations.
 *
 * @param entity - The entity to build parameters for
 * @param excludeReadOnlyFields - If true, excludes read-only fields from the schema
 * @param includePrimaryKeys - If true, includes primary key fields
 * @param nonPKeysOptional - If true, makes non-primary-key fields optional
 * @returns Object with Zod schemas for each included field
 */
function getEntityParamObject(
    entity: EntityInfo,
    excludeReadOnlyFields: boolean,
    includePrimaryKeys: boolean,
    nonPKeysOptional: boolean
): Record<string, z.ZodTypeAny> {
    const paramObject: Record<string, z.ZodTypeAny> = {};

    entity.Fields.filter(f => {
        if (f.IsPrimaryKey && includePrimaryKeys) {
            return true;
        }
        else if (f.ReadOnly && excludeReadOnlyFields) {
            return false;
        }
        else {
            return true;
        }
    }).forEach((f) => {
        addSingleParamToObject(paramObject, f, f.IsPrimaryKey ? false : nonPKeysOptional);
    });

    return paramObject;
}

/**
 * Adds a single field as a Zod parameter to the parameter object.
 * Handles type mapping from MemberJunction types to Zod schemas,
 * including support for value lists (enums).
 *
 * @param theObject - The parameter object to add the field to
 * @param field - The entity field info
 * @param optional - If true, makes the parameter optional
 */
function addSingleParamToObject(
    theObject: Record<string, z.ZodTypeAny>,
    field: EntityFieldInfo,
    optional: boolean
): void {
    let newParam: z.ZodTypeAny;
    switch (field.TSType) {
        case 'Date':
            newParam = z.date();
            break;
        case 'boolean':
            newParam = z.boolean();
            break;
        case 'number':
            newParam = z.number();
            break;
        case 'string':
        default:
            // For strings, check if we have a value list and create an enum
            if (field.ValueListTypeEnum === 'None' || field.EntityFieldValues.length === 0) {
                newParam = z.string();
            }
            else {
                const enumList = field.EntityFieldValues.map((v) => v.Value);
                if (field.ValueListTypeEnum === 'List') {
                    newParam = z.enum(enumList as [string, ...string[]]);
                }
                else {
                    // List + user input: allow enum values or any string
                    newParam = z.union([z.enum(enumList as [string, ...string[]]), z.string()]);
                }
            }
            break;
    }

    if (optional) {
        theObject[field.Name] = newParam.optional();
    }
    else {
        theObject[field.Name] = newParam;
    }
}

/**
 * Builds a Zod parameter object containing only the primary key fields for an entity.
 * Used for Get and Delete operations that only need to identify the record.
 *
 * @param entity - The entity to build primary key parameters for
 * @returns Object with Zod schemas for each primary key field
 */
function getEntityPrimaryKeyParamsObject(entity: EntityInfo): Record<string, z.ZodTypeAny> {
    const paramObject: Record<string, z.ZodTypeAny> = {};
    entity.PrimaryKeys.forEach((pk) => {
        addSingleParamToObject(paramObject, pk, false);
    });
    return paramObject;
}

/**
 * Creates a tool for retrieving a single record from an entity by primary key.
 *
 * @param addToolWithFilter - Function to register tools with filter check
 * @param entity - The entity to create the tool for
 */
function addEntityGetTool(addToolWithFilter: AddToolFn, entity: EntityInfo): void {
    const pkeyParams = getEntityPrimaryKeyParamsObject(entity);

    addToolWithFilter({
        name: `Get_${entity.ClassName}_Record`,
        description: `Retrieves the specified record from the ${entity.Name} entity`,
        parameters: z.object(pkeyParams),
        async execute(props, sessionContext) {
            const sessionUser = sessionContext.user;
            const md = new Metadata();
            const record = await md.GetEntityObject(entity.Name, sessionUser);
            await record.InnerLoad(new CompositeKey(
                entity.PrimaryKeys.map((pk) => ({
                    FieldName: pk.Name,
                    Value: props[pk.Name]
                }))
            ));
            return await convertEntityObjectToJSON(record);
        }
    });
}

/**
 * Configuration interface for entity tool matching.
 */
interface EntityToolConfig {
    get: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    runView: boolean;
    entityName?: string;
    schemaName?: string;
}

/**
 * Filters entities based on tool configuration patterns.
 *
 * Supports wildcard matching for both entityName and schemaName:
 * - `*` - Matches all
 * - `prefix*` - Matches names starting with prefix
 * - `*suffix` - Matches names ending with suffix
 * - `*contains*` - Matches names containing the text
 * - `exact` - Exact match (case-insensitive)
 *
 * @param allEntities - Array of all available entities
 * @param tool - Tool configuration with entity/schema patterns
 * @returns Array of entities matching the patterns
 */
function getMatchingEntitiesForTool(allEntities: EntityInfo[], tool: EntityToolConfig): EntityInfo[] {
    const matchingEntities = allEntities.filter((entity) => {
        const entityName = entity.Name;
        const schemaName = entity.SchemaName;
        const toolEntityName = tool.entityName?.trim().toLowerCase() || "*";
        const toolSchemaName = tool.schemaName?.trim().toLowerCase() || "*";

        // we support wildcards such as * which is all entities/schemas, *Partial which would be Partial is the ending of the string, or Partial* where Partial is the start of the string
        // so we need to check for the conditions as follows: exact match, wildcard at the start, wildcard at the end, and wildcard only means always match and assign to two variables, schemaMatch
        // first to scope the schema and then entityMatch if the schemaMatch is true
        let schemaMatch = false;
        let entityMatch = false;
        if (toolSchemaName === "*") {
            schemaMatch = true;
        }
        else if (toolSchemaName.startsWith("*") && toolSchemaName.endsWith("*")) {
            schemaMatch = schemaName.toLowerCase().includes(toolSchemaName.slice(1, -1));
        }
        else if (toolSchemaName.endsWith("*")) {
            schemaMatch = schemaName.toLowerCase().startsWith(toolSchemaName.slice(0, -1));
        }
        else if (toolSchemaName.startsWith("*")) {
            schemaMatch = schemaName.toLowerCase().endsWith(toolSchemaName.slice(1));
        }
        else {
            schemaMatch = schemaName.toLowerCase() === toolSchemaName;
        }

        if (schemaMatch) {
            // if the schema matches, we can check the entity name, otherwise we don't bother since we don't care about the entity name
            if (toolEntityName === "*") {
                entityMatch = true;
            }
            else if (toolEntityName.startsWith("*") && toolEntityName.endsWith("*")) {
                entityMatch = entityName.toLowerCase().includes(toolEntityName.slice(1, -1));
            }
            else if (toolEntityName.endsWith("*")) {
                entityMatch = entityName.toLowerCase().startsWith(toolEntityName.slice(0, -1));
            }
            else if (toolEntityName.startsWith("*")) {
                entityMatch = entityName.toLowerCase().endsWith(toolEntityName.slice(1));
            }
            else {
                entityMatch = entityName.toLowerCase() === toolEntityName;
            }
        }
        return schemaMatch && entityMatch;
    });
    return matchingEntities;
}

/*******************************************************************************
 * CLI UTILITIES
 ******************************************************************************/

/**
 * Lists all available tools without starting the server.
 *
 * This function is used by the `--list-tools` CLI option to display what tools
 * would be available based on the current configuration. It connects to the
 * database to discover dynamic tools (entities, agents) but does not start
 * the MCP server.
 *
 * Output is grouped by tool prefix and sorted alphabetically.
 *
 * @param filterOptions - Optional filter patterns to show a subset of tools
 *
 * @example
 * // List all tools
 * await listAvailableTools();
 *
 * @example
 * // List only Get_* tools
 * await listAvailableTools({ includePatterns: ['Get_*'] });
 */
export async function listAvailableTools(filterOptions: ToolFilterOptions = {}): Promise<void> {
    try {
        // Initialize configuration (loads .env and mj.config.cjs)
        _config = await initConfig();

        if (!_config.mcpServerSettings?.enableMCPServer) {
            console.log("MCP Server is disabled in the configuration.");
            return;
        }

        // Store filter options
        activeFilterOptions = filterOptions;
        registeredToolNames.length = 0;

        // Initialize database connection to discover dynamic tools
        const poolConfig = buildPoolConfig();
        const pool = new sql.ConnectionPool(poolConfig);
        await pool.connect();

        const sqlConfig = new SQLServerProviderConfigData(pool, _config.mjCoreSchema);
        await setupSQLServerClient(sqlConfig);

        // Register all tools (they won't actually be added to server, just tracked)
        // We need to use a dummy filter that includes everything for listing
        const listingFilterOptions = { ...filterOptions };
        activeFilterOptions = {}; // Temporarily clear filters to get all tool names

        // Add built-in tool
        registeredToolNames.push("Get_All_Entities");

        // Add agent run diagnostic tools
        registeredToolNames.push("List_Recent_Agent_Runs");
        registeredToolNames.push("Get_Agent_Run_Summary");
        registeredToolNames.push("Get_Agent_Run_Step_Detail");
        registeredToolNames.push("Get_Agent_Run_Step_Full_Data");

        // Use system user for tool discovery
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!systemUser) {
            throw new Error('System user not found in UserCache');
        }

        // Load tools to populate registeredToolNames
        await loadEntityToolsForListing(systemUser);
        await loadAgentToolsForListing(systemUser);

        // Close database connection
        await pool.close();

        // Apply filters to the list if specified
        let toolsToShow = registeredToolNames;
        if (listingFilterOptions.includePatterns || listingFilterOptions.excludePatterns) {
            activeFilterOptions = listingFilterOptions;
            toolsToShow = registeredToolNames.filter(name => shouldIncludeTool(name, listingFilterOptions));
        }

        // Sort tools alphabetically
        toolsToShow.sort();

        console.log("\n=== Available MCP Tools ===\n");

        if (listingFilterOptions.includePatterns || listingFilterOptions.excludePatterns) {
            console.log(`Showing ${toolsToShow.length} of ${registeredToolNames.length} tools (filtered)\n`);
        } else {
            console.log(`Total tools: ${toolsToShow.length}\n`);
        }

        // Group tools by prefix for better readability
        const toolGroups: Record<string, string[]> = {};
        for (const tool of toolsToShow) {
            const prefix = tool.split('_')[0];
            if (!toolGroups[prefix]) {
                toolGroups[prefix] = [];
            }
            toolGroups[prefix].push(tool);
        }

        // Print grouped tools
        for (const [prefix, tools] of Object.entries(toolGroups).sort()) {
            console.log(`--- ${prefix} ---`);
            for (const tool of tools) {
                console.log(`  ${tool}`);
            }
            console.log();
        }

        console.log("Use --include and --exclude to filter tools when starting the server.");
        console.log("Example: npx @memberjunction/ai-mcp-server --include \"Get_Users_*,Run_Agent\"");

    } catch (error) {
        console.error("Failed to list tools:", error);
    }
}

/**
 * Populates the registeredToolNames array with entity tool names for the --list-tools CLI option.
 * Does not actually register the tools with the server, just collects their names.
 *
 * @param _systemUser - System user for context (unused in this function but kept for API consistency)
 */
async function loadEntityToolsForListing(_systemUser: UserInfo): Promise<void> {
    const entityTools = _config.mcpServerSettings?.entityTools;

    if (entityTools && entityTools.length > 0) {
        const md = new Metadata();

        entityTools.forEach((tool) => {
            const matchingEntities = getMatchingEntitiesForTool(md.Entities, tool);
            matchingEntities.forEach((entity) => {
                if (tool.get) {
                    registeredToolNames.push(`Get_${entity.ClassName}_Record`);
                }
                if (tool.create) {
                    registeredToolNames.push(`Create_${entity.ClassName}_Record`);
                }
                if (tool.update) {
                    registeredToolNames.push(`Update_${entity.ClassName}_Record`);
                }
                if (tool.delete) {
                    registeredToolNames.push(`Delete_${entity.ClassName}_Record`);
                }
                if (tool.runView) {
                    registeredToolNames.push(`Run_${entity.ClassName}_View`);
                }
            });
        });
    }
}

/**
 * Populates the registeredToolNames array with agent tool names for the --list-tools CLI option.
 * Does not actually register the tools with the server, just collects their names.
 *
 * @param systemUser - System user for context when discovering agents
 */
async function loadAgentToolsForListing(systemUser: UserInfo): Promise<void> {
    const agentTools = _config.mcpServerSettings?.agentTools;

    if (agentTools && agentTools.length > 0) {
        const aiEngine = AIEngine.Instance;
        await aiEngine.Config(false, systemUser);

        const hasDiscovery = agentTools.some(tool => tool.discover);
        if (hasDiscovery) {
            registeredToolNames.push("Discover_Agents");
        }

        const hasExecute = agentTools.some(tool => tool.execute);
        if (hasExecute) {
            registeredToolNames.push("Run_Agent");
        }

        // Add specific agent execution tools
        for (const tool of agentTools) {
            const agentPattern = tool.agentName || "*";
            const agents = await discoverAgents(agentPattern, systemUser);

            for (const agent of agents) {
                if (tool.execute) {
                    registeredToolNames.push(`Execute_${(agent.Name || 'Unknown').replace(/\s+/g, '_')}_Agent`);
                }
            }
        }

        const hasStatus = agentTools.some(tool => tool.status);
        if (hasStatus) {
            registeredToolNames.push("Get_Agent_Run_Status");
        }

        const hasCancel = agentTools.some(tool => tool.cancel);
        if (hasCancel) {
            registeredToolNames.push("Cancel_Agent_Run");
        }
    }
}
