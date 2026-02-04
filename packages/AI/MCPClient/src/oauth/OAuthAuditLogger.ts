/**
 * @fileoverview OAuth Audit Logger
 *
 * Provides audit logging for OAuth 2.1 authorization events.
 * Logs to the MemberJunction Audit Logs entity for compliance and debugging.
 *
 * @module @memberjunction/ai-mcp-client/oauth/OAuthAuditLogger
 */

import { Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { AuditLogEntity } from '@memberjunction/core-entities';

/**
 * Audit log type IDs for OAuth events.
 * These must match the IDs assigned when the audit log types are synced to the database.
 * If not found, audit logging will be skipped gracefully.
 */
const AUDIT_LOG_TYPE_NAMES = {
    AUTHORIZATION_INITIATED: 'OAuth Authorization Initiated',
    AUTHORIZATION_COMPLETED: 'OAuth Authorization Completed',
    AUTHORIZATION_FAILED: 'OAuth Authorization Failed',
    TOKEN_REFRESHED: 'OAuth Token Refreshed',
    TOKEN_REFRESH_FAILED: 'OAuth Token Refresh Failed',
    CREDENTIALS_REVOKED: 'OAuth Credentials Revoked'
} as const;

/**
 * Details for OAuth authorization initiated event
 */
export interface AuthorizationInitiatedDetails {
    connectionId: string;
    serverId: string;
    issuerUrl: string;
    requestedScopes?: string;
    usedDynamicRegistration: boolean;
    stateParameter: string;
}

/**
 * Details for OAuth authorization completed event
 */
export interface AuthorizationCompletedDetails {
    connectionId: string;
    issuerUrl: string;
    grantedScopes?: string;
    tokenExpiresAt: Date;
    hasRefreshToken: boolean;
}

/**
 * Details for OAuth authorization failed event
 */
export interface AuthorizationFailedDetails {
    connectionId: string;
    issuerUrl?: string;
    errorCode: string;
    errorDescription?: string;
    isRetryable: boolean;
}

/**
 * Details for OAuth token refresh event
 */
export interface TokenRefreshDetails {
    connectionId: string;
    issuerUrl: string;
    newExpiresAt: Date;
    refreshCount: number;
}

/**
 * Details for OAuth token refresh failed event
 */
export interface TokenRefreshFailedDetails {
    connectionId: string;
    issuerUrl: string;
    errorMessage: string;
    requiresReauthorization: boolean;
}

/**
 * Details for OAuth credentials revoked event
 */
export interface CredentialsRevokedDetails {
    connectionId: string;
    reason?: string;
    revokedBy: string;
}

/**
 * Provides audit logging for OAuth events.
 *
 * All logging methods are non-fatal - errors during audit logging
 * will not interrupt the OAuth flow.
 *
 * @example
 * ```typescript
 * const auditLogger = new OAuthAuditLogger();
 *
 * // Log authorization initiated
 * await auditLogger.logAuthorizationInitiated({
 *     connectionId: 'conn-123',
 *     serverId: 'server-456',
 *     issuerUrl: 'https://auth.example.com',
 *     requestedScopes: 'read write',
 *     usedDynamicRegistration: true,
 *     stateParameter: 'abc123'
 * }, contextUser);
 * ```
 */
export class OAuthAuditLogger {
    /** Cache of audit log type IDs by name */
    private auditLogTypeCache: Map<string, string> = new Map();

    /** Entity ID for MCP Server Connections (for linking audit records) */
    private mcpConnectionEntityId: string | null = null;

    /**
     * Logs an OAuth authorization initiated event.
     * T047: Implement audit logging for OAuth authorization initiated event
     */
    public async logAuthorizationInitiated(
        details: AuthorizationInitiatedDetails,
        contextUser: UserInfo
    ): Promise<void> {
        await this.logEvent(
            AUDIT_LOG_TYPE_NAMES.AUTHORIZATION_INITIATED,
            'Success',
            `OAuth authorization initiated for MCP connection`,
            {
                connectionId: details.connectionId,
                serverId: details.serverId,
                issuerUrl: details.issuerUrl,
                requestedScopes: details.requestedScopes,
                usedDynamicRegistration: details.usedDynamicRegistration,
                stateParameter: details.stateParameter
            },
            details.connectionId,
            contextUser
        );
    }

    /**
     * Logs an OAuth authorization completed event.
     * T048: Implement audit logging for OAuth authorization completed event
     */
    public async logAuthorizationCompleted(
        details: AuthorizationCompletedDetails,
        contextUser: UserInfo
    ): Promise<void> {
        await this.logEvent(
            AUDIT_LOG_TYPE_NAMES.AUTHORIZATION_COMPLETED,
            'Success',
            `OAuth authorization completed for MCP connection`,
            {
                connectionId: details.connectionId,
                issuerUrl: details.issuerUrl,
                grantedScopes: details.grantedScopes,
                tokenExpiresAt: details.tokenExpiresAt.toISOString(),
                hasRefreshToken: details.hasRefreshToken
            },
            details.connectionId,
            contextUser
        );
    }

    /**
     * Logs an OAuth authorization failed event.
     * Part of T048 (covers failure cases)
     */
    public async logAuthorizationFailed(
        details: AuthorizationFailedDetails,
        contextUser: UserInfo
    ): Promise<void> {
        await this.logEvent(
            AUDIT_LOG_TYPE_NAMES.AUTHORIZATION_FAILED,
            'Failed',
            `OAuth authorization failed: ${details.errorCode}`,
            {
                connectionId: details.connectionId,
                issuerUrl: details.issuerUrl,
                errorCode: details.errorCode,
                errorDescription: details.errorDescription,
                isRetryable: details.isRetryable
            },
            details.connectionId,
            contextUser
        );
    }

    /**
     * Logs an OAuth token refreshed event.
     * T049: Implement audit logging for OAuth token refreshed event
     */
    public async logTokenRefreshed(
        details: TokenRefreshDetails,
        contextUser: UserInfo
    ): Promise<void> {
        await this.logEvent(
            AUDIT_LOG_TYPE_NAMES.TOKEN_REFRESHED,
            'Success',
            `OAuth tokens refreshed for MCP connection (refresh #${details.refreshCount})`,
            {
                connectionId: details.connectionId,
                issuerUrl: details.issuerUrl,
                newExpiresAt: details.newExpiresAt.toISOString(),
                refreshCount: details.refreshCount
            },
            details.connectionId,
            contextUser
        );
    }

    /**
     * Logs an OAuth token refresh failed event.
     * T050: Implement audit logging for OAuth token refresh failed event
     */
    public async logTokenRefreshFailed(
        details: TokenRefreshFailedDetails,
        contextUser: UserInfo
    ): Promise<void> {
        await this.logEvent(
            AUDIT_LOG_TYPE_NAMES.TOKEN_REFRESH_FAILED,
            'Failed',
            `OAuth token refresh failed${details.requiresReauthorization ? ' (requires re-authorization)' : ''}`,
            {
                connectionId: details.connectionId,
                issuerUrl: details.issuerUrl,
                errorMessage: details.errorMessage,
                requiresReauthorization: details.requiresReauthorization
            },
            details.connectionId,
            contextUser
        );
    }

    /**
     * Logs an OAuth credentials revoked event.
     * T051: Implement audit logging for OAuth credentials revoked event
     */
    public async logCredentialsRevoked(
        details: CredentialsRevokedDetails,
        contextUser: UserInfo
    ): Promise<void> {
        await this.logEvent(
            AUDIT_LOG_TYPE_NAMES.CREDENTIALS_REVOKED,
            'Success',
            `OAuth credentials revoked for MCP connection${details.reason ? `: ${details.reason}` : ''}`,
            {
                connectionId: details.connectionId,
                reason: details.reason,
                revokedBy: details.revokedBy
            },
            details.connectionId,
            contextUser
        );
    }

    // ========================================
    // Private Helper Methods
    // ========================================

    /**
     * Logs an audit event to the database.
     * Non-fatal - errors are logged but don't interrupt the caller.
     */
    private async logEvent(
        auditLogTypeName: string,
        status: 'Success' | 'Failed',
        description: string,
        details: Record<string, unknown>,
        connectionId: string,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            // Get the audit log type ID
            const auditLogTypeId = await this.getAuditLogTypeId(auditLogTypeName, contextUser);
            if (!auditLogTypeId) {
                // Audit log type not found - skip silently (may not be synced yet)
                LogStatus(`[OAuthAudit] Audit log type '${auditLogTypeName}' not found, skipping audit log`);
                return;
            }

            // Get the MCP Server Connections entity ID
            const entityId = await this.getMCPConnectionEntityId(contextUser);

            // Create the audit log record
            const md = new Metadata();
            const auditLog = await md.GetEntityObject<AuditLogEntity>('Audit Logs', contextUser);
            auditLog.NewRecord();

            auditLog.UserID = contextUser.ID;
            auditLog.AuditLogTypeID = auditLogTypeId;
            auditLog.Status = status;
            auditLog.Description = description;
            auditLog.Details = JSON.stringify(details);

            // Link to the MCP Server Connection entity and record
            if (entityId) {
                auditLog.EntityID = entityId;
                auditLog.RecordID = connectionId;
            }

            await auditLog.Save();

            LogStatus(`[OAuthAudit] Logged: ${description}`);
        } catch (error) {
            // Non-fatal - don't let audit logging failure break OAuth operations
            LogError(`[OAuthAudit] Failed to log audit event: ${error}`);
        }
    }

    /**
     * Gets the audit log type ID for a given type name.
     * Results are cached to avoid repeated database lookups.
     */
    private async getAuditLogTypeId(typeName: string, contextUser: UserInfo): Promise<string | null> {
        // Check cache first
        const cached = this.auditLogTypeCache.get(typeName);
        if (cached) {
            return cached;
        }

        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string }>({
                EntityName: 'Audit Log Types',
                ExtraFilter: `Name='${typeName.replace(/'/g, "''")}'`,
                Fields: ['ID'],
                ResultType: 'simple'
            }, contextUser);

            if (result.Success && result.Results && result.Results.length > 0) {
                const typeId = result.Results[0].ID;
                this.auditLogTypeCache.set(typeName, typeId);
                return typeId;
            }

            return null;
        } catch (error) {
            LogError(`[OAuthAudit] Failed to get audit log type ID: ${error}`);
            return null;
        }
    }

    /**
     * Gets the entity ID for MCP Server Connections.
     * Cached to avoid repeated lookups.
     */
    private async getMCPConnectionEntityId(contextUser: UserInfo): Promise<string | null> {
        if (this.mcpConnectionEntityId !== null) {
            return this.mcpConnectionEntityId || null;
        }

        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string }>({
                EntityName: 'Entities',
                ExtraFilter: `Name='MJ: MCP Server Connections'`,
                Fields: ['ID'],
                ResultType: 'simple'
            }, contextUser);

            if (result.Success && result.Results && result.Results.length > 0) {
                this.mcpConnectionEntityId = result.Results[0].ID;
                return this.mcpConnectionEntityId;
            }

            this.mcpConnectionEntityId = '';
            return null;
        } catch (error) {
            LogError(`[OAuthAudit] Failed to get MCP Connection entity ID: ${error}`);
            this.mcpConnectionEntityId = '';
            return null;
        }
    }
}

/**
 * Singleton instance for convenience
 */
let _auditLoggerInstance: OAuthAuditLogger | null = null;

/**
 * Gets the singleton OAuthAuditLogger instance.
 */
export function getOAuthAuditLogger(): OAuthAuditLogger {
    if (!_auditLoggerInstance) {
        _auditLoggerInstance = new OAuthAuditLogger();
    }
    return _auditLoggerInstance;
}
