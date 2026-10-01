import { RubricScoring, type RubricAnswer, type RubricScoreResult, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';

export interface SupersedeTarget {
    status: string;
    subjectEntityId: string;
    subjectRecordId: string;
    contextEntityId?: string | null;
    contextRecordId?: string | null;
    rubricId: string;
}

/**
 * Refuses a supersede target that is not Submitted, or whose subject, context,
 * or rubric differs from the evaluation replacing it. The caller then sets
 * Status to Superseded in the same transaction as the submit.
 */
export function AssertCanSupersede(target: SupersedeTarget, current: SupersedeTarget): void {
    if (target.status !== 'Submitted') {
        throw new RubricEvaluationError('Only a Submitted evaluation can be superseded.');
    }
    if (target.subjectEntityId !== current.subjectEntityId || target.subjectRecordId !== current.subjectRecordId) {
        throw new RubricEvaluationError('A supersede must be the same subject.');
    }
    if ((target.contextEntityId ?? null) !== (current.contextEntityId ?? null) || (target.contextRecordId ?? null) !== (current.contextRecordId ?? null)) {
        throw new RubricEvaluationError('A supersede must be the same context.');
    }
    if (target.rubricId !== current.rubricId) {
        throw new RubricEvaluationError('A supersede must be the same rubric.');
    }
}

/** @deprecated Use {@link AssertCanSupersede}. */
export function assertCanSupersede(target: SupersedeTarget, current: SupersedeTarget): void {
    return AssertCanSupersede(target, current);
}

export class RubricEvaluationError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'RubricEvaluationError';
    }
}

export interface EvaluationScoreInput {
    criterionId: string;
    scaleLevelId?: string | null;
    rawValue?: number | null;
    isNotApplicable?: boolean;
    confidence?: number | null;
    rationale?: string | null;
    evidence?: unknown;
    /** Group rows are written by the server. A client write is refused. */
    isComputed?: boolean;
}

export interface SubmitEvaluationInput {
    version: RubricVersionSnapshot;
    /** Published, or Retired only when this evaluation supersedes one pinned to this same version. */
    versionStatus: 'Published' | 'Retired' | 'Draft';
    supersedesEvaluationId?: string | null;
    scores: EvaluationScoreInput[];
    passThresholdOverride?: number | null;
}

export interface PersistedScore {
    criterionId: string;
    normalizedScore: number | null;
    effectiveWeight: number | null;
    overallContribution: number | null;
    gateFailed: boolean;
    isComputed: boolean;
}

export interface PersistedEvaluation {
    normalizedScore: number | null;
    completeness: number | null;
    outcome: RubricScoreResult['outcome'];
    passed: boolean | null;
    gateFailed: boolean;
    passThresholdApplied: number | null;
    bandId: string | null;
    confidence: number | null;
    scoringEngineVersion: '1.0';
    status: 'Submitted';
    submittedAt: Date;
}

/**
 * Refuses an evaluation that is not pinned to a Published version, unless it
 * supersedes an evaluation and the pinned version is the Retired one that
 * evaluation used. Score rows must name criteria of this version. A levels
 * answer must use that criterion's scale. A numeric answer is the only place
 * RawValue is accepted. IsComputed rows are refused from the client.
 */
export function ValidateEvaluationScores(input: SubmitEvaluationInput): void {
    if (input.versionStatus === 'Draft' || (input.versionStatus === 'Retired' && !input.supersedesEvaluationId)) {
        throw new RubricEvaluationError('A new evaluation must pin a Published version. Retired is only allowed when superseding an evaluation pinned to that version.');
    }
    const nodes = new Map(input.version.nodes.map(node => [node.id, node]));
    const scales = new Map(input.version.scales.map(scale => [scale.id, scale]));
    for (const score of input.scores) {
        if (score.isComputed) throw new RubricEvaluationError('Computed score rows are written by the server.');
        const node = nodes.get(score.criterionId);
        if (!node) throw new RubricEvaluationError(`Score ${score.criterionId} is not a criterion of this version.`);
        if (node.nodeType !== 'Criterion') throw new RubricEvaluationError(`${node.key} is a group. The server writes its score.`);
        const scale = node.scaleId ? scales.get(node.scaleId) : undefined;
        if (score.scaleLevelId && scale?.scaleType !== 'Levels') {
            throw new RubricEvaluationError(`${node.key} does not use a levels scale.`);
        }
        if (score.scaleLevelId && scale && !scale.levels.some(level => level.id === score.scaleLevelId)) {
            throw new RubricEvaluationError(`${node.key} is not on a level of its scale.`);
        }
        if (score.rawValue !== undefined && score.rawValue !== null && scale?.scaleType !== 'Numeric') {
            throw new RubricEvaluationError(`${node.key} does not use a numeric scale.`);
        }
        if (node.rationaleRequired && !score.isNotApplicable && !score.rationale) {
            throw new RubricEvaluationError(`${node.name} requires a rationale.`);
        }
        if (node.evidenceRequired && !score.isNotApplicable && (score.evidence === undefined || score.evidence === null)) {
            throw new RubricEvaluationError(`${node.name} requires evidence.`);
        }
    }
}

/** @deprecated Use {@link ValidateEvaluationScores}. */
export function validateEvaluationScores(input: SubmitEvaluationInput): void {
    return ValidateEvaluationScores(input);
}

/**
 * Validates, then scores with {@link RubricScoring.compute} and returns the
 * fields to persist. The caller writes score rows while the evaluation is
 * still Draft, then writes these evaluation fields and sets Status to Submitted.
 * This is the only copy of the math.
 */
export function SubmitEvaluation(input: SubmitEvaluationInput): { evaluation: PersistedEvaluation; scores: PersistedScore[] } {
    ValidateEvaluationScores(input);
    const answers: RubricAnswer[] = input.scores.map(score => ({
        criterionId: score.criterionId,
        scaleLevelId: score.scaleLevelId,
        rawValue: score.rawValue,
        isNotApplicable: score.isNotApplicable,
        confidence: score.confidence,
    }));
    const result = RubricScoring.compute({
        version: input.version,
        answers,
        passThresholdOverride: input.passThresholdOverride,
    });
    return {
        evaluation: {
            normalizedScore: result.normalizedScore,
            completeness: result.completeness,
            outcome: result.outcome,
            passed: result.passed,
            gateFailed: result.gateFailed,
            passThresholdApplied: result.passThresholdApplied,
            bandId: result.bandId,
            confidence: result.confidence,
            scoringEngineVersion: result.scoringEngineVersion,
            status: 'Submitted',
            submittedAt: new Date(),
        },
        scores: result.nodes.map(node => ({
            criterionId: node.id,
            normalizedScore: node.normalizedScore,
            effectiveWeight: node.effectiveWeight,
            overallContribution: node.overallContribution,
            gateFailed: node.gateFailed,
            isComputed: input.version.nodes.find(item => item.id === node.id)?.nodeType === 'Group',
        })),
    };
}

/** @deprecated Use {@link SubmitEvaluation}. */
export function submitEvaluation(input: SubmitEvaluationInput): { evaluation: PersistedEvaluation; scores: PersistedScore[] } {
    return SubmitEvaluation(input);
}
