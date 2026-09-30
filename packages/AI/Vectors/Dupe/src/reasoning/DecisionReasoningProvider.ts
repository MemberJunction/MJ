/**
 * @fileoverview 'Decision' mode reasoning provider.
 *
 * Asks a typed decision model one Likelihood per candidate ("the candidate record is the same
 * real-world entity as the new record") in a single `AIDecisionRunner` call per matched set. The
 * state is the same fields the prompt provider renders, from the same helper, serialized compactly.
 *
 * It only **recommends**: a candidate whose probability is at or above
 * {@link DecisionReasoningProvider.UncertainAbove} is `Uncertain` and flagged for a person; one below
 * it is `NotDuplicate`. It never emits `Merge` and never proposes a survivor or a field map, so a
 * `Decision`-mode set is never auto-merge eligible (typed-decision plan §3.6, rule 8). Survivor and
 * field choices remain LLM work: see `DecisionThenPromptReasoningProvider`.
 *
 * @module @memberjunction/ai-vector-dupe
 */

import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIDecisionRunner, AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { ApplyPlattCalibration, type DecisionAnswer, type DecisionQuestion, type PlattCalibration } from '@memberjunction/ai';
import {
    DuplicateReasoningProvider,
    DECISION_REASONING_PROVIDER_KEY
} from './DuplicateReasoningProvider';
import {
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
    DuplicateReasoningContext,
    DuplicateReasoningCandidateVerdict,
    ReasoningCandidate,
    ReasoningSourceRecord
} from './DuplicateReasoningTypes';

/** One candidate's probability of being the same real-world entity as the source record. */
export interface DuplicateCandidateProbability {
    /** The candidate record id (matches the input candidate's RecordID). */
    RecordID: string;
    /**
     * The Likelihood's probability in [0, 1], **calibrated** for the model that answered (see
     * {@link DUPLICATE_DECISION_CALIBRATION}). Null when the decision returned no answer for this
     * candidate, or when the answering model has no calibration.
     */
    Probability: number | null;
    /** The model's own probability, before calibration; null when there was no answer. */
    RawProbability?: number | null;
}

/**
 * Platt calibration of the duplicate Likelihood ("the candidate is the same real-world entity as
 * the new record"), per decision model, keyed by the name MJ gives the model that answered
 * (`modelInfo.modelName`). A model's raw probabilities are not calibrated: Jev ranks candidates almost
 * perfectly (AUC 0.99) but its raw probabilities run high for similar records that are not
 * duplicates.
 *
 * A model with no entry gives no calibrated probability, since its raw one can't be banded. The
 * entry check then flags nothing, as it does for a failed decision; batch `Decision` mode bands its
 * candidates `Uncertain` for review; and `DecisionThenPrompt` sends them all to the prompt. The
 * provider logs the missing calibration once per model. An app that binds another decision model
 * supplies its calibration by overriding {@link DecisionReasoningProvider.CalibrationFor}.
 *
 * Fitted on the duplicate-check measurement (plan Task 3.8, 2026-09-29): 160 labelled new records for
 * MJ: Actions (80 rewrites of an existing action, 80 similar actions that don't exist), five vector
 * candidates each, two repeats per model. Refit whenever a model, its version or the question changes.
 */
export const DUPLICATE_DECISION_CALIBRATION: Readonly<Record<string, PlattCalibration>> = Object.freeze({
    'Jev': Object.freeze({ A: 2.5855, B: -4.4485 }),
    'LLM Decision': Object.freeze({ A: 0.9918, B: -1.4843 })
});

/** The shipped calibration for the model that answered, or null when it has none. */
export function DuplicateDecisionCalibrationFor(modelName: string | undefined): PlattCalibration | null {
    const name = modelName?.trim();
    return (name && DUPLICATE_DECISION_CALIBRATION[name]) || null;
}

/**
 * The duplicate Likelihood calibrated for the model that answered, or null when that model has no
 * calibration.
 */
export function CalibratedDuplicateProbability(probability: number, modelName: string | undefined): number | null {
    const calibration = DuplicateDecisionCalibrationFor(modelName);
    return calibration ? ApplyPlattCalibration(probability, calibration) : null;
}

