import type { RubricFormAnswer } from '@memberjunction/ng-rubrics';
import type { RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';

export interface DisagreementItem {
    key: string;
    name: string;
    humanMean: number;
    aiMean: number;
    gap: number;
    runId?: string;
}

const AI_EVALUATORS = new Set(['AIPrompt', 'Agent']);

/** CriterionKey is the criterion's identity. Criterion is the label. The row id is not the key. */
export function CriterionIdentity(row: { CriterionKey?: unknown; Criterion?: unknown }): { key: string; name: string | null } {
    const key = row.CriterionKey == null || row.CriterionKey === '' ? '' : String(row.CriterionKey);
    const name = row.Criterion == null || row.Criterion === '' ? null : String(row.Criterion);
    return { key, name };
}

/**
 * One row per stored cohort. The human and AI means are the view's cohort columns.
 * A second score in the same cohort does not change those means.
 * The score view identifies a cohort by subject, context, rubric, and major version.
 */
export function CohortDisagreement(rows: {
    CriterionKey?: unknown;
    Criterion?: unknown;
    CriterionCohortHumanMeanScore?: unknown;
    CriterionCohortAIMeanScore?: unknown;
    SubjectRecordID?: unknown;
    ContextRecordID?: unknown;
    RubricVersionID?: unknown;
    RubricID?: unknown;
    RubricMajorVersion?: unknown;
}[]): DisagreementItem[] {
    const seen = new Set<string>();
    const items: DisagreementItem[] = [];
    for (const row of rows) {
        const identity = CriterionIdentity(row);
        if (!identity.key) continue;
        const runId = idText(row.SubjectRecordID);
        const versionId = idText(row.RubricVersionID) || `${idText(row.RubricID)}|${idText(row.RubricMajorVersion)}`;
        const cohort = `${runId}|${idText(row.ContextRecordID)}|${versionId}|${identity.key}`;
        if (seen.has(cohort)) continue;
        seen.add(cohort);
        const humanMean = numberOrNull(row.CriterionCohortHumanMeanScore);
        const aiMean = numberOrNull(row.CriterionCohortAIMeanScore);
        if (humanMean == null || aiMean == null) continue;
        items.push({
            key: identity.key,
            name: identity.name || identity.key,
            humanMean,
            aiMean,
            gap: Math.abs(humanMean - aiMean),
            runId,
        });
    }
    return items.sort((left, right) => right.gap - left.gap || left.key.localeCompare(right.key));
}

/** Submitted rubric scores over time. This is not a test-suite run score. */
export function RubricScoreTrend(rows: { at: string | Date | null; score: number | null; runId?: string | null }[]): { at: string; score: number; runId: string }[] {
    return rows
        .filter(row => row.score != null && row.at != null && row.at !== '')
        .map(row => ({
            at: row.at instanceof Date ? row.at.toISOString() : String(row.at),
            score: row.score as number,
            runId: row.runId == null ? '' : String(row.runId),
        }))
        .sort((left, right) => left.at.localeCompare(right.at));
}

/**
 * Means of submitted human scores and submitted AI scores for one criterion,
 * within one subject and version. A criterion with only one side is left out.
 */
export function DisagreementFromScores(input: {
    evaluations: { id: string; subjectId: string; versionId: string; evaluatorType: string; status: string }[];
    scores: { evaluationId: string; key: string; name?: string | null; normalizedScore: number | null }[];
}): DisagreementItem[] {
    const evaluations = new Map(input.evaluations.filter(row => row.status === 'Submitted').map(row => [row.id, row]));
    const groups = new Map<string, { key: string; name: string; human: number[]; ai: number[] }>();
    for (const score of input.scores) {
        if (score.normalizedScore == null || !score.key) continue;
        const evaluation = evaluations.get(score.evaluationId);
        if (!evaluation) continue;
        const side = evaluation.evaluatorType === 'Human' ? 'human' : AI_EVALUATORS.has(evaluation.evaluatorType) ? 'ai' : null;
        if (!side) continue;
        const id = `${evaluation.subjectId}|${evaluation.versionId}|${score.key}`;
        const group = groups.get(id) ?? { key: id, name: score.name || score.key, human: [], ai: [] };
        if (score.name) group.name = score.name;
        group[side].push(score.normalizedScore);
        groups.set(id, group);
    }
    return DisagreementQueue([...groups.values()].map(group => ({
        key: group.key,
        name: group.name,
        humanMean: group.human.length ? group.human.reduce((sum, score) => sum + score, 0) / group.human.length : null,
        aiMean: group.ai.length ? group.ai.reduce((sum, score) => sum + score, 0) / group.ai.length : null,
    })));
}

/** Largest |human mean − AI mean| first. A criterion with either mean missing is left out. */
export function DisagreementQueue(rows: { key: string; name?: string | null; humanMean: number | null; aiMean: number | null }[]): DisagreementItem[] {
    return rows
        .filter(row => row.humanMean != null && row.aiMean != null)
        .map(row => ({
            key: row.key,
            name: row.name || row.key,
            humanMean: row.humanMean as number,
            aiMean: row.aiMean as number,
            gap: Math.abs((row.humanMean as number) - (row.aiMean as number)),
        }))
        .sort((left, right) => right.gap - left.gap || left.key.localeCompare(right.key));
}

/** Scores for one test or suite, oldest first. Runs with no score are left out. */
export function ScoreTrend(runs: { at: string | Date; score: number | null; scopeId: string }[], scopeId: string): { at: string; score: number }[] {
    return runs
        .filter(run => run.scopeId === scopeId && run.score != null)
        .map(run => ({ at: run.at instanceof Date ? run.at.toISOString() : run.at, score: run.score as number }))
        .sort((left, right) => left.at.localeCompare(right.at));
}

/** A leaf fails when its gate failed, or when its score is below that version's pass threshold. */
export function CriterionFailureRates(scores: { key: string; normalizedScore: number | null; gateFailed?: boolean; passThreshold?: number | null }[]): { key: string; rate: number; count: number }[] {
    const buckets = new Map<string, { failed: number; total: number }>();
    for (const score of scores) {
        if (score.normalizedScore == null && !score.gateFailed) continue;
        const bucket = buckets.get(score.key) ?? { failed: 0, total: 0 };
        bucket.total += 1;
        const belowThreshold = score.normalizedScore != null && score.passThreshold != null && score.normalizedScore < score.passThreshold;
        if (score.gateFailed || belowThreshold) bucket.failed += 1;
        buckets.set(score.key, bucket);
    }
    return [...buckets.entries()]
        .map(([key, bucket]) => ({ key, rate: bucket.failed / bucket.total, count: bucket.total }))
        .sort((left, right) => right.rate - left.rate || left.key.localeCompare(right.key));
}

/** Active rubrics, by name, for the Test and Test Suite RubricID picker. */
export function RubricPickerOptions(rows: { ID?: string; id?: string; Name?: string; name?: string; Status?: string | null }[]): { id: string; name: string }[] {
    return rows
        .filter(row => (row.Status ?? 'Active') === 'Active')
        .map(row => ({ id: String(row.ID ?? row.id ?? ''), name: String(row.Name ?? row.name ?? '') }))
        .filter(row => row.id.length > 0 && row.name.length > 0)
        .sort((left, right) => left.name.localeCompare(right.name));
}

export interface RubricRunView {
    version: RubricVersionSnapshot;
    result: RubricScoreResult;
    answers: RubricFormAnswer[];
}

/** A rubric or inline-judge oracle result, shaped for mj-rubric-result. */
export function RubricRunView(oracleResults: { oracleType?: string; type?: string; Name?: string; details?: unknown; Details?: unknown }[] | null | undefined): RubricRunView | null {
    const list = oracleResults ?? [];
    const chosen = list.find(item => kind(item) === 'rubric' && criteriaOf(item).length > 0)
        ?? list.find(item => (kind(item) === 'llm-judge' || kind(item).includes('judge')) && criteriaOf(item).length > 0);
    if (!chosen) return null;
    const details = detailsOf(chosen);
    const criteria = criteriaOf(chosen);
    const nodes = criteria.map((item, index) => {
        const key = String(item.Key ?? item.key ?? `c${index}`);
        return {
            id: key,
            key,
            name: text(item.Name ?? item.name) ?? key,
            normalizedScore: numberOrNull(item.NormalizedScore ?? item.normalizedScore),
            weight: numberOrNull(item.Weight ?? item.weight) ?? 1,
            gateFailed: flag(item.GateFailed ?? item.gateFailed),
            rationale: text(item.Rationale ?? item.rationale),
            evidence: text(item.Evidence ?? item.evidence),
        };
    });
    const normalizedScore = numberOrNull(details?.NormalizedScore);
    return {
        version: {
            id: 'run',
            rubricId: 'run',
            notApplicablePolicy: 'NotAllowed',
            scoreDisplayMin: 0,
            scoreDisplayMax: 1,
            nodes: nodes.map(node => ({
                id: node.id, key: node.key, name: node.name, nodeType: 'Criterion' as const, weight: node.weight,
                isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0,
            })),
            scales: [],
            bands: [],
        },
        result: {
            normalizedScore,
            completeness: numberOrNull(details?.Completeness),
            outcome: (details?.Outcome as RubricScoreResult['outcome']) ?? 'Scored',
            passed: details?.Passed === true ? true : details?.Passed === false ? false : null,
            gateFailed: flag(details?.GateFailed) || nodes.some(node => node.gateFailed),
            passThresholdApplied: null,
            bandId: text(details?.BandID ?? details?.bandId) ?? null,
            confidence: null,
            scoringEngineVersion: '1.0',
            nodes: nodes.map(node => ({
                id: node.id, key: node.key, normalizedScore: node.normalizedScore, effectiveWeight: node.weight,
                overallContribution: node.normalizedScore, gateFailed: node.gateFailed, isNotApplicable: false, isAdvisory: false,
            })),
        },
        answers: nodes.map(node => ({ criterionId: node.id, rationale: node.rationale, evidence: node.evidence })),
    };
}

/** The id of the evaluation this run stored, when the oracle recorded one. */
export function RubricEvaluationId(oracleResults: { details?: unknown; Details?: unknown }[] | null | undefined): string | null {
    for (const item of oracleResults ?? []) {
        const id = text(detailsOf(item)?.RubricEvaluationID ?? detailsOf(item)?.rubricEvaluationId);
        if (id) return id;
    }
    return null;
}

/** The stored evaluation, its scores, and the criterion names. Completeness stays null when the row has none. */
export function StoredRubricView(
    evaluation: Record<string, unknown>,
    scores: Record<string, unknown>[],
    criteria: Record<string, unknown>[],
    bands: Record<string, unknown>[] = [],
): RubricRunView {
    const byId = new Map(criteria.map(row => [String(row.ID ?? ''), row]));
    const leaves = scores.filter(row => !flag(row.IsComputed));
    const nodes = leaves.map(score => {
        const criterion = byId.get(String(score.CriterionID ?? ''));
        const key = String(criterion?.Key ?? '');
        return {
            id: String(score.CriterionID ?? ''),
            key,
            name: String(criterion?.Name ?? ''),
            normalizedScore: numberOrNull(score.NormalizedScore),
            weight: numberOrNull(criterion?.Weight) ?? 1,
            gateFailed: flag(score.GateFailed),
            rationale: text(score.Rationale),
            evidence: evidenceText(score.Evidence),
        };
    });
    return {
        version: {
            id: String(evaluation.RubricVersionID ?? 'stored'),
            rubricId: String(evaluation.RubricID ?? ''),
            notApplicablePolicy: 'ExcludeAndRedistribute',
            scoreDisplayMin: numberOrNull(evaluation.ScoreDisplayMin) ?? 0,
            scoreDisplayMax: numberOrNull(evaluation.ScoreDisplayMax) ?? 100,
            nodes: nodes.map(node => ({
                id: node.id, key: node.key, name: node.name, nodeType: 'Criterion' as const, weight: node.weight,
                isAdvisory: false, isGate: node.gateFailed, evidenceRequired: false, rationaleRequired: false, sequence: 0,
            })),
            scales: [],
            bands: bands.map(band => ({
                id: String(band.ID ?? ''),
                label: String(band.Label ?? ''),
                minScore: numberOrNull(band.MinScore) ?? 0,
                maxScore: numberOrNull(band.MaxScore) ?? 1,
                displayTone: String(band.DisplayTone ?? 'Neutral'),
                sequence: numberOrNull(band.Sequence) ?? 0,
            })),
        },
        result: {
            normalizedScore: numberOrNull(evaluation.NormalizedScore),
            completeness: numberOrNull(evaluation.Completeness),
            outcome: (evaluation.Outcome as RubricScoreResult['outcome']) ?? 'Scored',
            passed: evaluation.Passed === true ? true : evaluation.Passed === false ? false : null,
            gateFailed: flag(evaluation.GateFailed) || nodes.some(node => node.gateFailed),
            passThresholdApplied: numberOrNull(evaluation.PassThresholdApplied),
            bandId: text(evaluation.BandID) ?? null,
            confidence: numberOrNull(evaluation.Confidence),
            scoringEngineVersion: String(evaluation.ScoringEngineVersion ?? '') as RubricScoreResult['scoringEngineVersion'],
            nodes: nodes.map(node => ({
                id: node.id, key: node.key, normalizedScore: node.normalizedScore, effectiveWeight: node.weight,
                overallContribution: node.normalizedScore, gateFailed: node.gateFailed, isNotApplicable: false, isAdvisory: false,
            })),
        },
        answers: nodes.map(node => ({ criterionId: node.id, rationale: node.rationale, evidence: node.evidence })),
    };
}

function kind(item: { oracleType?: string; type?: string; Name?: string }): string {
    return String(item.oracleType ?? item.type ?? item.Name ?? '').toLowerCase();
}

function detailsOf(item: { details?: unknown; Details?: unknown }): Record<string, unknown> | null {
    const value = item.details ?? item.Details;
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function criteriaOf(item: { details?: unknown; Details?: unknown }): Record<string, unknown>[] {
    const criteria = detailsOf(item)?.Criteria;
    return Array.isArray(criteria) ? criteria.filter(row => row && typeof row === 'object') as Record<string, unknown>[] : [];
}

function idText(value: unknown): string {
    return value == null || value === '' ? '' : String(value);
}

function numberOrNull(value: unknown): number | null {
    if (value == null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | undefined {
    return value == null || value === '' ? undefined : String(value);
}

function flag(value: unknown): boolean {
    return value === true || value === 1;
}

function evidenceText(value: unknown): string | undefined {
    const raw = text(value);
    if (!raw) return undefined;
    if (raw.startsWith('[')) {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
                const quotes = parsed.map(item => {
                    const record = item as { Text?: unknown; Quote?: unknown; Note?: unknown };
                    return text(record.Text ?? record.Quote ?? record.Note);
                }).filter((item): item is string => !!item);
                if (quotes.length > 0) return quotes.join(' ');
            }
        } catch {
            return raw;
        }
    }
    return raw;
}
