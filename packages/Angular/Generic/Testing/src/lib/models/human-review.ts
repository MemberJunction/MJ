import type { RubricFormAnswer } from '@memberjunction/ng-rubrics';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { EvidenceJson } from '@memberjunction/rubrics-base';

/** The rubric judgment already stored for a test run. Human rows are not a judgment. */
export interface JudgedRubric {
    RubricId: string;
    VersionId: string;
    SubjectEntityId: string;
    SubjectRecordId: string;
    ContextEntityId: string | null;
    ContextRecordId: string | null;
}

/** A submitted non-human evaluation for this run. Prefers the AI prompt judge. */
export function JudgedRubric(rows: Record<string, unknown>[]): JudgedRubric | null {
    const submitted = rows.filter(row => String(row.Status ?? '') === 'Submitted' && String(row.EvaluatorType ?? '') !== 'Human');
    const judge = submitted.find(row => String(row.EvaluatorType) === 'AIPrompt') ?? submitted[0];
    if (!judge?.RubricID || !judge.RubricVersionID || !judge.SubjectEntityID || !judge.SubjectRecordID) return null;
    return {
        RubricId: String(judge.RubricID),
        VersionId: String(judge.RubricVersionID),
        SubjectEntityId: String(judge.SubjectEntityID),
        SubjectRecordId: String(judge.SubjectRecordID),
        ContextEntityId: blank(judge.ContextEntityID),
        ContextRecordId: blank(judge.ContextRecordID),
    };
}

/**
 * This reviewer's current Submitted human score for the same subject and version.
 * The new evaluation supersedes it so the cohort does not count the same person twice.
 */
export function PriorHumanEvaluation(rows: Record<string, unknown>[], judged: JudgedRubric, userId: string): string | null {
    const prior = rows.find(row =>
        String(row.Status ?? '') === 'Submitted'
        && String(row.EvaluatorType ?? '') === 'Human'
        && String(row.EvaluatorUserID ?? '') === userId
        && String(row.RubricID ?? '') === judged.RubricId
        && String(row.RubricVersionID ?? '') === judged.VersionId
        && String(row.SubjectRecordID ?? '') === judged.SubjectRecordId
        && blank(row.ContextRecordID) === judged.ContextRecordId);
    return prior?.ID == null || prior.ID === '' ? null : String(prior.ID);
}

/** Draft fields for the human score. Subject and context match the judgment. Status stays Draft until the scores are saved. */
export function HumanEvaluationFields(judged: JudgedRubric, userId: string, supersedesEvaluationId?: string | null): Record<string, unknown> {
    return {
        RubricID: judged.RubricId,
        RubricVersionID: judged.VersionId,
        SubjectEntityID: judged.SubjectEntityId,
        SubjectRecordID: judged.SubjectRecordId,
        ContextEntityID: judged.ContextEntityId,
        ContextRecordID: judged.ContextRecordId,
        EvaluatorType: 'Human',
        EvaluatorUserID: userId,
        Status: 'Draft',
        SupersedesEvaluationID: supersedesEvaluationId ?? null,
    };
}

/** Score rows written while the evaluation is still Draft. The server computes the result on submit. */
export function HumanScoreFields(evaluationId: string, answers: RubricFormAnswer[]): Record<string, unknown>[] {
    return answers.map(answer => ({
        EvaluationID: evaluationId,
        CriterionID: answer.criterionId,
        ScaleLevelID: answer.isNotApplicable ? null : answer.scaleLevelId ?? null,
        RawValue: answer.isNotApplicable ? null : answer.rawValue ?? null,
        IsNotApplicable: answer.isNotApplicable === true,
        Rationale: answer.rationale ?? null,
        Evidence: EvidenceJson(answer.evidence),
    }));
}

/** The version the scoring form needs, built from the stored rows. */
export function VersionSnapshot(
    version: Record<string, unknown>,
    criteria: Record<string, unknown>[],
    scales: Record<string, unknown>[],
    levels: Record<string, unknown>[],
    criterionLevels: Record<string, unknown>[] = [],
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
            guidance: row.Guidance == null || row.Guidance === '' ? null : String(row.Guidance),
            nodeType: (row.NodeType === 'Group' ? 'Group' : 'Criterion') as 'Group' | 'Criterion',
            scaleId: blank(row.ScaleID),
            weight: Number(row.Weight ?? 1),
            isAdvisory: flag(row.IsAdvisory),
            isGate: flag(row.IsGate),
            gateMinimumScore: row.GateMinimumScore == null || row.GateMinimumScore === '' ? null : Number(row.GateMinimumScore),
            notApplicablePolicy: row.NotApplicablePolicy == null || row.NotApplicablePolicy === '' ? null : row.NotApplicablePolicy as RubricVersionSnapshot['notApplicablePolicy'],
            evidenceRequired: flag(row.EvidenceRequired),
            rationaleRequired: flag(row.RationaleRequired),
            sequence: Number(row.Sequence ?? 0),
            anchors: criterionLevels.filter(level => String(level.CriterionID) === String(row.ID)).map(level => ({
                scaleLevelId: blank(level.ScaleLevelID),
                anchorValue: level.AnchorValue == null || level.AnchorValue === '' ? null : Number(level.AnchorValue),
                descriptor: String(level.Descriptor ?? ''),
            })),
        })),
        scales: scales.map(scale => ({
            id: String(scale.ID),
            scaleType: (scale.ScaleType === 'Numeric' ? 'Numeric' : 'Levels') as 'Levels' | 'Numeric',
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
