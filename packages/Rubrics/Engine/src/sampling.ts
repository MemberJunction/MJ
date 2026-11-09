export {
    DriftDeltas, DriftSeries, KeepSample, PeriodMeans,
    RubricIdFromVersion, SampleBucket,
    type DriftEvaluationRow, type DriftRunRow, type DriftScoreRow,
} from '@memberjunction/rubrics-base';
import { KeepSample, RubricIdFromVersion } from '@memberjunction/rubrics-base';
import type { EvaluationAgentRunner } from './AgentRubricEvaluator.js';

export interface SamplingLink {
    agentId: string;
    rubricId: string;
    sampleRate: number;
    status: string;
    /** AIAgentRubric.EvaluatorConfig. Absent means LLM SinglePass. */
    evaluatorConfig?: unknown;
}

export interface SampledRun {
    RunId: string;
    AgentId: string;
    RubricId: string;
    /**
     * The link's EvaluatorConfig, passed to the engine as is. The engine resolves it, so a link
     * whose config names no runnable evaluator fails that run and not the whole job. Missing
     * config is LLM SinglePass, not Deterministic.
     */
    EvaluatorConfig?: unknown;
}

/** Active production-sampling links, recent runs, skipping runs that already have this rubric's evaluation. */
export function SelectSampledRuns(input: {
    links: SamplingLink[];
    runs: { id: string; agentId: string }[];
    evaluated: { runId: string; rubricId: string }[];
}): SampledRun[] {
    const chosen: SampledRun[] = [];
    for (const link of input.links) {
        if (link.status !== 'Active') continue;
        for (const run of input.runs) {
            if (run.agentId !== link.agentId) continue;
            if (input.evaluated.some(row => row.runId === run.id && row.rubricId === link.rubricId)) continue;
            if (!KeepSample(run.id, link.sampleRate)) continue;
            chosen.push({
                RunId: run.id,
                AgentId: link.agentId,
                RubricId: link.rubricId,
                EvaluatorConfig: link.evaluatorConfig,
            });
        }
    }
    return chosen;
}

export interface SamplingLoader {
    Load(): Promise<Parameters<typeof SelectSampledRuns>[0]>;
}

/** Subject entity for a sampled production run. */
export const AGENT_RUN_SUBJECT = 'MJ: AI Agent Runs';

export interface SamplingEvaluator {
    EvaluateRecord(input: {
        rubricId: string;
        subjectRecordId: string;
        subjectEntityName: string;
        /** AIAgentRubric.EvaluatorConfig. See ResolveRubricEvaluatorSelection. */
        evaluatorConfig?: unknown;
        agent?: EvaluationAgentRunner;
    }): Promise<void>;
}

/** Scheduled job. Loads links and runs, then evaluates the kept runs off the agent response path. */
export class EvaluateSampledAgentRuns {
    public Failures: { runId: string; message: string }[] = [];

    public constructor(
        private readonly loader: SamplingLoader,
        private readonly engine: SamplingEvaluator,
        private readonly volumeCap: number = SAMPLING_VOLUME_CAP,
        private readonly agent?: EvaluationAgentRunner,
    ) {}

    public Plan(input: Parameters<typeof SelectSampledRuns>[0]): ReturnType<typeof SelectSampledRuns> {
        return SelectSampledRuns(input);
    }

        public async Run(): Promise<ReturnType<typeof SelectSampledRuns>> {
        const chosen = this.Plan(await this.loader.Load()).slice(0, Math.max(0, this.volumeCap));
        this.Failures = [];
        for (const item of chosen) {
            try {
                await this.engine.EvaluateRecord({
                    rubricId: item.RubricId,
                    subjectRecordId: item.RunId,
                    subjectEntityName: AGENT_RUN_SUBJECT,
                    evaluatorConfig: item.EvaluatorConfig,
                    ...(this.agent ? { agent: this.agent } : {}),
                });
            } catch (error) {
                this.Failures.push({ runId: item.RunId, message: error instanceof Error ? error.message : String(error) });
            }
        }
        return chosen;
    }

    }

export interface AgentRubricLinkRow {
    agentId: string;
    rubricId: string;
    sampleRate: number;
    status: string;
    purpose: string;
    evaluatorConfig?: unknown;
}

