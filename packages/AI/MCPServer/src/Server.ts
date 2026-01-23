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

import { BaseEntity, CompositeKey, EntityFieldInfo, EntityInfo, Metadata, RunView, UserInfo } from "@memberjunction/core";
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from "@memberjunction/sqlserver-dataprovider";
import { FastMCP } from "fastmcp";
import sql from "mssql";
import { z } from "zod";
import { initConfig, ConfigInfo } from './config.js';
import { AgentRunner } from "@memberjunction/ai-agents";
import { AIAgentEntityExtended, AIAgentRunEntityExtended, AIAgentRunStepEntityExtended } from "@memberjunction/ai-core-plus";
import * as fs from 'fs/promises';
import * as path from 'path';
import { AIEngine } from "@memberjunction/aiengine";
import { ChatMessage } from "@memberjunction/ai";
import { CredentialEngine } from "@memberjunction/credentials";
import { EncryptionEngine } from "@memberjunction/encryption";
import * as http from 'http';

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
 * Extends Record<string, unknown> to satisfy FastMCP's generic constraint.
 */
interface MCPSessionContext extends Record<string, unknown> {
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

/** FastMCP server instance - initialized in initializeServer() */
let server: FastMCP<MCPSessionContext>;

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
function extractAPIKeyFromRequest(request: http.IncomingMessage): string | null {
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
function extractRequestContext(request: http.IncomingMessage): {
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
    } else {
        ipAddress = request.socket?.remoteAddress || null;
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
 * This function is called by FastMCP for each incoming connection.
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
async function authenticateRequest(request: http.IncomingMessage): Promise<MCPSessionContext> {
    const apiKey = extractAPIKeyFromRequest(request);

    console.log(`[Auth] API key found: ${apiKey ? 'yes' : 'no'}`);

    // Backward compatibility: if no API key but systemApiKey configured, use system user
    if (!apiKey && _config.mcpServerSettings?.systemApiKey) {
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!systemUser) {
            throw new Error('System user not found in UserCache');
        }
        console.log(`Authenticated via system API key for user: ${systemUser?.Email}`);
        return { apiKey: 'system', apiKeyId: 'system', user: systemUser };
    }

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

        console.log(`✅ Authenticated via API key for user: ${validation.user?.Email}`);
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
 * Registers a tool with the MCP server, applying the active filter options.
 *
 * This wrapper:
 * 1. Always adds the tool name to registeredToolNames for --list-tools
 * 2. Only registers the tool with the server if it passes the active filters
 *
 * @param toolConfig - The FastMCP tool configuration object
 */
function addToolWithFilter(toolConfig: Parameters<typeof server.addTool>[0]): void {
    const toolName = toolConfig.name;

    // Always track the tool name for --list-tools
    registeredToolNames.push(toolName);

    // Check if tool should be included based on active filters
    if (!shouldIncludeTool(toolName, activeFilterOptions)) {
        return; // Skip this tool
    }

    server.addTool(toolConfig);
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
 * SERVER INITIALIZATION
 ******************************************************************************/

/**
 * Initializes and starts the MemberJunction MCP server.
 *
 * This function performs the following setup:
 * 1. Establishes database connection using configured credentials
 * 2. Sets up SQL Server client and MemberJunction metadata
 * 3. Loads API keys into the CredentialEngine cache for fast validation
 * 4. Registers all configured tools (entities, agents, actions)
 * 5. Starts the FastMCP server with SSE transport
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

        // Store filter options for use by addToolWithFilter
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

        // Create FastMCP server with API key authentication
        server = new FastMCP<MCPSessionContext>({
            name: "MemberJunction",
            version: "1.0.0",
            authenticate: authenticateRequest
        });

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

        // Register tools
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
        await loadEntityTools();
        await loadActionTools(systemUser);
        await loadAgentTools(systemUser);
        loadAgentRunDiagnosticTools();
        console.log("Tools loaded successfully.");

        // Configure server options with API key authentication
        const serverOptions = {
            transportType: "sse" as const,
            sse: {
                endpoint: "/mcp" as `/${string}`,
                port: mcpServerPort
            }
        };

        // Start server with SSE transport
        server.start(serverOptions);

        console.log(`MemberJunction MCP Server running on port ${mcpServerPort}`);
        console.log(`Server endpoint available at: http://localhost:${mcpServerPort}/mcp`);
    } catch (error) {
        console.error("Failed to initialize MCP server:", error);
    }
}

/*******************************************************************************
 * TOOL LOADERS
 ******************************************************************************/

/**
 * Loads action tools from configuration.
 * Note: Action tools are not yet implemented - this function logs a warning if any are configured.
 *
 * @param _systemUser - System user for context (reserved for future use)
 */
async function loadActionTools(_systemUser: UserInfo): Promise<void> {
    const actionTools = _config.mcpServerSettings?.actionTools;
    if (actionTools && actionTools.length > 0) {
        console.warn("Action tools are not yet supported");
    }
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
 * @param systemUser - System user for context when discovering and configuring agents
 */
async function loadAgentTools(systemUser: UserInfo): Promise<void> {
    const agentTools = _config.mcpServerSettings?.agentTools;
    
    if (agentTools && agentTools.length > 0) {
        // Ensure AIEngine is configured
        const aiEngine = AIEngine.Instance;
        await aiEngine.Config(false, systemUser);
        
        // Add discovery tool if any agent tool has discover enabled
        const hasDiscovery = agentTools.some(tool => tool.discover);
        if (hasDiscovery) {
            addToolWithFilter({
                name: "Discover_Agents",
                description: "List available AI agents based on a name pattern (* for all agents)",
                parameters: z.object({
                    pattern: z.string().describe("Name pattern to match agents (supports wildcards: *, *Agent, Agent*, *Agent*)")
                }),
                // async execute(props: any) {
                //     const agents = await discoverAgents(props.pattern, contextUser);
                async execute(props: any, context: any) {
                    const sessionUser = context.session?.user;
                    if (!sessionUser) {
                        return JSON.stringify({ error: "No authenticated user in session" });
                    }
                    const agents = await discoverAgents(props.pattern, sessionUser);
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
                    data: z.record(z.any()).optional().describe("Template data for the agent"),
                    waitForCompletion: z.boolean().optional().default(true).describe("Wait for agent to complete before returning")
                }),
                async execute(props: any, context: any) {
                    const sessionUser = context.session?.user;
                    if (!sessionUser) {
                        return JSON.stringify({ success: false, error: "No authenticated user in session" });
                    }
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
                            agent = aiEngine.Agents.find(a => a.Name?.toLowerCase() === props.agentName.toLowerCase()) || null;
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
                        const messages: ChatMessage[] = props.conversationHistory?.map((msg: any) => ({
                            role: msg.role,
                            content: msg.content
                        })) || [];
                        
                        // Execute the agent
                        const agentRunner = new AgentRunner();
                        const result = await agentRunner.RunAgent({
                            agent,
                            conversationMessages: messages,
                            contextUser: sessionUser,
                            data: props.data
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
                    addAgentExecuteTool(agent);
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
                async execute(props: any, context: any) {
                    const sessionUser = context.session?.user;
                    if (!sessionUser) {
                        return JSON.stringify({ error: "No authenticated user in session" });
                    }
                    const md = new Metadata();
                    const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', sessionUser);
                    const loaded = await agentRun.Load(props.runId);

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
                async execute(props: any, context: any) {
                    const sessionUser = context.session?.user;
                    if (!sessionUser) {
                        return JSON.stringify({ success: false, message: "No authenticated user in session" });
                    }
                    // Note: Actual cancellation would require the agent to check the cancellation token
                    // For now, we can update the status to indicate cancellation was requested
                    const md = new Metadata();
                    const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', sessionUser);
                    const loaded = await agentRun.Load(props.runId);

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
 */
function loadAgentRunDiagnosticTools(): void {
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
        async execute(props: any, context: any) {
            const sessionUser = context.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ error: "No authenticated user in session" });
            }
            const rv = new RunView();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - props.days);
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
                MaxRows: props.limit,
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
        async execute(props: any, context: any) {
            const sessionUser = context.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ error: "No authenticated user in session" });
            }
            const md = new Metadata();
            const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', sessionUser);
            const loaded = await agentRun.Load(props.runId);

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
        async execute(props: any, context: any) {
            const sessionUser = context.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ error: "No authenticated user in session" });
            }
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
            if (props.stepNumber < 1 || props.stepNumber > steps.length) {
                return JSON.stringify({ error: `Invalid step number. Run has ${steps.length} steps.` });
            }

            const step = steps[props.stepNumber - 1];
            const inputData = truncateText(step.InputData, props.maxChars);
            const outputData = truncateText(step.OutputData, props.maxChars);

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
        async execute(props: any, context: any) {
            const sessionUser = context.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ error: "No authenticated user in session" });
            }
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
            if (props.stepNumber < 1 || props.stepNumber > steps.length) {
                return JSON.stringify({ error: `Invalid step number. Run has ${steps.length} steps.` });
            }

            const step = steps[props.stepNumber - 1];
            const stepData = step.GetAll();

            // Determine output file path
            const runIdShort = props.runId.substring(0, 8);
            const defaultFile = `./agent-run-${runIdShort}-step-${props.stepNumber}.json`;
            const filePath = path.resolve(process.cwd(), props.outputFile || defaultFile);

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
 * @param agent - The agent entity to create an execution tool for
 */
function addAgentExecuteTool(agent: AIAgentEntityExtended): void {
    const agentRunner = new AgentRunner();

    addToolWithFilter({
        name: `Execute_${(agent.Name || 'Unknown').replace(/\s+/g, '_')}_Agent`,
        description: `Execute the ${agent.Name || 'Unknown'} agent. ${agent.Description || ''}`,
        parameters: z.object({
            conversationHistory: z.array(z.object({
                role: z.enum(['user', 'assistant', 'system']),
                content: z.string()
            })).optional().describe("Conversation history for context"),
            data: z.record(z.any()).optional().describe("Template data for the agent"),
            waitForCompletion: z.boolean().optional().default(true).describe("Wait for agent to complete before returning")
        }),
        async execute(props: any, context: any) {
            const sessionUser = context.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ success: false, error: "No authenticated user in session" });
            }
            try {
                // Convert conversation history to ChatMessage format
                const messages: ChatMessage[] = props.conversationHistory?.map((msg: any) => ({
                    role: msg.role,
                    content: msg.content
                })) || [];

                // Execute the agent
                const result = await agentRunner.RunAgent({
                    agent,
                    conversationMessages: messages,
                    contextUser: sessionUser,
                    data: props.data
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
 */
async function loadEntityTools(): Promise<void> {
    const entityTools = _config.mcpServerSettings?.entityTools;

    if (entityTools && entityTools.length > 0) {
        const md = new Metadata();

        // Iterate through the tools and add them to the server
        entityTools.forEach((tool) => {
            const matchingEntities = getMatchingEntitiesForTool(md.Entities, tool);
            matchingEntities.forEach((entity) => {
                if (tool.get) {
                    addEntityGetTool(entity);
                }
                if (tool.create) {
                    addEntityCreateTool(entity);
                }
                if (tool.update) {
                    addEntityUpdateTool(entity);
                }
                if (tool.delete) {
                    addEntityDeleteTool(entity);
                }
                if (tool.runView) {
                    addEntityRunViewTool(entity);
                }
            });
        });
    }
}

/**
 * Creates a RunView tool for querying entity records.
 * Allows filtering, sorting, and field selection.
 *
 * @param entity - The entity to create the tool for
 */
function addEntityRunViewTool(entity: EntityInfo): void {
    const paramObject = z.object({
        extraFilter: z.string().optional(),
        orderBy: z.string().optional(),
        fields: z.array(z.string()).optional(),
    })
    const toolConfig = {
        name: `Run_${entity.ClassName}_View`,
        description: `Returns data from the ${entity.Name} entity, optionally filtered by extraFilter and ordered by orderBy`,
        parameters: paramObject,
        async execute (props: any, context: any) {
            const sessionUser = context.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ error: "No authenticated user in session" });
            }
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: entity.Name,
                ExtraFilter: props.extraFilter ? props.extraFilter : undefined,
                OrderBy: props.orderBy ? props.orderBy : undefined,
                Fields: props.fields ? props.fields : undefined,
            }, sessionUser);
            return JSON.stringify(result);
        }
    };
    addToolWithFilter(toolConfig);
}

/**
 * Creates a tool for creating new records in an entity.
 * Parameters are generated from the entity's non-readonly fields.
 *
 * @param entity - The entity to create the tool for
 */
function addEntityCreateTool(entity: EntityInfo): void {
    const paramObject = getEntityParamObject(entity, true, false, false);

    const toolConfig = {
        name: `Create_${entity.ClassName}_Record`,
        description: `Creates a new record in the ${entity.Name} entity`,
        parameters: z.object(paramObject),
        async execute (props: any, context: any) {
            const sessionUser = context.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ success: false, record: undefined, errorMessage: "No authenticated user in session" });
            }
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
    };
    addToolWithFilter(toolConfig);
}

/**
 * Creates a tool for updating existing records in an entity.
 * Requires primary key fields to identify the record, plus optional fields to update.
 *
 * @param entity - The entity to create the tool for
 */
function addEntityUpdateTool(entity: EntityInfo): void {
    const paramObject = getEntityParamObject(entity, true, true, true);

    const toolConfig = {
        name: `Update_${entity.ClassName}_Record`,
        description: `Updates the specified record in the ${entity.Name} entity`,
        parameters: z.object(paramObject),
        async execute (props: any, context: any) {
            const sessionUser = context.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ success: false, record: undefined, errorMessage: "No authenticated user in session" });
            }
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
    };
    addToolWithFilter(toolConfig);
}

/**
 * Creates a tool for deleting records from an entity.
 * Only requires the primary key field(s) to identify the record.
 *
 * @param entity - The entity to create the tool for
 */
function addEntityDeleteTool(entity: EntityInfo): void {
    const pkeyParams = getEntityPrimaryKeyParamsObject(entity);
    const toolConfig = {
        name: `Delete_${entity.ClassName}_Record`,
        description: `Deletes the specified record from the ${entity.Name} entity`,
        parameters: z.object(pkeyParams),
        async execute (props: any, context: any) {
            const sessionUser = context.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ success: false, record: undefined, errorMessage: "No authenticated user in session" });
            }
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
    };
    addToolWithFilter(toolConfig);
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
 * @param entity - The entity to create the tool for
 */
function addEntityGetTool(entity: EntityInfo): void {
    const pkeyParams = getEntityPrimaryKeyParamsObject(entity);

    const toolConfig = {
        name: `Get_${entity.ClassName}_Record`,
        description: `Retrieves the specified record from the ${entity.Name} entity`,
        parameters: z.object(pkeyParams),
        async execute (props: unknown, context: unknown) {
            const ctx = context as { session?: MCPSessionContext };
            const sessionUser = ctx.session?.user;
            if (!sessionUser) {
                return JSON.stringify({ error: "No authenticated user in session" });
            }
            const p = props as Record<string, unknown>;
            const md = new Metadata();
            const record = await md.GetEntityObject(entity.Name, sessionUser);
            await record.InnerLoad(new CompositeKey(
                entity.PrimaryKeys.map((pk) => ({
                    FieldName: pk.Name,
                    Value: p[pk.Name]
                }))
            ));
            return await convertEntityObjectToJSON(record);
        }
    };
    addToolWithFilter(toolConfig);
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