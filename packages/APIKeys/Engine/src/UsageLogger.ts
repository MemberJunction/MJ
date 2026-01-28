/**
 * Usage Logger for API Key Authorization
 * Records detailed audit trail of API key usage and authorization decisions
 * @module @memberjunction/api-keys
 */

import { Metadata, UserInfo } from '@memberjunction/core';
import { APIKeyUsageLogEntity } from '@memberjunction/core-entities';
import { UsageLogEntry, EvaluatedRule } from './interfaces';

/**
 * Logs API key usage with detailed authorization evaluation information
 */
export class UsageLogger {
    /**
     * Log a usage entry to the database
     * @param entry - The usage log entry to record
     * @param contextUser - The user context for database operations
     * @returns The created log entity ID, or null if logging failed
     */
    public async Log(entry: UsageLogEntry, contextUser: UserInfo): Promise<string | null> {
        try {
            const md = new Metadata();
            const logEntity = await md.GetEntityObject<APIKeyUsageLogEntity>(
                'MJ: API Key Usage Logs',
                contextUser
            );

            logEntity.NewRecord();
            logEntity.APIKeyID = entry.APIKeyId;
            logEntity.ApplicationID = entry.ApplicationId;
            logEntity.Endpoint = entry.Endpoint;
            logEntity.Operation = entry.Operation;
            logEntity.Method = entry.Method;
            logEntity.StatusCode = entry.StatusCode;
            logEntity.ResponseTimeMs = entry.ResponseTimeMs;
            logEntity.IPAddress = entry.IPAddress;
            logEntity.UserAgent = entry.UserAgent;
            logEntity.RequestedResource = entry.RequestedResource;
            logEntity.ScopesEvaluated = this.serializeEvaluatedRules(entry.ScopesEvaluated);
            logEntity.AuthorizationResult = entry.AuthorizationResult;
            logEntity.DeniedReason = entry.DeniedReason;

            const saved = await logEntity.Save();
            return saved ? logEntity.ID : null;
        } catch (error) {
            console.error('Failed to log API key usage:', error);
            return null;
        }
    }

    /**
     * Log a successful request
     */
    public async LogSuccess(
        apiKeyId: string,
        applicationId: string | null,
        endpoint: string,
        operation: string | null,
        method: string,
        statusCode: number,
        responseTimeMs: number | null,
        requestedResource: string | null,
        evaluatedRules: EvaluatedRule[],
        ipAddress: string | null,
        userAgent: string | null,
        contextUser: UserInfo
    ): Promise<string | null> {
        return this.Log({
            APIKeyId: apiKeyId,
            ApplicationId: applicationId,
            Endpoint: endpoint,
            Operation: operation,
            Method: method,
            StatusCode: statusCode,
            ResponseTimeMs: responseTimeMs,
            IPAddress: ipAddress,
            UserAgent: userAgent,
            RequestedResource: requestedResource,
            ScopesEvaluated: evaluatedRules,
            AuthorizationResult: 'Allowed',
            DeniedReason: null
        }, contextUser);
    }

    /**
     * Log a denied request
     */
    public async LogDenied(
        apiKeyId: string,
        applicationId: string | null,
        endpoint: string,
        operation: string | null,
        method: string,
        statusCode: number,
        responseTimeMs: number | null,
        requestedResource: string | null,
        evaluatedRules: EvaluatedRule[],
        deniedReason: string,
        ipAddress: string | null,
        userAgent: string | null,
        contextUser: UserInfo
    ): Promise<string | null> {
        return this.Log({
            APIKeyId: apiKeyId,
            ApplicationId: applicationId,
            Endpoint: endpoint,
            Operation: operation,
            Method: method,
            StatusCode: statusCode,
            ResponseTimeMs: responseTimeMs,
            IPAddress: ipAddress,
            UserAgent: userAgent,
            RequestedResource: requestedResource,
            ScopesEvaluated: evaluatedRules,
            AuthorizationResult: 'Denied',
            DeniedReason: deniedReason
        }, contextUser);
    }

    /**
     * Log a request that didn't require scope checking
     */
    public async LogNoScopesRequired(
        apiKeyId: string,
        applicationId: string | null,
        endpoint: string,
        operation: string | null,
        method: string,
        statusCode: number,
        responseTimeMs: number | null,
        ipAddress: string | null,
        userAgent: string | null,
        contextUser: UserInfo
    ): Promise<string | null> {
        return this.Log({
            APIKeyId: apiKeyId,
            ApplicationId: applicationId,
            Endpoint: endpoint,
            Operation: operation,
            Method: method,
            StatusCode: statusCode,
            ResponseTimeMs: responseTimeMs,
            IPAddress: ipAddress,
            UserAgent: userAgent,
            RequestedResource: null,
            ScopesEvaluated: [],
            AuthorizationResult: 'NoScopesRequired',
            DeniedReason: null
        }, contextUser);
    }

    /**
     * Serialize evaluated rules to JSON for storage
     */
    private serializeEvaluatedRules(rules: EvaluatedRule[]): string {
        return JSON.stringify(rules.map(r => ({
            level: r.Level,
            ruleId: r.Rule.Id,
            scopePath: r.Rule.ScopePath,
            pattern: r.Rule.Pattern,
            patternType: r.Rule.PatternType,
            isDeny: r.Rule.IsDeny,
            priority: r.Rule.Priority,
            matched: r.Matched,
            patternMatched: r.PatternMatched,
            result: r.Result
        })));
    }

    /**
     * Parse evaluated rules from JSON storage
     */
    public static ParseEvaluatedRules(json: string | null): EvaluatedRule[] {
        if (!json) return [];

        try {
            const parsed = JSON.parse(json);
            return parsed.map((r: Record<string, unknown>) => ({
                Level: r.level as 'application' | 'key',
                Rule: {
                    Id: r.ruleId as string,
                    ScopeId: '',  // Not stored in compact format
                    ScopePath: r.scopePath as string,
                    Pattern: r.pattern as string | null,
                    PatternType: r.patternType as 'Include' | 'Exclude',
                    IsDeny: r.isDeny as boolean,
                    Priority: r.priority as number
                },
                Matched: r.matched as boolean,
                PatternMatched: r.patternMatched as string | null,
                Result: r.result as 'Allowed' | 'Denied' | 'NoMatch'
            }));
        } catch {
            return [];
        }
    }
}
