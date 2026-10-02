/** Stable bucket 0..9999 for a run id. The same id always lands in the same bucket. */
export function SampleBucket(runId: string): number {
    let hash = 0;
    for (const char of runId) hash = Math.imul(hash, 31) + char.charCodeAt(0);
    return (hash >>> 0) % 10000;
}

/** @deprecated Use {@link SampleBucket}. */
export function sampleBucket(runId: string): number {
    return SampleBucket(runId);
}

/** True when the run falls inside the link's sample rate. Rate is 0..1. */
export function KeepSample(runId: string, sampleRate: number): boolean {
    if (sampleRate <= 0) return false;
    if (sampleRate >= 1) return true;
    return SampleBucket(runId) < sampleRate * 10000;
}

/** @deprecated Use {@link KeepSample}. */
export function keepSample(runId: string, sampleRate: number): boolean {
    return KeepSample(runId, sampleRate);
}

export interface DriftScoreRow {
    evaluationId: string;
    criterionId: string;
    /** The criterion's Key. Drift is keyed by this, not by the row id. */
    criterionKey?: string;
    normalizedScore: number;
}

export interface DriftEvaluationRow {
    id: string;
    subjectRecordId: string;
    /** The evaluation stores a version id. The rubric id comes from that version. */
    rubricVersionId: string;
    at: string;
}

export interface DriftRunRow {
    id: string;
    agentId: string;
}

/** Rubric id stored on the version. An unknown version resolves to an empty string. */
export function RubricIdFromVersion(versionId: string, versions: { id: string; rubricId: string }[]): string {
    return versions.find(row => row.id === versionId)?.rubricId ?? '';
}

/** @deprecated Use {@link RubricIdFromVersion}. */
export function rubricIdFromVersion(versionId: string, versions: { id: string; rubricId: string }[]): string {
    return RubricIdFromVersion(versionId, versions);
}

/**
 * Joins a score to its evaluation and that evaluation's agent run.
 * The key is agent, rubric, and criterion. A score with no matching run is left out.
 */
export function DriftSeries(input: {
    scores: DriftScoreRow[];
    evaluations: DriftEvaluationRow[];
    runs: DriftRunRow[];
    versions: { id: string; rubricId: string }[];
    /** Criterion id to Key. The series key uses Key, so two ids of one criterion stay together. */
    criteria?: { id: string; key: string }[];
}): { key: string; score: number; at: string }[] {
    const evaluations = new Map(input.evaluations.map(row => [row.id, row]));
    const agents = new Map(input.runs.map(row => [row.id, row.agentId]));
    const criterionKeys = new Map((input.criteria ?? []).map(row => [row.id, row.key]));
    const rows: { key: string; score: number; at: string }[] = [];
    for (const score of input.scores) {
        const evaluation = evaluations.get(score.evaluationId);
        if (!evaluation || !Number.isFinite(score.normalizedScore)) continue;
        const agentId = agents.get(evaluation.subjectRecordId);
        const rubricId = RubricIdFromVersion(evaluation.rubricVersionId, input.versions);
        const criterionKey = score.criterionKey || criterionKeys.get(score.criterionId) || score.criterionId;
        if (!agentId || !rubricId || !criterionKey) continue;
        rows.push({ key: `${agentId}|${rubricId}|${criterionKey}`, score: score.normalizedScore, at: evaluation.at });
    }
    return rows;
}

/** @deprecated Use {@link DriftSeries}. */
export function driftSeries(input: {
    scores: DriftScoreRow[];
    evaluations: DriftEvaluationRow[];
    runs: DriftRunRow[];
    versions: { id: string; rubricId: string }[];
}): { key: string; score: number; at: string }[] {
    return DriftSeries(input);
}

/** Mean score of each key whose timestamp falls in [start, end). */
export function PeriodMeans(rows: { key: string; score: number; at: string }[], start: string, end: string): { key: string; mean: number }[] {
    const buckets = new Map<string, number[]>();
    for (const row of rows) {
        if (row.at < start || row.at >= end) continue;
        const list = buckets.get(row.key) ?? [];
        list.push(row.score);
        buckets.set(row.key, list);
    }
    return [...buckets.entries()].map(([key, scores]) => ({ key, mean: scores.reduce((sum, score) => sum + score, 0) / scores.length }));
}

/** @deprecated Use {@link PeriodMeans}. */
export function periodMeans(rows: { key: string; score: number; at: string }[], start: string, end: string): { key: string; mean: number }[] {
    return PeriodMeans(rows, start, end);
}

/** Drop of the current period's mean below the previous period. A drop past the threshold alerts. */
export function DriftDeltas(current: { key: string; mean: number }[], previous: { key: string; mean: number }[], threshold: number): { key: string; drop: number; alert: boolean }[] {
    return current.map(row => {
        const prior = previous.find(item => item.key === row.key);
        const drop = prior == null ? 0 : prior.mean - row.mean;
        return { key: row.key, drop, alert: prior != null && drop > threshold };
    });
}

/** @deprecated Use {@link DriftDeltas}. */
export function driftDeltas(current: { key: string; mean: number }[], previous: { key: string; mean: number }[], threshold: number): { key: string; drop: number; alert: boolean }[] {
    return DriftDeltas(current, previous, threshold);
}
