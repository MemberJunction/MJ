import { EntityInfo, LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from "@memberjunction/sqlserver-dataprovider";
import { GetAPIKeyEngine } from "@memberjunction/api-keys";
import express, { Request, Response, NextFunction } from 'express';
import * as sql from 'mssql';
import { z } from "zod";
import { configInfo, dbDatabase, dbHost, dbPassword, dbPort, dbUsername, dbInstanceName, dbTrustServerCertificate, a2aServerSettings } from './config.js';
import { EntityOperations, OperationResult } from './EntityOperations.js';
import { AgentOperations } from './AgentOperations.js';
import { AIEngine } from "@memberjunction/aiengine";
import { AIAgentEntityExtended } from "@memberjunction/ai-core-plus";

// A2A Server Configuration
const a2aServerPort = a2aServerSettings?.port || 3200;

// Database Configuration
const poolConfig: sql.config = {
    server: dbHost,
    port: dbPort,
    user: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    requestTimeout: configInfo.databaseSettings.requestTimeout,
    connectionTimeout: configInfo.databaseSettings.connectionTimeout,
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: dbTrustServerCertificate === 'Y'
    },
};

if (dbInstanceName !== null && dbInstanceName !== undefined && dbInstanceName.trim().length > 0) {
    poolConfig.options!.instanceName = dbInstanceName;
}

// A2A Server Classes and Types
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

interface Task {
    id: string;
    status: TaskStatus;
    messages: Message[];
    artifacts: Artifact[];
    created: Date;
    updated: Date;
}

interface Message {
    id: string;
    taskId: string;
    role: 'user' | 'agent';
    parts: Part[];
    created: Date;
}

interface Part {
    id: string;
    type: 'text' | 'file' | 'data';
    content: string | object;
    metadata?: object;
}

interface Artifact {
    id: string;
    taskId: string;
    name: string;
    parts: Part[];
    created: Date;
}

interface AgentCard {
    name: string;
    description: string;
    version: string;
    endpoints: {
        tasks: string;
        agentCard: string;
    };
    authentication?: {
        type: string;
        scheme: string;
    };
    capabilities: {
        streaming: boolean;
        asynchronous: boolean;
        multimedia: boolean;
        entities: {
            name: string;
            schema: string;
            operations: string[];
        }[];
        agents?: {
            name: string;
            operations: string[];
        }[];
    };
}

// In-memory storage for tasks (in production, this would use a database)
const tasks = new Map<string, Task>();

// Express application
const app = express();
app.use(express.json());

/**
 * Extract request context from an Express request for API key logging.
 */
function extractRequestContext(req: Request): {
    endpoint: string;
    method: string;
    ipAddress: string | null;
    userAgent: string | null;
} {
    return {
        endpoint: req.path || req.url || '/a2a',
        method: req.method || 'POST',
        ipAddress: req.ip || req.socket?.remoteAddress || null,
        userAgent: req.headers['user-agent'] as string || null,
    };
}

/**
 * Authorization context for task processing
 */
interface AuthorizationContext {
    apiKeyHash: string;
    user: UserInfo;
}

/**
 * Authorize an operation against the API key's scope permissions.
 * Uses the two-level scope evaluation (application ceiling + key scopes).
 *
 * @param authContext - The authorization context with API key hash and user
 * @param scopePath - The scope path (e.g., 'action:execute', 'agent:execute')
 * @param resource - The specific resource being accessed
 * @returns Object with allowed flag and error message if denied
 */
async function authorizeOperation(
    authContext: AuthorizationContext,
    scopePath: string,
    resource: string
): Promise<{ allowed: boolean; error?: string }> {
    const systemUser = UserCache.Instance.Users[0];
    if (!systemUser) {
        return { allowed: false, error: 'System user not available for authorization' };
    }

    try {
        const apiKeyEngine = GetAPIKeyEngine();
        const result = await apiKeyEngine.Authorize(
            authContext.apiKeyHash,
            'A2AServer',
            scopePath,
            resource,
            systemUser,
            {
                endpoint: '/a2a/tasks',
                method: 'POST',
                operation: scopePath,
            }
        );

        if (!result.Allowed) {
            LogStatus(`A2A Server: Authorization denied - ${result.Reason}`);
            return { allowed: false, error: result.Reason };
        }

        return { allowed: true };
    } catch (error) {
        LogError('A2A Server: Authorization error', undefined, error);
        return { allowed: false, error: error instanceof Error ? error.message : 'Authorization failed' };
    }
}

