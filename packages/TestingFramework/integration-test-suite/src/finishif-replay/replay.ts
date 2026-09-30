/**
 * replay.ts — runs the finishIf replay end to end, against injected readers, author and decider.
 *
 * 1. Reads the corpus steps and extracts the rounds; production's code checks leave some never gated.
 * 2. Samples the gated rounds (`--limit`), and reads their label turns' latency, cost and tokens.
 * 3. For the `authored` arm, writes each round's finishIf, or takes it from the cache.
 * 4. Asks the decision about each round, per arm and rep, and judges it with production's rule.
 * 5. Reads each decision's cost back, and builds the report.
 *
 * A dry run stops after step 2 and prints the plan: it makes no model and no decision call.
 */
import type { DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import { BuildFinishIfQuestions, JudgeFinishIf } from '@memberjunction/ai-agents';
import type { AuthorOutcome } from './author';
import { GateScore } from './metrics';
import { BuildFinishIfReplayReport, GENERIC_FINISH_IF_QUESTION, RenderFinishIfReplayReport, type AuthoringSummary, type FinishIfReplayReport, type FinishIfReplaySettings } from './report';
import { BuildRoundState, ExtractRounds, NormalizeId, RoundSavingsOf, SampleRounds } from './rounds';
import type {
    AuthoredFinishIf,
    FinishIfReplayArm,
    GateObservation,
    LabelCounts,
    ReplayPromptRunRow,
    ReplayRound,
    ReplayStepRow,
    RoundExtraction,
    RoundSavings
} from './types';

/** Reads the corpus database. Read-only. */
export interface CorpusReader {
    ReadSteps(): Promise<ReplayStepRow[]>;
    ReadPromptRuns(ids: readonly string[]): Promise<ReplayPromptRunRow[]>;
}

/** Writes a round's finishIf for the `authored` arm. */
export interface FinishIfRoundAuthor {
    Author(round: ReplayRound): Promise<AuthorOutcome>;
}

/** One decision call's reply. */
export interface DecisionReply {
    Success: boolean;
    Answers: Record<string, DecisionAnswer>;
    ModelName: string | null;
    PromptRunID: string | null;
    LatencyMs: number;
    Error: string | null;
}

/** Asks the decision prompt the gate's questions about a state. */
export interface FinishIfDecider {
    Decide(state: string, questions: Record<string, DecisionQuestion>): Promise<DecisionReply>;
}

/** Reads the decisions' prompt-run costs back, by prompt-run ID. */
export interface GateCostReader {
    ReadCosts(promptRunIds: readonly string[]): Promise<Map<string, number | null>>;
}

/** Where the replay writes and logs. */
export interface ReplaySink {
    AppendAuthored(entry: AuthoredFinishIf): void;
    AppendDecision(observation: GateObservation): void;
    WriteReport(report: FinishIfReplayReport, markdown: string): void;
    Log(line: string): void;
}

/** What the replay is asked to do. */
export interface FinishIfReplayOptions {
    Settings: FinishIfReplaySettings;
    DryRun: boolean;
    Concurrency: number;
    /** Authored finishIfs from earlier runs, by normalized round ID. */
    AuthoredCache: ReadonlyMap<string, AuthoredFinishIf>;
}

/** What the replay runs against. */
export interface FinishIfReplayDeps {
    Corpus: CorpusReader;
    /** Required when the `authored` arm runs and a round is not in the cache. */
    Author: FinishIfRoundAuthor | null;
    Decider: FinishIfDecider;
    Costs: GateCostReader;
    Sink: ReplaySink;
    Now: () => Date;
}

/** What a run will do, as a dry run prints it. */
export interface ReplayPlan {
    Rounds: number;
    Labels: LabelCounts;
    NeverGated: number;
    NeverGatedLabels: LabelCounts;
    Excluded: number;
    Gated: number;
    Sampled: number;
    /** Rounds the author must write; each takes one to three calls. */
    RoundsToAuthor: number;
    /** Decision calls, if every round is authored. */
    DecisionCalls: number;
}

/** What a run did. */
export interface FinishIfReplayResult {
    Plan: ReplayPlan;
    /** Null for a dry run. */
    Report: FinishIfReplayReport | null;
}

/** The rounds, the sample and its savings. */
interface PreparedRounds {
    Extraction: RoundExtraction;
    Sampled: ReplayRound[];
    Savings: Map<string, RoundSavings>;
}

/** One decision to make. */
interface DecisionTask {
    Round: ReplayRound;
    Arm: FinishIfReplayArm;
    Rep: number;
    Questions: Record<string, DecisionQuestion>;
}

function labelCounts(rounds: readonly ReplayRound[]): LabelCounts {
    const finish = rounds.filter(r => r.Label === 'finish').length;
    return { Finish: finish, Continue: rounds.length - finish };
}

/**
 * Maps the items through `worker`, at most `limit` at a time, keeping the items' order.
 */
export async function MapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        for (let i = next++; i < items.length; i = next++) {
            results[i] = await worker(items[i], i);
        }
    });
    await Promise.all(lanes);
    return results;
}

