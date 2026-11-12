import { LogStatus } from '@memberjunction/core';
import { RegisterClass, UUIDMap, UUIDSet } from '@memberjunction/global';
import {
    DEFAULT_DECISION_PROMPT, DecisionPassMetadata, RunRubricDecisionPass, type RubricDecisionDeferral, type RubricDecisionPass,
} from './DecisionRubricEvaluator.js';
import {
    DEFAULT_RUBRIC_JUDGE_PROMPT, LLMRubricEvaluator, PromptRef, PromptServiceRunner, RenderCriteriaText, RUBRIC_CRITERION_PROMPT, RUBRIC_EVALUATOR_PROMPT,
} from './LLMRubricEvaluator.js';
import { BaseRubricEvaluator, type RubricCandidate } from './RubricEvaluator.js';
import {
    DEFAULT_DECISION_CONFIDENCE_THRESHOLD,
    type RubricEvaluatorContext, type RubricEvaluatorRun, type RubricEvaluatorType, type RubricJsonValue, type RubricPromptRef,
} from './evaluatorServices.js';
import { LeafNodes, type RubricCriterionPromptData } from './promptData.js';

/** A criterion the decision pass handed to the LLM, and why. */
export interface DeferredCriterion {
    Key: string;
    Reason: RubricDecisionDeferral;
}

/**
 * Scores a rubric with a decision model first and an LLM only where the decision cannot be trusted
 * or cannot answer — the cheap, fast path for most criteria, with the LLM's rationale and quotes
 * where they are required.
 *
 * 1. **Decision pass.** One decision call asks every leaf it can as a Score question (level scales,
 *    and numeric scales mapped onto levels), exactly as the Decision evaluator does. Its prompt is
 *    DecisionPromptID / DecisionPromptName (default `Default Decision`) and DecisionModelID pins its
 *    model, so PromptID / PromptName / ModelID keep naming the LLM half's judge and model.
 * 2. **LLM follow-up.** One SinglePass LLM call, through the same prompts the LLM evaluator uses,
 *    for just the leaves the decision did not settle:
 *    - `EvidenceRequired`: the leaf requires evidence, which a decision model cannot quote;
 *    - `NotAskable`: its scale cannot be a Score question;
 *    - `Unanswered`: the decision returned no answer for it;
 *    - `LowConfidence`: its confidence is CALIBRATED (a fit exists for use `rubric-evaluation`,
 *      question = its key, on the model that answered) and below DecisionConfidenceThreshold
 *      (default {@link DEFAULT_DECISION_CONFIDENCE_THRESHOLD}). A raw confidence is never thresholded,
 *      so until a fit exists every answered leaf keeps its decision answer.
 *    When the LLM omits a `LowConfidence` leaf, the decision's answer is kept.
 * 3. **Merge.** The decision's answers and the LLM's are scored together by RubricScoring.
 *
 * The decision never fails an evaluation: when the decision service is missing, the call throws,
 * nothing can be asked, or an answer cannot be read, the whole rubric is scored by the LLM evaluator
 * with the same settings, and the run metadata records `FallbackReason`. A failure of the LLM itself
 * fails the evaluation, as it would under the LLM evaluator.
 *
 * Run metadata records `AnsweredBy` (`Decision`, `DecisionThenLLM` or `LLM`), which criteria each
 * half settled and why, the calibrated criteria, and every prompt run.
 */
@RegisterClass(BaseRubricEvaluator, 'DecisionThenLLM')
export class DecisionThenLLMRubricEvaluator extends BaseRubricEvaluator {
    public get EvaluatorName(): string {
        return 'DecisionThenLLM';
    }

    public get EvaluatorType(): RubricEvaluatorType {
        return 'AIPrompt';
    }

    public async EvaluateRubric(context: RubricEvaluatorContext): Promise<RubricEvaluatorRun> {
        const prompts = context.Services.Prompts;
        if (!prompts) throw new Error('A DecisionThenLLM evaluation requires a prompt service.');
        const settings = context.Settings;
        const criterionPrompt = PromptRef(settings.CriterionPromptID, settings.CriterionPromptName, RUBRIC_CRITERION_PROMPT);
        const criteria = await RenderCriteriaText(context.Version, prompts, criterionPrompt);
        const decisionPrompt = PromptRef(settings.DecisionPromptID, settings.DecisionPromptName, DEFAULT_DECISION_PROMPT);
        let pass: RubricDecisionPass;
        try {
            const decisions = context.Services.Decisions;
            if (!decisions) throw new Error('no decision service is available');
            pass = await RunRubricDecisionPass({
                Version: context.Version, Content: context.Content, Criteria: criteria, Decisions: decisions, Prompt: decisionPrompt,
                ModelID: settings.DecisionModelID, AskEvidenceRequired: false,
            });
        } catch (error) {
            return this.wholeRubricByLLM(context, error instanceof Error ? error.message : String(error));
        }
        return this.mergeWithFollowUp(context, criteria, pass, decisionPrompt, criterionPrompt);
    }