/**
 * Authentication middleware for A2A endpoints.
 * Validates MJ API keys (X-API-Key header with mj_sk_* format).
 */
async function authenticateRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
        res.status(401).json({
            error: {
                code: 401,
                message: 'Missing API key. Provide X-API-Key header with a valid MJ API key.'
            }
        });
        return;
    }

    try {
        // Get system user for validation context
        const systemUser = UserCache.Instance.Users[0];
        if (!systemUser) {
            LogError('A2A Server: No system user available for API key validation');
            res.status(500).json({
                error: {
                    code: 500,
                    message: 'Server configuration error'
                }
            });
            return;
        }

        const requestContext = extractRequestContext(req);

        const apiKeyEngine = GetAPIKeyEngine();
        const validationResult = await apiKeyEngine.ValidateAPIKey(
            {
                RawKey: apiKey,
                ApplicationName: 'A2AServer', // Check if key is bound to this application
                Endpoint: requestContext.endpoint,
                Method: requestContext.method,
                Operation: undefined, // Could extract from request body if available
                StatusCode: 200, // Auth succeeded if we get past validation
                ResponseTimeMs: undefined, // Not available at auth time
                IPAddress: requestContext.ipAddress ?? undefined,
                UserAgent: requestContext.userAgent ?? undefined,
            },
            systemUser
        );

        if (!validationResult.IsValid) {
            LogStatus(`A2A Server: Invalid API key attempt from ${requestContext.ipAddress}`);
            res.status(401).json({
                error: {
                    code: 401,
                    message: 'Invalid API key'
                }
            });
            return;
        }

        // Store the authenticated user on the request for use in handlers
        (req as RequestWithUser).authenticatedUser = validationResult.User!;
        (req as RequestWithUser).apiKeyId = validationResult.APIKeyId;
        (req as RequestWithUser).apiKeyHash = validationResult.APIKeyHash;

        next();
    } catch (error) {
        LogError('A2A Server: API key validation error', undefined, error);
        res.status(500).json({
            error: {
                code: 500,
                message: 'Authentication error'
            }
        });
    }
}

/**
 * Extended Request type with authenticated user information.
 */
interface RequestWithUser extends Request {
    authenticatedUser?: UserInfo;
    apiKeyId?: string;
    apiKeyHash?: string;
}

// Initialize A2A server
export async function initializeA2AServer() {
    try {
        if (!a2aServerSettings?.enableA2AServer) {
            console.log("A2A Server is disabled in the configuration.");
            throw new Error("A2A Server is disabled in the configuration.");
        }

        // Initialize database connection
        const pool = new sql.ConnectionPool(poolConfig);
        await pool.connect();
        
        // Setup SQL Server client
        const config = new SQLServerProviderConfigData(pool, configInfo.mjCoreSchema);
        await setupSQLServerClient(config);
        console.log("Database connection setup completed.");

        // Set up routes
        setupRoutes();
        
        // Start the server
        app.listen(a2aServerPort, () => {
            console.log(`MemberJunction A2A Server running on port ${a2aServerPort}`);
            console.log(`Agent card available at: http://localhost:${a2aServerPort}/a2a/agent-card`);
        });
    } catch (error) {
        console.error("Failed to initialize A2A server:", error);
    }
}

