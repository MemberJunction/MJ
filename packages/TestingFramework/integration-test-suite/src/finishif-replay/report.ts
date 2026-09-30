/**
 * report.ts — the finishIf replay's report: `report.json` and `report.md`.
 *
 * The report names rounds, runs, steps and prompt runs by ID only. It carries labels, step-type
 * names from a fixed list, model names and numbers, and never any text from a step: no reasoning,
 * no action params or results, no authored question.
 */
import type { ConfidenceInterval } from '@memberjunction/testing-engine';
import { ComputeArmMetrics, PassesByNextStep, SummarizeRoundOutcomes, type ArmMetricOptions, type ArmMetrics, type NextStepPasses, type SweepRow } from './metrics';
import type {
    FinishIfNextStepName,
    FinishIfReplayArm,
    FinishIfReplayLabel,
    GateObservation,
    LabelCounts,
    ReplayExclusion,
    ReplayRound,
    RoundExtraction,
    RoundSavings
} from './types';

/** The one question of the `generic` arm. */
export const GENERIC_FINISH_IF_QUESTION = 'The action results fully complete what the user asked for, so no further action or reply is needed.';

/** What the run was asked to do. */
export interface FinishIfReplaySettings {
    CorpusDatabase: string;
    DecisionPrompt: string;
    /** The decision model every call is pinned to, with failover off; null for the prompt's own selection and failover. */
    DecisionModel: string | null;
    AuthorModel: string | null;
    Arms: FinishIfReplayArm[];
    Reps: number;
    Seed: number;
    Limit: number | null;
    ProductionThreshold: number;
    Thresholds: number[];
    GenericQuestion: string;
    BootstrapResamples: number;
    CalibrationFolds: number;
}

/** Rounds per next-step name and label. */
export interface NextStepCount {
    NextStep: FinishIfNextStepName;
    Label: FinishIfReplayLabel;
    Rounds: number;
}

/** The corpus, as the replay found it. */
export interface CorpusSummary {
    AgentRuns: number;
    Rounds: number;
    Labels: LabelCounts;
    ByNextStep: NextStepCount[];
    NeverGatedLoopIteration: LabelCounts;
    NeverGatedNotAnActionsTurn: LabelCounts;
    NeverGatedNotALoopAgent: LabelCounts;
    NeverGatedActionFailed: LabelCounts;
    NeverGatedMayHaveDirectives: LabelCounts;
    Gated: LabelCounts;
    /** Gated rounds sent to the decision, after `--limit`. */
    Sampled: LabelCounts;
    ExcludedNoNextPrompt: number;
    ExcludedNoPreviousPrompt: number;
    ExcludedLabelUnreadable: number;
    SampledWithoutLatency: number;
    SampledWithoutCost: number;
}

/** How the `authored` arm's questions came to be. */
export interface AuthoringSummary {
    FromCache: number;
    AuthoredNow: number;
    Failed: number;
}

/** One arm's metrics, with its authoring summary for the `authored` arm. */
export interface ArmReport extends ArmMetrics {
    Authoring: AuthoringSummary | null;
    /** Of `Calls`, the decisions reused from an earlier run's `decisions.jsonl`, with no call. */
    CachedCalls: number;
    /** The decided rounds per next step, and how many pass at the production threshold. */
    ProductionByNextStep: NextStepPasses[];
}

/** One round, by ID. */
export interface RoundRecord {
    RoundId: string;
    AgentRunID: string;
    LabelStepID: string;
    LabelPromptRunID: string | null;
    Label: FinishIfReplayLabel;
    NextStep: FinishIfNextStepName;
    GateStatus: ReplayRound['GateStatus'];
    Actions: number;
    Sampled: boolean;
    LabelLatencyMs: number | null;
    LabelCostUSD: number | null;
    LabelTokens: number | null;
}

