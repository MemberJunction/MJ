/** Stable bucket 0..9999 for a run id. The same id always lands in the same bucket. */
export function sampleBucket(runId: string): number {
    let hash = 0;
    for (const char of runId) hash = Math.imul(hash, 31) + char.charCodeAt(0);
    return (hash >>> 0) % 10000;
}

/** True when the run falls inside the link's sample rate. Rate is 0..1. */
export function keepSample(runId: string, sampleRate: number): boolean {
    if (sampleRate <= 0) return false;
    if (sampleRate >= 1) return true;
    return sampleBucket(runId) < sampleRate * 10000;
}

export interface SamplingLink {
    agentId: string;
    rubricId: string;
    sampleRate: number;
    status: string;
}

/** Active production-sampling links, recent runs, skipping runs that already have this rubric's evaluation. */
export function selectSampledRuns(input: {
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
            if (!keepSample(run.id, link.sampleRate)) continue;
            chosen.push({ runId: run.id, agentId: link.agentId, rubricId: link.rubricId });
        }
    }
    return chosen;
}

export interface SamplingLoader {
    load(): Promise<Parameters<typeof selectSampledRuns>[0]>;
}

export interface SamplingEvaluator {
    evaluateRecord(input: { rubricId: string; subjectRecordId: string }): Promise<void>;
}

/** Scheduled job. Loads links and runs, then evaluates the kept runs off the agent response path. */
export class EvaluateSampledAgentRuns {
    public constructor(private readonly loader: SamplingLoader, private readonly engine: SamplingEvaluator) {}

    public plan(input: Parameters<typeof selectSampledRuns>[0]): ReturnType<typeof selectSampledRuns> {
        return selectSampledRuns(input);
    }

    public async run(): Promise<ReturnType<typeof selectSampledRuns>> {
        const chosen = this.plan(await this.loader.load());
        for (const item of chosen) {
            await this.engine.evaluateRecord({ rubricId: item.rubricId, subjectRecordId: item.runId });
        }
        return chosen;
    }
}

/** Mean score of each key whose timestamp falls in [start, end). */
export function periodMeans(rows: { key: string; score: number; at: string }[], start: string, end: string): { key: string; mean: number }[] {
    const buckets = new Map<string, number[]>();
    for (const row of rows) {
        if (row.at < start || row.at >= end) continue;
        const list = buckets.get(row.key) ?? [];
        list.push(row.score);
        buckets.set(row.key, list);
    }
    return [...buckets.entries()].map(([key, scores]) => ({ key, mean: scores.reduce((sum, score) => sum + score, 0) / scores.length }));
}

/** Drop of the current period's mean below the previous period. A drop past the threshold alerts. */
export function driftDeltas(current: { key: string; mean: number }[], previous: { key: string; mean: number }[], threshold: number): { key: string; drop: number; alert: boolean }[] {
    return current.map(row => {
        const prior = previous.find(item => item.key === row.key);
        const drop = prior == null ? 0 : prior.mean - row.mean;
        return { key: row.key, drop, alert: prior != null && drop > threshold };
    });
}