function setupRoutes() {
    // Agent Card endpoint (public - for discovery)
    app.get('/a2a/agent-card', async (req, res) => {
        const agentCard = await generateAgentCard();
        res.json(agentCard);
    });

    // Apply authentication middleware to all /a2a/tasks routes
    app.use('/a2a/tasks', authenticateRequest);

    // Send a message to a task
    app.post('/a2a/tasks/send', (req: Request, res: Response) => {
        const reqWithUser = req as RequestWithUser;
        const authContext = reqWithUser.apiKeyHash && reqWithUser.authenticatedUser
            ? { apiKeyHash: reqWithUser.apiKeyHash, user: reqWithUser.authenticatedUser }
            : undefined;
        const result = handleTaskSend(req.body, reqWithUser.authenticatedUser, authContext);
        res.json(result);
    });

    // Send a message to a task with streaming response
    app.post('/a2a/tasks/sendSubscribe', (req: Request, res: Response) => {
        if (!a2aServerSettings?.streamingEnabled) {
            res.status(400).json({
                error: {
                    code: 400,
                    message: "Streaming is not enabled for this agent"
                }
            });
            return;
        }

        // Set up SSE connection
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reqWithUser = req as RequestWithUser;
        const authContext = reqWithUser.apiKeyHash && reqWithUser.authenticatedUser
            ? { apiKeyHash: reqWithUser.apiKeyHash, user: reqWithUser.authenticatedUser }
            : undefined;
        handleTaskSendSubscribe(req.body, res, reqWithUser.authenticatedUser, authContext);
    });

    // Get a task's status
    app.get('/a2a/tasks/:taskId', (req: Request, res: Response) => {
        const taskId = req.params.taskId as string;
        const task = tasks.get(taskId);

        if (!task) {
            res.status(404).json({
                error: {
                    code: 404,
                    message: `Task with ID ${taskId} not found`
                }
            });
            return;
        }

        res.json(task);
    });

    // Cancel a task
    app.post('/a2a/tasks/:taskId/cancel', (req: Request, res: Response) => {
        const taskId = req.params.taskId as string;
        const task = tasks.get(taskId);

        if (!task) {
            res.status(404).json({
                error: {
                    code: 404,
                    message: `Task with ID ${taskId} not found`
                }
            });
            return;
        }

        task.status = 'cancelled';
        task.updated = new Date();

        res.json({ success: true });
    });
}

async function generateAgentCard(): Promise<AgentCard> {
    const contextUser = UserCache.Instance.Users[0];
    const md = new Metadata();
    const entityCapabilities = getEntityCapabilities(md.Entities, contextUser);
    const agentCapabilities = await getAgentCapabilities(contextUser);

    return {
        name: a2aServerSettings?.agentName || "MemberJunction",
        description: a2aServerSettings?.agentDescription || "MemberJunction A2A Agent",
        version: "1.0.0",
        endpoints: {
            tasks: `/a2a/tasks`,
            agentCard: `/a2a/agent-card`
        },
        authentication: {
            type: "apiKey",
            scheme: "X-API-Key"
        },
        capabilities: {
            streaming: !!a2aServerSettings?.streamingEnabled,
            asynchronous: false,
            multimedia: false,
            entities: entityCapabilities,
            agents: agentCapabilities
        }
    };
}

function getEntityCapabilities(allEntities: EntityInfo[], contextUser: UserInfo) {
    const capabilities = [];
    const entityCapabilitiesConfig = a2aServerSettings?.entityCapabilities || [];

    for (const config of entityCapabilitiesConfig) {
        const matchingEntities = getMatchingEntitiesForConfig(allEntities, config);
        
        for (const entity of matchingEntities) {
            const operations = [];
            if (config.get) operations.push('get');
            if (config.create) operations.push('create');
            if (config.update) operations.push('update');
            if (config.delete) operations.push('delete');
            if (config.runView) operations.push('query');

            if (operations.length > 0) {
                capabilities.push({
                    name: entity.Name,
                    schema: entity.SchemaName,
                    operations: operations
                });
            }
        }
    }

    return capabilities;
}