    /** Sends the leaves the decision did not settle to the LLM in one call, and scores both halves together. */
    private async mergeWithFollowUp(
        context: RubricEvaluatorContext, criteria: RubricCriterionPromptData[], pass: RubricDecisionPass,
        decisionPrompt: RubricPromptRef, criterionPrompt: RubricPromptRef,
    ): Promise<RubricEvaluatorRun> {
        const threshold = ConfidenceThreshold(context.Settings.DecisionConfidenceThreshold);
        const lowConfidence = pass.Answered.filter(item => item.Calibrated && (item.Candidate.confidence ?? 0) < threshold);
        const deferred: DeferredCriterion[] = [
            ...pass.NotAsked,
            ...pass.Unanswered.map(key => ({ Key: key, Reason: 'Unanswered' as const })),
            ...lowConfidence.map(item => ({ Key: item.Key, Reason: 'LowConfidence' as const })),
        ];
        const promptRunIds: string[] = pass.PromptRunID ? [pass.PromptRunID] : [];
        const metadata: Record<string, RubricJsonValue> = {
            AnsweredBy: deferred.length > 0 ? 'DecisionThenLLM' : 'Decision',
            DecisionPrompt: decisionPrompt.ID ?? decisionPrompt.Name ?? null,
            CriterionPrompt: criterionPrompt.ID ?? criterionPrompt.Name ?? null,
            ConfidenceThreshold: threshold,
            LLMCriteria: deferred.map(item => ({ Key: item.Key, Reason: item.Reason })),
            ...DecisionPassMetadata(pass),
        };
        if (context.Settings.DecisionModelID) metadata.DecisionModelID = context.Settings.DecisionModelID;
        const deferredKeys = new Set(deferred.map(item => item.Key));
        const kept = pass.Answered.filter(item => !deferredKeys.has(item.Key)).map(item => item.Candidate);
        const decisionKeys = pass.Answered.filter(item => !deferredKeys.has(item.Key)).map(item => item.Key);
        let followUp: RubricCandidate[] = [];
        if (deferred.length > 0) {
            followUp = await this.askLLM(context, criteria.filter(criterion => deferredKeys.has(criterion.Key)), promptRunIds, metadata);
            const llmAnswered = new UUIDSet(followUp.map(candidate => candidate.criterionId));
            const keptDecision = lowConfidence.filter(item => !llmAnswered.Has(item.Candidate.criterionId));
            kept.push(...keptDecision.map(item => item.Candidate));
            decisionKeys.push(...keptDecision.map(item => item.Key));
            metadata.KeptDecisionAnswers = keptDecision.map(item => item.Key);
        }
        metadata.DecisionCriteria = decisionKeys;
        metadata.PromptRunIDs = promptRunIds;
        const scored = this.Evaluate(context.Version, InLeafOrder(context, [...kept, ...followUp]));
        return { ...scored, aiPromptRunId: promptRunIds.length === 1 ? promptRunIds[0] : null, metadata };
    }

    /**
     * One SinglePass LLM call for the given criteria, through the LLM evaluator's prompts. Answers
     * for criteria it was not asked are dropped and counted, like unknown keys.
     */
    private async askLLM(
        context: RubricEvaluatorContext, criteria: RubricCriterionPromptData[], promptRunIds: string[], metadata: Record<string, RubricJsonValue>,
    ): Promise<RubricCandidate[]> {
        const llm = new LLMRubricEvaluator(PromptServiceRunner(context, promptRunIds), 'SinglePass');
        const answered = await llm.AnswerCriteria(context.Version, context.Content, criteria, context.Subject);
        const askedKeys = new Set(criteria.map(criterion => criterion.Key));
        const askedIds = new UUIDSet(LeafNodes(context.Version).filter(node => askedKeys.has(node.key)).map(node => node.id));
        const asked = answered.candidates.filter(candidate => askedIds.Has(candidate.criterionId));
        const settings = context.Settings;
        metadata.SystemPrompt = PromptRefName(PromptRef(settings.SystemPromptID, settings.SystemPromptName, RUBRIC_EVALUATOR_PROMPT));
        metadata.JudgePrompt = PromptRefName(PromptRef(settings.PromptID, settings.PromptName, DEFAULT_RUBRIC_JUDGE_PROMPT));
        metadata.DroppedUnknownKeys = answered.droppedUnknownKeys + (answered.candidates.length - asked.length);
        metadata.DroppedQuotes = answered.droppedQuotes;
        if (settings.ModelID) metadata.ModelID = settings.ModelID;
        return asked;
    }

    /** The RunDecisionUse fallback: the decision could not answer, so the LLM evaluator scores everything. */
    private async wholeRubricByLLM(context: RubricEvaluatorContext, reason: string): Promise<RubricEvaluatorRun> {
        LogStatus(`DecisionThenLLM: scoring the whole rubric with the LLM evaluator: ${reason}`);
        const run = await new LLMRubricEvaluator().EvaluateRubric(context);
        return { ...run, metadata: { ...(run.metadata ?? {}), AnsweredBy: 'LLM', FallbackReason: reason } };
    }
}

/** The configured threshold when it is a probability, else the default. */
function ConfidenceThreshold(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_DECISION_CONFIDENCE_THRESHOLD;
}

/** Candidates in the rubric's leaf order, so the combined rationale reads in tree order. */
function InLeafOrder(context: RubricEvaluatorContext, candidates: RubricCandidate[]): RubricCandidate[] {
    const leaves = LeafNodes(context.Version);
    const order = new UUIDMap<number>(leaves.map((node, index) => [node.id, index] as const));
    const position = (id: string): number => order.Get(id) ?? leaves.length;
    return [...candidates].sort((left, right) => position(left.criterionId) - position(right.criterionId));
}

function PromptRefName(ref: RubricPromptRef): string | null {
    return ref.ID ?? ref.Name ?? null;
}