/** The whole report. */
export interface FinishIfReplayReport {
    GeneratedAt: string;
    Settings: FinishIfReplaySettings;
    Corpus: CorpusSummary;
    Arms: ArmReport[];
    Rounds: RoundRecord[];
    Notes: string[];
}

/** Everything the report is built from. */
export interface FinishIfReplayReportInput {
    GeneratedAt: string;
    Settings: FinishIfReplaySettings;
    Extraction: RoundExtraction;
    /** The gated rounds sent to the decision. */
    Sampled: readonly ReplayRound[];
    /** Each sampled round's savings, by round ID. */
    Savings: ReadonlyMap<string, RoundSavings>;
    Observations: readonly GateObservation[];
    /** The decisions reused from an earlier run, per arm. */
    CachedCalls: Readonly<Record<FinishIfReplayArm, number>>;
    Authoring: AuthoringSummary | null;
}

/** The notes every report carries. */
export const FINISH_IF_REPLAY_NOTES: readonly string[] = [
    'The corpus is simulated users talking to real MJ agents.',
    "The authored arm's questions are an LLM's reconstruction from the turn that asked for the actions, not what the loop model would have written live.",
    'A label is `finish` when the next turn is Success, or terminates without asking for actions (a Chat reply included); every other next turn is `continue`.',
    'A loop Chat step always terminates, a clarifying question included, so a `finish` round that ended in a Chat reply may be one where a passing gate would have replaced the question with its pre-written message. The per-next-step table at the production threshold separates them.',
    "Production gates only the Actions step a Loop agent's turn asked for: a ForEach or While loop's iterations, actions after any other kind of turn, and a non-Loop agent's actions are never gated.",
    'Recorded Actions steps do not keep AIDirectives. A round with an action that can return them is treated as never gated.',
    'The state is formatted from the recorded, JSON-serialized results; media outputs keep their data instead of the placeholder production would show.',
    'A false finish saves nothing: net savings count the skipped turns of `finish` rounds only, less the gate on every decided round.',
    'The decision calls do not carry the corpus agent ID.',
    'A failover or delegated decision cost may be missing on branches without #4880.'
];

function counts(rounds: ReadonlyArray<{ Label: FinishIfReplayLabel }>): LabelCounts {
    const finish = rounds.filter(r => r.Label === 'finish').length;
    return { Finish: finish, Continue: rounds.length - finish };
}

function byNextStep(rounds: readonly ReplayRound[]): NextStepCount[] {
    const tally = new Map<string, NextStepCount>();
    for (const round of rounds) {
        const key = `${round.NextStep}|${round.Label}`;
        const entry = tally.get(key) ?? { NextStep: round.NextStep, Label: round.Label, Rounds: 0 };
        entry.Rounds++;
        tally.set(key, entry);
    }
    return [...tally.values()].sort((a, b) => b.Rounds - a.Rounds || a.NextStep.localeCompare(b.NextStep));
}

/** The corpus summary. */
export function SummarizeCorpus(extraction: RoundExtraction, sampled: readonly ReplayRound[], savings: ReadonlyMap<string, RoundSavings>): CorpusSummary {
    const rounds = extraction.Rounds;
    const excluded = (reason: ReplayExclusion['Reason']): number => extraction.Excluded.filter(e => e.Reason === reason).length;
    const sampledSavings = sampled.map(r => savings.get(r.RoundId));
    return {
        AgentRuns: new Set(rounds.map(r => r.AgentRunID.toUpperCase())).size,
        Rounds: rounds.length,
        Labels: counts(rounds),
        ByNextStep: byNextStep(rounds),
        NeverGatedLoopIteration: counts(rounds.filter(r => r.GateStatus === 'loop-iteration')),
        NeverGatedNotAnActionsTurn: counts(rounds.filter(r => r.GateStatus === 'not-an-actions-turn')),
        NeverGatedNotALoopAgent: counts(rounds.filter(r => r.GateStatus === 'not-a-loop-agent')),
        NeverGatedActionFailed: counts(rounds.filter(r => r.GateStatus === 'action-failed')),
        NeverGatedMayHaveDirectives: counts(rounds.filter(r => r.GateStatus === 'may-have-directives')),
        Gated: counts(rounds.filter(r => r.GateStatus === 'gated')),
        Sampled: counts(sampled),
        ExcludedNoNextPrompt: excluded('no-next-prompt'),
        ExcludedNoPreviousPrompt: excluded('no-previous-prompt'),
        ExcludedLabelUnreadable: excluded('label-unreadable'),
        SampledWithoutLatency: sampledSavings.filter(s => (s?.LatencyMs ?? null) === null).length,
        SampledWithoutCost: sampledSavings.filter(s => (s?.CostUSD ?? null) === null).length
    };
}