async function getAgentCapabilities(contextUser: UserInfo) {
    const capabilities = [];
    const agentCapabilitiesConfig = a2aServerSettings?.agentCapabilities || [];

    // Ensure AIEngine is configured
    const aiEngine = AIEngine.Instance;
    await aiEngine.Config(false, contextUser);

    for (const config of agentCapabilitiesConfig) {
        const agentPattern = config.agentName || "*";
        
        try {
            const allAgents = aiEngine.Agents;
            let agents: AIAgentEntityExtended[] = [];
            
            if (agentPattern === '*') {
                agents = allAgents;
            } else {
                const isWildcardPattern = agentPattern.includes('*');
                if (!isWildcardPattern) {
                    // Exact match
                    agents = allAgents.filter(a => a.Name === agentPattern);
                } else {
                    // Convert wildcard pattern to regex
                    const regexPattern = agentPattern
                        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
                        .replace(/\*/g, '.*'); // Convert * to .*
                    
                    const regex = new RegExp(`^${regexPattern}$`, 'i');
                    agents = allAgents.filter(a => a.Name && regex.test(a.Name));
                }
            }
            
            for (const agent of agents) {
                const operations = [];
                if (config.discover) operations.push('discover');
                if (config.execute) operations.push('execute');
                if (config.monitor) operations.push('monitor');
                if (config.cancel) operations.push('cancel');

                if (operations.length > 0 && agent.Name) {
                    capabilities.push({
                        name: agent.Name,
                        operations: operations
                    });
                }
            }
        } catch (error) {
            LogError('Failed to discover agents', '', error);
        }
    }

    // Add general agent operations if any capability is enabled
    const hasAnyCapability = agentCapabilitiesConfig.some(c => c.discover || c.execute || c.monitor || c.cancel);
    if (hasAnyCapability) {
        const generalOps = [];
        if (agentCapabilitiesConfig.some(c => c.discover)) generalOps.push('discoverAgents');
        if (agentCapabilitiesConfig.some(c => c.monitor)) generalOps.push('getAgentRunStatus');
        if (agentCapabilitiesConfig.some(c => c.cancel)) generalOps.push('cancelAgentRun');
        
        if (generalOps.length > 0) {
            capabilities.push({
                name: '_general',
                operations: generalOps
            });
        }
    }

    return capabilities;
}

function getMatchingEntitiesForConfig(allEntities: EntityInfo[], config: any) {
    return allEntities.filter((entity) => {
        const entityName = entity.Name.toLowerCase();
        const schemaName = entity.SchemaName.toLowerCase();
        const configEntityName = config.entityName?.trim().toLowerCase() || "*";
        const configSchemaName = config.schemaName?.trim().toLowerCase() || "*";

        let schemaMatch = false;
        let entityMatch = false;

        // Schema matching
        if (configSchemaName === "*") {
            schemaMatch = true;
        } else if (configSchemaName.startsWith("*") && configSchemaName.endsWith("*")) {
            schemaMatch = schemaName.includes(configSchemaName.slice(1, -1));
        } else if (configSchemaName.endsWith("*")) {
            schemaMatch = schemaName.startsWith(configSchemaName.slice(0, -1));
        } else if (configSchemaName.startsWith("*")) {
            schemaMatch = schemaName.endsWith(configSchemaName.slice(1));
        } else {
            schemaMatch = schemaName === configSchemaName;
        }

        // Entity matching (only checked if schema matches)
        if (schemaMatch) {
            if (configEntityName === "*") {
                entityMatch = true;
            } else if (configEntityName.startsWith("*") && configEntityName.endsWith("*")) {
                entityMatch = entityName.includes(configEntityName.slice(1, -1));
            } else if (configEntityName.endsWith("*")) {
                entityMatch = entityName.startsWith(configEntityName.slice(0, -1));
            } else if (configEntityName.startsWith("*")) {
                entityMatch = entityName.endsWith(configEntityName.slice(1));
            } else {
                entityMatch = entityName === configEntityName;
            }
        }

        return schemaMatch && entityMatch;
    });
}

