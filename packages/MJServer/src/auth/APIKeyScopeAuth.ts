/**
 * API Key Scope Authorization Utilities
 * Provides utilities for checking API key scopes in resolvers
 * @module @memberjunction/server
 */

import { AuthorizationError } from 'type-graphql';
import { GetAPIKeyEngine, AuthorizationResult, AuthorizationRequest } from '@memberjunction/api-keys';
import { UserInfo, RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { MJAPIKeyEntity, MJAPIApplicationEntity } from '@memberjunction/core-entities';

/**
 * Application names used by the API Key authorization system
 */
export type ApplicationName = 'MJAPI' | 'MCPServer' | 'A2AServer' | string;

/**
 * Options for scope authorization
 */
export interface ScopeAuthOptions {
    /** The application making the request (default: 'MJAPI') */
    applicationName?: ApplicationName;
    /** Resource being accessed (e.g., entity name, action name) */
    resource?: string;
    /** Whether to throw an error on denied access (default: true) */
    throwOnDenied?: boolean;
}

/**
 * Result of scope authorization check
 */
export interface ScopeAuthResult {
    /** Whether access is allowed */
    Allowed: boolean;
    /** Human-readable reason for the decision */
    Reason?: string;
    /** Whether scope checking was performed (false if no API key or enforcement disabled) */
    Checked: boolean;
    /** All rules evaluated during the check */
    EvaluatedRules?: AuthorizationResult['EvaluatedRules'];
}

/**
 * Outcome of the shared scope decision used by both public check functions.
 * - `skipped`: no API key on the request, so scope checking does not apply.
 * - `denied`: refused before the scope evaluator ran (key or application problem).
 *   `ApplicationId` is set when the application row was found (e.g. it is inactive).
 * - `evaluated`: the scope evaluator ran; its result decides access.
 */
type ScopeDecision =
    | { Kind: 'skipped' }
    | { Kind: 'denied'; Reason: string; ApplicationId?: string }
    | { Kind: 'evaluated'; APIKeyId: string; ApplicationId: string; AuthResult: AuthorizationResult };

/**
 * The single decision path behind {@link CheckAPIKeyScope} and {@link CheckAPIKeyScopeAndLog}:
 * key lookup, application lookup, the application-active ceiling, then the scope evaluator.
 * Keeping it in one place means the two public variants cannot drift apart on what they enforce.
 */
async function decideAPIKeyScope(
    apiKeyId: string | undefined,
    scopePath: string,
    contextUser: UserInfo,
    applicationName: ApplicationName,
    resource: string
): Promise<ScopeDecision> {
    // If no API key ID, not authenticated via API key - skip scope check
    if (!apiKeyId) {
        return { Kind: 'skipped' };
    }

    const rv = new RunView();
    const keyResult = await rv.RunView<MJAPIKeyEntity>({
        EntityName: 'MJ: API Keys',
        ExtraFilter: `ID='${EscapeSQLString(apiKeyId)}'`,
        ResultType: 'entity_object'
    }, contextUser);

    if (!keyResult.Success || keyResult.Results.length === 0) {
        return { Kind: 'denied', Reason: 'API key not found' };
    }
    const apiKey = keyResult.Results[0];

    const appResult = await rv.RunView<MJAPIApplicationEntity>({
        EntityName: 'MJ: API Applications',
        ExtraFilter: `Name='${EscapeSQLString(applicationName)}'`,
        ResultType: 'entity_object'
    }, contextUser);

    if (!appResult.Success || appResult.Results.length === 0) {
        return { Kind: 'denied', Reason: `Unknown application: ${applicationName}` };
    }
    const app = appResult.Results[0];

    if (!app.IsActive) {
        return { Kind: 'denied', Reason: `Application is not active: ${applicationName}`, ApplicationId: app.ID };
    }

    const request: AuthorizationRequest = {
        APIKeyId: apiKeyId,
        UserId: apiKey.UserID,
        ApplicationId: app.ID,
        ScopePath: scopePath,
        Resource: resource
    };

    // Use the scope evaluator directly (since we already have the key ID)
    const authResult = await GetAPIKeyEngine().GetScopeEvaluator().EvaluateAccess(request, contextUser);
    return { Kind: 'evaluated', APIKeyId: apiKeyId, ApplicationId: app.ID, AuthResult: authResult };
}

/** Message thrown when the scope evaluator denies a request. */
function scopeDeniedMessage(scopePath: string, resource: string, reason: string | undefined): string {
    const scopeDisplay = resource !== '*' ? `${scopePath} (${resource})` : scopePath;
    return `API key does not have permission for scope: ${scopeDisplay}. ${reason || ''}`;
}

/**
 * Check if an API key has the required scope for an operation.
 *
 * This function implements the three-tier permission model:
 * 1. User Permissions - What the user can do (already checked by authentication)
 * 2. Application Ceiling - Maximum scope the application allows
 * 3. API Key Scopes - Specific scopes granted to this key
 *
 * @param apiKeyId - The API key ID from context.userPayload.apiKeyId
 * @param scopePath - The scope path required (e.g., 'view:run', 'agent:execute')
 * @param contextUser - The authenticated user from context.userPayload.userRecord
 * @param options - Additional options for scope checking
 * @returns ScopeAuthResult with authorization details
 * @throws AuthorizationError if access is denied and throwOnDenied is true
 *
 * @example
 * ```typescript
 * // In a resolver
 * async runView(@Ctx() ctx: AppContext): Promise<ViewResult> {
 *   await CheckAPIKeyScope(
 *     ctx.userPayload.apiKeyId,
 *     'view:run',
 *     ctx.userPayload.userRecord,
 *     { resource: 'User' }
 *   );
 *   // ... proceed with operation
 * }
 * ```
 */
export async function CheckAPIKeyScope(
    apiKeyId: string | undefined,
    scopePath: string,
    contextUser: UserInfo,
    options: ScopeAuthOptions = {}
): Promise<ScopeAuthResult> {
    const {
        applicationName = 'MJAPI',
        resource = '*',
        throwOnDenied = true
    } = options;

    const decision = await decideAPIKeyScope(apiKeyId, scopePath, contextUser, applicationName, resource);

    if (decision.Kind === 'skipped') {
        return { Allowed: true, Checked: false, Reason: 'Not authenticated via API key' };
    }
    if (decision.Kind === 'denied') {
        if (throwOnDenied) {
            throw new AuthorizationError(decision.Reason);
        }
        return { Allowed: false, Checked: true, Reason: decision.Reason };
    }

    const authResult = decision.AuthResult;
    if (!authResult.Allowed && throwOnDenied) {
        throw new AuthorizationError(scopeDeniedMessage(scopePath, resource, authResult.Reason));
    }

    return {
        Allowed: authResult.Allowed,
        Reason: authResult.Reason,
        Checked: true,
        EvaluatedRules: authResult.EvaluatedRules
    };
}

/**
 * Check if an API key has the required scope and log usage.
 *
 * Same decision as CheckAPIKeyScope (including the application-active ceiling), plus a usage-log
 * row for every request that reaches a known application.
 * Use this for operations where you want detailed audit trails.
 *
 * @param apiKeyId - The API key ID from context.userPayload.apiKeyId
 * @param scopePath - The scope path required
 * @param contextUser - The authenticated user
 * @param usageDetails - Details about the request for logging
 * @param options - Additional options for scope checking
 * @returns ScopeAuthResult with authorization details and optional log ID
 */
export async function CheckAPIKeyScopeAndLog(
    apiKeyId: string | undefined,
    scopePath: string,
    contextUser: UserInfo,
    usageDetails: {
        endpoint: string;
        method: string;
        operationName?: string;
        ipAddress?: string;
        userAgent?: string;
        statusCode?: number;
        responseTimeMs?: number;
    },
    options: ScopeAuthOptions = {}
): Promise<ScopeAuthResult & { LogId?: string }> {
    const {
        applicationName = 'MJAPI',
        resource = '*',
        throwOnDenied = true
    } = options;

    const decision = await decideAPIKeyScope(apiKeyId, scopePath, contextUser, applicationName, resource);

    if (decision.Kind === 'skipped') {
        return { Allowed: true, Checked: false, Reason: 'Not authenticated via API key' };
    }

    const usageLogger = GetAPIKeyEngine().GetUsageLogger();

    if (decision.Kind === 'denied') {
        // Key-not-found and unknown-application denials have no application row to attribute
        // the log to, so only a denial with a known application (e.g. inactive) is logged.
        let deniedLogId: string | undefined;
        if (apiKeyId && decision.ApplicationId) {
            deniedLogId = (await usageLogger.LogDenied(
                apiKeyId,
                decision.ApplicationId,
                usageDetails.endpoint,
                usageDetails.operationName || null,
                usageDetails.method,
                usageDetails.statusCode ?? 403,
                usageDetails.responseTimeMs || null,
                resource,
                [],
                decision.Reason,
                usageDetails.ipAddress || null,
                usageDetails.userAgent || null,
                contextUser
            )) || undefined;
        }
        if (throwOnDenied) {
            throw new AuthorizationError(decision.Reason);
        }
        return { Allowed: false, Checked: true, Reason: decision.Reason, LogId: deniedLogId };
    }

    const authResult = decision.AuthResult;
    const appId = decision.ApplicationId;
    const statusCode = usageDetails.statusCode ?? (authResult.Allowed ? 200 : 403);

    let logId: string | undefined;
    if (authResult.Allowed) {
        logId = (await usageLogger.LogSuccess(
            decision.APIKeyId,
            appId,
            usageDetails.endpoint,
            usageDetails.operationName || null,
            usageDetails.method,
            statusCode,
            usageDetails.responseTimeMs || null,
            resource,
            authResult.EvaluatedRules,
            usageDetails.ipAddress || null,
            usageDetails.userAgent || null,
            contextUser
        )) || undefined;
    } else {
        logId = (await usageLogger.LogDenied(
            decision.APIKeyId,
            appId,
            usageDetails.endpoint,
            usageDetails.operationName || null,
            usageDetails.method,
            statusCode,
            usageDetails.responseTimeMs || null,
            resource,
            authResult.EvaluatedRules,
            authResult.Reason,
            usageDetails.ipAddress || null,
            usageDetails.userAgent || null,
            contextUser
        )) || undefined;
    }

    if (!authResult.Allowed && throwOnDenied) {
        throw new AuthorizationError(scopeDeniedMessage(scopePath, resource, authResult.Reason));
    }

    return {
        Allowed: authResult.Allowed,
        Reason: authResult.Reason,
        Checked: true,
        EvaluatedRules: authResult.EvaluatedRules,
        LogId: logId
    };
}

/**
 * Decorator-style function for common scope checks.
 * Returns a function that can be used in resolvers.
 *
 * @param scopePath - The scope path required
 * @param options - Additional options
 * @returns A function that performs the scope check
 *
 * @example
 * ```typescript
 * const requireViewRun = RequireScope('view:run');
 *
 * // In resolver
 * async runView(@Ctx() ctx: AppContext): Promise<ViewResult> {
 *   await requireViewRun(ctx);
 *   // ... proceed
 * }
 * ```
 */
export function RequireScope(scopePath: string, options: Omit<ScopeAuthOptions, 'resource'> = {}) {
    return async (ctx: { userPayload: { apiKeyId?: string; userRecord: UserInfo } }, resource?: string) => {
        await CheckAPIKeyScope(
            ctx.userPayload.apiKeyId,
            scopePath,
            ctx.userPayload.userRecord,
            { ...options, resource }
        );
    };
}

// Pre-built scope checkers for common operations
export const RequireViewRun = RequireScope('view:run');
export const RequireQueryRun = RequireScope('query:run');
export const RequireAgentExecute = RequireScope('agent:execute');
