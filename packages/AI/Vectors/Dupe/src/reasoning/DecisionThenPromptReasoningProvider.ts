/**
 * @fileoverview 'DecisionThenPrompt' mode reasoning provider: an explicit chain.
 *
 * The detector resolves exactly one provider per `ReasoningMode`, so a decision cannot feed the
 * prompt provider through configuration alone. This provider chains them:
 *
 *   1. {@link DecisionReasoningProvider} runs one decision over the set and drops every candidate
 *      whose probability is below its threshold.
 *   2. `PromptReasoningProvider` reasons over **only the survivors**, so auto-merge still works
 *      wherever the prompt provider allows it.
 *
 * Both stages resolve through the class factory under the 'Decision' and 'Prompt' modes, so an
 * application's override of either mode applies inside the chain as well.
 *
 * With no survivors the set is `NotDuplicate` and the prompt never runs. If the decision fails,
 * every candidate goes to the prompt provider, which is the `Prompt` mode's behaviour: narrowing is
 * an optimisation, so its failure must never hide a candidate.
 *
 * Each match row points at the run that produced its verdict: a survivor's at the prompt run, a
 * dropped candidate's at the decision run. A failed decision's run is named in the error log, since
 * a match row holds only one prompt run id.
 *
 * @module @memberjunction/ai-vector-dupe
 */

import { LogError } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    DuplicateReasoningProvider,
    DECISION_REASONING_PROVIDER_KEY,
    DECISION_THEN_PROMPT_REASONING_PROVIDER_KEY,
    PROMPT_REASONING_PROVIDER_KEY
} from './DuplicateReasoningProvider';
import { PromptReasoningProvider } from './PromptReasoningProvider';
import {
    DecisionReasoningProvider,
    DuplicateCandidateProbability,
    DuplicateDecisionResult
} from './DecisionReasoningProvider';
import {
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
    DuplicateReasoningContext,
    ReasoningFieldDelta
} from './DuplicateReasoningTypes';

/**
 * Chained reasoning provider: the decision filters, then the prompt reasons over the survivors.
 * Registered under the 'DecisionThenPrompt' `ReasoningMode`.
 */
@RegisterClass(DuplicateReasoningProvider, DECISION_THEN_PROMPT_REASONING_PROVIDER_KEY)
export class DecisionThenPromptReasoningProvider extends DuplicateReasoningProvider {
    /** The filter stage. Its `UncertainAbove` is the survival threshold. */
    protected readonly DecisionStage: DecisionReasoningProvider;
    /** The reasoning stage, which sees only the survivors. */
    protected readonly PromptStage: DuplicateReasoningProvider;

    /**
     * The class factory passes no arguments, so both stages resolve through the class factory
     * under the 'Decision' and 'Prompt' modes: an application's override of either mode applies
     * inside the chain too.
     *
     * @param decisionStage the filter stage; defaults to {@link ResolveDecisionStage}
     * @param promptStage the reasoning stage; defaults to {@link ResolvePromptStage}
     */
    constructor(decisionStage?: DecisionReasoningProvider, promptStage?: DuplicateReasoningProvider) {
        super();
        this.DecisionStage = decisionStage ?? this.ResolveDecisionStage();
        this.PromptStage = promptStage ?? this.ResolvePromptStage();
    }

