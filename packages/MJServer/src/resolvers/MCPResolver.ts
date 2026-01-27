/**
 * @fileoverview MCP GraphQL Resolver
 *
 * Provides GraphQL mutations for MCP (Model Context Protocol) operations
 * including tool synchronization with progress streaming.
 */

import { Resolver, Mutation, Arg, Ctx, Field, ObjectType, InputType, PubSub } from 'type-graphql';
import { PubSubEngine } from 'type-graphql';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { MCPClientManager, MCPSyncToolsResult } from '@memberjunction/ai-mcp-client';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';

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
