/**
 * Scope Evaluator for API Key Authorization
 * Implements two-level evaluation: Application Ceiling -> Key Scopes
 * @module @memberjunction/api-keys
 */

import { RunView, UserInfo } from '@memberjunction/core';
import {
    APIApplicationScopeEntity,
    APIKeyApplicationEntity,
    APIKeyScopeEntity,
    APIScopeEntity
} from '@memberjunction/core-entities';
import { PatternMatcher } from './PatternMatcher';
import {
    AuthorizationRequest,
    AuthorizationResult,
    EvaluatedRule,
    ScopeRule,
    ScopeRuleMatch
} from './interfaces';

/**
 * Internal result from evaluating a single level (app or key)
 */
interface LevelEvaluationResult {
    allowed: boolean;
    reason: string;
    matchedRule: ScopeRuleMatch | undefined;
    evaluatedRules: EvaluatedRule[];
}

/**
 * Evaluates API key authorization using two-level scope evaluation:
 * 1. Application Ceiling (APIApplicationScope) - what the app allows
 * 2. Key Scopes (APIKeyScope) - what the key grants
 *
 * Both levels support pattern matching with Include/Exclude and Deny rules.
 * Deny rules always trump Allow rules at the same priority level.
 */
export class ScopeEvaluator {
    private _scopeCache: Map<string, APIScopeEntity[]> = new Map();
    private _appScopeCache: Map<string, APIApplicationScopeEntity[]> = new Map();
    private _keyScopeCache: Map<string, APIKeyScopeEntity[]> = new Map();
    private _keyAppCache: Map<string, APIKeyApplicationEntity[]> = new Map();
    private _cacheExpiryMs: number;
    private _lastCacheRefresh: number = 0;
    private _defaultBehaviorNoScopes: 'allow' | 'deny';

    constructor(cacheTTLMs: number = 60000, defaultBehaviorNoScopes: 'allow' | 'deny' = 'allow') {
        this._cacheExpiryMs = cacheTTLMs;
        this._defaultBehaviorNoScopes = defaultBehaviorNoScopes;
    }

    /**
     * Evaluate authorization for a request
     * @param request - The authorization request
     * @param contextUser - The user context for database operations
     * @returns Authorization result with detailed evaluation info
     */
    public async EvaluateAccess(
        request: AuthorizationRequest,
        contextUser: UserInfo
    ): Promise<AuthorizationResult> {
        const evaluatedRules: EvaluatedRule[] = [];

        // 1. Check if API key is bound to specific applications
        const keyApps = await this.loadKeyApplications(request.APIKeyId, contextUser);

        if (keyApps.length > 0) {
            const boundToThisApp = keyApps.some(ka => ka.ApplicationID === request.ApplicationId);
            if (!boundToThisApp) {
                return {
                    Allowed: false,
                    Reason: 'API key not authorized for this application',
                    EvaluatedRules: []
                };
            }
        }
        // If keyApps is empty, key works with all applications

        // 2. Evaluate application scope ceiling
        const appResult = await this.evaluateApplicationCeiling(
            request.ApplicationId,
            request.ScopePath,
            request.Resource,
            contextUser
        );
        evaluatedRules.push(...appResult.evaluatedRules);

        if (!appResult.allowed) {
            return {
                Allowed: false,
                Reason: appResult.reason,
                MatchedAppRule: appResult.matchedRule,
                EvaluatedRules: evaluatedRules
            };
        }

        // 3. Evaluate API key scope rules
        const keyResult = await this.evaluateKeyScopes(
            request.APIKeyId,
            request.ScopePath,
            request.Resource,
            contextUser
        );
        evaluatedRules.push(...keyResult.evaluatedRules);

        return {
            Allowed: keyResult.allowed,
            Reason: keyResult.reason,
            MatchedAppRule: appResult.matchedRule,
            MatchedKeyRule: keyResult.matchedRule,
            EvaluatedRules: evaluatedRules
        };
    }

    /**
     * Clear all caches
     */
    public ClearCache(): void {
        this._scopeCache.clear();
        this._appScopeCache.clear();
        this._keyScopeCache.clear();
        this._keyAppCache.clear();
    }

    /**
     * Evaluate application-level scope ceiling
     */
    private async evaluateApplicationCeiling(
        applicationId: string,
        scopePath: string,
        resource: string,
        contextUser: UserInfo
    ): Promise<LevelEvaluationResult> {
        const rules = await this.loadApplicationScopeRules(applicationId, scopePath, contextUser);
        return this.evaluateRules(rules, resource, 'application');
    }