async function prepareRounds(options: FinishIfReplayOptions, corpus: CorpusReader): Promise<PreparedRounds> {
    const extraction = ExtractRounds(await corpus.ReadSteps());
    const gated = extraction.Rounds.filter(r => r.GateStatus === 'gated');
    const sampled = SampleRounds(gated, options.Settings.Limit, options.Settings.Seed);
    const runIds = sampled.map(r => r.LabelPromptRunID).filter((id): id is string => !!id);
    const runs = await corpus.ReadPromptRuns([...new Set(runIds.map(NormalizeId))]);
    const byId = new Map(runs.map(run => [NormalizeId(run.ID), run] as const));
    return { Extraction: extraction, Sampled: sampled, Savings: new Map(sampled.map(r => [r.RoundId, RoundSavingsOf(r, byId)] as const)) };
}

/** What a run will do. */
export function PlanReplay(prepared: PreparedRounds, options: FinishIfReplayOptions): ReplayPlan {
    const rounds = prepared.Extraction.Rounds;
    const neverGated = rounds.filter(r => r.GateStatus !== 'gated');
    const authored = options.Settings.Arms.includes('authored');
    return {
        Rounds: rounds.length,
        Labels: labelCounts(rounds),
        NeverGated: neverGated.length,
        NeverGatedLabels: labelCounts(neverGated),
        Excluded: prepared.Extraction.Excluded.length,
        Gated: rounds.length - neverGated.length,
        Sampled: prepared.Sampled.length,
        RoundsToAuthor: authored ? prepared.Sampled.filter(r => !options.AuthoredCache.has(NormalizeId(r.RoundId))).length : 0,
        DecisionCalls: prepared.Sampled.length * options.Settings.Arms.length * options.Settings.Reps
    };
}

function logPlan(plan: ReplayPlan, sink: ReplaySink): void {
    sink.Log(`${plan.Rounds} rounds (${plan.Labels.Finish} finish, ${plan.Labels.Continue} continue); ${plan.Excluded} stretches of actions excluded`);
    sink.Log(`${plan.NeverGated} never gated by the code checks (${plan.NeverGatedLabels.Finish} finish, ${plan.NeverGatedLabels.Continue} continue); ${plan.Gated} gated; ${plan.Sampled} sent to the decision`);
    sink.Log(`planned: ${plan.RoundsToAuthor} rounds to author (1-3 calls each); ${plan.DecisionCalls} decision calls`);
}

/** Authors the rounds missing from the cache into `into`, and returns how many failed. */
async function authorMissing(
    rounds: readonly ReplayRound[],
    author: FinishIfRoundAuthor,
    concurrency: number,
    sink: ReplaySink,
    into: Map<string, AuthoredFinishIf>
): Promise<number> {
    let failed = 0;
    await MapWithConcurrency(rounds, concurrency, async round => {
        const outcome = await author.Author(round);
        if (!outcome.FinishIf) {
            failed++;
            sink.Log(`authoring failed for round ${round.RoundId} after ${outcome.Attempts} attempts: ${outcome.Error ?? 'no reason'}`);
            return;
        }
        const entry: AuthoredFinishIf = { RoundId: round.RoundId, FinishIf: outcome.FinishIf };
        into.set(round.RoundId, entry);
        sink.AppendAuthored(entry);
    });
    return failed;
}

/** The `authored` arm's finishIfs, from the cache or the author, by round ID. */
async function authorRounds(
    sampled: readonly ReplayRound[],
    options: FinishIfReplayOptions,
    deps: FinishIfReplayDeps
): Promise<{ FinishIfs: Map<string, AuthoredFinishIf>; Summary: AuthoringSummary }> {
    const finishIfs = new Map<string, AuthoredFinishIf>();
    const toAuthor = sampled.filter(r => {
        const cached = options.AuthoredCache.get(NormalizeId(r.RoundId));
        if (cached) {
            finishIfs.set(r.RoundId, cached);
        }
        return !cached;
    });
    let failed = 0;
    if (toAuthor.length > 0) {
        if (!deps.Author) {
            throw new Error(`${toAuthor.length} rounds need an authored finishIf, and no author is configured`);
        }
        failed = await authorMissing(toAuthor, deps.Author, options.Concurrency, deps.Sink, finishIfs);
    }
    return { FinishIfs: finishIfs, Summary: { FromCache: sampled.length - toAuthor.length, AuthoredNow: toAuthor.length - failed, Failed: failed } };
}

