/**
 * @fileoverview OAuth Token Management
 *
 * Handles token storage, refresh, and validation for OAuth-protected MCP connections.
 * Stores tokens via CredentialEngine for consistent encryption and audit logging.
 *
 * @module @memberjunction/ai-mcp-client/oauth/TokenManager
 */

import { Metadata, RunView, UserInfo, LogError, LogStatus, BaseEntity, CompositeKey } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import type {
    OAuthTokenSet,
    OAuthTokenResponse,
    TokenRefreshResult,
    OAuthClientRegistration
} from './types.js';
import { OAuthErrorMessages } from './ErrorMessages.js';
import { getOAuthAuditLogger } from './OAuthAuditLogger.js';

/** Entity name for OAuth tokens */
const ENTITY_OAUTH_TOKENS = 'MJ: O Auth Tokens';

/** Credential type name for MCP OAuth tokens */
const CREDENTIAL_TYPE_MCP_OAUTH = 'MCP OAuth Token';

/** Default token expiration threshold in seconds (5 minutes) */
const DEFAULT_EXPIRATION_THRESHOLD_SECONDS = 300;

/**
 * Manages OAuth token storage, validation, and refresh.
 *
 * Features:
 * - Secure token storage via CredentialEngine
 * - Proactive token refresh before expiration
 * - Concurrent refresh protection via mutex pattern
 * - Retry logic with exponential backoff
 *
 * @example
 * ```typescript
 * const tokenManager = new TokenManager();
 *
 * // Store new tokens
 * await tokenManager.storeTokens(connectionId, tokens, contextUser);
 *
 * // Check token validity
 * const isValid = await tokenManager.isTokenValid(connectionId, contextUser);
 *
 * // Get valid token (refreshes if needed)
 * const tokens = await tokenManager.getValidTokens(connectionId, clientReg, contextUser);
 * ```
 */
export class TokenManager {
    /** Expiration threshold in seconds (tokens expiring within this time are considered expired) */
    private readonly expirationThresholdSeconds: number;

    /** Locks for concurrent refresh protection */
    private readonly refreshLocks: Map<string, Promise<TokenRefreshResult>> = new Map();

    /** In-memory token cache for faster access */
    private readonly tokenCache: Map<string, OAuthTokenSet> = new Map();

    constructor(expirationThresholdSeconds = DEFAULT_EXPIRATION_THRESHOLD_SECONDS) {
        this.expirationThresholdSeconds = expirationThresholdSeconds;
    }