/** What {@link DuplicateDecisionResult.UncalibratedModel} holds when the run named no model. */
export const UNNAMED_DECISION_MODEL = '(unnamed model)';

/** Models already logged as having no calibration, so each is logged once per process. */
const loggedUncalibratedModels = new Set<string>();

/** The outcome of one decision call over a matched set. */
export interface DuplicateDecisionResult {
    /** Whether the decision call succeeded. */
    Success: boolean;
    /** Why the call failed, when {@link Success} is false. */
    ErrorMessage?: string;
    /** One entry per input candidate, in input order. Empty when the call failed. */
    Candidates: DuplicateCandidateProbability[];
    /** The decision's `MJ: AI Prompt Runs` row id, when the runner wrote one. */
    AIPromptRunID: string | null;
    /**
     * Set when the model that answered has no calibration: its name, or
     * {@link UNNAMED_DECISION_MODEL} when the run named none. Every candidate's `Probability` is then
     * null and its `RawProbability` holds the model's own answer. The entry check treats such a
     * result like a failed decision and flags nothing.
     */
    UncalibratedModel?: string;
}

/**
 * Typed-decision reasoning provider. Registered under the 'Decision' `ReasoningMode`.
 */
@RegisterClass(DuplicateReasoningProvider, DECISION_REASONING_PROVIDER_KEY)
export class DecisionReasoningProvider extends DuplicateReasoningProvider {
    /**
     * The flagging threshold used when none is passed, as it is when the class factory builds the
     * provider, on **calibrated** probabilities. A flag asks a person to look, so it favours precision:
     * a missed duplicate is only today's behaviour, and needless flags teach people to ignore them.
     * At a calibrated 0.7, Jev flagged the true source at 96.6% precision, caught 71% of duplicates, and
     * flagged 2.5% of new records; LLM Decision scored 74%, 40% and 14%. The vector threshold alone
     * flagged every candidate. (Duplicate-check measurement, plan Task 3.8, 2026-09-29.)
     */
    public static readonly DEFAULT_UNCERTAIN_ABOVE = 0.7;

    /**
     * The threshold for the decision stage of `DecisionThenPrompt`, on calibrated probabilities. There
     * the decision only drops implausible candidates before the prompt reasons over the rest, so it
     * keeps recall: at a calibrated 0.3, Jev kept 98.8% of true duplicates and passed 14.5% of candidates.
     */
    public static readonly PRE_FILTER_UNCERTAIN_ABOVE = 0.3;
    /** The seeded decision prompt whose model bindings choose the decision model. */
    public static readonly DEFAULT_PROMPT_NAME = 'Default Decision';

    /** A candidate at or above this probability is `Uncertain` (flagged for a person); below it, `NotDuplicate`. */
    public readonly UncertainAbove: number;

    /**
     * @param uncertainAbove the flagging threshold in [0, 1]. Defaults to
     *   {@link DecisionReasoningProvider.DEFAULT_UNCERTAIN_ABOVE}.
     */
    constructor(uncertainAbove: number = DecisionReasoningProvider.DEFAULT_UNCERTAIN_ABOVE) {
        super();
        this.UncertainAbove = uncertainAbove;
    }

