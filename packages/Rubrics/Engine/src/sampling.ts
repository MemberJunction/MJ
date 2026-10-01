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

/** Scheduled job body. Evaluation is this list, not work on the agent's response path. */
export class EvaluateSampledAgentRuns {
    public plan(input: Parameters<typeof selectSampledRuns>[0]): ReturnType<typeof selectSampledRuns> {
        return selectSampledRuns(input);
    }
}

/** Drop of the current period's mean below the previous period. A drop past the threshold alerts. */
export function driftDeltas(current: { key: string; mean: number }[], previous: { key: string; mean: number }[], threshold: number): { key: string; drop: number; alert: boolean }[] {
    return current.map(row => {
        const prior = previous.find(item => item.key === row.key);
        const drop = prior == null ? 0 : prior.mean - row.mean;
        return { key: row.key, drop, alert: prior != null && drop > threshold };
    });
}
