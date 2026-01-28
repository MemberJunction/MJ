/**
 * @fileoverview MCP GraphQL Resolver
 *
 * Provides GraphQL mutations for MCP (Model Context Protocol) operations
 * including tool synchronization with progress streaming.
 */

import { Resolver, Mutation, Arg, Ctx, Field, ObjectType, InputType, PubSub } from 'type-graphql';
import { PubSubEngine } from 'type-graphql';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { MCPClientManager, MCPSyncToolsResult, MCPToolCallResult } from '@memberjunction/ai-mcp-client';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import { GraphQLJSONObject } from 'graphql-type-json';

/**
 * Input type for syncing MCP tools
 */
@InputType()
export class SyncMCPToolsInput {
    /**
     * The ID of the MCP server connection to sync tools for
     */
    @Field()
    ConnectionID: string;

    /**
     * Optional flag to force a full sync even if recently synced
     */
    @Field({ nullable: true })
    ForceSync?: boolean;
}

/**
 * Output type for MCP tool sync results
 */
@ObjectType()
export class SyncMCPToolsResult {
    /**
     * Whether the sync operation succeeded
     */
    @Field()
    Success: boolean;

    /**
     * Error message if the operation failed
     */
    @Field({ nullable: true })
    ErrorMessage?: string;

    /**
     * Number of tools newly added
     */
    @Field()
    Added: number;

    /**
     * Number of tools updated
     */
    @Field()
    Updated: number;

    /**
     * Number of tools marked as deprecated
     */
    @Field()
    Deprecated: number;

    /**
     * Total number of tools after sync
     */
    @Field()
    Total: number;

    /**
     * Name of the MCP server that was synced
     */
    @Field({ nullable: true })
    ServerName?: string;

    /**
     * Connection name that was synced
     */
    @Field({ nullable: true })
    ConnectionName?: string;
}

/**
 * Input type for executing an MCP tool
 */
@InputType()
export class ExecuteMCPToolInput {
    /**
     * The ID of the MCP server connection to use
     */
    @Field()
    ConnectionID: string;

    /**
     * The ID of the tool to execute (from MCP Server Tools entity)
     */
    @Field()
    ToolID: string;

    /**
     * The name of the tool to execute
     */
    @Field()
    ToolName: string;

    /**
     * JSON string of input arguments to pass to the tool
     */
    @Field({ nullable: true })
    InputArgs?: string;
}

/**
 * Output type for MCP tool execution results
 */
@ObjectType()
export class ExecuteMCPToolResult {
    /**
     * Whether the tool execution succeeded
     */
    @Field()
    Success: boolean;

    /**
     * Error message if the execution failed
     */
    @Field({ nullable: true })
    ErrorMessage?: string;

    /**
     * The result returned by the tool (JSON)
     */
    @Field(() => GraphQLJSONObject, { nullable: true })
    Result?: Record<string, unknown> | null;

    /**
     * Execution duration in milliseconds
     */
    @Field({ nullable: true })
    DurationMs?: number;
}

/**
 * Progress message type for sync status updates
 */
interface SyncProgressMessage {
    resolver: string;
    type: string;
    status: 'ok' | 'error';
    connectionId: string;
    phase: 'connecting' | 'listing' | 'syncing' | 'complete' | 'error';
    message: string;
    progress?: {
        current?: number;
        total?: number;
        percentage?: number;
    };
    result?: {
        added: number;
        updated: number;
        deprecated: number;
        total: number;
    };
}

/**
 * MCP Resolver for GraphQL operations
 */
