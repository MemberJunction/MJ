import { BaseAgent } from './base-agent';
import { PayloadManager } from './PayloadManager';
import { ExecuteAgentParams, BaseAgentNextStep, MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import { format as formatSQL } from 'sql-formatter';

/**
 * Query Builder Agent - Orchestrator for building data queries.
 *
 * Extends BaseAgent to add post-processing when the agent completes:
 *  - Formats SQL in `metadata.sql` using sql-formatter for consistent,
 *    readable output regardless of how the LLM emitted it.
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
                language: 'tsql',
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
}