    /**
     * Evaluate key-level scope rules.
     * If the key has no scope rules defined, applies the defaultBehaviorNoScopes setting.
     */
    private async evaluateKeyScopes(
        apiKeyId: string,
        scopePath: string,
        resource: string,
        contextUser: UserInfo
    ): Promise<LevelEvaluationResult> {
        const rules = await this.loadKeyScopeRules(apiKeyId, scopePath, contextUser);

        // If key has no scope rules for this scope, apply default behavior
        if (rules.length === 0) {
            if (this._defaultBehaviorNoScopes === 'allow') {
                return {
                    allowed: true,
                    reason: 'Key has no scope restrictions (default: allow)',
                    matchedRule: undefined,
                    evaluatedRules: []
                };
            }
            // Default deny behavior falls through to evaluateRules which will return denied
        }

        return this.evaluateRules(rules, resource, 'key');
    }

    /**
     * Evaluate a set of rules against a resource
     * Rules are sorted by Priority DESC, IsDeny DESC
     */
    private evaluateRules(
        rules: ScopeRule[],
        resource: string,
        level: 'application' | 'key'
    ): LevelEvaluationResult {
        const evaluatedRules: EvaluatedRule[] = [];

        // Sort: Priority DESC, then IsDeny DESC (deny rules first at same priority)
        const sortedRules = [...rules].sort((a, b) => {
            if (b.Priority !== a.Priority) {
                return b.Priority - a.Priority;
            }
            return (b.IsDeny ? 1 : 0) - (a.IsDeny ? 1 : 0);
        });

        for (const rule of sortedRules) {
            const evalResult = this.evaluateSingleRule(rule, resource, level);
            evaluatedRules.push(evalResult);

            if (evalResult.Matched) {
                if (rule.IsDeny) {
                    return {
                        allowed: false,
                        reason: `${level === 'application' ? 'Application' : 'Key'} denies access via rule ${rule.ID}`,
                        matchedRule: this.toRuleMatch(rule),
                        evaluatedRules
                    };
                }

                // First matching allow rule wins
                return {
                    allowed: true,
                    reason: `${level === 'application' ? 'Application' : 'Key'} allows access`,
                    matchedRule: this.toRuleMatch(rule),
                    evaluatedRules
                };
            }
        }

        // No matching rules
        const noMatchReason = level === 'application'
            ? 'Application does not allow this scope/resource combination'
            : 'No matching key scope rules';

        return {
            allowed: false,
            reason: noMatchReason,
            matchedRule: undefined,
            evaluatedRules
        };
    }

    /**
     * Evaluate a single rule against a resource
     */
    private evaluateSingleRule(
        rule: ScopeRule,
        resource: string,
        level: 'application' | 'key'
    ): EvaluatedRule {
        const matchResult = PatternMatcher.match(resource, rule.ResourcePattern);

        let matched: boolean;
        let result: 'Allowed' | 'Denied' | 'NoMatch';

        if (rule.PatternType === 'Include') {
            // Include: grant if pattern matches
            matched = matchResult.matched;
        } else {
            // Exclude: grant if pattern does NOT match
            matched = !matchResult.matched;
        }

        if (!matched) {
            result = 'NoMatch';
        } else if (rule.IsDeny) {
            result = 'Denied';
        } else {
            result = 'Allowed';
        }

        return {
            Level: level,
            Rule: this.toRuleMatch(rule),
            Matched: matched,
            PatternMatched: matchResult.matchedPattern,
            Result: result
        };
    }

    /**
     * Convert a ScopeRule to ScopeRuleMatch
     */
    private toRuleMatch(rule: ScopeRule): ScopeRuleMatch {
        return {
            Id: rule.ID,
            ScopeId: rule.ScopeID,
            ScopePath: rule.FullPath,
            Pattern: rule.ResourcePattern,
            PatternType: rule.PatternType,
            IsDeny: rule.IsDeny,
            Priority: rule.Priority
        };
    }

    /**
     * Get applications bound to a key (public accessor)
     */
    public async GetKeyApplications(
        apiKeyId: string,
        contextUser: UserInfo
    ): Promise<APIKeyApplicationEntity[]> {
        return this.loadKeyApplications(apiKeyId, contextUser);
    }

    /**
     * Load applications bound to a key
     */
    private async loadKeyApplications(
        apiKeyId: string,
        contextUser: UserInfo
    ): Promise<APIKeyApplicationEntity[]> {
        const cacheKey = `keyApp:${apiKeyId}`;

        if (this.isCacheValid() && this._keyAppCache.has(cacheKey)) {
            return this._keyAppCache.get(cacheKey)!;
        }

        const rv = new RunView();
        const result = await rv.RunView<APIKeyApplicationEntity>({
            EntityName: 'MJ: API Key Applications',
            ExtraFilter: `APIKeyID='${apiKeyId}'`,
            ResultType: 'entity_object'
        }, contextUser);

        const apps = result.Success ? result.Results : [];
        this._keyAppCache.set(cacheKey, apps);
        return apps;
    }

