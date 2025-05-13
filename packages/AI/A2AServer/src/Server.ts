import { EntityInfo, LogError, Metadata, UserInfo } from "@memberjunction/core";
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from "@memberjunction/sqlserver-dataprovider";
import express from 'express';
import { DataSource } from "typeorm";
import { z } from "zod";
import { DataSourceOptions } from 'typeorm';
import { configInfo, dbDatabase, dbHost, dbPassword, dbPort, dbUsername, dbInstanceName, dbTrustServerCertificate, a2aServerSettings } from './config.js';
import { EntityOperations, OperationResult } from './EntityOperations.js';

// A2A Server Configuration
const a2aServerPort = a2aServerSettings?.port || 3200;

// Database Configuration
const ormConfig = {
    type: 'mssql' as const,
    entities: [],
    logging: false,
    host: dbHost,
    port: dbPort,
    username: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    synchronize: false,
    requestTimeout: configInfo.databaseSettings.requestTimeout,
    connectionTimeout: configInfo.databaseSettings.connectionTimeout,
    options: {},
};

if (dbInstanceName !== null && dbInstanceName !== undefined && dbInstanceName.trim().length > 0) {
    ormConfig.options = {
        ...ormConfig.options,
        instanceName: dbInstanceName,
    };
}

if (dbTrustServerCertificate !== null && dbTrustServerCertificate !== undefined) {
    ormConfig.options = {
        ...ormConfig.options,
        trustServerCertificate: dbTrustServerCertificate === 'Y',
    };
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
    };
}

// In-memory storage for tasks (in production, this would use a database)
const tasks = new Map<string, Task>();

// Express application
const app = express();
app.use(express.json());

// Initialize A2A server
export async function initializeA2AServer() {
    try {
        if (!a2aServerSettings?.enableA2AServer) {
            console.log("A2A Server is disabled in the configuration.");
            throw new Error("A2A Server is disabled in the configuration.");
        }

        // Initialize database connection
        const dataSource = new DataSource(ormConfig);
        await dataSource.initialize();
        
        // Setup SQL Server client
        const config = new SQLServerProviderConfigData(dataSource, '', configInfo.mjCoreSchema);
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
    // Agent Card endpoint
    app.get('/a2a/agent-card', (req, res) => {
        const agentCard = generateAgentCard();
        res.json(agentCard);
    });

    // Send a message to a task
    app.post('/a2a/tasks/send', (req, res) => {
        const result = handleTaskSend(req.body);
        res.json(result);
    });

    // Send a message to a task with streaming response
    app.post('/a2a/tasks/sendSubscribe', (req, res) => {
        if (!a2aServerSettings?.streamingEnabled) {
            return res.status(400).json({
                error: {
                    code: 400,
                    message: "Streaming is not enabled for this agent"
                }
            });
        }

        // Set up SSE connection
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        handleTaskSendSubscribe(req.body, res);
    });

    // Get a task's status
    app.get('/a2a/tasks/:taskId', (req, res) => {
        const { taskId } = req.params;
        const task = tasks.get(taskId);
        
        if (!task) {
            return res.status(404).json({
                error: {
                    code: 404,
                    message: `Task with ID ${taskId} not found`
                }
            });
        }
        
        res.json(task);
    });

    // Cancel a task
    app.post('/a2a/tasks/:taskId/cancel', (req, res) => {
        const { taskId } = req.params;
        const task = tasks.get(taskId);
        
        if (!task) {
            return res.status(404).json({
                error: {
                    code: 404,
                    message: `Task with ID ${taskId} not found`
                }
            });
        }
        
        task.status = 'cancelled';
        task.updated = new Date();
        
        res.json({ success: true });
    });
}

function generateAgentCard(): AgentCard {
    const contextUser = UserCache.Instance.Users[0];
    const md = new Metadata();
    const entityCapabilities = getEntityCapabilities(md.Entities, contextUser);

    return {
        name: a2aServerSettings?.agentName || "MemberJunction",
        description: a2aServerSettings?.agentDescription || "MemberJunction A2A Agent",
        version: "1.0.0",
        endpoints: {
            tasks: `/a2a/tasks`,
            agentCard: `/a2a/agent-card`
        },
        capabilities: {
            streaming: !!a2aServerSettings?.streamingEnabled,
            asynchronous: false,
            multimedia: false,
            entities: entityCapabilities
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

function handleTaskSend(requestBody: any) {
    const { taskId, message } = requestBody;
    
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
        
        // Process the task asynchronously
        processTask(task);
        
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
        
        // Process the updated task
        processTask(task);
        
        return {
            taskId: task.id,
            status: task.status
        };
    }
}

function handleTaskSendSubscribe(requestBody: any, res: any) {
    const result = handleTaskSend(requestBody);
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
async function processTask(task: Task) {
    try {
        task.status = 'in_progress';
        task.updated = new Date();

        // Get the last user message
        const lastMessage = task.messages.filter(m => m.role === 'user').pop();

        if (!lastMessage) {
            throw new Error("No user message found");
        }

        // Initialize entity operations
        const entityOps = new EntityOperations();

        // Extract text content and parse operation
        const textParts = lastMessage.parts.filter(p => p.type === 'text');
        const textContent = textParts.map(p => typeof p.content === 'string' ? p.content : JSON.stringify(p.content)).join(" ");

        // Extract structured data if any
        const dataParts = lastMessage.parts.filter(p => p.type === 'data');
        const dataContent = dataParts.length > 0 ? dataParts[0].content : null;

        // Parse the command and parameters
        let operation = 'unknown';
        let entityName = '';
        let parameters: any = {};

        // Try to extract command and parameters from structured data first
        if (dataContent && typeof dataContent === 'object') {
            operation = (dataContent as any).operation || 'unknown';
            entityName = (dataContent as any).entity || '';
            parameters = (dataContent as any).parameters || {};
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
            if (!entityName) {
                throw new Error("Entity name not specified");
            }

            operationResult = await entityOps.processOperation(operation, entityName, parameters);
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