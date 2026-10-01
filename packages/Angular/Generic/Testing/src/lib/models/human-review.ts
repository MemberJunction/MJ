import type { RubricFormAnswer, RubricVersionSnapshot } from '@memberjunction/ng-rubrics';

/** The rubric judgment already stored for a test run. Human rows are not a judgment. */
export interface JudgedRubric {
    rubricId: string;
    versionId: string;
    subjectEntityId: string;
    subjectRecordId: string;
    contextEntityId: string | null;
    contextRecordId: string | null;
}

/** A submitted non-human evaluation for this run. Prefers the AI prompt judge. */
export function judgedRubric(rows: Record<string, unknown>[]): JudgedRubric | null {
    const submitted = rows.filter(row => String(row.Status ?? '') === 'Submitted' && String(row.EvaluatorType ?? '') !== 'Human');
    const judge = submitted.find(row => String(row.EvaluatorType) === 'AIPrompt') ?? submitted[0];
    if (!judge?.RubricID || !judge.RubricVersionID || !judge.SubjectEntityID || !judge.SubjectRecordID) return null;
    return {
        rubricId: String(judge.RubricID),
        versionId: String(judge.RubricVersionID),
        subjectEntityId: String(judge.SubjectEntityID),
        subjectRecordId: String(judge.SubjectRecordID),
        contextEntityId: blank(judge.ContextEntityID),
        contextRecordId: blank(judge.ContextRecordID),
    };
}

/** Draft fields for the human score. Subject and context match the judgment. Status stays Draft until the scores are saved. */
export function humanEvaluationFields(judged: JudgedRubric, userId: string): Record<string, unknown> {
    return {
        RubricID: judged.rubricId,
        RubricVersionID: judged.versionId,
        SubjectEntityID: judged.subjectEntityId,
        SubjectRecordID: judged.subjectRecordId,
        ContextEntityID: judged.contextEntityId,
        ContextRecordID: judged.contextRecordId,
        EvaluatorType: 'Human',
        EvaluatorUserID: userId,
        Status: 'Draft',
    };
}

/** Score rows written while the evaluation is still Draft. The server computes the result on submit. */
export function humanScoreFields(evaluationId: string, answers: RubricFormAnswer[]): Record<string, unknown>[] {
    return answers.map(answer => ({
        EvaluationID: evaluationId,
        CriterionID: answer.criterionId,
        ScaleLevelID: answer.isNotApplicable ? null : answer.scaleLevelId ?? null,
        IsNotApplicable: answer.isNotApplicable === true,
        Rationale: answer.rationale ?? null,
        Evidence: answer.evidence ?? null,
    }));
}

/** The version the scoring form needs, built from the stored rows. */
export function versionSnapshot(
    version: Record<string, unknown>,
    criteria: Record<string, unknown>[],
    scales: Record<string, unknown>[],
    levels: Record<string, unknown>[],
): RubricVersionSnapshot {
    return {
        id: String(version.ID),
        rubricId: String(version.RubricID),
        notApplicablePolicy: (version.NotApplicablePolicy as RubricVersionSnapshot['notApplicablePolicy']) ?? 'ExcludeAndRedistribute',
        passThreshold: version.PassThreshold == null ? null : Number(version.PassThreshold),
        scoreDisplayMin: version.ScoreDisplayMin == null ? 0 : Number(version.ScoreDisplayMin),
        scoreDisplayMax: version.ScoreDisplayMax == null ? 100 : Number(version.ScoreDisplayMax),
        nodes: criteria.map(row => ({
            id: String(row.ID),
            key: String(row.Key),
            parentId: blank(row.ParentID),
            name: String(row.Name ?? row.Key),
            nodeType: (row.NodeType as 'Criterion' | 'Group') ?? 'Criterion',
            scaleId: blank(row.ScaleID),
            weight: Number(row.Weight ?? 1),
            isAdvisory: flag(row.IsAdvisory),
            isGate: flag(row.IsGate),
            gateMinimumScore: row.GateMinimumScore == null ? null : Number(row.GateMinimumScore),
            evidenceRequired: flag(row.EvidenceRequired),
            rationaleRequired: flag(row.RationaleRequired),
            sequence: Number(row.Sequence ?? 0),
        })),
        scales: scales.map(scale => ({
            id: String(scale.ID),
            scaleType: (scale.ScaleType as 'Levels' | 'Numeric') ?? 'Levels',
            higherIsBetter: scale.HigherIsBetter !== false && scale.HigherIsBetter !== 0,
            levels: levels.filter(level => String(level.ScaleID) === String(scale.ID)).map(level => ({
                id: String(level.ID),
                label: String(level.Label),
                value: Number(level.Value ?? 0),
                normalizedValue: Number(level.NormalizedValue ?? 0),
                sequence: Number(level.Sequence ?? 0),
            })),
        })),
        bands: [],
    };
}

function blank(value: unknown): string | null {
    if (value == null || value === '') return null;
    return String(value);
}

function flag(value: unknown): boolean {
    return value === true || value === 1;
}
