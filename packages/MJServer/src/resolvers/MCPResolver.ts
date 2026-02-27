/**
 * @fileoverview MCP GraphQL Resolver
 *
 * Provides GraphQL mutations for MCP (Model Context Protocol) operations
 * including tool synchronization with progress streaming and OAuth management.
 */

import { Resolver, Mutation, Query, Subscription, Arg, Ctx, Root, Field, ObjectType, InputType, PubSub, registerEnumType } from 'type-graphql';
import { PubSubEngine } from 'type-graphql';
import { LogError, LogStatus, UserInfo, Metadata, RunView } from '@memberjunction/core';
import {
    MCPClientManager,
    MCPSyncToolsResult,
    MCPToolCallResult,
    OAuthAuthorizationRequiredError,
    OAuthReauthorizationRequiredError,
    OAuthManager,
    TokenManager
} from '@memberjunction/ai-mcp-client';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import { GraphQLJSONObject } from 'graphql-type-json';
import { configInfo } from '../config.js';

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

    /**
     * Whether OAuth authorization is required before connecting
     */
    @Field({ nullable: true })
    RequiresOAuth?: boolean;

    /**
     * OAuth authorization URL if authorization is required
     */
    @Field({ nullable: true })
    AuthorizationUrl?: string;

    /**
     * OAuth state parameter for tracking the authorization flow
     */
    @Field({ nullable: true })
    StateParameter?: string;

    /**
     * Whether OAuth re-authorization is required
     */
    @Field({ nullable: true })
    RequiresReauthorization?: boolean;

    /**
     * Reason for re-authorization if required
     */
    @Field({ nullable: true })
    ReauthorizationReason?: string;
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

// ============================================================================
// OAuth GraphQL Types
// ============================================================================

/**
 * OAuth authorization status enum
 */
enum MCPOAuthStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    EXPIRED = 'EXPIRED'
}

// Register the enum with TypeGraphQL
registerEnumType(MCPOAuthStatus, {
    name: 'MCPOAuthStatus',
    description: 'Status of an OAuth authorization flow'
});

/**
 * Input for initiating OAuth authorization
 */
@InputType()
export class InitiateMCPOAuthInput {
    @Field()
    ConnectionID: string;

    @Field({ nullable: true })
    AdditionalScopes?: string;

    @Field({ nullable: true, description: 'Frontend URL to use as redirect_uri. When provided, the frontend handles the OAuth callback instead of the API server.' })
    FrontendCallbackUrl?: string;
}

/**
 * Input for checking OAuth status
 */
@InputType()
export class GetMCPOAuthStatusInput {
    @Field()
    StateParameter: string;
}

/**
 * Input for revoking OAuth credentials
 */
@InputType()
export class RevokeMCPOAuthInput {
    @Field()
    ConnectionID: string;

    @Field({ nullable: true })
    Reason?: string;
}

/**
 * Input for refreshing OAuth tokens
 */
@InputType()
export class RefreshMCPOAuthTokenInput {
    @Field()
    ConnectionID: string;
}

/**
 * Result from initiating OAuth authorization
 */
@ObjectType()
export class InitiateMCPOAuthResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    AuthorizationUrl?: string;

    @Field({ nullable: true })
    StateParameter?: string;

    @Field({ nullable: true })
    ExpiresAt?: Date;

    @Field({ nullable: true })
    UsedDynamicRegistration?: boolean;
}

/**
 * Result from checking OAuth status
 */
@ObjectType()
export class MCPOAuthStatusResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field(() => MCPOAuthStatus, { nullable: true })
    Status?: MCPOAuthStatus;

    @Field({ nullable: true })
    ConnectionID?: string;

    @Field({ nullable: true })
    InitiatedAt?: Date;

    @Field({ nullable: true })
    CompletedAt?: Date;

    @Field({ nullable: true })
    AuthErrorCode?: string;

    @Field({ nullable: true })
    AuthErrorDescription?: string;

    @Field({ nullable: true })
    IsRetryable?: boolean;
}

/**
 * Result from revoking OAuth credentials
 */
@ObjectType()
export class RevokeMCPOAuthResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    ConnectionID?: string;
}

/**
 * Result from refreshing OAuth tokens
 */
@ObjectType()
export class RefreshMCPOAuthTokenResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    ExpiresAt?: Date;

    @Field({ nullable: true })
    RequiresReauthorization?: boolean;
}

/**
 * OAuth connection status information
 */
