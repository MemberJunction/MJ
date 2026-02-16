/**
 * Scope Evaluator for API Key Authorization
 * Implements two-level evaluation: Application Ceiling -> Key Scopes
 * Uses APIKeysEngineBase for cached metadata access.
 * @module @memberjunction/api-keys
 */

import { UserInfo } from '@memberjunction/core';
import {
    MJAPIApplicationScopeEntity,
    MJAPIKeyApplicationEntity,
    MJAPIKeyScopeEntity
} from '@memberjunction/core-entities';
import { APIKeysEngineBase } from '@memberjunction/api-keys-base';
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
 *
 * This class now uses APIKeysEngineBase for cached metadata access,
 * eliminating redundant per-request database queries.
 */
export class ScopeEvaluator {
    private _defaultBehaviorNoScopes: 'allow' | 'deny';

    constructor(defaultBehaviorNoScopes: 'allow' | 'deny' = 'allow') {
        this._defaultBehaviorNoScopes = defaultBehaviorNoScopes;
    }

    /**
     * Access to the cached metadata from APIKeysEngineBase
     */
    protected get Base(): APIKeysEngineBase {
        return APIKeysEngineBase.Instance;
    }

    /**
     * Evaluate authorization for a request.
     * Uses cached metadata from APIKeysEngineBase.
     * @param request - The authorization request
     * @param _contextUser - The user context (kept for API compatibility)
     * @returns Authorization result with detailed evaluation info
     */
    public async EvaluateAccess(
        request: AuthorizationRequest,
        _contextUser: UserInfo
    ): Promise<AuthorizationResult> {
        const evaluatedRules: EvaluatedRule[] = [];

        // 1. Check if API key is bound to specific applications (from Base cache)
        const keyApps = this.Base.GetKeyApplicationsByKeyId(request.APIKeyId);

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
        const appResult = this.evaluateApplicationCeiling(
            request.ApplicationId,
            request.ScopePath,
            request.Resource
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
        const keyResult = this.evaluateKeyScopes(
            request.APIKeyId,
            request.ScopePath,
            request.Resource
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
     * Clear cache - delegates to Base engine
     * @deprecated Use APIKeysEngineBase.Instance.Config(true) to force refresh instead
     */
    public ClearCache(): void {
        // The Base engine manages its own cache now.
        // To force a refresh, call APIKeysEngineBase.Instance.Config(true, contextUser)
    }

    /**
     * Evaluate application-level scope ceiling
     * Uses cached data from APIKeysEngineBase
     */
    private evaluateApplicationCeiling(
        applicationId: string,
        scopePath: string,
        resource: string
    ): LevelEvaluationResult {
        const rules = this.getApplicationScopeRules(applicationId, scopePath);
        return this.evaluateRules(rules, resource, 'application');
    }

    /**
     * Evaluate key-level scope rules.
     * If the key has no scope rules defined, applies the defaultBehaviorNoScopes setting.
     * Uses cached data from APIKeysEngineBase
     */
    private evaluateKeyScopes(
        apiKeyId: string,
        scopePath: string,
        resource: string
    ): LevelEvaluationResult {
        const rules = this.getKeyScopeRules(apiKeyId, scopePath);

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
     * Get applications bound to a key.
     * Uses cached data from APIKeysEngineBase.
     * @param apiKeyId - The API key ID
     * @param _contextUser - Kept for API compatibility
     */
    public async GetKeyApplications(
        apiKeyId: string,
        _contextUser: UserInfo
    ): Promise<MJAPIKeyApplicationEntity[]> {
        return this.Base.GetKeyApplicationsByKeyId(apiKeyId);
    }

    /**
     * Get application scope rules for a scope path.
     * Uses cached data from APIKeysEngineBase.
     */
    private getApplicationScopeRules(
        applicationId: string,
        scopePath: string
    ): ScopeRule[] {
        // Get the scope by path from cache
        const scope = this.Base.GetScopeByPath(scopePath);
        if (!scope) {
            return [];
        }

        // Get application scope rules from cache
        const appScopes = this.Base.GetApplicationScopeRules(applicationId, scope.ID);
        return this.toScopeRules(appScopes, scope.FullPath);
    }

    /**
     * Get key scope rules for a scope path.
     * Uses cached data from APIKeysEngineBase.
     */
    private getKeyScopeRules(
        apiKeyId: string,
        scopePath: string
    ): ScopeRule[] {
        // Get the scope by path from cache
        const scope = this.Base.GetScopeByPath(scopePath);
        if (!scope) {
            return [];
        }

        // Get key scope rules from cache
        const keyScopes = this.Base.GetKeyScopeRules(apiKeyId, scope.ID);
        return this.toScopeRulesFromKey(keyScopes, scope.FullPath);
    }

    /**
     * Convert MJAPIApplicationScopeEntity to ScopeRule
     */
    private toScopeRules(
        entities: MJAPIApplicationScopeEntity[],
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
     * Convert MJAPIKeyScopeEntity to ScopeRule
     */
    private toScopeRulesFromKey(
        entities: MJAPIKeyScopeEntity[],
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
}