    /**
     * Load application scope rules for a scope path
     */
    private async loadApplicationScopeRules(
        applicationId: string,
        scopePath: string,
        contextUser: UserInfo
    ): Promise<ScopeRule[]> {
        const cacheKey = `appScope:${applicationId}:${scopePath}`;

        if (this.isCacheValid() && this._appScopeCache.has(cacheKey)) {
            const cached = this._appScopeCache.get(cacheKey)!;
            return this.toScopeRules(cached);
        }

        // First get the scope ID for this path
        const scope = await this.getScopeByPath(scopePath, contextUser);
        if (!scope) {
            return [];
        }

        const rv = new RunView();
        const result = await rv.RunView<APIApplicationScopeEntity>({
            EntityName: 'MJ: API Application Scopes',
            ExtraFilter: `ApplicationID='${applicationId}' AND ScopeID='${scope.ID}'`,
            OrderBy: 'Priority DESC',
            ResultType: 'entity_object'
        }, contextUser);

        const rules = result.Success ? result.Results : [];
        this._appScopeCache.set(cacheKey, rules);
        return this.toScopeRules(rules, scope.FullPath);
    }

    /**
     * Load key scope rules for a scope path
     */
    private async loadKeyScopeRules(
        apiKeyId: string,
        scopePath: string,
        contextUser: UserInfo
    ): Promise<ScopeRule[]> {
        const cacheKey = `keyScope:${apiKeyId}:${scopePath}`;

        if (this.isCacheValid() && this._keyScopeCache.has(cacheKey)) {
            const cached = this._keyScopeCache.get(cacheKey)!;
            return this.toScopeRulesFromKey(cached);
        }

        // First get the scope ID for this path
        const scope = await this.getScopeByPath(scopePath, contextUser);
        if (!scope) {
            return [];
        }

        const rv = new RunView();
        const result = await rv.RunView<APIKeyScopeEntity>({
            EntityName: 'MJ: API Key Scopes',
            ExtraFilter: `APIKeyID='${apiKeyId}' AND ScopeID='${scope.ID}'`,
            OrderBy: 'Priority DESC',
            ResultType: 'entity_object'
        }, contextUser);

        const rules = result.Success ? result.Results : [];
        this._keyScopeCache.set(cacheKey, rules);
        return this.toScopeRulesFromKey(rules, scope.FullPath);
    }

    /**
     * Get scope by full path
     */
    private async getScopeByPath(
        fullPath: string,
        contextUser: UserInfo
    ): Promise<APIScopeEntity | null> {
        const cacheKey = `scope:${fullPath}`;

        if (this.isCacheValid() && this._scopeCache.has(cacheKey)) {
            const cached = this._scopeCache.get(cacheKey)!;
            return cached.length > 0 ? cached[0] : null;
        }

        const rv = new RunView();
        const result = await rv.RunView<APIScopeEntity>({
            EntityName: 'MJ: API Scopes',
            ExtraFilter: `FullPath='${fullPath}' AND IsActive=1`,
            ResultType: 'entity_object'
        }, contextUser);

        const scopes = result.Success ? result.Results : [];
        this._scopeCache.set(cacheKey, scopes);
        return scopes.length > 0 ? scopes[0] : null;
    }

    /**
     * Convert APIApplicationScopeEntity to ScopeRule
     */
    private toScopeRules(
        entities: APIApplicationScopeEntity[],
        fullPath?: string
    ): ScopeRule[] {
        return entities.map(e => ({
            ID: e.ID,
            ScopeID: e.ScopeID,
            FullPath: fullPath || '',
            ResourcePattern: e.ResourcePattern,
            PatternType: e.PatternType as 'Include' | 'Exclude',
            IsDeny: e.IsDeny,
            Priority: e.Priority
        }));
    }

    /**
     * Convert APIKeyScopeEntity to ScopeRule
     */
    private toScopeRulesFromKey(
        entities: APIKeyScopeEntity[],
        fullPath?: string
    ): ScopeRule[] {
        return entities.map(e => ({
            ID: e.ID,
            ScopeID: e.ScopeID,
            FullPath: fullPath || '',
            ResourcePattern: e.ResourcePattern,
            PatternType: e.PatternType as 'Include' | 'Exclude',
            IsDeny: e.IsDeny,
            Priority: e.Priority
        }));
    }

    /**
     * Check if cache is still valid
     */
    private isCacheValid(): boolean {
        const now = Date.now();
        if (now - this._lastCacheRefresh > this._cacheExpiryMs) {
            this.ClearCache();
            this._lastCacheRefresh = now;
            return false;
        }
        return true;
    }
}