@ObjectType()
export class MCPOAuthConnectionStatus {
    @Field()
    ConnectionID: string;

    @Field()
    IsOAuthEnabled: boolean;

    @Field()
    HasValidTokens: boolean;

    @Field({ nullable: true })
    IsAccessTokenExpired?: boolean;

    @Field({ nullable: true })
    TokenExpiresAt?: Date;

    @Field({ nullable: true })
    HasRefreshToken?: boolean;

    @Field()
    RequiresReauthorization: boolean;

    @Field({ nullable: true })
    ReauthorizationReason?: string;

    @Field({ nullable: true })
    IssuerUrl?: string;

    @Field({ nullable: true })
    GrantedScopes?: string;
}

// ========================================
// Subscription Topics and Types
// ========================================

/** PubSub topic for MCP OAuth events */
export const MCP_OAUTH_EVENTS_TOPIC = 'MCP_OAUTH_EVENTS';

/**
 * OAuth event types for subscriptions
 */
export type MCPOAuthEventType =
    | 'authorizationRequired'
    | 'authorizationCompleted'
    | 'tokenRefreshed'
    | 'tokenRefreshFailed';

/**
 * Payload interface for OAuth subscription events
 */
export interface MCPOAuthEventPayload {
    eventType: MCPOAuthEventType;
    connectionId: string;
    timestamp: string;
    authorizationUrl?: string;
    stateParameter?: string;
    errorMessage?: string;
    requiresReauthorization?: boolean;
}

/**
 * Notification type for OAuth events
 */
@ObjectType()
export class MCPOAuthEventNotification {
    @Field()
    EventType: string;

    @Field()
    ConnectionID: string;

    @Field()
    Timestamp: Date;

    @Field({ nullable: true })
    AuthorizationUrl?: string;

    @Field({ nullable: true })
    StateParameter?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    RequiresReauthorization?: boolean;
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
            const publicUrl = this.getPublicUrl();
            await manager.initialize(user, { publicUrl });

            // Publish initial progress
            this.publishProgress(pubSub, sessionId, ConnectionID, 'connecting', 'Connecting to MCP server...');

