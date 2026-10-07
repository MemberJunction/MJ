import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import type { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';

export interface ScopeDecision {
    Allowed: boolean;
    Reason: string;
}

export interface ScopeRequestContext {
    Endpoint: string;
    Method: string;
}

export interface WorkQueueScopeAuthorizer {
    /** `sessionUser` is the authenticated API-key user; its APIKeyActingContext rides along for filtered rules. */
    Authorize(apiKeyHash: string, scopePath: string, resource: string, sessionUser: UserInfo, request: ScopeRequestContext): Promise<ScopeDecision>;
}

/** Application whose ceiling applies to REST publishes — the same one MJServer's resolvers check against. */
export const WORK_QUEUE_API_APPLICATION = 'MJAPI';

/**
 * Mirrors ResolverBase.CheckAPIKeyScopeAuthorization (packages/MJServer/src/generic/ResolverBase.ts), which is
 * protected on the resolver base and so cannot be called from an Express route:
 *  1. rules are evaluated and usage is logged as the SYSTEM user — the API key's user may not be able to read scope
 *     rules or write usage logs;
 *  2. the `full_access` scope short-circuits the specific check (evaluated with skipLogging: it is a fast path,
 *     not the authorization decision);
 *  3. the session user's acting context is passed so filtered rules with {{Acting*}} tokens do not fail closed.
 * Callers without an API key never reach this class: the handler refuses them first (03 §9).
 */
export class APIKeyScopeAuthorizer implements WorkQueueScopeAuthorizer {
    constructor(private readonly getSystemUser: () => UserInfo | null = () => UserCache.Instance.GetSystemUser() ?? null) {}

    public async Authorize(apiKeyHash: string, scopePath: string, resource: string, sessionUser: UserInfo, request: ScopeRequestContext): Promise<ScopeDecision> {
        const systemUser = this.getSystemUser();
        if (!systemUser) {
            throw new Error('System user not found');
        }
        const engine = GetAPIKeyEngine();
        const http = { endpoint: request.Endpoint, method: request.Method };
        const fullAccess = await engine.Authorize(apiKeyHash, WORK_QUEUE_API_APPLICATION, 'full_access', '*', systemUser, http, { skipLogging: true });
        if (fullAccess.Allowed) {
            return { Allowed: true, Reason: 'full_access' };
        }
        const result = await engine.Authorize(apiKeyHash, WORK_QUEUE_API_APPLICATION, scopePath, resource, systemUser, http, {
            actingContext: sessionUser.APIKeyActingContext,
        });
        return { Allowed: result.Allowed, Reason: result.Reason };
    }
}
