import type { RubricFormAnswer, RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/ng-rubrics';

export interface DisagreementItem {
    key: string;
    name: string;
    humanMean: number;
    aiMean: number;
    gap: number;
}

const AI_EVALUATORS = new Set(['AIPrompt', 'Agent']);

/** Score rows identify a criterion by CriterionID. Criterion is the label. CriterionKey is not a column. */
export function CriterionIdentity(row: { CriterionID?: unknown; Criterion?: unknown }): { key: string; name: string | null } {
    const key = row.CriterionID == null || row.CriterionID === '' ? '' : String(row.CriterionID);
    const name = row.Criterion == null || row.Criterion === '' ? null : String(row.Criterion);
    return { key, name };
}

/** @deprecated Use {@link CriterionIdentity}. */
export function criterionIdentity(row: { CriterionID?: unknown; Criterion?: unknown }): { key: string; name: string | null } {
    return CriterionIdentity(row);
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

/** @deprecated Use {@link DisagreementFromScores}. */
export function disagreementFromScores(input: {
    evaluations: { id: string; subjectId: string; versionId: string; evaluatorType: string; status: string }[];
    scores: { evaluationId: string; key: string; name?: string | null; normalizedScore: number | null }[];
}): DisagreementItem[] {
    return DisagreementFromScores(input);
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

/** @deprecated Use {@link DisagreementQueue}. */
export function disagreementQueue(rows: { key: string; name?: string | null; humanMean: number | null; aiMean: number | null }[]): DisagreementItem[] {
    return DisagreementQueue(rows);
}

/** Scores for one test or suite, oldest first. Runs with no score are left out. */
export function ScoreTrend(runs: { at: string | Date; score: number | null; scopeId: string }[], scopeId: string): { at: string; score: number }[] {
    return runs
        .filter(run => run.scopeId === scopeId && run.score != null)
        .map(run => ({ at: run.at instanceof Date ? run.at.toISOString() : run.at, score: run.score as number }))
        .sort((left, right) => left.at.localeCompare(right.at));
}

/** @deprecated Use {@link ScoreTrend}. */
export function scoreTrend(runs: { at: string | Date; score: number | null; scopeId: string }[], scopeId: string): { at: string; score: number }[] {
    return ScoreTrend(runs, scopeId);
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

/** @deprecated Use {@link CriterionFailureRates}. */
export function criterionFailureRates(scores: { key: string; normalizedScore: number | null; gateFailed?: boolean; passThreshold?: number | null }[]): { key: string; rate: number; count: number }[] {
    return CriterionFailureRates(scores);
}

/** Active rubrics, by name, for the Test and Test Suite RubricID picker. */
export function RubricPickerOptions(rows: { ID?: string; id?: string; Name?: string; name?: string; Status?: string | null }[]): { id: string; name: string }[] {
    return rows
        .filter(row => (row.Status ?? 'Active') === 'Active')
        .map(row => ({ id: String(row.ID ?? row.id ?? ''), name: String(row.Name ?? row.name ?? '') }))
        .filter(row => row.id.length > 0 && row.name.length > 0)
        .sort((left, right) => left.name.localeCompare(right.name));
}

/** @deprecated Use {@link RubricPickerOptions}. */
export function rubricPickerOptions(rows: { ID?: string; id?: string; Name?: string; name?: string; Status?: string | null }[]): { id: string; name: string }[] {
    return RubricPickerOptions(rows);
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
            name: String(item.Name ?? item.name ?? key),
            normalizedScore: numberOrNull(item.NormalizedScore ?? item.normalizedScore),
            weight: numberOrNull(item.Weight ?? item.weight) ?? 1,
            gateFailed: item.GateFailed === true || item.gateFailed === true,
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
            completeness: numberOrNull(details?.Completeness) ?? 1,
            outcome: (details?.Outcome as RubricScoreResult['outcome']) ?? 'Scored',
            passed: details?.Passed === true ? true : details?.Passed === false ? false : null,
            gateFailed: details?.GateFailed === true || nodes.some(node => node.gateFailed),
            passThresholdApplied: null,
            bandId: null,
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

/** @deprecated Use {@link RubricRunView}. */
export function rubricRunView(oracleResults: { oracleType?: string; type?: string; Name?: string; details?: unknown; Details?: unknown }[] | null | undefined): RubricRunView | null {
    return RubricRunView(oracleResults);
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

function numberOrNull(value: unknown): number | null {
    if (value == null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | undefined {
    return value == null || value === '' ? undefined : String(value);
}