export interface AgentRunRow {
    id: string;
    agentId: string;
    status: string;
    /** When the run started. A run older than the recency window is not sampled. */
    startedAt?: string;
}

/** Seven days. A completed run older than this is outside the sampling window. */
export const SAMPLING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** The job stops after this many evaluations, even when more runs were kept. */
export const SAMPLING_VOLUME_CAP = 100;
/** How many run ids go into one evaluated-lookup. */
export const SAMPLING_EVALUATED_BATCH = 100;

export interface SamplingJobOptions {
    Now?: Date;
    WindowMs?: number;
    /** Only these agents. Omit to use every agent that has a sampling link. */
    AgentIds?: string[];
    VolumeCap?: number;
    EvaluatedBatchSize?: number;
    /** Passed into EvaluateRecord for an Agent config. */
    Agent?: EvaluationAgentRunner;
}

export function SamplingSince(now: Date = new Date(), windowMs: number = SAMPLING_WINDOW_MS): string {
    return new Date(now.getTime() - windowMs).toISOString();
}

/** Completed runs inside the window and, when set, the agent list. A run with no start time stays. */
export function FilterSamplingRuns(runs: AgentRunRow[], options: { since?: string; agentIds?: string[] }): AgentRunRow[] {
    return runs.filter(run => {
        if (run.status !== 'Completed') return false;
        if (options.agentIds && options.agentIds.length > 0 && !options.agentIds.includes(run.agentId)) return false;
        if (run.startedAt && options.since && run.startedAt < options.since) return false;
        return true;
    });
}

export function ChunkIds(ids: string[], size: number): string[][] {
    const width = Math.max(1, size);
    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += width) chunks.push(ids.slice(index, index + width));
    return chunks;
}

/** Links, completed runs, and evaluations already stored. The job reads these and does not query itself. */
export interface ProductionSamplingCatalog {
    links(): Promise<AgentRubricLinkRow[]>;
    runs(filter?: { since?: string; agentIds?: string[] }): Promise<AgentRunRow[]>;
    /**
     * Evaluations for these run ids, one batch at a time. They point at a version.
     * They do not store a rubric id.
     */
    evaluated(runIds: string[]): Promise<{ runId: string; rubricVersionId: string }[]>;
    versions(): Promise<{ id: string; rubricId: string }[]>;
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

/** Active links whose purpose is ProductionSampling. Evaluation and SelfCheck are not sampled. */
export function ProductionSamplingLinks(links: AgentRubricLinkRow[]): SamplingLink[] {
    return links
        .filter(link => link.purpose === 'ProductionSampling' && link.status === 'Active')
        .map(link => ({
            agentId: link.agentId,
            rubricId: link.rubricId,
            sampleRate: link.sampleRate,
            status: link.status,
            evaluatorConfig: link.evaluatorConfig,
        }));
}

/** Loader for the scheduled job. Completed runs only, and only ProductionSampling links. */
export function ProductionSamplingLoader(catalog: ProductionSamplingCatalog, options: SamplingJobOptions = {}): SamplingLoader {
    return {
        async Load() {
            const links = ProductionSamplingLinks(await catalog.links());
            const agentIds = options.AgentIds ?? [...new Set(links.map(link => link.agentId))];
            const since = SamplingSince(options.Now ?? new Date(), options.WindowMs ?? SAMPLING_WINDOW_MS);
            const runs = FilterSamplingRuns(await catalog.runs({ since, agentIds }), { since, agentIds })
                .map(run => ({ id: run.id, agentId: run.agentId }));
            const evaluatedRows = [];
            for (const batch of ChunkIds(runs.map(run => run.id), options.EvaluatedBatchSize ?? SAMPLING_EVALUATED_BATCH)) {
                evaluatedRows.push(...await catalog.evaluated(batch));
            }
            const evaluated = EvaluatedRubricRuns(evaluatedRows, await catalog.versions());
            return { links, runs, evaluated };
        },
    };
}

/** The scheduled job, built with a catalog that can see purpose. */
export function ProductionSamplingJob(catalog: ProductionSamplingCatalog, engine: SamplingEvaluator, options: SamplingJobOptions = {}): EvaluateSampledAgentRuns {
    return new EvaluateSampledAgentRuns(
        ProductionSamplingLoader(catalog, options),
        engine,
        options.VolumeCap ?? SAMPLING_VOLUME_CAP,
        options.Agent,
    );
}