/** The decisions to make, rep by rep, so a stopped run has whole reps. */
function decisionTasks(sampled: readonly ReplayRound[], authored: ReadonlyMap<string, AuthoredFinishIf>, settings: FinishIfReplaySettings): DecisionTask[] {
    const generic = BuildFinishIfQuestions({ questions: [GENERIC_FINISH_IF_QUESTION] });
    const tasks: DecisionTask[] = [];
    for (let rep = 1; rep <= settings.Reps; rep++) {
        for (const arm of settings.Arms) {
            for (const round of sampled) {
                const finishIf = arm === 'generic' ? null : authored.get(round.RoundId)?.FinishIf;
                if (arm === 'generic' || finishIf) {
                    tasks.push({ Round: round, Arm: arm, Rep: rep, Questions: finishIf ? BuildFinishIfQuestions(finishIf) : generic });
                }
            }
        }
    }
    return tasks;
}

/** A decision's reply, judged with production's rule. A failed call never passes. */
export function ObservationFromReply(task: Pick<DecisionTask, 'Round' | 'Arm' | 'Rep' | 'Questions'>, reply: DecisionReply, threshold: number): GateObservation {
    const judged = reply.Success ? JudgeFinishIf(reply.Answers, task.Questions, threshold) : { Passed: false, Probabilities: {} };
    return {
        RoundId: task.Round.RoundId,
        Arm: task.Arm,
        Rep: task.Rep,
        CallSucceeded: reply.Success,
        Probabilities: judged.Probabilities,
        Score: reply.Success ? GateScore(judged.Probabilities, Object.keys(task.Questions)) : null,
        Passed: judged.Passed,
        ModelName: reply.ModelName,
        PromptRunID: reply.PromptRunID,
        LatencyMs: reply.LatencyMs,
        CostUSD: null
    };
}

async function decideRounds(tasks: readonly DecisionTask[], options: FinishIfReplayOptions, deps: FinishIfReplayDeps): Promise<GateObservation[]> {
    let done = 0;
    return MapWithConcurrency(tasks, options.Concurrency, async task => {
        const reply = await deps.Decider.Decide(BuildRoundState(task.Round), task.Questions);
        const observation = ObservationFromReply(task, reply, options.Settings.ProductionThreshold);
        deps.Sink.AppendDecision(observation);
        if (!reply.Success) {
            deps.Sink.Log(`decision failed for round ${task.Round.RoundId} (${task.Arm}, rep ${task.Rep}): ${reply.Error ?? 'no reason'}`);
        }
        if (++done % 100 === 0) {
            deps.Sink.Log(`${done} of ${tasks.length} decisions`);
        }
        return observation;
    });
}

/** Each decision's cost, read back after its prompt run is saved. */
async function withCosts(observations: readonly GateObservation[], costs: GateCostReader): Promise<GateObservation[]> {
    const ids = [...new Set(observations.map(o => o.PromptRunID).filter((id): id is string => !!id).map(NormalizeId))];
    const read = ids.length > 0 ? await costs.ReadCosts(ids) : new Map<string, number | null>();
    return observations.map(o => ({ ...o, CostUSD: o.PromptRunID ? read.get(NormalizeId(o.PromptRunID)) ?? null : null }));
}

/** Runs the replay. */
export async function RunFinishIfReplay(options: FinishIfReplayOptions, deps: FinishIfReplayDeps): Promise<FinishIfReplayResult> {
    const prepared = await prepareRounds(options, deps.Corpus);
    const plan = PlanReplay(prepared, options);
    logPlan(plan, deps.Sink);
    if (options.DryRun) {
        return { Plan: plan, Report: null };
    }
    const authored = options.Settings.Arms.includes('authored')
        ? await authorRounds(prepared.Sampled, options, deps)
        : { FinishIfs: new Map<string, AuthoredFinishIf>(), Summary: null };
    const decided = await decideRounds(decisionTasks(prepared.Sampled, authored.FinishIfs, options.Settings), options, deps);
    const report = BuildFinishIfReplayReport({
        GeneratedAt: deps.Now().toISOString(),
        Settings: options.Settings,
        Extraction: prepared.Extraction,
        Sampled: prepared.Sampled,
        Savings: prepared.Savings,
        Observations: await withCosts(decided, deps.Costs),
        Authoring: authored.Summary
    });
    deps.Sink.WriteReport(report, RenderFinishIfReplayReport(report));
    return { Plan: plan, Report: report };
}
