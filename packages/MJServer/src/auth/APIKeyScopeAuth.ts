/**
 * API Key Scope Authorization Utilities
 * Provides utilities for checking API key scopes in resolvers
 * @module @memberjunction/server
 */

import { AuthorizationError } from 'type-graphql';
import { GetAPIKeyEngine, AuthorizationResult, AuthorizationRequest } from '@memberjunction/api-keys';
import { UserInfo, RunView } from '@memberjunction/core';
import { APIKeyEntity, APIApplicationEntity } from '@memberjunction/core-entities';

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

    // If no API key ID, not authenticated via API key - skip scope check
    if (!apiKeyId) {
        return {
            Allowed: true,
            Checked: false,
            Reason: 'Not authenticated via API key'
        };
    }

    const engine = GetAPIKeyEngine();

    // Get the API key to find the user ID
    const rv = new RunView();
    const keyResult = await rv.RunView<APIKeyEntity>({
        EntityName: 'MJ: API Keys',
        ExtraFilter: `ID='${apiKeyId}'`,
        ResultType: 'entity_object'
    }, contextUser);

    if (!keyResult.Success || keyResult.Results.length === 0) {
        const result: ScopeAuthResult = {
            Allowed: false,
            Checked: true,
            Reason: 'API key not found'
        };
        if (throwOnDenied) {
            throw new AuthorizationError(result.Reason);
        }
        return result;
    }

    const apiKey = keyResult.Results[0];

    // Get the application by name
    const appResult = await rv.RunView<APIApplicationEntity>({
        EntityName: 'MJ: API Applications',
        ExtraFilter: `Name='${applicationName}'`,
        ResultType: 'entity_object'
    }, contextUser);

    if (!appResult.Success || appResult.Results.length === 0) {
        const result: ScopeAuthResult = {
            Allowed: false,
            Checked: true,
            Reason: `Unknown application: ${applicationName}`
        };
        if (throwOnDenied) {
            throw new AuthorizationError(result.Reason);
        }
        return result;
    }

    const app = appResult.Results[0];

    if (!app.IsActive) {
        const result: ScopeAuthResult = {
            Allowed: false,
            Checked: true,
            Reason: `Application is not active: ${applicationName}`
        };
        if (throwOnDenied) {
            throw new AuthorizationError(result.Reason);
        }
        return result;
    }

    // Build the authorization request
    const request: AuthorizationRequest = {
        APIKeyId: apiKeyId,
        UserId: apiKey.UserID,
        ApplicationId: app.ID,
        ScopePath: scopePath,
        Resource: resource
    };

    // Use the scope evaluator directly (since we already have the key ID)
    const scopeEvaluator = engine.GetScopeEvaluator();
    const authResult = await scopeEvaluator.EvaluateAccess(request, contextUser);

    if (!authResult.Allowed && throwOnDenied) {
        const scopeDisplay = resource !== '*' ? `${scopePath} (${resource})` : scopePath;
        throw new AuthorizationError(
            `API key does not have permission for scope: ${scopeDisplay}. ${authResult.Reason || ''}`
        );
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
 * Same as CheckAPIKeyScope but also logs the authorization attempt.
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

    // If no API key ID, not authenticated via API key - skip scope check
    if (!apiKeyId) {
        return {
            Allowed: true,
            Checked: false,
            Reason: 'Not authenticated via API key'
        };
    }

    const engine = GetAPIKeyEngine();
    const rv = new RunView();

    // Get the API key
    const keyResult = await rv.RunView<APIKeyEntity>({
        EntityName: 'MJ: API Keys',
        ExtraFilter: `ID='${apiKeyId}'`,
        ResultType: 'entity_object'
    }, contextUser);

    if (!keyResult.Success || keyResult.Results.length === 0) {
        const result: ScopeAuthResult & { LogId?: string } = {
            Allowed: false,
            Checked: true,
            Reason: 'API key not found'
        };
        if (throwOnDenied) {
            throw new AuthorizationError(result.Reason);
        }
        return result;
    }

    const apiKey = keyResult.Results[0];

    // Get the application
    const appResult = await rv.RunView<APIApplicationEntity>({
        EntityName: 'MJ: API Applications',
        ExtraFilter: `Name='${applicationName}'`,
        ResultType: 'entity_object'
    }, contextUser);

    if (!appResult.Success || appResult.Results.length === 0) {
        const result: ScopeAuthResult & { LogId?: string } = {
            Allowed: false,
            Checked: true,
            Reason: `Unknown application: ${applicationName}`
        };
        if (throwOnDenied) {
            throw new AuthorizationError(result.Reason);
        }
        return result;
    }

    const app = appResult.Results[0];

    // Build the authorization request
    const request: AuthorizationRequest = {
        APIKeyId: apiKeyId,
        UserId: apiKey.UserID,
        ApplicationId: app.ID,
        ScopePath: scopePath,
        Resource: resource
    };

    // Evaluate access
    const scopeEvaluator = engine.GetScopeEvaluator();
    const authResult = await scopeEvaluator.EvaluateAccess(request, contextUser);

    // Log the usage
    const usageLogger = engine.GetUsageLogger();
    const statusCode = usageDetails.statusCode ?? (authResult.Allowed ? 200 : 403);

    let logId: string | undefined;
    if (authResult.Allowed) {
        logId = (await usageLogger.LogSuccess(
            apiKeyId,
            app.ID,
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
            apiKeyId,
            app.ID,
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
        const scopeDisplay = resource !== '*' ? `${scopePath} (${resource})` : scopePath;
        throw new AuthorizationError(
            `API key does not have permission for scope: ${scopeDisplay}. ${authResult.Reason || ''}`
        );
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
