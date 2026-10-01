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

export interface SamplingLink {
    agentId: string;
    rubricId: string;
    sampleRate: number;
    status: string;
}

/** Active production-sampling links, recent runs, skipping runs that already have this rubric's evaluation. */
export function SelectSampledRuns(input: {
    links: SamplingLink[];
    runs: { id: string; agentId: string }[];
    evaluated: { runId: string; rubricId: string }[];
}): { runId: string; agentId: string; rubricId: string }[] {
    const chosen: { runId: string; agentId: string; rubricId: string }[] = [];
    for (const link of input.links) {
        if (link.status !== 'Active') continue;
        for (const run of input.runs) {
            if (run.agentId !== link.agentId) continue;
            if (input.evaluated.some(row => row.runId === run.id && row.rubricId === link.rubricId)) continue;
            if (!KeepSample(run.id, link.sampleRate)) continue;
            chosen.push({ runId: run.id, agentId: link.agentId, rubricId: link.rubricId });
        }
    }
    return chosen;
}

/** @deprecated Use {@link SelectSampledRuns}. */
export function selectSampledRuns(input: {
    links: SamplingLink[];
    runs: { id: string; agentId: string }[];
    evaluated: { runId: string; rubricId: string }[];
}): { runId: string; agentId: string; rubricId: string }[] {
    return SelectSampledRuns(input);
}

export interface SamplingLoader {
    Load(): Promise<Parameters<typeof SelectSampledRuns>[0]>;
}

/** Subject entity for a sampled production run. */
export const AGENT_RUN_SUBJECT = 'MJ: AI Agent Runs';

export interface SamplingEvaluator {
    EvaluateRecord(input: { rubricId: string; subjectRecordId: string; subjectEntityName: string }): Promise<void>;
}

/** Scheduled job. Loads links and runs, then evaluates the kept runs off the agent response path. */
export class EvaluateSampledAgentRuns {
    public constructor(private readonly loader: SamplingLoader, private readonly engine: SamplingEvaluator) {}

    public Plan(input: Parameters<typeof SelectSampledRuns>[0]): ReturnType<typeof SelectSampledRuns> {
        return SelectSampledRuns(input);
    }

    /** @deprecated Use {@link Plan}. */
    public plan(input: Parameters<typeof selectSampledRuns>[0]): ReturnType<typeof selectSampledRuns> {
        return this.Plan(input);
    }

    public async Run(): Promise<ReturnType<typeof SelectSampledRuns>> {
        const chosen = this.Plan(await this.loader.Load());
        for (const item of chosen) {
            await this.engine.EvaluateRecord({
                rubricId: item.rubricId,
                subjectRecordId: item.runId,
                subjectEntityName: AGENT_RUN_SUBJECT,
            });
        }
        return chosen;
    }

    /** @deprecated Use {@link Run}. */
    public async run(): Promise<ReturnType<typeof selectSampledRuns>> {
        return this.Run();
    }
}

export interface AgentRubricLinkRow {
    agentId: string;
    rubricId: string;
    sampleRate: number;
    status: string;
    purpose: string;
}

export interface AgentRunRow {
    id: string;
    agentId: string;
    status: string;
}

/** Links, completed runs, and evaluations already stored. The job reads these and does not query itself. */
export interface ProductionSamplingCatalog {
    links(): Promise<AgentRubricLinkRow[]>;
    runs(): Promise<AgentRunRow[]>;
    /** Evaluations point at a version. They do not store a rubric id. */
    evaluated(): Promise<{ runId: string; rubricVersionId: string }[]>;
    versions(): Promise<{ id: string; rubricId: string }[]>;
}

/** Rubric id stored on the version. An unknown version resolves to an empty string. */
export function RubricIdFromVersion(versionId: string, versions: { id: string; rubricId: string }[]): string {
    return versions.find(row => row.id === versionId)?.rubricId ?? '';
}

/** @deprecated Use {@link RubricIdFromVersion}. */
export function rubricIdFromVersion(versionId: string, versions: { id: string; rubricId: string }[]): string {
    return RubricIdFromVersion(versionId, versions);
}

