/**
 * @fileoverview OAuth Callback Handler for MCP OAuth flows
 *
 * Handles OAuth authorization callbacks from external authorization servers.
 * This endpoint is unauthenticated since it's called by the auth server after user consent.
 *
 * Endpoints:
 * - GET /api/v1/oauth/callback - Authorization callback
 * - GET /api/v1/oauth/status/:stateParameter - Poll for authorization status (authenticated)
 * - POST /api/v1/oauth/initiate - Initiate OAuth flow (authenticated)
 *
 * @module @memberjunction/server/rest/OAuthCallbackHandler
 */

import express from 'express';
import { LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { OAuthManager, MCPClientManager } from '@memberjunction/ai-mcp-client';
import type { MCPServerOAuthConfig } from '@memberjunction/ai-mcp-client';

/** Entity name for MCP Server Connections */
const ENTITY_MCP_SERVER_CONNECTIONS = 'MJ: MCP Server Connections';

/** Entity name for MCP Servers */
const ENTITY_MCP_SERVERS = 'MJ: MCP Servers';

/** Entity name for OAuth Authorization States */
const ENTITY_OAUTH_AUTHORIZATION_STATES = 'MJ: O Auth Authorization States';

/**
 * Configuration for OAuth callback handler
 */
export interface OAuthCallbackHandlerOptions {
    /** Base URL for this MJAPI instance (for redirects) */
    publicUrl: string;
    /** URL to redirect to after successful authorization */
    successRedirectUrl?: string;
    /** URL to redirect to after failed authorization */
    errorRedirectUrl?: string;
}

/**
 * Handles OAuth callbacks and related endpoints for MCP server authentication.
 *
 * The callback endpoint is unauthenticated because it's called by external auth servers.
 * It uses the state parameter to look up the authorization context and validate the flow.
 *
 * @example
 * ```typescript
 * const oauthHandler = new OAuthCallbackHandler({
 *     publicUrl: 'https://api.example.com'
 * });
 *
 * // Mount unauthenticated callback route
 * app.use('/api/v1/oauth', oauthHandler.getCallbackRouter());
 *
 * // Mount authenticated routes
 * app.use('/api/v1/oauth', authMiddleware, oauthHandler.getAuthenticatedRouter());
 * ```
 */
export class OAuthCallbackHandler {
    private readonly options: OAuthCallbackHandlerOptions;
    private readonly oauthManager: OAuthManager;
    private readonly callbackRouter: express.Router;
    private readonly authenticatedRouter: express.Router;

    constructor(options: OAuthCallbackHandlerOptions) {
        this.options = {
            successRedirectUrl: `${options.publicUrl}/oauth/success`,
            errorRedirectUrl: `${options.publicUrl}/oauth/error`,
            ...options
        };
        this.oauthManager = new OAuthManager();
        this.callbackRouter = express.Router();
        this.authenticatedRouter = express.Router();
        this.setupRoutes();
    }

    /**
     * Sets up all routes for OAuth handling.
     */
    private setupRoutes(): void {
        // Unauthenticated callback route
        this.callbackRouter.get('/callback', this.handleCallback.bind(this));

        // Success and error pages (unauthenticated - user is redirected here after OAuth)
        this.callbackRouter.get('/success', this.handleSuccessPage.bind(this));
        this.callbackRouter.get('/error', this.handleErrorPage.bind(this));

        // Authenticated routes
        this.authenticatedRouter.get('/status/:stateParameter', this.getStatus.bind(this));
        this.authenticatedRouter.post('/initiate', this.initiateFlow.bind(this));
    }

    /**
     * Renders a success page after OAuth authorization completes.
     */
    private handleSuccessPage(req: express.Request, res: express.Response): void {
        const { state, connectionId } = req.query;
        res.status(200).send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authorization Successful</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .container { background: white; padding: 3rem; border-radius: 1rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; max-width: 400px; }
        .icon { font-size: 4rem; margin-bottom: 1rem; }
        h1 { color: #22c55e; margin: 0 0 1rem; }
        p { color: #64748b; margin: 0 0 1.5rem; line-height: 1.6; }
        .details { background: #f1f5f9; padding: 1rem; border-radius: 0.5rem; font-size: 0.875rem; color: #475569; word-break: break-all; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✅</div>
        <h1>Authorization Successful</h1>
        <p>Your MCP server connection has been authorized. You can close this window and return to MemberJunction.</p>
        ${connectionId ? `<div class="details">Connection ID: ${connectionId}</div>` : ''}
    </div>
</body>
</html>
        `);
    }

    /**
     * Renders an error page when OAuth authorization fails.
     */
    private handleErrorPage(req: express.Request, res: express.Response): void {
        const { error, error_description } = req.query;
        const errorCode = error ? String(error) : 'unknown_error';
        const errorMessage = error_description ? String(error_description) : 'An error occurred during authorization.';

        res.status(200).send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authorization Failed</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .container { background: white; padding: 3rem; border-radius: 1rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; max-width: 400px; }
        .icon { font-size: 4rem; margin-bottom: 1rem; }
        h1 { color: #ef4444; margin: 0 0 1rem; }
        p { color: #64748b; margin: 0 0 1.5rem; line-height: 1.6; }
        .error-code { background: #fef2f2; color: #991b1b; padding: 0.5rem 1rem; border-radius: 0.5rem; font-family: monospace; display: inline-block; margin-bottom: 1rem; }
        .error-message { background: #f1f5f9; padding: 1rem; border-radius: 0.5rem; font-size: 0.875rem; color: #475569; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">❌</div>
        <h1>Authorization Failed</h1>
        <div class="error-code">${errorCode}</div>
        <div class="error-message">${errorMessage}</div>
        <p style="margin-top: 1.5rem;">Please close this window and try again.</p>
    </div>
</body>
</html>
        `);
    }

    /**
     * Handles the OAuth authorization callback.
     *
     * This endpoint is unauthenticated - the auth server redirects here after user consent.
     * We validate the state parameter and exchange the code for tokens.
     *
     * @param req - Express request
     * @param res - Express response
     */
    private async handleCallback(req: express.Request, res: express.Response): Promise<void> {
        LogStatus(`[OAuth Callback] Received callback: ${req.originalUrl}`);
        const { code, state, error, error_description } = req.query;
        LogStatus(`[OAuth Callback] Parameters - state: ${state}, code: ${code ? 'present' : 'missing'}, error: ${error || 'none'}`);

        // Validate state parameter is present
        if (!state || typeof state !== 'string') {
            this.redirectToError(res, 'invalid_request', 'Missing state parameter');
            return;
        }

        try {
            // Get system user for initial lookup
            const systemUser = this.getSystemUser();
            if (!systemUser) {
                LogError('[OAuth Callback] System user not available');
                this.redirectToError(res, 'server_error', 'System configuration error');
                return;
            }

            // Look up the authorization state to get the user context
            const authState = await this.loadAuthorizationState(state, systemUser);
            if (!authState) {
                this.redirectToError(res, 'invalid_state', 'Authorization state not found or expired');
                return;
            }

            // Get the actual user from cache
            const contextUser = UserCache.Users.find(u => u.ID === authState.userId);
            if (!contextUser) {
                LogError(`[OAuth Callback] User ${authState.userId} not found in cache`);
                this.redirectToError(res, 'server_error', 'User context not found', authState.frontendReturnUrl);
                return;
            }

            // Handle error from authorization server
            if (error) {
                const errorMessage = error_description ? String(error_description) : 'Authorization denied';
                await this.oauthManager.handleAuthorizationError(
                    state,
                    String(error),
                    errorMessage,
                    contextUser
                );
                this.redirectToError(res, String(error), errorMessage, authState.frontendReturnUrl);
                return;
            }

            // Validate authorization code is present
            if (!code || typeof code !== 'string') {
                this.redirectToError(res, 'invalid_request', 'Missing authorization code', authState.frontendReturnUrl);
                return;
            }

            // Exchange code for tokens
            const result = await this.oauthManager.completeAuthorizationFlow(state, code, contextUser);

            if (result.success) {
                LogStatus(`[OAuth Callback] Authorization completed for state ${state}`);
                // Notify MCPClientManager that authorization has completed
                MCPClientManager.Instance.notifyOAuthAuthorizationCompleted(authState.connectionId, {
                    stateParameter: state,
                    completedAt: new Date().toISOString()
                });
                this.redirectToSuccess(res, state, authState.connectionId, authState.frontendReturnUrl);
            } else {
                LogError(`[OAuth Callback] Authorization failed: ${result.errorMessage}`);
                this.redirectToError(
                    res,
                    result.errorCode ?? 'authorization_failed',
                    result.errorMessage ?? 'Authorization failed',
                    authState.frontendReturnUrl
                );
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LogError(`[OAuth Callback] Unexpected error: ${errorMessage}`);
            this.redirectToError(res, 'server_error', 'An unexpected error occurred');
        }
    }

    /**
     * Gets the status of an OAuth authorization flow.
     *
     * Authenticated endpoint for polling authorization status.
     *
     * @param req - Express request
     * @param res - Express response
     */
    private async getStatus(req: express.Request, res: express.Response): Promise<void> {
        const { stateParameter } = req.params;
        const contextUser = req['mjUser'] as UserInfo;

        if (!contextUser) {
            res.status(401).json({
                success: false,
                errorMessage: 'Authentication required'
            });
            return;
        }

        try {
            const authState = await this.loadAuthorizationState(stateParameter, contextUser);

            if (!authState) {
                res.status(404).json({
                    success: false,
                    errorCode: 'not_found',
                    errorMessage: 'Authorization state not found'
                });
                return;
            }

            // Verify user owns this state
            if (authState.userId !== contextUser.ID) {
                res.status(403).json({
                    success: false,
                    errorCode: 'forbidden',
                    errorMessage: 'Access denied'
                });
                return;
            }

            // Map status
            let status: 'pending' | 'completed' | 'failed' | 'expired';
            switch (authState.status) {
                case 'Pending':
                    status = new Date() >= authState.expiresAt ? 'expired' : 'pending';
                    break;
                case 'Completed':
                    status = 'completed';
                    break;
                case 'Failed':
                    status = 'failed';
                    break;
                case 'Expired':
                    status = 'expired';
                    break;
                default:
                    status = 'pending';
            }

            res.json({
                status,
                connectionId: authState.connectionId,
                completedAt: authState.completedAt?.toISOString(),
                errorCode: authState.errorCode,
                errorMessage: authState.errorDescription,
                isRetryable: status === 'failed' || status === 'expired'
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LogError(`[OAuth Status] Error: ${errorMessage}`);
            res.status(500).json({
                success: false,
                errorCode: 'server_error',
                errorMessage: 'Failed to get authorization status'
            });
        }
    }

    /**
     * Initiates a new OAuth authorization flow.
     *
     * Authenticated endpoint for starting OAuth authorization.
     *
     * @param req - Express request
     * @param res - Express response
     */
    private async initiateFlow(req: express.Request, res: express.Response): Promise<void> {
        const { connectionId, additionalScopes, frontendReturnUrl } = req.body;
        const contextUser = req['mjUser'] as UserInfo;

        if (!contextUser) {
            res.status(401).json({
                success: false,
                errorMessage: 'Authentication required'
            });
            return;
        }

        if (!connectionId) {
            res.status(400).json({
                success: false,
                errorCode: 'invalid_request',
                errorMessage: 'connectionId is required'
            });
            return;
        }

        try {
            // Load connection and server config
            const config = await this.loadConnectionConfig(connectionId, contextUser);
            if (!config) {
                res.status(404).json({
                    success: false,
                    errorCode: 'not_found',
                    errorMessage: 'Connection not found'
                });
                return;
            }

            // Build OAuth config
            const oauthConfig: MCPServerOAuthConfig = {
                OAuthIssuerURL: config.OAuthIssuerURL,
                OAuthScopes: additionalScopes
                    ? `${config.OAuthScopes ?? ''} ${additionalScopes}`.trim()
                    : config.OAuthScopes,
                OAuthMetadataCacheTTLMinutes: config.OAuthMetadataCacheTTLMinutes,
                OAuthClientID: config.OAuthClientID,
                OAuthClientSecretEncrypted: config.OAuthClientSecretEncrypted,
                OAuthRequirePKCE: config.OAuthRequirePKCE
            };

            if (!oauthConfig.OAuthIssuerURL) {
                res.status(400).json({
                    success: false,
                    errorCode: 'invalid_configuration',
                    errorMessage: 'OAuth is not configured for this server'
                });
                return;
            }

            // Initiate the flow with optional frontend return URL
            const result = await this.oauthManager.initiateAuthorizationFlow(
                connectionId,
                config.serverId,
                oauthConfig,
                this.options.publicUrl,
                contextUser,
                frontendReturnUrl ? { frontendReturnUrl: String(frontendReturnUrl) } : undefined
            );

            if (result.success) {
                res.json({
                    success: true,
                    authorizationUrl: result.authorizationUrl,
                    stateParameter: result.stateParameter,
                    expiresAt: result.expiresAt?.toISOString(),
                    message: 'Please redirect the user to the authorization URL'
                });
            } else {
                res.status(400).json({
                    success: false,
                    errorCode: 'initiation_failed',
                    errorMessage: result.errorMessage
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LogError(`[OAuth Initiate] Error: ${errorMessage}`);
            res.status(500).json({
                success: false,
                errorCode: 'server_error',
                errorMessage: 'Failed to initiate OAuth flow'
            });
        }
    }

    // ========================================
    // Helper Methods
    // ========================================

    /**
     * Gets the system user from cache.
     */
    private getSystemUser(): UserInfo | null {
        try {
            return UserCache.Instance.GetSystemUser();
        } catch {
            return null;
        }
    }

    /**
     * Loads authorization state from database.
     */
    private async loadAuthorizationState(
        stateParameter: string,
        contextUser: UserInfo
    ): Promise<{
        connectionId: string;
        userId: string;
        status: string;
        errorCode?: string;
        errorDescription?: string;
        expiresAt: Date;
        completedAt?: Date;
        frontendReturnUrl?: string;
    } | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<{
                MCPServerConnectionID: string;
                UserID: string;
                Status: string;
                ErrorCode: string | null;
                ErrorDescription: string | null;
                ExpiresAt: Date;
                CompletedAt: Date | null;
                FrontendReturnURL: string | null;
            }>({
                EntityName: ENTITY_OAUTH_AUTHORIZATION_STATES,
                ExtraFilter: `StateParameter='${stateParameter.replace(/'/g, "''")}'`,
                Fields: ['MCPServerConnectionID', 'UserID', 'Status', 'ErrorCode', 'ErrorDescription', 'ExpiresAt', 'CompletedAt', 'FrontendReturnURL'],
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return null;
            }

            const record = result.Results[0];
            return {
                connectionId: record.MCPServerConnectionID,
                userId: record.UserID,
                status: record.Status,
                errorCode: record.ErrorCode ?? undefined,
                errorDescription: record.ErrorDescription ?? undefined,
                expiresAt: new Date(record.ExpiresAt),
                completedAt: record.CompletedAt ? new Date(record.CompletedAt) : undefined,
                frontendReturnUrl: record.FrontendReturnURL ?? undefined
            };
        } catch (error) {
            LogError(`[OAuth Callback] Failed to load authorization state: ${error}`);
            return null;
        }
    }

    /**
     * Loads connection and server OAuth configuration.
     */
    private async loadConnectionConfig(
        connectionId: string,
        contextUser: UserInfo
    ): Promise<{
        serverId: string;
        OAuthIssuerURL?: string;
        OAuthScopes?: string;
        OAuthMetadataCacheTTLMinutes?: number;
        OAuthClientID?: string;
        OAuthClientSecretEncrypted?: string;
        OAuthRequirePKCE?: boolean;
    } | null> {
        try {
            const rv = new RunView();

            // Get connection to get server ID
            const connResult = await rv.RunView<{ MCPServerID: string }>({
                EntityName: ENTITY_MCP_SERVER_CONNECTIONS,
                ExtraFilter: `ID='${connectionId}'`,
                Fields: ['MCPServerID'],
                ResultType: 'simple'
            }, contextUser);

            if (!connResult.Success || !connResult.Results || connResult.Results.length === 0) {
                return null;
            }

            const serverId = connResult.Results[0].MCPServerID;

            // Get server OAuth config
            const serverResult = await rv.RunView<{
                OAuthIssuerURL: string | null;
                OAuthScopes: string | null;
                OAuthMetadataCacheTTLMinutes: number | null;
                OAuthClientID: string | null;
                OAuthClientSecretEncrypted: string | null;
                OAuthRequirePKCE: boolean | null;
            }>({
                EntityName: ENTITY_MCP_SERVERS,
                ExtraFilter: `ID='${serverId}'`,
                Fields: [
                    'OAuthIssuerURL', 'OAuthScopes', 'OAuthMetadataCacheTTLMinutes',
                    'OAuthClientID', 'OAuthClientSecretEncrypted', 'OAuthRequirePKCE'
                ],
                ResultType: 'simple'
            }, contextUser);

            if (!serverResult.Success || !serverResult.Results || serverResult.Results.length === 0) {
                return null;
            }

            const server = serverResult.Results[0];
            return {
                serverId,
                OAuthIssuerURL: server.OAuthIssuerURL ?? undefined,
                OAuthScopes: server.OAuthScopes ?? undefined,
                OAuthMetadataCacheTTLMinutes: server.OAuthMetadataCacheTTLMinutes ?? undefined,
                OAuthClientID: server.OAuthClientID ?? undefined,
                OAuthClientSecretEncrypted: server.OAuthClientSecretEncrypted ?? undefined,
                OAuthRequirePKCE: server.OAuthRequirePKCE ?? undefined
            };
        } catch (error) {
            LogError(`[OAuth Callback] Failed to load connection config: ${error}`);
            return null;
        }
    }

    /**
     * Redirects to success page with state info.
     * If a frontend return URL is provided, redirects there instead of the default success page.
     */
    private redirectToSuccess(res: express.Response, state: string, connectionId: string, frontendReturnUrl?: string): void {
        // If frontend return URL is provided, redirect there with success parameters
        if (frontendReturnUrl) {
            try {
                const url = new URL(frontendReturnUrl);
                url.searchParams.set('oauth', 'success');
                url.searchParams.set('state', state);
                url.searchParams.set('connectionId', connectionId);
                LogStatus(`[OAuth Callback] Redirecting to frontend URL: ${url.toString()}`);
                res.redirect(302, url.toString());
                return;
            } catch (error) {
                LogError(`[OAuth Callback] Invalid frontend return URL '${frontendReturnUrl}', falling back to default`);
                // Fall through to default redirect
            }
        }

        // Default: redirect to built-in success page
        const url = new URL(this.options.successRedirectUrl!);
        url.searchParams.set('state', state);
        url.searchParams.set('connectionId', connectionId);
        res.redirect(302, url.toString());
    }

    /**
     * Redirects to error page with error info.
     * If a frontend return URL is provided, redirects there instead of the default error page.
     */
    private redirectToError(res: express.Response, errorCode: string, errorMessage: string, frontendReturnUrl?: string): void {
        // If frontend return URL is provided, redirect there with error parameters
        if (frontendReturnUrl) {
            try {
                const url = new URL(frontendReturnUrl);
                url.searchParams.set('oauth', 'error');
                url.searchParams.set('error', errorCode);
                url.searchParams.set('error_description', errorMessage);
                LogStatus(`[OAuth Callback] Redirecting to frontend URL with error: ${url.toString()}`);
                res.redirect(302, url.toString());
                return;
            } catch (error) {
                LogError(`[OAuth Callback] Invalid frontend return URL '${frontendReturnUrl}', falling back to default`);
                // Fall through to default redirect
            }
        }

        // Default: redirect to built-in error page
        const url = new URL(this.options.errorRedirectUrl!);
        url.searchParams.set('error', errorCode);
        url.searchParams.set('error_description', errorMessage);
        res.redirect(302, url.toString());
    }

    /**
     * Gets the router for unauthenticated callback endpoint.
     */
    public getCallbackRouter(): express.Router {
        return this.callbackRouter;
    }

    /**
     * Gets the router for authenticated OAuth endpoints.
     */
    public getAuthenticatedRouter(): express.Router {
        return this.authenticatedRouter;
    }
}

/**
 * Creates and configures the OAuth callback handler.
 *
 * @param options - Handler configuration
 * @returns Object with callback and authenticated routers
 */
export function createOAuthCallbackHandler(options: OAuthCallbackHandlerOptions): {
    callbackRouter: express.Router;
    authenticatedRouter: express.Router;
} {
    const handler = new OAuthCallbackHandler(options);
    return {
        callbackRouter: handler.getCallbackRouter(),
        authenticatedRouter: handler.getAuthenticatedRouter()
    };
}