    /**
     * Filter the set with the decision, then reason over the survivors with the prompt.
     */
    public async Reason(
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateReasoningOutput> {
        const decision = await this.DecisionStage.DecideCandidates(input, context);
        if (!decision.Success) {
            LogError(`DecisionThenPrompt: the decision failed (${this.describeFailure(decision)}); passing every candidate to the prompt.`);
            return this.PromptStage.Reason(input, context);
        }
        const dropped = decision.Candidates.filter(c => !this.DecisionStage.IsPlausible(c.Probability));
        if (dropped.length === decision.Candidates.length) {
            return this.noSurvivorsOutput(decision);
        }
        const output = await this.PromptStage.Reason(this.NarrowToSurvivors(input, dropped), context);
        return this.withDroppedVerdicts(output, dropped, decision.AIPromptRunID);
    }

    /**
     * The input with the dropped candidates removed, from the candidate list and from the field
     * deltas. A field whose remaining values no longer differ is dropped too, since the deltas carry
     * differing fields only.
     */
    protected NarrowToSurvivors(
        input: DuplicateReasoningInput,
        dropped: DuplicateCandidateProbability[]
    ): DuplicateReasoningInput {
        const droppedIDs = this.recordIDSet(dropped);
        const keep = (recordID: string): boolean => !droppedIDs.has(this.normalizeRecordID(recordID));
        return {
            ...input,
            Candidates: input.Candidates.filter(c => keep(c.RecordID)),
            FieldDeltas: input.FieldDeltas
                .map(d => ({ FieldName: d.FieldName, Values: d.Values.filter(v => keep(v.RecordID)) }))
                .filter(d => this.stillDiffers(d))
        };
    }

    /**
     * The filter stage: the provider registered for the 'Decision' mode. The chain needs its
     * probability API, so a registration that is not a `DecisionReasoningProvider` falls back to
     * the shipped one.
     */
    protected ResolveDecisionStage(): DecisionReasoningProvider {
        const registered = this.resolveRegisteredProvider(DECISION_REASONING_PROVIDER_KEY);
        return registered instanceof DecisionReasoningProvider ? registered : new DecisionReasoningProvider();
    }

    /** The reasoning stage: the provider registered for the 'Prompt' mode, else the shipped one. */
    protected ResolvePromptStage(): DuplicateReasoningProvider {
        return this.resolveRegisteredProvider(PROMPT_REASONING_PROVIDER_KEY) ?? new PromptReasoningProvider();
    }

    /** The provider the class factory registers for a mode, or null when none is registered. */
    private resolveRegisteredProvider(mode: string): DuplicateReasoningProvider | null {
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<DuplicateReasoningProvider>(DuplicateReasoningProvider, mode);
        return result.Resolved ? result.Instance : null;
    }

    /** No candidate survived: `NotDuplicate` for the set, from the decision alone, with no prompt call. */
    private noSurvivorsOutput(decision: DuplicateDecisionResult): DuplicateReasoningOutput {
        const output = this.DecisionStage.RecommendFromDecision(decision);
        output.Reasoning = `The decision model put all ${decision.Candidates.length} candidates below ` +
            `${this.DecisionStage.UncertainAbove.toFixed(2)}, so the prompt did not run.`;
        return output;
    }

    /**
     * Give each dropped candidate its own `NotDuplicate` verdict from the decision, carrying the
     * decision's run id, so its match row neither falls back to the set-level recommendation nor
     * points at a prompt run that never saw it. The prompt's verdicts and set-level fields are
     * otherwise left as the prompt returned them.
     */
    private withDroppedVerdicts(
        output: DuplicateReasoningOutput,
        dropped: DuplicateCandidateProbability[],
        decisionRunID: string | null
    ): DuplicateReasoningOutput {
        if (!output.Success) {
            return output;
        }
        const droppedIDs = this.recordIDSet(dropped);
        output.CandidateVerdicts = [
            ...output.CandidateVerdicts.filter(v => !droppedIDs.has(this.normalizeRecordID(v.RecordID))),
            ...dropped.map(c => ({ ...this.DecisionStage.BandCandidate(c), AIPromptRunID: decisionRunID }))
        ];
        return output;
    }

    /** The failure for the log, naming the decision's run when the runner wrote one. */
    private describeFailure(decision: DuplicateDecisionResult): string {
        const error = decision.ErrorMessage ?? 'unknown error';
        return decision.AIPromptRunID ? `${error}; decision run ${decision.AIPromptRunID}` : error;
    }

    private stillDiffers(delta: ReasoningFieldDelta): boolean {
        return new Set(delta.Values.map(v => v.Value)).size > 1;
    }

    private recordIDSet(candidates: DuplicateCandidateProbability[]): Set<string> {
        return new Set(candidates.map(c => this.normalizeRecordID(c.RecordID)));
    }

    /** Record ids compare case-insensitively (SQL Server and PostgreSQL case UUIDs differently). */
    private normalizeRecordID(recordID: string): string {
        return recordID.trim().toLowerCase();
    }
}