function handleTaskSend(requestBody: Record<string, unknown>, authenticatedUser?: UserInfo, authContext?: AuthorizationContext) {
    const { taskId, message } = requestBody as { taskId?: string; message?: { parts?: Part[] } };

    if (!taskId) {
        // Create a new task
        const newTaskId = generateId();
        const task: Task = {
            id: newTaskId,
            status: 'pending',
            messages: [],
            artifacts: [],
            created: new Date(),
            updated: new Date()
        };

        if (message) {
            const newMessage: Message = {
                id: generateId(),
                taskId: newTaskId,
                role: 'user',
                parts: message.parts || [],
                created: new Date()
            };
            task.messages.push(newMessage);
        }

        tasks.set(newTaskId, task);

        // Process the task asynchronously with the authenticated user
        processTask(task, authenticatedUser, authContext);

        return {
            taskId: newTaskId,
            status: task.status
        };
    } else {
        // Update an existing task
        const task = tasks.get(taskId);

        if (!task) {
            throw {
                error: {
                    code: 404,
                    message: `Task with ID ${taskId} not found`
                }
            };
        }

        if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'failed') {
            throw {
                error: {
                    code: 400,
                    message: `Cannot update a task with status: ${task.status}`
                }
            };
        }

        if (message) {
            const newMessage: Message = {
                id: generateId(),
                taskId,
                role: 'user',
                parts: message.parts || [],
                created: new Date()
            };
            task.messages.push(newMessage);
            task.updated = new Date();
        }

        // Process the updated task with the authenticated user
        processTask(task, authenticatedUser, authContext);

        return {
            taskId: task.id,
            status: task.status
        };
    }
}

function handleTaskSendSubscribe(requestBody: Record<string, unknown>, res: Response, authenticatedUser?: UserInfo, authContext?: AuthorizationContext) {
    const result = handleTaskSend(requestBody, authenticatedUser, authContext);
    const task = tasks.get(result.taskId);
    
    if (!task) {
        res.write(`data: ${JSON.stringify({ error: { code: 404, message: "Task not found" } })}\n\n`);
        res.end();
        return;
    }
    
    // Send initial task state
    res.write(`data: ${JSON.stringify({ 
        taskId: task.id,
        status: task.status 
    })}\n\n`);
    
    // Set up a listener for task updates
    const updateInterval = setInterval(() => {
        const updatedTask = tasks.get(task.id);
        
        if (!updatedTask) {
            clearInterval(updateInterval);
            res.end();
            return;
        }
        
        // Send task status updates
        res.write(`data: ${JSON.stringify({ 
            taskId: updatedTask.id,
            status: updatedTask.status 
        })}\n\n`);
        
        // If task is completed, send final message and end the stream
        if (updatedTask.status === 'completed' || updatedTask.status === 'cancelled' || updatedTask.status === 'failed') {
            clearInterval(updateInterval);
            
            // Send final artifacts
            if (updatedTask.artifacts.length > 0) {
                res.write(`data: ${JSON.stringify({
                    taskId: updatedTask.id,
                    artifacts: updatedTask.artifacts
                })}\n\n`);
            }
            
            res.end();
        }
    }, 500);
    
    // Handle client disconnect
    res.on('close', () => {
        clearInterval(updateInterval);
    });
}

