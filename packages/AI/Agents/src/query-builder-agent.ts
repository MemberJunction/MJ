import { BaseAgent } from './base-agent';
import { PayloadManager } from './PayloadManager';
import { ExecuteAgentParams, BaseAgentNextStep, MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import { BaseEntity, DatabasePlatform, ResolvePlatformKey, ResolveSQLFormatterLanguage } from '@memberjunction/core';
import { format as formatSQL, supportedDialects } from 'sql-formatter';
import type { SqlLanguage } from 'sql-formatter';

/**
 * Query Builder Agent - Orchestrator for building data queries.
 *
 * Extends BaseAgent to add post-processing when the agent completes:
 *  - Formats SQL in `metadata.sql` using sql-formatter for consistent,
 *    readable output regardless of how the LLM emitted it. The formatter's
 *    language is derived from the tenant's own data provider, so a PostgreSQL
 *    tenant is not re-formatted as T-SQL.
 */
@RegisterClass(BaseAgent, 'QueryBuilderAgent')
export class QueryBuilderAgent extends BaseAgent {

    /**
     * After the base validation passes, format the SQL in the payload
     * so it is always stored with proper indentation and line breaks.
     */
    protected override async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // Run base validation first (min-execution checks, payload schema, etc.)
        const baseResult = await super.validateSuccessNextStep(params, nextStep, currentPayload, agentRun, currentStep);
        if (baseResult.step === 'Retry') {
            return baseResult;
        }

        // Resolve the effective payload: apply any pending change request
        const effectivePayload = this.resolveEffectivePayload<P>(currentPayload, baseResult);

        // Format SQL if present
        const formatted = this.formatPayloadSql<P>(effectivePayload);
        if (formatted) {
            return {
                ...baseResult,
                newPayload: formatted
            };
        }

        return baseResult;
    }

    /**
     * Applies payload change request (if any) to produce the actual payload
     * that will be persisted.
     */
    private resolveEffectivePayload<P>(currentPayload: P, nextStep: BaseAgentNextStep<P>): P {
        if (nextStep.payloadChangeRequest) {
            const pm = new PayloadManager();
            const result = pm.applyAgentChangeRequest<P>(currentPayload, nextStep.payloadChangeRequest);
            return result.result || currentPayload;
        }
        if (nextStep.newPayload) {
            return nextStep.newPayload;
        }
        return currentPayload;
    }

    /**
     * Looks for `metadata.sql` in the payload and formats it with sql-formatter.
     * Returns a new payload with the formatted SQL, or null if no formatting was needed.
     */
    private formatPayloadSql<P>(payload: P): P | null {
        const p = payload as Record<string, unknown>;
        const metadata = p?.metadata as Record<string, unknown> | undefined;
        const rawSql = metadata?.sql;

        if (typeof rawSql !== 'string' || rawSql.trim().length === 0) {
            return null;
        }

        try {
            const formatted = formatSQL(rawSql, {
                language: this.resolveFormatterLanguage(),
                tabWidth: 4,
                keywordCase: 'upper',
                linesBetweenQueries: 2
            });

            // Only update if formatting actually changed something
            if (formatted === rawSql) {
                return null;
            }

            return {
                ...p,
                metadata: {
                    ...metadata,
                    sql: formatted
                }
            } as P;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`QueryBuilderAgent: sql-formatter failed, keeping original SQL. Error: ${message}`);
            return null;
        }
    }

    /**
     * The sql-formatter language matching the platform this tenant's SQL will
     * actually run on.
     *
     * Previously hardcoded to `'tsql'`, which re-formatted a PostgreSQL tenant's
     * SQL against T-SQL rules. The language is declared by the SQLDialect, so it
     * follows `provider.PlatformKey` with no per-dialect map here.
     *
     * Falls back to generic `'sql'` if a dialect ever names a language this
     * sql-formatter build does not ship — formatting is cosmetic, so degrading
     * beats throwing.
     *
     * The provider read is guarded: `BaseEntity.Provider` THROWS when there is no
     * global object store, and formatting used to work without one. A cosmetic
     * step must never be the reason a payload loses its SQL.
     */
    private resolveFormatterLanguage(): SqlLanguage {
        let platform: DatabasePlatform;
        try {
            platform = ResolvePlatformKey(BaseEntity.Provider);
        } catch {
            platform = ResolvePlatformKey(undefined);
        }
        const language = ResolveSQLFormatterLanguage(platform);
        return (supportedDialects as readonly string[]).includes(language)
            ? (language as SqlLanguage)
            : 'sql';
    }
}