    /**
     * Stores new OAuth tokens for a connection.
     *
     * Creates or updates a credential via CredentialEngine, then stores
     * metadata in the OAuthToken table.
     *
     * @param connectionId - MCP Server Connection ID
     * @param tokens - Token set to store
     * @param contextUser - User context
     */
    public async storeTokens(
        connectionId: string,
        tokens: OAuthTokenSet,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            // Ensure CredentialEngine is loaded
            await CredentialEngine.Instance.Config(false, contextUser);

            const md = new Metadata();
            const rv = new RunView();

            // Check if OAuthToken record already exists
            const existing = await rv.RunView<{ ID: string; CredentialID: string | null }>({
                EntityName: ENTITY_OAUTH_TOKENS,
                ExtraFilter: `MCPServerConnectionID='${connectionId}'`,
                Fields: ['ID', 'CredentialID'],
                ResultType: 'simple'
            }, contextUser);

            let credentialId: string;

            // Prepare credential values
            const credentialValues: Record<string, string> = {
                accessToken: tokens.accessToken
            };
            if (tokens.refreshToken) {
                credentialValues.refreshToken = tokens.refreshToken;
            }

            if (existing.Success && existing.Results && existing.Results.length > 0) {
                const existingRecord = existing.Results[0];

                if (existingRecord.CredentialID) {
                    // Update existing credential
                    await CredentialEngine.Instance.updateCredential(
                        existingRecord.CredentialID,
                        credentialValues,
                        contextUser
                    );
                    credentialId = existingRecord.CredentialID;
                } else {
                    // Create new credential (migrating from old schema)
                    const credential = await CredentialEngine.Instance.storeCredential(
                        CREDENTIAL_TYPE_MCP_OAUTH,
                        `MCP OAuth - ${connectionId.substring(0, 8)}`,
                        credentialValues,
                        {
                            description: `OAuth tokens for MCP server connection ${connectionId}`,
                            isDefault: false
                        },
                        contextUser
                    );
                    credentialId = credential.ID;
                }

                // Update OAuthToken metadata
                const entity = await md.GetEntityObject<BaseEntity>(ENTITY_OAUTH_TOKENS, contextUser);
                const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: existingRecord.ID }]);
                await entity.InnerLoad(compositeKey);

                entity.Set('CredentialID', credentialId);
                entity.Set('TokenType', tokens.tokenType);
                entity.Set('ExpiresAt', new Date(tokens.expiresAt * 1000));
                entity.Set('Scope', tokens.scope ?? null);
                entity.Set('IssuerURL', tokens.issuer);
                entity.Set('LastRefreshAt', tokens.lastRefreshAt ? new Date(tokens.lastRefreshAt * 1000) : null);
                entity.Set('RefreshCount', tokens.refreshCount);

                await entity.Save();
            } else {
                // Create new credential
                const credential = await CredentialEngine.Instance.storeCredential(
                    CREDENTIAL_TYPE_MCP_OAUTH,
                    `MCP OAuth - ${connectionId.substring(0, 8)}`,
                    credentialValues,
                    {
                        description: `OAuth tokens for MCP server connection ${connectionId}`,
                        isDefault: false
                    },
                    contextUser
                );
                credentialId = credential.ID;

                // Create new OAuthToken record
                const entity = await md.GetEntityObject<BaseEntity>(ENTITY_OAUTH_TOKENS, contextUser);
                entity.NewRecord();
                entity.Set('MCPServerConnectionID', connectionId);
                entity.Set('CredentialID', credentialId);
                entity.Set('TokenType', tokens.tokenType);
                entity.Set('ExpiresAt', new Date(tokens.expiresAt * 1000));
                entity.Set('Scope', tokens.scope ?? null);
                entity.Set('IssuerURL', tokens.issuer);
                entity.Set('LastRefreshAt', tokens.lastRefreshAt ? new Date(tokens.lastRefreshAt * 1000) : null);
                entity.Set('RefreshCount', tokens.refreshCount);

                await entity.Save();
            }

            // Update in-memory cache
            this.tokenCache.set(connectionId, tokens);

            LogStatus(`[OAuth] Stored tokens for connection ${connectionId}`);
        } catch (error) {
            LogError(`[OAuth] Failed to store tokens: ${error}`);
            throw error;
        }
    }

    /**
     * Loads tokens for a connection.
     *
     * @param connectionId - MCP Server Connection ID
     * @param contextUser - User context
     * @returns Token set or null if not found
     */
    public async loadTokens(
        connectionId: string,
        contextUser: UserInfo
    ): Promise<OAuthTokenSet | null> {
        // Check in-memory cache first
        const cached = this.tokenCache.get(connectionId);
        if (cached) {
            return cached;
        }

        try {
            // Ensure CredentialEngine is loaded
            await CredentialEngine.Instance.Config(false, contextUser);

            const rv = new RunView();

            // Load OAuthToken metadata
            const result = await rv.RunView<{
                CredentialID: string | null;
                TokenType: string;
                ExpiresAt: Date;
                Scope: string | null;
                IssuerURL: string;
                LastRefreshAt: Date | null;
                RefreshCount: number;
            }>({
                EntityName: ENTITY_OAUTH_TOKENS,
                ExtraFilter: `MCPServerConnectionID='${connectionId}'`,
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return null;
            }

            const record = result.Results[0];

            if (!record.CredentialID) {
                // No credential linked - token needs to be re-acquired
                LogStatus(`[OAuth] No credential linked for connection ${connectionId}`);
                return null;
            }

            // Load the credential values via CredentialEngine
            const resolvedCredential = await CredentialEngine.Instance.getCredential<{
                accessToken: string;
                refreshToken?: string;
            }>(
                `MCP OAuth - ${connectionId.substring(0, 8)}`,
                {
                    contextUser,
                    credentialId: record.CredentialID,
                    subsystem: 'MCPClient'
                }
            );

            const tokens: OAuthTokenSet = {
                accessToken: resolvedCredential.values.accessToken,
                tokenType: record.TokenType,
                expiresAt: Math.floor(new Date(record.ExpiresAt).getTime() / 1000),
                refreshToken: resolvedCredential.values.refreshToken,
                scope: record.Scope ?? undefined,
                issuer: record.IssuerURL,
                lastRefreshAt: record.LastRefreshAt
                    ? Math.floor(new Date(record.LastRefreshAt).getTime() / 1000)
                    : undefined,
                refreshCount: record.RefreshCount ?? 0
            };

            // Update in-memory cache
            this.tokenCache.set(connectionId, tokens);

            return tokens;
        } catch (error) {
            // Log but don't throw - token might not exist yet
            LogStatus(`[OAuth] No stored tokens found for connection ${connectionId}: ${error}`);
            return null;
        }
    }

    /**
     * Checks if stored tokens are valid (not expired or expiring soon).
     *
     * @param connectionId - MCP Server Connection ID
     * @param contextUser - User context
     * @returns true if tokens are valid
     */
    public async isTokenValid(connectionId: string, contextUser: UserInfo): Promise<boolean> {
        const tokens = await this.loadTokens(connectionId, contextUser);
        if (!tokens) {
            return false;
        }

        return this.isTokenSetValid(tokens);
    }

    /**
     * Checks if a token set is valid (not expired or expiring soon).
     *
     * @param tokens - Token set to check
     * @returns true if valid
     */
    public isTokenSetValid(tokens: OAuthTokenSet): boolean {
        const now = Math.floor(Date.now() / 1000);
        const threshold = now + this.expirationThresholdSeconds;

        return tokens.expiresAt > threshold;
    }

    /**
     * Gets valid tokens for a connection, refreshing if needed.
     *
     * @param connectionId - MCP Server Connection ID
     * @param clientRegistration - Client registration for token refresh
     * @param tokenEndpoint - Token endpoint URL
     * @param contextUser - User context
     * @returns Valid token set
     * @throws Error if tokens cannot be obtained
     */
    public async getValidTokens(
        connectionId: string,
        clientRegistration: OAuthClientRegistration,
        tokenEndpoint: string,
        contextUser: UserInfo
    ): Promise<OAuthTokenSet> {
        const tokens = await this.loadTokens(connectionId, contextUser);

        if (!tokens) {
            throw new Error('No tokens stored for this connection. Authorization required.');
        }

        // Check if tokens are still valid
        if (this.isTokenSetValid(tokens)) {
            return tokens;
        }

        // Check if we have a refresh token
        if (!tokens.refreshToken) {
            throw new Error('Access token expired and no refresh token available. Re-authorization required.');
        }

        // Refresh the tokens
        const refreshResult = await this.refreshTokens(
            connectionId,
            tokens,
            clientRegistration,
            tokenEndpoint,
            contextUser
        );

        if (!refreshResult.success || !refreshResult.tokens) {
            if (refreshResult.requiresReauthorization) {
                throw new Error(`Token refresh failed: ${refreshResult.errorMessage}. Re-authorization required.`);
            }
            throw new Error(`Token refresh failed: ${refreshResult.errorMessage}`);
        }

        return refreshResult.tokens;
    }

    /**
     * Refreshes tokens using the refresh token.
     *
     * Uses concurrent refresh protection to prevent multiple simultaneous
     * refresh operations for the same connection.
     *
     * @param connectionId - MCP Server Connection ID
     * @param currentTokens - Current token set with refresh token
     * @param clientRegistration - Client registration for authentication
     * @param tokenEndpoint - Token endpoint URL
     * @param contextUser - User context
     * @returns Refresh result
     */
    public async refreshTokens(
        connectionId: string,
        currentTokens: OAuthTokenSet,
        clientRegistration: OAuthClientRegistration,
        tokenEndpoint: string,
        contextUser: UserInfo
    ): Promise<TokenRefreshResult> {
        // Check for existing refresh operation
        const existingRefresh = this.refreshLocks.get(connectionId);
        if (existingRefresh) {
            LogStatus(`[OAuth] Waiting for existing refresh operation for ${connectionId}`);
            return existingRefresh;
        }

        // Start new refresh with lock
        const refreshPromise = this.performRefresh(
            connectionId,
            currentTokens,
            clientRegistration,
            tokenEndpoint,
            contextUser
        );

        this.refreshLocks.set(connectionId, refreshPromise);

        try {
            return await refreshPromise;
        } finally {
            this.refreshLocks.delete(connectionId);
        }
    }

    /**
     * Performs the actual token refresh with retry logic.
     */
    private async performRefresh(
        connectionId: string,
        currentTokens: OAuthTokenSet,
        clientRegistration: OAuthClientRegistration,
        tokenEndpoint: string,
        contextUser: UserInfo
    ): Promise<TokenRefreshResult> {
        const maxRetries = 3;
        const baseDelayMs = 1000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                LogStatus(`[OAuth] Refreshing tokens for ${connectionId} (attempt ${attempt}/${maxRetries})`);

                const newTokens = await this.exchangeRefreshToken(
                    currentTokens.refreshToken!,
                    clientRegistration,
                    tokenEndpoint
                );

                // Build updated token set
                const refreshedTokens: OAuthTokenSet = {
                    accessToken: newTokens.access_token,
                    tokenType: newTokens.token_type ?? 'Bearer',
                    expiresAt: this.calculateExpiresAt(newTokens.expires_in),
                    refreshToken: newTokens.refresh_token ?? currentTokens.refreshToken,
                    scope: newTokens.scope ?? currentTokens.scope,
                    issuer: currentTokens.issuer,
                    lastRefreshAt: Math.floor(Date.now() / 1000),
                    refreshCount: currentTokens.refreshCount + 1
                };

                // Store the new tokens
                await this.storeTokens(connectionId, refreshedTokens, contextUser);

                LogStatus(`[OAuth] Successfully refreshed tokens for ${connectionId}`);

                // Audit log: Token refreshed (T049)
                const auditLogger = getOAuthAuditLogger();
                await auditLogger.logTokenRefreshed({
                    connectionId,
                    issuerUrl: currentTokens.issuer,
                    newExpiresAt: new Date(refreshedTokens.expiresAt * 1000),
                    refreshCount: refreshedTokens.refreshCount
                }, contextUser);

                return {
                    success: true,
                    requiresReauthorization: false,
                    tokens: refreshedTokens
                };

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                LogError(`[OAuth] Token refresh attempt ${attempt} failed: ${errorMessage}`);

                // Check if error is retryable
                if (!OAuthErrorMessages.isRetryable(errorMessage)) {
                    // Audit log: Token refresh failed (T050)
                    const auditLogger = getOAuthAuditLogger();
                    await auditLogger.logTokenRefreshFailed({
                        connectionId,
                        issuerUrl: currentTokens.issuer,
                        errorMessage: OAuthErrorMessages.getUserMessage(errorMessage),
                        requiresReauthorization: OAuthErrorMessages.requiresReauthorization(errorMessage)
                    }, contextUser);

                    return {
                        success: false,
                        errorMessage: OAuthErrorMessages.getUserMessage(errorMessage),
                        requiresReauthorization: OAuthErrorMessages.requiresReauthorization(errorMessage)
                    };
                }

                // Wait before retry with exponential backoff
                if (attempt < maxRetries) {
                    const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
                    await this.sleep(delayMs);
                }
            }
        }

        // Audit log: Token refresh failed after all retries (T050)
        const auditLogger = getOAuthAuditLogger();
        await auditLogger.logTokenRefreshFailed({
            connectionId,
            issuerUrl: currentTokens.issuer,
            errorMessage: 'Token refresh failed after multiple attempts',
            requiresReauthorization: true
        }, contextUser);

        return {
            success: false,
            errorMessage: 'Token refresh failed after multiple attempts. Please try reconnecting.',
            requiresReauthorization: true
        };
    }

    /**
     * Exchanges a refresh token for new tokens.
     */
    private async exchangeRefreshToken(
        refreshToken: string,
        clientRegistration: OAuthClientRegistration,
        tokenEndpoint: string
    ): Promise<OAuthTokenResponse> {
        // Build request body
        const body = new URLSearchParams();
        body.set('grant_type', 'refresh_token');
        body.set('refresh_token', refreshToken);
        body.set('client_id', clientRegistration.clientId);

        if (clientRegistration.scope) {
            body.set('scope', clientRegistration.scope);
        }

        // Build headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        };

        // Add client authentication if client secret exists
        if (clientRegistration.clientSecret) {
            const credentials = Buffer.from(
                `${clientRegistration.clientId}:${clientRegistration.clientSecret}`
            ).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
        }

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers,
            body: body.toString()
        });

        if (!response.ok) {
            const errorBody = await response.text();
            let errorCode = `HTTP ${response.status}`;
            try {
                const errorJson = JSON.parse(errorBody);
                if (errorJson.error) {
                    errorCode = errorJson.error;
                    if (errorJson.error_description) {
                        errorCode += `: ${errorJson.error_description}`;
                    }
                }
            } catch {
                errorCode += `: ${errorBody}`;
            }
            throw new Error(errorCode);
        }

        return await response.json() as OAuthTokenResponse;
    }

    /**
     * Calculates expiration timestamp from expires_in.
     */
    private calculateExpiresAt(expiresIn?: number): number {
        const now = Math.floor(Date.now() / 1000);
        // Default to 1 hour if not specified
        return now + (expiresIn ?? 3600);
    }

    /**
     * Revokes stored credentials for a connection.
     *
     * Deletes both the OAuthToken metadata and the associated credential.
     *
     * @param connectionId - MCP Server Connection ID
     * @param contextUser - User context
     */
    public async revokeCredentials(connectionId: string, contextUser: UserInfo): Promise<void> {
        try {
            const md = new Metadata();
            const rv = new RunView();

            const existing = await rv.RunView<{ ID: string; CredentialID: string | null }>({
                EntityName: ENTITY_OAUTH_TOKENS,
                ExtraFilter: `MCPServerConnectionID='${connectionId}'`,
                Fields: ['ID', 'CredentialID'],
                ResultType: 'simple'
            }, contextUser);

            if (existing.Success && existing.Results && existing.Results.length > 0) {
                const record = existing.Results[0];

                // Delete the OAuthToken record first
                const tokenEntity = await md.GetEntityObject<BaseEntity>(ENTITY_OAUTH_TOKENS, contextUser);
                const tokenKey = new CompositeKey([{ FieldName: 'ID', Value: record.ID }]);
                const tokenLoaded = await tokenEntity.InnerLoad(tokenKey);
                if (tokenLoaded) {
                    await tokenEntity.Delete();
                }

                // Delete the associated credential if it exists
                if (record.CredentialID) {
                    try {
                        const credEntity = await md.GetEntityObject<BaseEntity>('MJ: Credentials', contextUser);
                        const credKey = new CompositeKey([{ FieldName: 'ID', Value: record.CredentialID }]);
                        const credLoaded = await credEntity.InnerLoad(credKey);
                        if (credLoaded) {
                            await credEntity.Delete();
                        }
                    } catch (credError) {
                        LogError(`[OAuth] Failed to delete credential: ${credError}`);
                        // Continue anyway - token record is deleted
                    }
                }
            }

            // Clear from in-memory cache
            this.tokenCache.delete(connectionId);

            LogStatus(`[OAuth] Revoked credentials for connection ${connectionId}`);

            // Audit log: Credentials revoked (T051)
            const auditLogger = getOAuthAuditLogger();
            await auditLogger.logCredentialsRevoked({
                connectionId,
                revokedBy: contextUser.ID
            }, contextUser);
        } catch (error) {
            LogError(`[OAuth] Failed to revoke credentials: ${error}`);
            throw error;
        }
    }

    /**
     * Handles a refresh failure by determining if re-authorization is needed.
     *
     * @param errorMessage - The error message from the failed refresh
     * @returns Object indicating whether re-authorization is required
     */
    public handleRefreshFailure(errorMessage: string): { requiresReauthorization: boolean; userMessage: string } {
        const mapped = OAuthErrorMessages.mapError(errorMessage);
        return {
            requiresReauthorization: mapped.requiresReauthorization,
            userMessage: mapped.userMessage
        };
    }

    /**
     * Sleep helper for retry delays.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
