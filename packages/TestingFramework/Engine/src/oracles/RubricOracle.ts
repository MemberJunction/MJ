import '@memberjunction/ai-agents';
import { ProviderRubricEngine, type RubricSubjectContent } from '@memberjunction/rubrics';
import type { OracleConfig, OracleInput, OracleResult } from '../types';
import type { IOracle } from './IOracle';

export interface RubricOracleEngine {
    EvaluateRecord(input: {
        rubricId?: string;
        versionId?: string;
        subjectEntityName: string;
        subjectRecordId: string;
        contextEntityName?: string;
        contextRecordId?: string;
        passThreshold?: number | null;
        evaluatorConfig?: unknown;
        content?: RubricSubjectContent;
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
 * The oracle config's `evaluator` is an evaluator selection (IRubricEvaluatorSelection);
 * LLM SinglePass when it is absent.
 */
export class RubricOracle implements IOracle {
    public readonly type = 'rubric';

    public constructor(private readonly engine?: RubricOracleEngine) {}

    public async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        const settings = config as { rubricId?: string; rubricVersionId?: string; passThreshold?: number; versionLabel?: string; evaluator?: unknown };
        const provider = input.provider;
        const engine = this.engine ?? (provider ? ProviderRubricEngine(provider, input.contextUser) : undefined);
        if (!engine) {
            return { oracleType: this.type, passed: false, score: 0, message: 'No rubric engine is configured.' };
        }
        if (!input.testRunId) {
            return { oracleType: this.type, passed: false, score: 0, message: 'subject not found or not readable' };
        }
        const result = await engine.EvaluateRecord({
            rubricId: settings.rubricId,
            versionId: settings.rubricVersionId,
            subjectEntityName: 'MJ: Test Runs',
            subjectRecordId: input.testRunId,
            contextEntityName: 'MJ: Tests',
            contextRecordId: input.test?.ID,
            passThreshold: settings.passThreshold ?? null,
            evaluatorConfig: settings.evaluator,
            content: input.subjectContent ?? RubricOracleContent(input),
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

/** The output the driver already has. The test-run row is not saved until later. */
export function RubricOracleContent(input: { test?: { InputDefinition?: unknown }; expectedOutput?: unknown; actualOutput?: unknown }): { text?: string; data: Record<string, unknown> } {
    let text: string | undefined = typeof input.actualOutput === 'string' ? input.actualOutput : undefined;
    if (!text && input.actualOutput && typeof input.actualOutput === 'object') {
        const obj = input.actualOutput as Record<string, unknown>;
        if (typeof obj.message === 'string') text = obj.message;
        else if (typeof obj.response === 'string') text = obj.response;
        else if (typeof obj.text === 'string') text = obj.text;
    }
    return {
        text,
        data: {
            input: input.test?.InputDefinition,
            expectedOutput: input.expectedOutput,
            actualOutput: input.actualOutput,
        },
    };
}