/** Pairs each evaluation's run with the rubric that owns its version. */
export function EvaluatedRubricRuns(
    evaluations: { runId: string; rubricVersionId: string }[],
    versions: { id: string; rubricId: string }[],
): { runId: string; rubricId: string }[] {
    return evaluations.flatMap(row => {
        const rubricId = RubricIdFromVersion(row.rubricVersionId, versions);
        return rubricId ? [{ runId: row.runId, rubricId }] : [];
    });
}

/** @deprecated Use {@link EvaluatedRubricRuns}. */
export function evaluatedRubricRuns(
    evaluations: { runId: string; rubricVersionId: string }[],
    versions: { id: string; rubricId: string }[],
): { runId: string; rubricId: string }[] {
    return EvaluatedRubricRuns(evaluations, versions);
}

/** Active links whose purpose is ProductionSampling. Evaluation and SelfCheck are not sampled. */
export function ProductionSamplingLinks(links: AgentRubricLinkRow[]): SamplingLink[] {
    return links
        .filter(link => link.purpose === 'ProductionSampling' && link.status === 'Active')
        .map(link => ({ agentId: link.agentId, rubricId: link.rubricId, sampleRate: link.sampleRate, status: link.status }));
}

/** @deprecated Use {@link ProductionSamplingLinks}. */
export function productionSamplingLinks(links: AgentRubricLinkRow[]): SamplingLink[] {
    return ProductionSamplingLinks(links);
}

/** Loader for the scheduled job. Completed runs only, and only ProductionSampling links. */
export function ProductionSamplingLoader(catalog: ProductionSamplingCatalog): SamplingLoader {
    return {
        async Load() {
            const runs = (await catalog.runs())
                .filter(run => run.status === 'Completed')
                .map(run => ({ id: run.id, agentId: run.agentId }));
            const evaluated = EvaluatedRubricRuns(await catalog.evaluated(), await catalog.versions());
            return { links: ProductionSamplingLinks(await catalog.links()), runs, evaluated };
        },
    };
}

/** @deprecated Use {@link ProductionSamplingLoader}. */
export function productionSamplingLoader(catalog: ProductionSamplingCatalog): SamplingLoader {
    return ProductionSamplingLoader(catalog);
}

/** The scheduled job, built with a catalog that can see purpose. */
export function ProductionSamplingJob(catalog: ProductionSamplingCatalog, engine: SamplingEvaluator): EvaluateSampledAgentRuns {
    return new EvaluateSampledAgentRuns(ProductionSamplingLoader(catalog), engine);
}

/** @deprecated Use {@link ProductionSamplingJob}. */
export function productionSamplingJob(catalog: ProductionSamplingCatalog, engine: SamplingEvaluator): EvaluateSampledAgentRuns {
    return ProductionSamplingJob(catalog, engine);
}

export interface DriftScoreRow {
    evaluationId: string;
    criterionId: string;
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

/**
 * Joins a score to its evaluation and that evaluation's agent run.
 * The key is agent, rubric, and criterion. A score with no matching run is left out.
 */
export function DriftSeries(input: {
    scores: DriftScoreRow[];
    evaluations: DriftEvaluationRow[];
    runs: DriftRunRow[];
    versions: { id: string; rubricId: string }[];
}): { key: string; score: number; at: string }[] {
    const evaluations = new Map(input.evaluations.map(row => [row.id, row]));
    const agents = new Map(input.runs.map(row => [row.id, row.agentId]));
    const rows: { key: string; score: number; at: string }[] = [];
    for (const score of input.scores) {
        const evaluation = evaluations.get(score.evaluationId);
        if (!evaluation || !Number.isFinite(score.normalizedScore)) continue;
        const agentId = agents.get(evaluation.subjectRecordId);
        const rubricId = RubricIdFromVersion(evaluation.rubricVersionId, input.versions);
        if (!agentId || !rubricId || !score.criterionId) continue;
        rows.push({ key: `${agentId}|${rubricId}|${score.criterionId}`, score: score.normalizedScore, at: evaluation.at });
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
