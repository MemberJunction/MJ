import { Metadata, RunView, UserInfo } from "@memberjunction/core";
import { setupSQLServerClient, SQLServerProviderConfigData } from "@memberjunction/sqlserver-dataprovider";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import sql from "mssql";
import { configInfo, dbDatabase, dbHost, dbPassword, dbPort, dbUsername, dbInstanceName, dbTrustServerCertificate } from './config.js';
import { AIAgentRunEntity, AIAgentRunStepEntity } from "@memberjunction/core-entities";

// Prepare mssql configuration
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

// Create MCP server instance
const server = new Server({
    name: "MemberJunction Agent Run Tools",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
});

/**
 * Truncate large text content for MCP responses
 */
function truncateText(text: string, maxChars: number): { value: string; truncated: boolean } {
    if (!text || text.length <= maxChars) {
        return { value: text || '', truncated: false };
    }

    const firstPart = Math.floor(maxChars * 0.7);
    const lastPart = Math.floor(maxChars * 0.3);
    const truncatedCount = text.length - maxChars;

    return {
        value: `${text.substring(0, firstPart)}\n\n[... ${truncatedCount} characters truncated ...]\n\n${text.substring(text.length - lastPart)}`,
        truncated: true
    };
}

// Tool definitions
const tools = [
    {
        name: "List_Recent_Agent_Runs",
        description: "List recent AI agent runs with optional filtering. Fast query that returns basic run information.",
        inputSchema: {
            type: "object",
            properties: {
                agentName: { type: "string", description: "Filter by agent name (partial match)" },
                status: { type: "string", enum: ['Success', 'Failed', 'Running', 'Cancelled', 'all'], default: 'all', description: "Filter by run status" },
                days: { type: "number", default: 7, description: "Number of days to look back (default: 7)" },
                limit: { type: "number", default: 10, description: "Maximum number of runs to return (default: 10)" }
            }
        }
    },
    {
        name: "Get_Agent_Run_Summary",
        description: "Get comprehensive summary of an agent run. Loads step metadata WITHOUT input/output data for fast performance. Use Get_Agent_Run_Step_Detail to drill into specific steps.",
        inputSchema: {
            type: "object",
            properties: {
                runId: { type: "string", description: "The agent run ID to summarize" }
            },
            required: ["runId"]
        }
    },
    {
        name: "Get_Agent_Run_Step_Detail",
        description: "Get detailed information about a specific step including input/output data. Data is automatically truncated to prevent timeouts.",
        inputSchema: {
            type: "object",
            properties: {
                runId: { type: "string", description: "The agent run ID" },
                stepNumber: { type: "number", description: "The step number to retrieve (1-based index)" },
                maxChars: { type: "number", default: 5000, description: "Maximum characters for I/O data (default: 5000, use 0 for no truncation)" }
            },
            required: ["runId", "stepNumber"]
        }
    },
    {
        name: "Get_Agent_Run_Step_Full_Data",
        description: "Get complete untruncated step data. Optionally write to file for large data.",
        inputSchema: {
            type: "object",
            properties: {
                runId: { type: "string", description: "The agent run ID" },
                stepNumber: { type: "number", description: "The step number to retrieve (1-based index)" },
                outputFile: { type: "string", description: "Optional: File path to write JSON output" }
            },
            required: ["runId", "stepNumber"]
        }
    }
];

let contextUser: UserInfo;

