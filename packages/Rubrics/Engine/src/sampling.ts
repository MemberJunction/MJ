export {
    DriftDeltas, driftDeltas, DriftSeries, driftSeries, KeepSample, keepSample, PeriodMeans, periodMeans,
    RubricIdFromVersion, rubricIdFromVersion, SampleBucket, sampleBucket,
    type DriftEvaluationRow, type DriftRunRow, type DriftScoreRow,
} from '@memberjunction/rubrics-base';
import { KeepSample, RubricIdFromVersion } from '@memberjunction/rubrics-base';

export interface SamplingLink {
    agentId: string;
    rubricId: string;
    sampleRate: number;
    status: string;
    /** AIAgentRubric.EvaluatorConfig. Absent means LLM SinglePass. */
    evaluatorConfig?: unknown;
}

/** The evaluator a sampled run uses. Missing config is LLM SinglePass, not Deterministic. */
export function SamplingEvaluatorChoice(config: unknown): { evaluator: 'LLM' | 'Deterministic' | 'AI'; promptMode: 'SinglePass' | 'PerCriterion' } {
    const parsed = typeof config === 'string' ? parseConfig(config) : config;
    const record = parsed && typeof parsed === 'object' ? parsed as { EvaluatorType?: string; Mode?: string } : {};
    const promptMode = record.Mode === 'PerCriterion' ? 'PerCriterion' : 'SinglePass';
    if (record.EvaluatorType === 'Deterministic') return { evaluator: 'Deterministic', promptMode };
    if (record.EvaluatorType === 'Agent') return { evaluator: 'AI', promptMode };
    return { evaluator: 'LLM', promptMode };
}

function parseConfig(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export interface SampledRun {
    runId: string;
    agentId: string;
    rubricId: string;
    evaluator: 'LLM' | 'Deterministic' | 'AI';
    promptMode: 'SinglePass' | 'PerCriterion';
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
                runId: run.id,
                agentId: link.agentId,
                rubricId: link.rubricId,
                ...SamplingEvaluatorChoice(link.evaluatorConfig),
            });
        }
    }
    return chosen;
}

/** @deprecated Use {@link SelectSampledRuns}. */
export function selectSampledRuns(input: {
    links: SamplingLink[];
    runs: { id: string; agentId: string }[];
    evaluated: { runId: string; rubricId: string }[];
}): SampledRun[] {
    return SelectSampledRuns(input);
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
        evaluator: 'LLM' | 'Deterministic' | 'AI';
        promptMode: 'SinglePass' | 'PerCriterion';
    }): Promise<void>;
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
                evaluator: item.evaluator,
                promptMode: item.promptMode,
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
    evaluatorConfig?: unknown;
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
        .map(link => ({
            agentId: link.agentId,
            rubricId: link.rubricId,
            sampleRate: link.sampleRate,
            status: link.status,
            evaluatorConfig: link.evaluatorConfig,
        }));
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