function roundRecords(extraction: RoundExtraction, sampled: readonly ReplayRound[], savings: ReadonlyMap<string, RoundSavings>): RoundRecord[] {
    const sampledIds = new Set(sampled.map(r => r.RoundId));
    return extraction.Rounds.map(round => {
        const saved = savings.get(round.RoundId);
        return {
            RoundId: round.RoundId,
            AgentRunID: round.AgentRunID,
            LabelStepID: round.LabelStepID,
            LabelPromptRunID: round.LabelPromptRunID,
            Label: round.Label,
            NextStep: round.NextStep,
            GateStatus: round.GateStatus,
            Actions: round.Actions.length,
            Sampled: sampledIds.has(round.RoundId),
            LabelLatencyMs: saved?.LatencyMs ?? null,
            LabelCostUSD: saved?.CostUSD ?? null,
            LabelTokens: saved?.Tokens ?? null
        };
    });
}

/** Builds the report. */
export function BuildFinishIfReplayReport(input: FinishIfReplayReportInput): FinishIfReplayReport {
    const options: ArmMetricOptions = {
        Seed: input.Settings.Seed,
        BootstrapResamples: input.Settings.BootstrapResamples,
        CalibrationFolds: input.Settings.CalibrationFolds,
        Thresholds: input.Settings.Thresholds,
        ProductionThreshold: input.Settings.ProductionThreshold
    };
    const arms = input.Settings.Arms.map(arm => {
        const observations = input.Observations.filter(o => o.Arm === arm);
        const outcomes = SummarizeRoundOutcomes(input.Sampled, observations, input.Savings);
        return {
            ...ComputeArmMetrics(arm, outcomes, observations, options),
            Authoring: arm === 'authored' ? input.Authoring : null,
            CachedCalls: input.CachedCalls[arm],
            ProductionByNextStep: PassesByNextStep(input.Sampled, outcomes, options.ProductionThreshold)
        };
    });
    return {
        GeneratedAt: input.GeneratedAt,
        Settings: input.Settings,
        Corpus: SummarizeCorpus(input.Extraction, input.Sampled, input.Savings),
        Arms: arms,
        Rounds: roundRecords(input.Extraction, input.Sampled, input.Savings),
        Notes: [...FINISH_IF_REPLAY_NOTES]
    };
}

// ─── Markdown ──────────────────────────────────────────────────────────────────────────────────

