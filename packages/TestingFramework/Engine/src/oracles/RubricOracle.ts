import { RunView } from '@memberjunction/core';
import { providerRubricEngine } from '@memberjunction/rubrics';
import type { OracleConfig, OracleInput, OracleResult } from '../types';
import type { IOracle } from './IOracle';

export interface RubricOracleEngine {
    evaluateRecord(input: {
        rubricId?: string;
        versionId?: string;
        subjectEntityName: string;
        subjectRecordId: string;
        contextEntityName?: string;
        contextRecordId?: string;
        passThreshold?: number | null;
        evaluator?: 'LLM' | 'Deterministic' | 'AI';
    }): Promise<{
        evaluationId: string;
        score: number | null;
        outcome: string | null;
        displayScore?: number | null;
        criteria: { key: string; normalizedScore: number | null; rationale?: string }[];
    }>;
}

/**
 * Judges a test run with a rubric. The subject is the test run and the context
 * is the test. A host can inject the engine; otherwise the call uses the input provider.
 */
export class RubricOracle implements IOracle {
    public readonly type = 'rubric';

    public constructor(private readonly engine?: RubricOracleEngine) {}

    public async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        const settings = config as { rubricId?: string; rubricVersionId?: string; passThreshold?: number; versionLabel?: string };
        const provider = input.provider ?? (RunView.Provider as OracleInput['provider']);
        const engine = this.engine ?? (provider ? providerRubricEngine(provider, input.contextUser) : undefined);
        if (!engine) {
            return { oracleType: this.type, passed: false, score: 0, message: 'No rubric engine is configured.' };
        }
        const result = await engine.evaluateRecord({
            rubricId: settings.rubricId,
            versionId: settings.rubricVersionId,
            subjectEntityName: 'MJ: Test Runs',
            subjectRecordId: input.testRunId ?? '',
            contextEntityName: 'MJ: Tests',
            contextRecordId: input.test?.ID,
            passThreshold: settings.passThreshold ?? null,
            evaluator: 'LLM',
        });
        const passed = result.outcome === 'Passed' || result.outcome === 'Scored';
        const label = settings.versionLabel ?? settings.rubricVersionId ?? 'published';
        const shown = result.displayScore ?? result.score ?? 0;
        return {
            oracleType: this.type,
            passed,
            score: result.score ?? 0,
            message: `${settings.rubricId ?? 'rubric'} v${label}: ${result.outcome} (${shown})`,
            details: {
                RubricEvaluationID: result.evaluationId,
                RubricVersionLabel: label,
                Outcome: result.outcome,
                Criteria: result.criteria.map(item => ({
                    Key: item.key,
                    Name: item.key,
                    NormalizedScore: item.normalizedScore,
                    Rationale: item.rationale,
                })),
            },
        };
    }
}
