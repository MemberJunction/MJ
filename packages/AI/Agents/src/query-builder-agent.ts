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

        // Resolve the effective payload and strip mutually-exclusive stale format keys
        return this.postProcessQueryBuilderStep(baseResult, currentPayload);
    }

    /**
     * Query Builder is a conversational agent that finishes turns with `step: 'Chat'`
     * (`AwaitingFeedback`) rather than `step: 'Success'`. Apply the same format normalization
     * and SQL formatting on Chat steps so every emitted artifact version is clean.
     */
    protected override async validateChatNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const baseResult = await super.validateChatNextStep(params, nextStep, currentPayload, agentRun, currentStep);
        if (baseResult.step !== 'Chat') {
            return baseResult;
        }
        return this.postProcessQueryBuilderStep(baseResult, currentPayload);
    }

    private postProcessQueryBuilderStep<P>(baseResult: BaseAgentNextStep<P>, currentPayload: P): BaseAgentNextStep<P> {
        const effectivePayload = this.normalizePayloadFormat<P>(
            this.resolveEffectivePayload<P>(currentPayload, baseResult),
            baseResult
        );

        const formatted = this.formatPayloadSql<P>(effectivePayload) ?? effectivePayload;
        if (formatted !== currentPayload) {
            return {
                ...baseResult,
                newPayload: formatted
            };
        }

        return baseResult;
    }

    private resolveEffectivePayload<P>(currentPayload: P, nextStep: BaseAgentNextStep<P>): P {
        if (nextStep.payloadChangeRequest) {
            const pm = new PayloadManager();
            const base = nextStep.artifactDirective?.behavior === 'create-new' ? ({} as P) : currentPayload;
            const result = pm.applyAgentChangeRequest<P>(base, nextStep.payloadChangeRequest);
            return result.result || currentPayload;
        }
        if (nextStep.newPayload) {
            return nextStep.newPayload;
        }
        return currentPayload;
    }

    /**
     * Ensures a single-table DataArtifactSpec (`columns`/`rows`) does not retain stale `tables`
     * (and vice versa) when a turn transitions between single-table and multi-table formats.
     */
    protected normalizePayloadFormat<P>(payload: P, nextStep: BaseAgentNextStep<P>): P {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return payload;
        }
        const p = payload as Record<string, unknown>;
        const changeReq = nextStep.payloadChangeRequest;
        if (!changeReq) {
            return payload;
        }

        const touchedKeys = new Set<string>([
            ...Object.keys((changeReq.newElements as Record<string, unknown>) || {}),
            ...Object.keys((changeReq.updateElements as Record<string, unknown>) || {}),
            ...Object.keys((changeReq.replaceElements as Record<string, unknown>) || {}),
        ]);

        const wroteSingleTable = touchedKeys.has('columns') || touchedKeys.has('rows');
        const wroteMultiTable = touchedKeys.has('tables');

        if (wroteSingleTable && !wroteMultiTable && ('tables' in p || 'computations' in p || 'interpretation' in p)) {
            const cleaned: Record<string, unknown> = { ...p };
            delete cleaned.tables;
            delete cleaned.computations;
            if (!touchedKeys.has('interpretation')) {
                delete cleaned.interpretation;
            }
            return cleaned as P;
        }

        if (wroteMultiTable && !wroteSingleTable && ('columns' in p || 'rows' in p || 'metadata' in p || 'source' in p)) {
            const cleaned: Record<string, unknown> = { ...p };
            delete cleaned.columns;
            delete cleaned.rows;
            if (!touchedKeys.has('source')) {
                delete cleaned.source;
            }
            if (!touchedKeys.has('metadata')) {
                delete cleaned.metadata;
            }
            return cleaned as P;
        }

        return payload;
    }

    /**
     * Formats `metadata.sql` (single-table) and/or `tables[].metadata.sql` (multi-table)
     * with sql-formatter. Returns a new payload with formatted SQL, or null if unchanged.
     */
    private formatPayloadSql<P>(payload: P): P | null {
        const p = payload as Record<string, unknown>;
        if (!p || typeof p !== 'object') {
            return null;
        }

        let changed = false;
        const result: Record<string, unknown> = { ...p };

        const metadata = p.metadata as Record<string, unknown> | undefined;
        const rawSql = metadata?.sql;
        if (typeof rawSql === 'string' && rawSql.trim().length > 0) {
            const formatted = this.tryFormatSql(rawSql);
            if (formatted && formatted !== rawSql) {
                result.metadata = { ...metadata, sql: formatted };
                changed = true;
            }
        }

        if (Array.isArray(p.tables)) {
            const formattedTables = (p.tables as Array<Record<string, unknown>>).map((table) => {
                const tMeta = table?.metadata as Record<string, unknown> | undefined;
                const tSql = tMeta?.sql;
                if (typeof tSql === 'string' && tSql.trim().length > 0) {
                    const formatted = this.tryFormatSql(tSql);
                    if (formatted && formatted !== tSql) {
                        changed = true;
                        return {
                            ...table,
                            metadata: { ...tMeta, sql: formatted }
                        };
                    }
                }
                return table;
            });
            if (changed) {
                result.tables = formattedTables;
            }
        }

        return changed ? (result as P) : null;
    }

    private tryFormatSql(rawSql: string): string | null {
        try {
            return formatSQL(rawSql, {
                language: 'tsql',
                tabWidth: 4,
                keywordCase: 'upper',
                linesBetweenQueries: 2
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`QueryBuilderAgent: sql-formatter failed, keeping original SQL. Error: ${message}`);
            return null;
        }
    }
}