function num(value: number | null, digits = 3): string {
    return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function pct(value: number | null): string {
    return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function interval(ci: ConfidenceInterval | null): string {
    return ci ? `[${num(ci.Lower)}, ${num(ci.Upper)}]` : '—';
}

function labels(c: LabelCounts): string {
    return `${c.Finish} finish / ${c.Continue} continue`;
}

function renderSettings(settings: FinishIfReplaySettings): string[] {
    return [
        `- Corpus database: \`${settings.CorpusDatabase}\``,
        `- Decision prompt: ${settings.DecisionPrompt}`,
        `- Decision model: ${settings.DecisionModel ? `${settings.DecisionModel}, pinned, failover off` : "the prompt's own selection, with failover"}`,
        `- Author model: ${settings.AuthorModel ?? '—'}`,
        `- Arms: ${settings.Arms.join(', ')}; reps: ${settings.Reps}; seed: ${settings.Seed}; limit: ${settings.Limit ?? 'none'}`,
        `- Generic question: "${settings.GenericQuestion}"`,
        `- Production threshold: ${settings.ProductionThreshold}; bootstrap resamples: ${settings.BootstrapResamples}; calibration folds: ${settings.CalibrationFolds}`
    ];
}

function renderCorpus(corpus: CorpusSummary): string[] {
    return [
        '## Corpus',
        '',
        '| | Rounds |',
        '|---|---|',
        `| Agent runs with a round | ${corpus.AgentRuns} |`,
        `| Rounds | ${corpus.Rounds} (${labels(corpus.Labels)}) |`,
        `| Never gated: a ForEach or While loop's iterations | ${labels(corpus.NeverGatedLoopIteration)} |`,
        `| Never gated: the turn before did not ask for an Actions step | ${labels(corpus.NeverGatedNotAnActionsTurn)} |`,
        `| Never gated: not a Loop agent's run | ${labels(corpus.NeverGatedNotALoopAgent)} |`,
        `| Never gated: an action failed | ${labels(corpus.NeverGatedActionFailed)} |`,
        `| Never gated: an action may have returned AIDirectives | ${labels(corpus.NeverGatedMayHaveDirectives)} |`,
        `| Gated | ${labels(corpus.Gated)} |`,
        `| Sent to the decision | ${labels(corpus.Sampled)} |`,
        `| Excluded: no next Prompt step | ${corpus.ExcludedNoNextPrompt} |`,
        `| Excluded: no previous Prompt step | ${corpus.ExcludedNoPreviousPrompt} |`,
        `| Excluded: next Prompt step unreadable | ${corpus.ExcludedLabelUnreadable} |`,
        `| Sent, without a recorded latency / cost | ${corpus.SampledWithoutLatency} / ${corpus.SampledWithoutCost} |`,
        '',
        '| Next step | Label | Rounds |',
        '|---|---|---|',
        ...corpus.ByNextStep.map(n => `| ${n.NextStep} | ${n.Label} | ${n.Rounds} |`)
    ];
}

function sweepTable(rows: readonly SweepRow[], production: number): string[] {
    return [
        '| Threshold | Passes | Skippable share | False-finish rate | Precision | Net ms saved / 1k | Net $ saved / 1k | Tokens saved / 1k |',
        '|---|---|---|---|---|---|---|---|',
        ...rows.map(r => `| ${r.Threshold === production ? `**${num(r.Threshold, 2)}**` : num(r.Threshold, 2)} | ${r.Passes} | ${pct(r.SkippableShare)} | ${pct(r.FalseFinishRate)} | ${pct(r.Precision)} | ${num(r.NetLatencySavedMsPer1k, 0)} | ${num(r.NetCostSavedUSDPer1k, 4)} | ${num(r.TokensSavedPer1k, 0)} |`)
    ];
}

function renderProduction(arm: ArmReport): string[] {
    const p = arm.Production;
    return [
        `### At the production threshold, ${p.Threshold}`,
        '',
        `- Round scores: skippable share ${pct(p.Raw.SkippableShare)}, false-finish rate ${pct(p.Raw.FalseFinishRate)}, precision ${pct(p.Raw.Precision)}, net ${num(p.Raw.NetLatencySavedMsPer1k, 0)} ms and $${num(p.Raw.NetCostSavedUSDPer1k, 4)} saved per 1k rounds.`,
        `- Calibrated: skippable share ${pct(p.Calibrated?.SkippableShare ?? null)}, false-finish rate ${pct(p.Calibrated?.FalseFinishRate ?? null)}.`,
        `- Every rep, as \`JudgeFinishIf\` judged it: ${p.PerRep.FinishPasses} of ${p.PerRep.FinishReps} finish reps passed (${pct(p.PerRep.SkippableShare)}), ${p.PerRep.ContinuePasses} of ${p.PerRep.ContinueReps} continue reps passed (${pct(p.PerRep.FalseFinishRate)}).`,
        '',
        '| Next step | Label | Decided rounds | Passing |',
        '|---|---|---|---|',
        ...arm.ProductionByNextStep.map(n => `| ${n.NextStep} | ${n.Label} | ${n.Rounds} | ${n.Passes} |`)
    ];
}

function renderPlatt(arm: ArmReport): string[] {
    return [
        '### Platt fits on all points, for production',
        '',
        '| Answering model | Points | Finish | Continue | A | B | Converged |',
        '|---|---|---|---|---|---|---|',
        ...arm.Platt.map(f => `| ${f.Model} | ${f.Points} | ${f.Finish} | ${f.Continue} | ${num(f.A)} | ${num(f.B)} | ${f.Converged === null ? '—' : f.Converged ? 'yes' : 'no'} |`)
    ];
}

function renderArmSummary(arm: ArmReport): string[] {
    const authoring = arm.Authoring
        ? [`- Authoring: ${arm.Authoring.FromCache} from the cache, ${arm.Authoring.AuthoredNow} written now, ${arm.Authoring.Failed} failed validation after retries (not decided).`]
        : [];
    return [
        `## Arm: ${arm.Arm}`,
        '',
        ...authoring,
        `- Decided rounds: ${arm.Rounds} (${labels(arm.Labels)}); scored: ${arm.ScoredRounds}.`,
        `- Decision calls: ${arm.Calls} (${arm.CachedCalls} reused from an earlier run); failed: ${arm.FailedCalls}; reps without a usable score: ${arm.UnusableReps}.`,
        `- Gate score (the minimum probability over the round's questions): AUC ${num(arm.Auc)} ${interval(arm.AucCI)} (runs resampled); calibrated AUC ${num(arm.CalibratedAuc)}; ECE ${num(arm.Ece)} raw, ${num(arm.CalibratedEce)} calibrated.`,
        `- The gate itself: p50 ${num(arm.Gate.LatencyP50Ms, 0)} ms, p95 ${num(arm.Gate.LatencyP95Ms, 0)} ms; ${num(arm.Gate.LatencyMsPer1k, 0)} ms and $${num(arm.Gate.CostUSDPer1k, 4)} per 1k rounds; ${arm.Gate.CallsWithoutCost} calls without a cost.`,
        `- Repeatability of the verdict at ${arm.Production.Threshold}: ${arm.Repeatability.Rounds} rounds with 2+ reps, mean agreement ${pct(arm.Repeatability.MeanVerdictAgreement)}, unanimous ${pct(arm.Repeatability.UnanimousShare)}, mean score SD ${num(arm.Repeatability.MeanScoreStdDev)}.`
    ];
}

function renderArm(arm: ArmReport): string[] {
    return [
        ...renderArmSummary(arm),
        '',
        ...renderProduction(arm),
        '',
        '### Threshold sweep, raw scores',
        '',
        ...sweepTable(arm.Sweep, arm.Production.Threshold),
        '',
        '### Threshold sweep, 5-fold out-of-fold Platt calibration',
        '',
        ...(arm.CalibratedSweep ? sweepTable(arm.CalibratedSweep, arm.Production.Threshold) : ['Too few scored rounds to calibrate.']),
        '',
        ...renderPlatt(arm)
    ];
}

/** The report as Markdown. */
export function RenderFinishIfReplayReport(report: FinishIfReplayReport): string {
    return [
        '# finishIf replay',
        '',
        `Generated ${report.GeneratedAt}. Rounds are named by ID only; \`report.json\` lists them.`,
        '',
        ...renderSettings(report.Settings),
        '',
        ...renderCorpus(report.Corpus),
        '',
        ...report.Arms.flatMap(arm => [...renderArm(arm), '']),
        '## Notes',
        '',
        ...report.Notes.map(note => `- ${note}`)
    ].join('\n');
}