// Handle tool execution
async function handleToolCall(name: string, args: any) {
    try {
        switch (name) {
            case "List_Recent_Agent_Runs": {
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - (args.days || 7));

                let filter = `StartedAt >= '${startDate.toISOString()}' AND StartedAt <= '${endDate.toISOString()}'`;

                if (args.agentName) {
                    filter += ` AND Agent LIKE '%${args.agentName.replace(/'/g, "''")}%'`;
                }

                if (args.status && args.status !== 'all') {
                    filter += ` AND Status = '${args.status}'`;
                }

                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: filter,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: args.limit || 10,
                    Fields: ['ID', 'AgentID', 'Agent', 'Status', 'StartedAt', 'CompletedAt', 'TotalTokensUsed', 'TotalCost', 'ErrorMessage']
                }, contextUser);

                if (!result.Success) {
                    return { error: result.ErrorMessage };
                }

                return result.Results || [];
            }

            case "Get_Agent_Run_Summary": {
                const md = new Metadata();
                const runEntity = await md.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', contextUser);
                const loaded = await runEntity.Load(args.runId);

                if (!loaded) {
                    return { error: `Agent run not found: ${args.runId}` };
                }

                const rv = new RunView();
                const stepsResult = await rv.RunView({
                    EntityName: 'MJ: AI Agent Run Steps',
                    ExtraFilter: `AgentRunID = '${args.runId}'`,
                    OrderBy: 'StepNumber',
                    Fields: ['ID', 'StepNumber', 'StepName', 'StepType', 'Status', 'StartedAt', 'CompletedAt', 'ErrorMessage']
                }, contextUser);

                if (!stepsResult.Success) {
                    return { error: stepsResult.ErrorMessage };
                }

                const steps = stepsResult.Results || [];
                const runData = runEntity.GetAll();

                const duration = runData.StartedAt && runData.CompletedAt
                    ? new Date(runData.CompletedAt).getTime() - new Date(runData.StartedAt).getTime()
                    : 0;

                const errorSteps = steps.filter((s: any) => s.Status === 'Failed' || s.ErrorMessage);
                const firstError = errorSteps.length > 0 ? errorSteps[0] : undefined;

                return {
                    runId: runData.ID,
                    agentName: runData.Agent,
                    agentId: runData.AgentID,
                    status: runData.Status,
                    startedAt: runData.StartedAt?.toISOString(),
                    completedAt: runData.CompletedAt?.toISOString(),
                    duration,
                    totalTokens: runData.TotalTokensUsed || 0,
                    totalCost: runData.TotalCost || 0,
                    stepCount: steps.length,
                    hasErrors: errorSteps.length > 0,
                    errorCount: errorSteps.length,
                    steps: steps.map((step: any, index: number) => {
                        const stepDuration = step.StartedAt && step.CompletedAt
                            ? new Date(step.CompletedAt).getTime() - new Date(step.StartedAt).getTime()
                            : 0;

                        return {
                            stepNumber: index + 1,
                            stepId: step.ID,
                            stepName: step.StepName || `Step ${index + 1}`,
                            stepType: step.StepType || 'Unknown',
                            status: step.Status || 'Unknown',
                            duration: stepDuration,
                            errorMessage: step.ErrorMessage || undefined
                        };
                    }),
                    firstError: firstError ? {
                        stepNumber: steps.indexOf(firstError) + 1,
                        stepName: firstError.StepName || 'Unknown',
                        message: firstError.ErrorMessage || 'No error message'
                    } : undefined
                };
            }

            case "Get_Agent_Run_Step_Detail": {
                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: 'MJ: AI Agent Run Steps',
                    ExtraFilter: `AgentRunID = '${args.runId}'`,
                    OrderBy: 'StepNumber'
                }, contextUser);

                if (!result.Success) {
                    return { error: result.ErrorMessage };
                }

                const steps = result.Results || [];
                if (args.stepNumber < 1 || args.stepNumber > steps.length) {
                    return {
                        error: `Invalid step number: ${args.stepNumber} (run has ${steps.length} steps)`
                    };
                }

                const step = steps[args.stepNumber - 1];
                const stepData = typeof step.GetAll === 'function' ? step.GetAll() : step;

                const duration = stepData.StartedAt && stepData.CompletedAt
                    ? new Date(stepData.CompletedAt).getTime() - new Date(stepData.StartedAt).getTime()
                    : 0;

                const maxChars = args.maxChars || 5000;
                const inputTruncated = maxChars > 0 ? truncateText(stepData.InputData || '{}', maxChars) : { value: stepData.InputData || '{}', truncated: false };
                const outputTruncated = maxChars > 0 ? truncateText(stepData.OutputData || '{}', maxChars) : { value: stepData.OutputData || '{}', truncated: false };

                return {
                    stepNumber: args.stepNumber,
                    stepId: stepData.ID,
                    stepName: stepData.StepName,
                    stepType: stepData.StepType,
                    status: stepData.Status,
                    startedAt: stepData.StartedAt?.toISOString(),
                    completedAt: stepData.CompletedAt?.toISOString(),
                    duration,
                    input: {
                        data: inputTruncated.value,
                        truncated: inputTruncated.truncated,
                        originalLength: (stepData.InputData || '').length
                    },
                    output: {
                        data: outputTruncated.value,
                        truncated: outputTruncated.truncated,
                        originalLength: (stepData.OutputData || '').length
                    },
                    errorMessage: stepData.ErrorMessage || undefined
                };
            }

            case "Get_Agent_Run_Step_Full_Data": {
                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: 'MJ: AI Agent Run Steps',
                    ExtraFilter: `AgentRunID = '${args.runId}'`,
                    OrderBy: 'StepNumber'
                }, contextUser);

                if (!result.Success) {
                    return { error: result.ErrorMessage };
                }

                const steps = result.Results || [];
                if (args.stepNumber < 1 || args.stepNumber > steps.length) {
                    return {
                        error: `Invalid step number: ${args.stepNumber} (run has ${steps.length} steps)`
                    };
                }

                const step = steps[args.stepNumber - 1];
                const stepData = typeof step.GetAll === 'function' ? step.GetAll() : step;
                const dataSize = JSON.stringify(stepData).length;

                const runIdShort = args.runId.substring(0, 8);
                const defaultFileName = `./agent-run-${runIdShort}-step-${args.stepNumber}.json`;
                const outputPath = args.outputFile || defaultFileName;

                const fs = await import('fs/promises');
                const path = await import('path');
                const absolutePath = path.resolve(outputPath);
                await fs.writeFile(absolutePath, JSON.stringify(stepData, null, 2), 'utf-8');

                const response = {
                    success: true,
                    message: `Full step data written to file`,
                    filePath: absolutePath,
                    fileSize: dataSize,
                    stepSummary: {
                        stepNumber: args.stepNumber,
                        stepName: stepData.StepName,
                        status: stepData.Status,
                        inputLength: (stepData.InputData || '').length,
                        outputLength: (stepData.OutputData || '').length
                    }
                };

                if (dataSize < 10000) {
                    return {
                        ...response,
                        inlineData: stepData,
                        note: "Data included inline (file also saved)"
                    };
                }

                return response;
            }

            default:
                return { error: `Unknown tool: ${name}` };
        }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

// Initialize database and setup server
async function initializeServer() {
    try {
        // Initialize database connection
        const pool = new sql.ConnectionPool(poolConfig);
        await pool.connect();

        // Setup SQL Server client
        const config = new SQLServerProviderConfigData(pool, configInfo.mjCoreSchema);
        await setupSQLServerClient(config);

        // Load the context user for database operations
        contextUser = UserCache.Instance.Users[0];
        if (!contextUser) {
            throw new Error(`No users found in UserCache`);
        }

        // Set up tool handlers
        server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools
        }));

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const result = await handleToolCall(request.params.name, request.params.arguments || {});
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }]
            };
        });

        // Connect via stdio transport
        const transport = new StdioServerTransport();
        await server.connect(transport);
    } catch (error) {
        console.error("Failed to initialize server:", error);
        process.exit(1);
    }
}

// Run the server
initializeServer();
