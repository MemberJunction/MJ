import { RubricScoring, type RubricScoreResult, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { OracleResult } from '../types';

/** A binary inline rubric. Every string is a leaf, Met = 1 and Not met = 0, equal weight. There is no version row. */
export function inlineVersion(criteria: string[], strict: boolean, passThreshold: number): RubricVersionSnapshot {
    return {
        id: 'inline',
        rubricId: 'inline',
        notApplicablePolicy: 'NotAllowed',
        passThreshold,
        scoreDisplayMin: 0,
        scoreDisplayMax: 1,
        nodes: criteria.map((text, index) => ({
            id: `c${index}`,
            key: `c${index}`,
            name: text,
            nodeType: 'Criterion' as const,
            scaleId: 'met',
            weight: 1,
            isAdvisory: false,
            isGate: strict,
            gateMinimumScore: strict ? 1 : null,
            evidenceRequired: false,
            rationaleRequired: false,
            sequence: index,
        })),
        scales: [{
            id: 'met',
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [
                { id: 'not-met', label: 'Not met', value: 0, normalizedValue: 0, sequence: 0 },
                { id: 'met', label: 'Met', value: 1, normalizedValue: 1, sequence: 1 },
            ],
        }],
        bands: [],
    };
}

export function scoreInline(criteria: string[], answers: { index: number; met: boolean; rationale?: string }[], options: { strict?: boolean; passThreshold?: number }): RubricScoreResult {
    const version = inlineVersion(criteria, options.strict === true, options.passThreshold ?? 0.7);
    return RubricScoring.compute({
        version,
        answers: answers.map(answer => ({
            criterionId: `c${answer.index}`,
            scaleLevelId: answer.met ? 'met' : 'not-met',
            rationale: answer.rationale,
        })),
    });
}

/** Computer Use verdicts, reported in the same inline details shape. Not stored as a RubricEvaluation. */
export function inlineOracleFromVerdicts(verdicts: { criterion: string; met: boolean; evidence?: string }[], passThreshold = 0.7): OracleResult {
    const scored = scoreInline(verdicts.map(verdict => verdict.criterion), verdicts.map((verdict, index) => ({
        index,
        met: verdict.met,
        rationale: verdict.evidence,
    })), { passThreshold });
    return inlineOracleResult(verdicts.map(verdict => verdict.criterion), scored, verdicts.map(verdict => verdict.evidence));
}

export function inlineOracleResult(criteria: string[], scored: RubricScoreResult, evidence: (string | undefined)[] = []): OracleResult {
    const passed = scored.outcome === 'Passed';
    return {
        oracleType: 'llm-judge',
        passed,
        score: scored.normalizedScore ?? 0,
        message: `inline: ${scored.outcome} (${scored.normalizedScore ?? 0})`,
        details: {
            inline: true,
            Outcome: scored.outcome,
            Criteria: scored.nodes.map((node, index) => ({
                Key: node.key,
                Name: criteria[index] ?? node.key,
                NormalizedScore: node.normalizedScore,
                GateFailed: node.gateFailed,
                Rationale: evidence[index],
            })),
        },
    };
}