    /**
     * Reason over a matched set with one decision call. A failed call returns `Success: false` with
     * every candidate `Uncertain` (never `NotDuplicate`), so a failure never hides a candidate.
     */
    public async Reason(
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateReasoningOutput> {
        const decision = await this.DecideCandidates(input, context);
        return decision.Success
            ? this.RecommendFromDecision(decision)
            : this.failedDecisionOutput(input, decision);
    }

    /**
     * Run the decision for a matched set: one `AIDecisionRunner` call, with one Likelihood per
     * candidate. Never throws. A set with no candidates succeeds without a call.
     */
    public async DecideCandidates(
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateDecisionResult> {
        if (input.Candidates.length === 0) {
            return { Success: true, Candidates: [], AIPromptRunID: null };
        }
        try {
            await AIEngine.Instance.Config(false, context.ContextUser, context.Provider);
            const prompt = this.ResolveDecisionPrompt();
            if (!prompt) {
                return this.failedDecision(`Decision prompt "${DecisionReasoningProvider.DEFAULT_PROMPT_NAME}" not found`, null);
            }
            const run = await new AIDecisionRunner().ExecuteDecision(this.BuildDecisionParams(prompt, input, context));
            return this.readProbabilities(input, run);
        } catch (e) {
            LogError(e);
            return this.failedDecision(e instanceof Error ? e.message : String(e), null);
        }
    }

    /**
     * Whether a candidate stays in play: its probability is at or above {@link UncertainAbove}, or
     * unknown. An unknown probability fails toward inclusion.
     */
    public IsPlausible(probability: number | null): boolean {
        return probability == null || probability >= this.UncertainAbove;
    }

    /** Band one candidate's probability into `Uncertain` or `NotDuplicate`, carrying the probability as its confidence. */
    public BandCandidate(candidate: DuplicateCandidateProbability): DuplicateReasoningCandidateVerdict {
        const flagged = this.IsPlausible(candidate.Probability);
        return {
            RecordID: candidate.RecordID,
            Recommendation: flagged ? 'Uncertain' : 'NotDuplicate',
            Confidence: candidate.Probability,
            Reasoning: this.describeBand(candidate.Probability, flagged, candidate.RawProbability)
        };
    }

    /**
     * Turn a successful decision into the reasoning contract. Recommends only: no `Merge`, no
     * survivor and no field choices.
     */
    public RecommendFromDecision(decision: DuplicateDecisionResult): DuplicateReasoningOutput {
        const verdicts = decision.Candidates.map(c => this.BandCandidate(c));
        const overall = this.deriveOverall(verdicts);
        return {
            Success: true,
            Recommendation: overall.Recommendation,
            Confidence: overall.Confidence,
            Reasoning: this.summarize(verdicts),
            CandidateVerdicts: verdicts,
            SurvivorRecordID: null,
            FieldChoices: [],
            AIPromptRunID: decision.AIPromptRunID
        };
    }

    /** Resolve the decision prompt by name from the AIEngine cache (no DB query). */
    protected ResolveDecisionPrompt(): MJAIPromptEntityExtended | null {
        const target = DecisionReasoningProvider.DEFAULT_PROMPT_NAME.toLowerCase();
        return AIEngine.Instance.Prompts.find(p => (p.Name ?? '').trim().toLowerCase() === target) ?? null;
    }

    /**
     * The decision's state: the fields the prompt provider renders, from the same helper
     * ({@link DuplicateReasoningProvider.buildPromptData}), serialized as compact JSON.
     */
    protected BuildDecisionState(input: DuplicateReasoningInput): string {
        return JSON.stringify(this.buildPromptData(input));
    }

    /** One Likelihood per candidate, keyed by {@link QuestionKey}. */
    protected BuildQuestions(input: DuplicateReasoningInput): Record<string, DecisionQuestion> {
        const questions: Record<string, DecisionQuestion> = {};
        input.Candidates.forEach((candidate, index) => {
            questions[this.QuestionKey(index)] = {
                Kind: 'Likelihood',
                Instructions: this.BuildQuestionInstructions(input.SourceRecord, candidate)
            };
        });
        return questions;
    }

    /** The question key for the candidate at `index`. A label for code only: the model never reads it. */
    protected QuestionKey(index: number): string {
        return `candidate_${index + 1}`;
    }

    /**
     * The statement the model judges for one candidate. It names both records by label and record id,
     * because the model reads only the instructions and the state, and duplicates often share a label.
     */
    protected BuildQuestionInstructions(source: ReasoningSourceRecord, candidate: ReasoningCandidate): string {
        return `The candidate record "${candidate.Label}" (recordId ${candidate.RecordID}) is the same real-world entity ` +
            `as the new record, the sourceRecord "${source.Label}" (recordId ${source.RecordID}).`;
    }

    protected BuildDecisionParams(
        prompt: MJAIPromptEntityExtended,
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): AIDecisionParams {
        const params = new AIDecisionParams();
        params.prompt = prompt;
        params.contextUser = context.ContextUser;
        params.State = this.BuildDecisionState(input);
        params.Questions = this.BuildQuestions(input);
        return params;
    }

    /**
     * The calibration for the model that answered, by the name MJ gives it, or null when it has
     * none. Defaults to {@link DUPLICATE_DECISION_CALIBRATION}; override to calibrate another model.
     */
    protected CalibrationFor(modelName: string | undefined): PlattCalibration | null {
        return DuplicateDecisionCalibrationFor(modelName);
    }

    /** Read each candidate's probability from the run, in input order, calibrated for the model that answered. */
    private readProbabilities(input: DuplicateReasoningInput, run: AIDecisionRunResult): DuplicateDecisionResult {
        const runID = run.promptRun?.ID ?? null;
        if (!run.success) {
            return this.failedDecision(run.errorMessage ?? 'Decision execution failed', runID);
        }
        const modelName = run.modelInfo?.modelName?.trim() || undefined;
        const calibration = this.CalibrationFor(modelName);
        const candidates = input.Candidates.map((candidate, index) => {
            const raw = this.likelihoodOf(run.Answers[this.QuestionKey(index)]);
            return {
                RecordID: candidate.RecordID,
                Probability: raw == null || !calibration ? null : ApplyPlattCalibration(raw, calibration),
                RawProbability: raw
            };
        });
        const result: DuplicateDecisionResult = { Success: true, Candidates: candidates, AIPromptRunID: runID };
        if (!calibration) {
            result.UncalibratedModel = modelName ?? UNNAMED_DECISION_MODEL;
            this.logUncalibratedOnce(result.UncalibratedModel);
        }
        return result;
    }

    /** Log a model with no calibration the first time it answers, not on every decision. */
    private logUncalibratedOnce(modelName: string): void {
        if (loggedUncalibratedModels.has(modelName)) {
            return;
        }
        loggedUncalibratedModels.add(modelName);
        LogError(
            `Duplicate decision: the model "${modelName}" has no calibration, so its probabilities can't be banded. ` +
            'The entry check flags nothing for it, and Decision mode flags its candidates for review. ' +
            'Add its calibration (DUPLICATE_DECISION_CALIBRATION, or override CalibrationFor).'
        );
    }

    private likelihoodOf(answer: DecisionAnswer | undefined): number | null {
        return answer?.Kind === 'Likelihood' ? answer.Probability : null;
    }

    private failedDecision(message: string, runID: string | null): DuplicateDecisionResult {
        return { Success: false, ErrorMessage: message, Candidates: [], AIPromptRunID: runID };
    }

    /** A failed decision: `Success: false`, with every candidate `Uncertain` and the error recorded. */
    private failedDecisionOutput(input: DuplicateReasoningInput, decision: DuplicateDecisionResult): DuplicateReasoningOutput {
        const message = `Decision failed: ${decision.ErrorMessage ?? 'unknown error'}`;
        const output = this.failedOutput(message);
        output.CandidateVerdicts = input.Candidates.map(candidate => ({
            RecordID: candidate.RecordID,
            Recommendation: 'Uncertain',
            Confidence: null,
            Reasoning: `${message}. Flagged for review.`
        }));
        output.AIPromptRunID = decision.AIPromptRunID;
        return output;
    }

    private describeBand(probability: number | null, flagged: boolean, rawProbability?: number | null): string {
        if (probability == null && rawProbability != null) {
            return `The decision model has no calibration (raw probability ${rawProbability.toFixed(2)}). Flagged for review.`;
        }
        if (probability == null) {
            return 'The decision model returned no answer for this candidate. Flagged for review.';
        }
        const p = probability.toFixed(2);
        const threshold = this.UncertainAbove.toFixed(2);
        return flagged
            ? `Decision model: ${p} probability this is the same entity, at or above ${threshold}. Flagged for review.`
            : `Decision model: ${p} probability this is the same entity, below ${threshold}.`;
    }

    private summarize(verdicts: DuplicateReasoningCandidateVerdict[]): string {
        const flagged = verdicts.filter(v => v.Recommendation === 'Uncertain').length;
        return `Decision model flagged ${flagged} of ${verdicts.length} candidates for review ` +
            `(probability at or above ${this.UncertainAbove.toFixed(2)}). Decision mode recommends only; it never merges.`;
    }
}