            // Connect if not already connected
            const isConnected = manager.isConnected(ConnectionID);
            if (!isConnected) {
                LogStatus(`MCPResolver: Connecting to MCP server for connection ${ConnectionID}`);
                try {
                    await manager.connect(ConnectionID, { contextUser: user });
                } catch (connectError) {
                    // Check for OAuth authorization required
                    if (connectError instanceof OAuthAuthorizationRequiredError) {
                        const authError = connectError as OAuthAuthorizationRequiredError;
                        this.publishProgress(pubSub, sessionId, ConnectionID, 'error',
                            `OAuth authorization required. Please authorize at: ${authError.authorizationUrl}`);
                        return this.createOAuthRequiredResult(authError.authorizationUrl, authError.stateParameter);
                    }
                    if (connectError instanceof OAuthReauthorizationRequiredError) {
                        const reAuthError = connectError as OAuthReauthorizationRequiredError;
                        this.publishProgress(pubSub, sessionId, ConnectionID, 'error',
                            `OAuth re-authorization required: ${reAuthError.reason}`);
                        return this.createOAuthReauthorizationResult(reAuthError.reason, reAuthError.authorizationUrl, reAuthError.stateParameter);
                    }
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
            const publicUrl = this.getPublicUrl();
            await manager.initialize(user, { publicUrl });
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
                    // Check for OAuth authorization required
                    if (connectError instanceof OAuthAuthorizationRequiredError) {
                        const authError = connectError as OAuthAuthorizationRequiredError;
                        LogError(`MCPResolver: [${ToolName}] OAuth authorization required`);
                        return {
                            Success: false,
                            ErrorMessage: `OAuth authorization required. Please authorize at: ${authError.authorizationUrl}`,
                            Result: {
                                requiresOAuth: true,
                                authorizationUrl: authError.authorizationUrl,
                                stateParameter: authError.stateParameter
                            }
                        };
                    }
                    if (connectError instanceof OAuthReauthorizationRequiredError) {
                        const reAuthError = connectError as OAuthReauthorizationRequiredError;
                        LogError(`MCPResolver: [${ToolName}] OAuth re-authorization required: ${reAuthError.reason}`);
                        return {
                            Success: false,
                            ErrorMessage: `OAuth re-authorization required: ${reAuthError.reason}`,
                            Result: {
                                requiresReauthorization: true,
                                reason: reAuthError.reason,
                                authorizationUrl: reAuthError.authorizationUrl,
                                stateParameter: reAuthError.stateParameter
                            }
                        };
                    }
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

    // ========================================================================
    // OAuth Operations
    // ========================================================================

    /**
     * Gets OAuth connection status for an MCP connection.
     *
     * @param connectionId - The MCP Server Connection ID
     * @param ctx - GraphQL context
     * @returns OAuth connection status
     */
    @Query(() => MCPOAuthConnectionStatus)
    async GetMCPOAuthConnectionStatus(
        @Arg('ConnectionID') connectionId: string,
        @Ctx() ctx: AppContext
    ): Promise<MCPOAuthConnectionStatus> {
        const user = ctx.userPayload.userRecord;
        if (!user) {
            return {
                ConnectionID: connectionId,
                IsOAuthEnabled: false,
                HasValidTokens: false,
                RequiresReauthorization: false,
                ReauthorizationReason: 'User is not authenticated'
            };
        }

        try {
            // Load connection and server config
            const config = await this.loadConnectionOAuthConfig(connectionId, user);

            if (!config) {
                return {
                    ConnectionID: connectionId,
                    IsOAuthEnabled: false,
                    HasValidTokens: false,
                    RequiresReauthorization: false,
                    ReauthorizationReason: 'Connection not found'
                };
            }

            if (!config.OAuthIssuerURL) {
                return {
                    ConnectionID: connectionId,
                    IsOAuthEnabled: false,
                    HasValidTokens: false,
                    RequiresReauthorization: false
                };
            }

            // Get status from OAuthManager
            const oauthManager = new OAuthManager();
            const status = await oauthManager.getConnectionStatus(connectionId, config, user);

            return {
                ConnectionID: status.connectionId,
                IsOAuthEnabled: status.isOAuthEnabled,
                HasValidTokens: status.hasValidTokens,
                IsAccessTokenExpired: status.isAccessTokenExpired,
                TokenExpiresAt: status.tokenExpiresAt,
                HasRefreshToken: status.hasRefreshToken,
                RequiresReauthorization: status.requiresReauthorization,
                ReauthorizationReason: status.reauthorizationReason,
                IssuerUrl: status.issuerUrl,
                GrantedScopes: status.grantedScopes
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            LogError(`MCPResolver: GetMCPOAuthConnectionStatus failed: ${errorMsg}`);
            return {
                ConnectionID: connectionId,
                IsOAuthEnabled: false,
                HasValidTokens: false,
                RequiresReauthorization: true,
                ReauthorizationReason: errorMsg
            };
        }
    }

    /**
     * Gets OAuth authorization flow status by state parameter.
     *
     * @param input - Input containing state parameter
     * @param ctx - GraphQL context
     * @returns OAuth status result
     */
    @Query(() => MCPOAuthStatusResult)
    async GetMCPOAuthStatus(
        @Arg('input') input: GetMCPOAuthStatusInput,
        @Ctx() ctx: AppContext
    ): Promise<MCPOAuthStatusResult> {
        const user = ctx.userPayload.userRecord;
        if (!user) {
            return {
                Success: false,
                ErrorMessage: 'User is not authenticated'
            };
        }

        try {
            const rv = new RunView();
            const result = await rv.RunView<{
                ID: string;
                MCPServerConnectionID: string;
                Status: string;
                InitiatedAt: Date;
                CompletedAt: Date | null;
                ErrorCode: string | null;
                ErrorDescription: string | null;
            }>({
                EntityName: 'MJ: O Auth Authorization States',
                ExtraFilter: `StateParameter='${input.StateParameter.replace(/'/g, "''")}'`,
                ResultType: 'simple'
            }, user);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return {
                    Success: false,
                    ErrorMessage: 'Authorization state not found',
                    IsRetryable: true
                };
            }

            const state = result.Results[0];
            const statusMap: Record<string, MCPOAuthStatus> = {
                'Pending': MCPOAuthStatus.PENDING,
                'Completed': MCPOAuthStatus.COMPLETED,
                'Failed': MCPOAuthStatus.FAILED,
                'Expired': MCPOAuthStatus.EXPIRED
            };

            return {
                Success: true,
                Status: statusMap[state.Status] ?? MCPOAuthStatus.PENDING,
                ConnectionID: state.MCPServerConnectionID,
                InitiatedAt: new Date(state.InitiatedAt),
                CompletedAt: state.CompletedAt ? new Date(state.CompletedAt) : undefined,
                AuthErrorCode: state.ErrorCode ?? undefined,
                AuthErrorDescription: state.ErrorDescription ?? undefined,
                IsRetryable: state.Status === 'Failed' || state.Status === 'Expired'
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            LogError(`MCPResolver: GetMCPOAuthStatus failed: ${errorMsg}`);
            return {
                Success: false,
                ErrorMessage: errorMsg
            };
        }
    }

    /**
     * Initiates an OAuth authorization flow for an MCP connection.
     *
     * @param input - Input containing connection ID and optional scopes
     * @param ctx - GraphQL context
     * @returns Initiation result with authorization URL
     */
    @Mutation(() => InitiateMCPOAuthResult)
    async InitiateMCPOAuth(
        @Arg('input') input: InitiateMCPOAuthInput,
        @Ctx() ctx: AppContext
    ): Promise<InitiateMCPOAuthResult> {
        const user = ctx.userPayload.userRecord;
        if (!user) {
            return {
                Success: false,
                ErrorMessage: 'User is not authenticated'
            };
        }

        try {
            // Check API key scope authorization
            await this.CheckAPIKeyScopeAuthorization('mcp:oauth', input.ConnectionID, ctx.userPayload);

            // Load connection and server config
            const config = await this.loadConnectionOAuthConfig(input.ConnectionID, user);

            if (!config) {
                return {
                    Success: false,
                    ErrorMessage: 'Connection not found'
                };
            }

            if (!config.OAuthIssuerURL) {
                return {
                    Success: false,
                    ErrorMessage: 'OAuth is not configured for this connection'
                };
            }

            // Merge additional scopes if provided
            let scopes = config.OAuthScopes;
            if (input.AdditionalScopes) {
                scopes = scopes
                    ? `${scopes} ${input.AdditionalScopes}`
                    : input.AdditionalScopes;
            }

            const oauthConfig = {
                ...config,
                OAuthScopes: scopes
            };

            // Initiate the OAuth flow
            const oauthManager = new OAuthManager();
            const publicUrl = this.getPublicUrl();

            // Build options for the OAuth flow
            const oauthOptions: { frontendReturnUrl?: string; frontendCallbackUrl?: string } = {};
            if (input.FrontendCallbackUrl) {
                oauthOptions.frontendCallbackUrl = input.FrontendCallbackUrl;
            }

            const result = await oauthManager.initiateAuthorizationFlow(
                input.ConnectionID,
                config.MCPServerID,
                oauthConfig,
                publicUrl,
                user,
                Object.keys(oauthOptions).length > 0 ? oauthOptions : undefined
            );

            LogStatus(`MCPResolver: Initiated OAuth flow for connection ${input.ConnectionID}`);

            return {
                Success: result.success,
                ErrorMessage: result.errorMessage,
                AuthorizationUrl: result.authorizationUrl,
                StateParameter: result.stateParameter,
                ExpiresAt: result.expiresAt,
                UsedDynamicRegistration: result.usedDynamicRegistration
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            LogError(`MCPResolver: InitiateMCPOAuth failed: ${errorMsg}`);
            return {
                Success: false,
                ErrorMessage: errorMsg
            };
        }
    }

    /**
     * Revokes OAuth credentials for an MCP connection.
     *
     * @param input - Input containing connection ID and optional reason
     * @param ctx - GraphQL context
     * @returns Revocation result
     */
    @Mutation(() => RevokeMCPOAuthResult)
    async RevokeMCPOAuth(
        @Arg('input') input: RevokeMCPOAuthInput,
        @Ctx() ctx: AppContext
    ): Promise<RevokeMCPOAuthResult> {
        const user = ctx.userPayload.userRecord;
        if (!user) {
            return {
                Success: false,
                ErrorMessage: 'User is not authenticated'
            };
        }

        try {
            // Check API key scope authorization
            await this.CheckAPIKeyScopeAuthorization('mcp:oauth', input.ConnectionID, ctx.userPayload);

            // Revoke the credentials
            const tokenManager = new TokenManager();
            await tokenManager.revokeCredentials(input.ConnectionID, user);

            LogStatus(`MCPResolver: Revoked OAuth credentials for connection ${input.ConnectionID}${input.Reason ? ` (reason: ${input.Reason})` : ''}`);

            return {
                Success: true,
                ConnectionID: input.ConnectionID
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            LogError(`MCPResolver: RevokeMCPOAuth failed: ${errorMsg}`);
            return {
                Success: false,
                ErrorMessage: errorMsg,
                ConnectionID: input.ConnectionID
            };
        }
    }

    /**
     * Manually refreshes OAuth tokens for an MCP connection.
     *
     * @param input - Input containing connection ID
     * @param ctx - GraphQL context
     * @returns Refresh result
     */
    @Mutation(() => RefreshMCPOAuthTokenResult)
    async RefreshMCPOAuthToken(
        @Arg('input') input: RefreshMCPOAuthTokenInput,
        @Ctx() ctx: AppContext
    ): Promise<RefreshMCPOAuthTokenResult> {
        const user = ctx.userPayload.userRecord;
        if (!user) {
            return {
                Success: false,
                ErrorMessage: 'User is not authenticated'
            };
        }

        try {
            // Check API key scope authorization
            await this.CheckAPIKeyScopeAuthorization('mcp:oauth', input.ConnectionID, ctx.userPayload);

            // Load connection config
            const config = await this.loadConnectionOAuthConfig(input.ConnectionID, user);

            if (!config) {
                return {
                    Success: false,
                    ErrorMessage: 'Connection not found'
                };
            }

            if (!config.OAuthIssuerURL) {
                return {
                    Success: false,
                    ErrorMessage: 'OAuth is not configured for this connection'
                };
            }

            // Get the MCP client manager instance
            const manager = MCPClientManager.Instance;
            const publicUrl = this.getPublicUrl();
            await manager.initialize(user, { publicUrl });

            // Try to get access token (will refresh if needed)
            const oauthManager = new OAuthManager();
            try {
                await oauthManager.getAccessToken(
                    input.ConnectionID,
                    config.MCPServerID,
                    config,
                    publicUrl,
                    user
                );

                // Get updated status
                const status = await oauthManager.getConnectionStatus(input.ConnectionID, config, user);

                LogStatus(`MCPResolver: Refreshed OAuth tokens for connection ${input.ConnectionID}`);

                return {
                    Success: true,
                    ExpiresAt: status.tokenExpiresAt,
                    RequiresReauthorization: false
                };
            } catch (error) {
                if (error instanceof OAuthAuthorizationRequiredError ||
                    error instanceof OAuthReauthorizationRequiredError) {
                    return {
                        Success: false,
                        ErrorMessage: error.message,
                        RequiresReauthorization: true
                    };
                }
                throw error;
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            LogError(`MCPResolver: RefreshMCPOAuthToken failed: ${errorMsg}`);
            return {
                Success: false,
                ErrorMessage: errorMsg
            };
        }
    }

    // ========================================================================
    // Subscriptions
    // ========================================================================

    /**
     * Subscribes to OAuth events for MCP connections.
     *
     * Clients can subscribe to receive real-time notifications when:
     * - Authorization is required for a connection
     * - Authorization completes successfully
     * - Token is refreshed
     * - Token refresh fails
     *
     * @param payload - The OAuth event payload
     * @returns OAuth event notification
     */
    @Subscription(() => MCPOAuthEventNotification, { topics: MCP_OAUTH_EVENTS_TOPIC })
    onMCPOAuthEvent(
        @Root() payload: MCPOAuthEventPayload
    ): MCPOAuthEventNotification {
        return {
            EventType: payload.eventType,
            ConnectionID: payload.connectionId,
            Timestamp: new Date(payload.timestamp),
            AuthorizationUrl: payload.authorizationUrl,
            StateParameter: payload.stateParameter,
            ErrorMessage: payload.errorMessage,
            RequiresReauthorization: payload.requiresReauthorization
        };
    }

    // ========================================================================
    // Private Helper Methods
    // ========================================================================

    /**
     * Loads OAuth configuration for a connection
     */
    private async loadConnectionOAuthConfig(
        connectionId: string,
        contextUser: UserInfo
    ): Promise<{
        MCPServerID: string;
        OAuthIssuerURL?: string;
        OAuthScopes?: string;
        OAuthMetadataCacheTTLMinutes?: number;
        OAuthClientID?: string;
        OAuthClientSecretEncrypted?: string;
        OAuthRequirePKCE?: boolean;
    } | null> {
        try {
            const rv = new RunView();

            // First get connection to get server ID
            const connResult = await rv.RunView<{ MCPServerID: string }>({
                EntityName: 'MJ: MCP Server Connections',
                ExtraFilter: `ID='${connectionId}'`,
                Fields: ['MCPServerID'],
                ResultType: 'simple'
            }, contextUser);

            if (!connResult.Success || !connResult.Results || connResult.Results.length === 0) {
                return null;
            }

            const serverId = connResult.Results[0].MCPServerID;

            // Then get server OAuth config
            const serverResult = await rv.RunView<{
                OAuthIssuerURL: string | null;
                OAuthScopes: string | null;
                OAuthMetadataCacheTTLMinutes: number | null;
                OAuthClientID: string | null;
                OAuthClientSecretEncrypted: string | null;
                OAuthRequirePKCE: boolean | null;
            }>({
                EntityName: 'MJ: MCP Servers',
                ExtraFilter: `ID='${serverId}'`,
                Fields: [
                    'OAuthIssuerURL',
                    'OAuthScopes',
                    'OAuthMetadataCacheTTLMinutes',
                    'OAuthClientID',
                    'OAuthClientSecretEncrypted',
                    'OAuthRequirePKCE'
                ],
                ResultType: 'simple'
            }, contextUser);

            if (!serverResult.Success || !serverResult.Results || serverResult.Results.length === 0) {
                return null;
            }

            const server = serverResult.Results[0];
            return {
                MCPServerID: serverId,
                OAuthIssuerURL: server.OAuthIssuerURL ?? undefined,
                OAuthScopes: server.OAuthScopes ?? undefined,
                OAuthMetadataCacheTTLMinutes: server.OAuthMetadataCacheTTLMinutes ?? undefined,
                OAuthClientID: server.OAuthClientID ?? undefined,
                OAuthClientSecretEncrypted: server.OAuthClientSecretEncrypted ?? undefined,
                OAuthRequirePKCE: server.OAuthRequirePKCE ?? undefined
            };
        } catch (error) {
            LogError(`MCPResolver: Failed to load connection OAuth config: ${error}`);
            return null;
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

    /**
     * Creates a result indicating OAuth authorization is required
     */
    private createOAuthRequiredResult(authorizationUrl: string, stateParameter: string): SyncMCPToolsResult {
        return {
            Success: false,
            ErrorMessage: 'OAuth authorization required',
            Added: 0,
            Updated: 0,
            Deprecated: 0,
            Total: 0,
            RequiresOAuth: true,
            AuthorizationUrl: authorizationUrl,
            StateParameter: stateParameter
        };
    }

    /**
     * Creates a result indicating OAuth re-authorization is required
     */
    private createOAuthReauthorizationResult(
        reason: string,
        authorizationUrl?: string,
        stateParameter?: string
    ): SyncMCPToolsResult {
        return {
            Success: false,
            ErrorMessage: `OAuth re-authorization required: ${reason}`,
            Added: 0,
            Updated: 0,
            Deprecated: 0,
            Total: 0,
            RequiresReauthorization: true,
            ReauthorizationReason: reason,
            AuthorizationUrl: authorizationUrl,
            StateParameter: stateParameter
        };
    }

    /**
     * Gets the public URL for OAuth callbacks
     */
    private getPublicUrl(): string {
        // Use publicUrl from config, falling back to constructed URL
        if (configInfo.publicUrl) {
            return configInfo.publicUrl;
        }

        // Construct from baseUrl and graphqlPort
        const baseUrl = configInfo.baseUrl || 'http://localhost';
        const port = configInfo.graphqlPort || 4000;
        const rootPath = configInfo.graphqlRootPath || '/';

        // Construct full URL
        let url = `${baseUrl}:${port}`;
        if (rootPath && rootPath !== '/') {
            url += rootPath;
        }

        return url;
    }
}
/**
 * Publishes an OAuth event to the subscription topic.
 * Can be called from other resolvers or handlers to notify clients of OAuth events.
 *
 * @param pubSub - PubSub engine
 * @param event - OAuth event details
 */
export async function publishMCPOAuthEvent(
    pubSub: PubSubEngine,
    event: {
        eventType: MCPOAuthEventType;
        connectionId: string;
        authorizationUrl?: string;
        stateParameter?: string;
        errorMessage?: string;
        requiresReauthorization?: boolean;
    }
): Promise<void> {
    const payload: MCPOAuthEventPayload = {
        eventType: event.eventType,
        connectionId: event.connectionId,
        timestamp: new Date().toISOString(),
        authorizationUrl: event.authorizationUrl,
        stateParameter: event.stateParameter,
        errorMessage: event.errorMessage,
        requiresReauthorization: event.requiresReauthorization
    };

    await pubSub.publish(MCP_OAUTH_EVENTS_TOPIC, payload);
}
