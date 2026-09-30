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
 * A failed decision is a failed reasoning call, handled as the `Prompt` mode handles one: the
 * detector saves the set's match rows with empty LLM columns, so every candidate stays `Pending`
 * for review and none is auto-merge eligible.
 *
 * @module @memberjunction/ai-vector-dupe
 */

import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIDecisionRunner, AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
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
    /** The Likelihood's probability in [0, 1], or null when the decision returned no answer for this candidate. */
    Probability: number | null;
}

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
}

/**
 * Typed-decision reasoning provider. Registered under the 'Decision' `ReasoningMode`.
 */
@RegisterClass(DuplicateReasoningProvider, DECISION_REASONING_PROVIDER_KEY)
export class DecisionReasoningProvider extends DuplicateReasoningProvider {
    /** The flagging threshold used when none is passed, as it is when the class factory builds the provider. */
    public static readonly DEFAULT_UNCERTAIN_ABOVE = 0.5;
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
     * the error and the decision's run id, and no verdicts: the detector writes no LLM columns for a
     * failed set, so no candidate is marked `NotDuplicate` and none is merged.
     */
    public async Reason(
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateReasoningOutput> {
        const decision = await this.DecideCandidates(input, context);
        return decision.Success
            ? this.RecommendFromDecision(decision)
            : this.failedDecisionOutput(decision);
    }

    /**
     * Run the decision for a matched set: one `AIDecisionRunner` call, with one Likelihood per
     * candidate. The context's `CancellationToken` and `TimeoutMS`, when set, bound the model call.
     * Never throws. A set with no candidates succeeds without a call.
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
            const run = await new AIDecisionRunner().ExecuteDecision(this.buildDecisionParams(prompt, input, context));
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
            Reasoning: this.describeBand(candidate.Probability, flagged)
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

    private buildDecisionParams(
        prompt: MJAIPromptEntityExtended,
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): AIDecisionParams {
        const params = new AIDecisionParams();
        params.prompt = prompt;
        params.contextUser = context.ContextUser;
        params.cancellationToken = context.CancellationToken;
        params.timeoutMS = context.TimeoutMS;
        params.State = this.BuildDecisionState(input);
        params.Questions = this.BuildQuestions(input);
        return params;
    }

    /** Read each candidate's probability from the run, in input order. */
    private readProbabilities(input: DuplicateReasoningInput, run: AIDecisionRunResult): DuplicateDecisionResult {
        const runID = run.promptRun?.ID ?? null;
        if (!run.success) {
            return this.failedDecision(run.errorMessage ?? 'Decision execution failed', runID);
        }
        const candidates = input.Candidates.map((candidate, index) => ({
            RecordID: candidate.RecordID,
            Probability: this.likelihoodOf(run.Answers[this.QuestionKey(index)])
        }));
        return { Success: true, Candidates: candidates, AIPromptRunID: runID };
    }

    private likelihoodOf(answer: DecisionAnswer | undefined): number | null {
        return answer?.Kind === 'Likelihood' ? answer.Probability : null;
    }

    private failedDecision(message: string, runID: string | null): DuplicateDecisionResult {
        return { Success: false, ErrorMessage: message, Candidates: [], AIPromptRunID: runID };
    }

    /** A failed decision: `Success: false`, with the error and the decision's run id. */
    private failedDecisionOutput(decision: DuplicateDecisionResult): DuplicateReasoningOutput {
        const output = this.failedOutput(`Decision failed: ${decision.ErrorMessage ?? 'unknown error'}`);
        output.AIPromptRunID = decision.AIPromptRunID;
        return output;
    }

    private describeBand(probability: number | null, flagged: boolean): string {
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