// Process a task using MemberJunction APIs
async function processTask(task: Task, authenticatedUser?: UserInfo, authContext?: AuthorizationContext) {
    try {
        task.status = 'in_progress';
        task.updated = new Date();

        // Get the last user message
        const lastMessage = task.messages.filter(m => m.role === 'user').pop();

        if (!lastMessage) {
            throw new Error("No user message found");
        }

        // Use authenticated user or fall back to first cached user (for backwards compatibility)
        const contextUser = authenticatedUser || UserCache.Instance.Users[0];
        if (!contextUser) {
            throw new Error("No user context available for processing task");
        }

        // Initialize operations handlers with the authenticated user
        const entityOps = new EntityOperations();
        const agentOps = new AgentOperations(contextUser);

        // Extract text content and parse operation
        const textParts = lastMessage.parts.filter(p => p.type === 'text');
        const textContent = textParts.map(p => typeof p.content === 'string' ? p.content : JSON.stringify(p.content)).join(" ");

        // Extract structured data if any
        const dataParts = lastMessage.parts.filter(p => p.type === 'data');
        const dataContent = dataParts.length > 0 ? dataParts[0].content : null;

        // Parse the command and parameters
        let operation = 'unknown';
        let entityName = '';
        let parameters: Record<string, unknown> = {};

        // Try to extract command and parameters from structured data first
        if (dataContent && typeof dataContent === 'object') {
            operation = (dataContent as Record<string, unknown>).operation as string || 'unknown';
            entityName = (dataContent as Record<string, unknown>).entity as string || '';
            parameters = (dataContent as Record<string, unknown>).parameters as Record<string, unknown> || {};
        }
        // Otherwise parse from text
        else if (textContent) {
            const parsedCommand = entityOps.parseCommandFromText(textContent);
            operation = parsedCommand.operation;
            entityName = parsedCommand.entityName;
            parameters = parsedCommand.parameters;
        }

        // Perform the operation
        let operationResult: OperationResult;

        try {
            // Check if this is an agent operation
            const agentOperations = ['discoverAgents', 'executeAgent', 'getAgentRunStatus', 'cancelAgentRun'];

            if (agentOperations.includes(operation)) {
                // Authorize agent operation if authContext is provided
                if (authContext && operation === 'executeAgent') {
                    const agentName = (parameters.agentName as string) || (parameters.agentId as string) || '*';
                    const authResult = await authorizeOperation(authContext, 'agent:execute', agentName);
                    if (!authResult.allowed) {
                        operationResult = {
                            success: false,
                            errorMessage: `Authorization denied: ${authResult.error}`
                        };
                        throw new Error(operationResult.errorMessage);
                    }
                }

                // Agent operation
                operationResult = await agentOps.processOperation(operation, parameters);
            } else {
                // Authorize entity operation if authContext is provided
                if (authContext && entityName) {
                    // Map entity operations to scopes
                    const operationScopeMap: Record<string, string> = {
                        'get': 'entity:read',
                        'create': 'entity:create',
                        'update': 'entity:update',
                        'delete': 'entity:delete',
                        'query': 'view:run',
                        'runView': 'view:run'
                    };
                    const scopePath = operationScopeMap[operation];
                    if (scopePath) {
                        const authResult = await authorizeOperation(authContext, scopePath, entityName);
                        if (!authResult.allowed) {
                            operationResult = {
                                success: false,
                                errorMessage: `Authorization denied: ${authResult.error}`
                            };
                            throw new Error(operationResult.errorMessage);
                        }
                    }
                }

                // Regular entity operation
                if (!entityName) {
                    throw new Error("Entity name not specified");
                }
                operationResult = await entityOps.processOperation(operation, entityName, parameters);
            }
        } catch (error) {
            operationResult = {
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error)
            };
        }
        
        // Create response message
        const responseMessage: Message = {
            id: generateId(),
            taskId: task.id,
            role: 'agent',
            parts: [
                {
                    id: generateId(),
                    type: 'text',
                    content: operationResult.success
                        ? `Successfully performed ${operation} operation on ${entityName}`
                        : `Failed to perform ${operation} operation on ${entityName}: ${operationResult.errorMessage}`
                }
            ],
            created: new Date()
        };

        // Create artifact with result data
        const artifact: Artifact = {
            id: generateId(),
            taskId: task.id,
            name: `${operation}_result`,
            parts: [
                {
                    id: generateId(),
                    type: 'data',
                    content: {
                        success: operationResult.success,
                        operation,
                        entity: entityName,
                        result: operationResult.result,
                        error: operationResult.success ? undefined : operationResult.errorMessage,
                        timestamp: new Date().toISOString()
                    }
                }
            ],
            created: new Date()
        };

        // Update the task
        task.messages.push(responseMessage);
        task.artifacts.push(artifact);
        task.status = 'completed';
        task.updated = new Date();

    } catch (error) {
        console.error("Error processing task:", error);

        // Create error response
        const errorMessage: Message = {
            id: generateId(),
            taskId: task.id,
            role: 'agent',
            parts: [
                {
                    id: generateId(),
                    type: 'text',
                    content: `An error occurred while processing your request: ${error instanceof Error ? error.message : String(error)}`
                }
            ],
            created: new Date()
        };

        // Create error artifact
        const errorArtifact: Artifact = {
            id: generateId(),
            taskId: task.id,
            name: 'error',
            parts: [
                {
                    id: generateId(),
                    type: 'data',
                    content: {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                        timestamp: new Date().toISOString()
                    }
                }
            ],
            created: new Date()
        };

        task.messages.push(errorMessage);
        task.artifacts.push(errorArtifact);
        task.status = 'failed';
        task.updated = new Date();
    }
}

// Utility function to generate a random ID
function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}