@Resolver()
export class MCPResolver extends ResolverBase {
    /**
     * Syncs tools from an MCP server connection to the database.
     * Publishes progress updates via the statusUpdates subscription.
     *
     * @param input The sync input parameters
     * @param ctx The GraphQL context
     * @param pubSub PubSub engine for progress updates
     * @returns The sync result
     */
    @Mutation(() => SyncMCPToolsResult)
    async SyncMCPTools(
        @Arg('input') input: SyncMCPToolsInput,
        @Ctx() ctx: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<SyncMCPToolsResult> {
        const user = ctx.userPayload.userRecord;
        if (!user) {
            return this.createErrorResult('User is not authenticated');
        }

        const { ConnectionID } = input;
        const sessionId = ctx.userPayload.sessionId;

        try {
            // Check API key scope authorization
            await this.CheckAPIKeyScopeAuthorization('mcp:sync', ConnectionID, ctx.userPayload);

            // Get the MCP client manager instance and ensure it's initialized
            const manager = MCPClientManager.Instance;
            await manager.initialize(user);

            // Publish initial progress
            this.publishProgress(pubSub, sessionId, ConnectionID, 'connecting', 'Connecting to MCP server...');

            // Connect if not already connected
            const isConnected = manager.isConnected(ConnectionID);
            if (!isConnected) {
                LogStatus(`MCPResolver: Connecting to MCP server for connection ${ConnectionID}`);
                try {
                    await manager.connect(ConnectionID, { contextUser: user });
                } catch (connectError) {
                    const connectErrorMsg = connectError instanceof Error ? connectError.message : String(connectError);
                    this.publishProgress(pubSub, sessionId, ConnectionID, 'error', `Connection failed: ${connectErrorMsg}`);
                    return this.createErrorResult(`Failed to connect to MCP server: ${connectErrorMsg}`);
                }
            }

            // Get connection info for the result
            const connectionInfo = manager.getConnectionInfo(ConnectionID);
            const serverName = connectionInfo?.serverName || 'Unknown Server';
            const connectionName = connectionInfo?.connectionName || 'Unknown Connection';

            // Publish listing progress
            this.publishProgress(pubSub, sessionId, ConnectionID, 'listing', 'Discovering tools from MCP server...');

            // Perform the sync with event listening for granular progress
            LogStatus(`MCPResolver: Starting tool sync for connection ${ConnectionID}`);

            // Subscribe to manager events for this sync
            const eventHandler = (event: { type: string; data?: Record<string, unknown> }) => {
                if (event.type === 'toolsSynced') {
                    const data = event.data as { added: number; updated: number; deprecated: number; total: number } | undefined;
                    this.publishProgress(pubSub, sessionId, ConnectionID, 'complete', 'Tool sync complete', {
                        added: data?.added || 0,
                        updated: data?.updated || 0,
                        deprecated: data?.deprecated || 0,
                        total: data?.total || 0
                    });
                }
            };
            manager.addEventListener('toolsSynced', eventHandler);

            // Publish syncing progress
            this.publishProgress(pubSub, sessionId, ConnectionID, 'syncing', 'Synchronizing tools to database...');

            // Perform the sync
            const syncResult: MCPSyncToolsResult = await manager.syncTools(ConnectionID, { contextUser: user });

            // Remove event listener
            manager.removeEventListener('toolsSynced', eventHandler);

            if (!syncResult.success) {
                this.publishProgress(pubSub, sessionId, ConnectionID, 'error', `Sync failed: ${syncResult.error}`);
                return this.createErrorResult(syncResult.error || 'Tool sync failed');
            }

            // Publish final completion
            this.publishProgress(pubSub, sessionId, ConnectionID, 'complete',
                `Sync complete: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.deprecated} deprecated`,
                {
                    added: syncResult.added,
                    updated: syncResult.updated,
                    deprecated: syncResult.deprecated,
                    total: syncResult.total
                }
            );

            LogStatus(`MCPResolver: Tool sync complete for ${ConnectionID} - Added: ${syncResult.added}, Updated: ${syncResult.updated}, Deprecated: ${syncResult.deprecated}, Total: ${syncResult.total}`);

            return {
                Success: true,
                Added: syncResult.added,
                Updated: syncResult.updated,
                Deprecated: syncResult.deprecated,
                Total: syncResult.total,
                ServerName: serverName,
                ConnectionName: connectionName
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            LogError(`MCPResolver: Error syncing tools for ${ConnectionID}: ${errorMsg}`);
            this.publishProgress(pubSub, sessionId, ConnectionID, 'error', `Error: ${errorMsg}`);
            return this.createErrorResult(errorMsg);
        }
    }

    /**
     * Executes an MCP tool and returns the result.
     *
     * @param input The execution input parameters
     * @param ctx The GraphQL context
     * @returns The execution result
     */
    @Mutation(() => ExecuteMCPToolResult)
    async ExecuteMCPTool(
        @Arg('input') input: ExecuteMCPToolInput,
        @Ctx() ctx: AppContext
    ): Promise<ExecuteMCPToolResult> {
        const user = ctx.userPayload.userRecord;
        if (!user) {
            return {
                Success: false,
                ErrorMessage: 'User is not authenticated'
            };
        }

        const { ConnectionID, ToolID, ToolName, InputArgs } = input;
        const startTime = Date.now();

        try {
            // Check API key scope authorization
            LogStatus(`MCPResolver: [${ToolName}] Step 1 - Checking API key authorization...`);
            await this.CheckAPIKeyScopeAuthorization('mcp:execute', ConnectionID, ctx.userPayload);
            LogStatus(`MCPResolver: [${ToolName}] Step 1 complete - Authorization passed (${Date.now() - startTime}ms)`);

            // Get the MCP client manager instance and ensure it's initialized
            LogStatus(`MCPResolver: [${ToolName}] Step 2 - Initializing MCP client manager...`);
            const manager = MCPClientManager.Instance;
            await manager.initialize(user);
            LogStatus(`MCPResolver: [${ToolName}] Step 2 complete - Manager initialized (${Date.now() - startTime}ms)`);

            // Connect if not already connected
            const isConnected = manager.isConnected(ConnectionID);
            LogStatus(`MCPResolver: [${ToolName}] Step 3 - Connection status: ${isConnected ? 'already connected' : 'needs connection'}`);
            if (!isConnected) {
                LogStatus(`MCPResolver: [${ToolName}] Connecting to MCP server for connection ${ConnectionID}...`);
                try {
                    await manager.connect(ConnectionID, { contextUser: user });
                    LogStatus(`MCPResolver: [${ToolName}] Step 3 complete - Connected (${Date.now() - startTime}ms)`);
                } catch (connectError) {
                    const connectErrorMsg = connectError instanceof Error ? connectError.message : String(connectError);
                    LogError(`MCPResolver: [${ToolName}] Connection failed: ${connectErrorMsg}`);
                    return {
                        Success: false,
                        ErrorMessage: `Failed to connect to MCP server: ${connectErrorMsg}`
                    };
                }
            }

            // Parse input arguments
            LogStatus(`MCPResolver: [${ToolName}] Step 4 - Parsing input arguments...`);
            let parsedArgs: Record<string, unknown> = {};
            if (InputArgs) {
                try {
                    parsedArgs = JSON.parse(InputArgs);
                    LogStatus(`MCPResolver: [${ToolName}] Parsed args: ${JSON.stringify(parsedArgs).substring(0, 200)}...`);
                } catch (parseError) {
                    LogError(`MCPResolver: [${ToolName}] Failed to parse InputArgs: ${parseError}`);
                    return {
                        Success: false,
                        ErrorMessage: 'Invalid JSON in InputArgs'
                    };
                }
            }
            LogStatus(`MCPResolver: [${ToolName}] Step 4 complete - Args parsed (${Date.now() - startTime}ms)`);

            // Call the tool
            LogStatus(`MCPResolver: [${ToolName}] Step 5 - Calling tool on connection ${ConnectionID}...`);
            LogStatus(`MCPResolver: [${ToolName}] Tool ID: ${ToolID}`);
            const result: MCPToolCallResult = await manager.callTool(
                ConnectionID,
                ToolName,
                { arguments: parsedArgs },
                { contextUser: user }
            );
            LogStatus(`MCPResolver: [${ToolName}] Step 5 complete - Tool call returned (${Date.now() - startTime}ms)`);

            // Format the result for the response - wrap in object for GraphQLJSONObject
            let formattedResult: Record<string, unknown> | null = null;
            if (result.content && result.content.length > 0) {
                // If there's only one text content block, try to parse as JSON object
                if (result.content.length === 1 && result.content[0].type === 'text') {
                    const textContent = result.content[0].text;
                    // Try to parse as JSON object
                    if (textContent && (textContent.startsWith('{') || textContent.startsWith('['))) {
                        try {
                            const parsed = JSON.parse(textContent);
                            // Wrap arrays in an object
                            if (Array.isArray(parsed)) {
                                formattedResult = { items: parsed };
                            } else if (typeof parsed === 'object' && parsed !== null) {
                                formattedResult = parsed as Record<string, unknown>;
                            } else {
                                formattedResult = { value: parsed };
                            }
                        } catch {
                            // Keep as wrapped string if not valid JSON
                            formattedResult = { text: textContent };
                        }
                    } else {
                        // Wrap plain text in object
                        formattedResult = { text: textContent };
                    }
                } else {
                    // Return all content blocks wrapped in object
                    formattedResult = { content: result.content };
                }
            }

            // Use structuredContent if available (already an object)
            if (result.structuredContent) {
                formattedResult = result.structuredContent as Record<string, unknown>;
            }

            LogStatus(`MCPResolver: [${ToolName}] Step 6 complete - Result formatted (${Date.now() - startTime}ms)`);
            LogStatus(`MCPResolver: [${ToolName}] Tool execution complete - Success: ${result.success}, Duration: ${result.durationMs}ms, Total time: ${Date.now() - startTime}ms`);

            return {
                Success: result.success,
                ErrorMessage: result.error,
                Result: formattedResult,
                DurationMs: result.durationMs
            };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const stack = error instanceof Error ? error.stack : '';
            LogError(`MCPResolver: [${ToolName}] Error after ${Date.now() - startTime}ms: ${errorMsg}`);
            LogError(`MCPResolver: [${ToolName}] Stack: ${stack}`);
            return {
                Success: false,
                ErrorMessage: errorMsg
            };
        }
    }

    /**
     * Publishes a progress update to the statusUpdates subscription
     */
    private publishProgress(
        pubSub: PubSubEngine,
        sessionId: string,
        connectionId: string,
        phase: SyncProgressMessage['phase'],
        message: string,
        result?: { added: number; updated: number; deprecated: number; total: number }
    ): void {
        const progressMessage: SyncProgressMessage = {
            resolver: 'MCPResolver',
            type: 'MCPToolSyncProgress',
            status: phase === 'error' ? 'error' : 'ok',
            connectionId,
            phase,
            message,
            result
        };

        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify(progressMessage),
            sessionId
        });
    }

    /**
     * Creates an error result with default values
     */
    private createErrorResult(errorMessage: string): SyncMCPToolsResult {
        return {
            Success: false,
            ErrorMessage: errorMessage,
            Added: 0,
            Updated: 0,
            Deprecated: 0,
            Total: 0
        };
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadMCPResolver(): void {
    // Ensures the resolver is not tree-shaken
}
