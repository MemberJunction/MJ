/**
 * @fileoverview The `Decision` Feature Pipeline type's driver: runs the pipeline's prompt
 * on a typed decision model for each record, answering Likelihood, Choice, and Score questions
 * together in a single call via `AIDecisionRunner`.
 *
 * Produces calibrated per-output confidence scores for field targets, without model reasoning.
 *
 * Prompt-execution hooks (beforePromptExecute / afterPromptExecute) are LLM-specific and are not
 * called for Decision pipelines.
 *
 * NOTE ON CONFIDENCE & CACHING:
 * Direct computations by this driver produce per-output confidence scores returned in
 * {@link FeaturePipelineComputeSuccess.Confidence} and persisted to `MJ: Feature Values` history.
 * However, cache hits served from `MJ: Feature Value Cache` carry no confidence because the cache
 * table schema stores only input key hashes, prompt version hashes, and serialized output JSON;
 * it has no confidence column. Consumers should note that cached evaluations do not retain confidence.
 *
 * @module @memberjunction/record-set-processor
 */

import { RegisterClass, Canonicalize, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import {
    AIDecisionRunner,
    AIDecisionParams,
} from '@memberjunction/ai-prompts';
import {
    type DecisionQuestion,
    type LikelihoodQuestion,
    type ChoiceQuestion,
    type ScoreQuestion,
    type DecisionAnswer,
} from '@memberjunction/ai';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import {
    DECISION_FEATURE_PIPELINE_CAPABILITIES,
    type DataFeatureOutput,
    type DataFeatureSpec,
    type FeaturePipelineDriverCapabilities,
} from '@memberjunction/feature-pipelines';
import {
    BaseFeaturePipelineDriver,
    type FeaturePipelineComputeRequest,
    type FeaturePipelineComputeResult,
} from './BaseFeaturePipelineDriver';
import { SetNestedValue } from '../processors/InferProcessor';

/** The model type `AIDecisionRunner` requires, by name. */
const DECISION_MODEL_TYPE = 'Decision';

/**
 * Runs the pipeline's prompt on a typed decision model for each record, mapping outputs to
 * Likelihood, Choice, or Score questions and extracting calibrated confidence scores.
 */
@RegisterClass(BaseFeaturePipelineDriver, 'DecisionFeaturePipelineDriver')
export class DecisionFeaturePipelineDriver extends BaseFeaturePipelineDriver {
    /** Supported constraint types (boolean, enum, numeric) and field targets; produces confidence, no reasoning. */
    public get Capabilities(): FeaturePipelineDriverCapabilities {
        return DECISION_FEATURE_PIPELINE_CAPABILITIES;
    }

    /**
     * Executes the Decision pipeline for a single record:
     * 1. Validates that the prompt runs on Decision models ({@link IsDecisionPrompt}).
     * 2. Renders the record state via `BeforeBuildContext` and `BuildPromptData`, canonicalizing it.
     * 3. Checks estimated state tokens against the strictest `Decision.MaxStateTokens` limit of the models the prompt may run on (fails if exceeded, never truncates).
     * 4. Builds typed decision questions (Likelihood, Choice, Score) from the spec's outputs.
     * 5. Executes the decision via `AIDecisionRunner.ExecuteDecision`.
     * 6. Maps answers back to output values (applying boolean constraint threshold and score rubric rescaling) and confidences.
     */
    public async ComputeOutputs(request: FeaturePipelineComputeRequest): Promise<FeaturePipelineComputeResult> {
        const { Record: record, Context: context, Prompt: prompt, Spec: spec, Hooks: hooks } = request;

        if (!this.IsDecisionPrompt(prompt)) {
            return {
                Success: false,
                ErrorMessage: `Prompt '${prompt?.Name ?? prompt?.ID}' is not a Decision prompt; Decision pipelines require a prompt whose model type is Decision, or that has no model type and a Decision model bound to it.`,
                AIPromptRunID: undefined,
            };
        }

        // Hook: beforeBuildContext
        await hooks.BeforeBuildContext(record, context);

        const promptData = await hooks.BuildPromptData(record, context);
        const serializedState = Canonicalize(promptData);

        const estimatedTokens = Math.ceil(serializedState.length / 4);
        const maxStateTokens = this.ResolveMaxStateTokens(prompt);
        if (maxStateTokens !== undefined && maxStateTokens > 0 && estimatedTokens > maxStateTokens) {
            return {
                Success: false,
                ErrorMessage: `Rendered state token estimate (${estimatedTokens} tokens, ~${serializedState.length} characters / 4) exceeds the model's Decision.MaxStateTokens limit of ${maxStateTokens}. Narrow Context.Fields or use a smaller entity document.`,
                AIPromptRunID: undefined,
            };
        }

        const questions = this.BuildQuestions(request);

        const params = new AIDecisionParams();
        params.prompt = prompt;
        params.contextUser = context.contextUser;
        params.State = serializedState;
        params.Questions = questions;

        const runner = this.CreateDecisionRunner();
        const result = await runner.ExecuteDecision(params);
        const aiPromptRunID = result.promptRun?.ID;

        if (!result.success) {
            return {
                Success: false,
                ErrorMessage: result.errorMessage ?? 'Decision execution failed',
                AIPromptRunID: aiPromptRunID,
            };
        }

        const { rawResult, confidence } = this.MapAnswers(spec?.Outputs ?? [], result.Answers);

        return {
            Success: true,
            RawResult: rawResult,
            Confidence: confidence,
            AIPromptRunID: aiPromptRunID,
        };
    }

    /**
     * Whether the prompt is meant for Decision models: its model type is Decision or, when it has none (so
     * `AIDecisionRunner` applies its own Decision floor), a Decision model is bound to it. Model types are
     * compared by ID. The prompt's name plays no part, so a prompt whose type is LLM is refused here, before
     * the record's state is rendered, whatever it is called.
     */
    protected IsDecisionPrompt(prompt: MJAIPromptEntityExtended): boolean {
        const decisionTypeID = this.decisionModelTypeID();
        if (!prompt || !decisionTypeID) {
            return false;
        }
        if (prompt.AIModelTypeID) {
            return UUIDsEqual(prompt.AIModelTypeID, decisionTypeID);
        }
        return this.boundDecisionModels(prompt, decisionTypeID).length > 0;
    }

    /**
     * The strictest `Decision.MaxStateTokens` among the models the prompt may run on, or undefined when none
     * declares one. The runner picks the model per call, by credentials and failover, so the state is
     * checked against every model it may pick rather than against whichever binding is read first. Those
     * models are the Decision models bound to the prompt or, when none is bound, every active Decision model.
     */
    protected ResolveMaxStateTokens(prompt: MJAIPromptEntityExtended): number | undefined {
        const limits = this.eligibleDecisionModels(prompt)
            .map((model) => AIEngine.Instance.GetEffectiveModelConfiguration(model.ID)?.Decision?.MaxStateTokens)
            .filter((limit): limit is number => typeof limit === 'number' && limit > 0);
        return limits.length > 0 ? Math.min(...limits) : undefined;
    }

    /** The ID of the model type `AIDecisionRunner` requires, matched by name as the runner matches it. */
    private decisionModelTypeID(): string | undefined {
        const wanted = DECISION_MODEL_TYPE.toLowerCase();
        return AIEngine.Instance.ModelTypes.find((type) => type.Name?.trim().toLowerCase() === wanted)?.ID;
    }

    /** The active Decision models bound to the prompt through its active or preview `MJ: AI Prompt Models` rows. */
    private boundDecisionModels(prompt: MJAIPromptEntityExtended, decisionTypeID: string): MJAIModelEntityExtended[] {
        return AIEngine.Instance.PromptModels
            .filter((binding) => UUIDsEqual(binding.PromptID, prompt.ID) && (binding.Status === 'Active' || binding.Status === 'Preview'))
            .map((binding) => AIEngine.Instance.ModelsByID.get(NormalizeUUID(binding.ModelID)))
            .filter((model): model is MJAIModelEntityExtended => model !== undefined && this.isActiveOfType(model, decisionTypeID));
    }

    /** The models the prompt may run on: its bound Decision models, or every active Decision model when none is bound. */
    private eligibleDecisionModels(prompt: MJAIPromptEntityExtended): MJAIModelEntityExtended[] {
        const decisionTypeID = this.decisionModelTypeID();
        if (!decisionTypeID) {
            return [];
        }
        const bound = this.boundDecisionModels(prompt, decisionTypeID);
        return bound.length > 0 ? bound : AIEngine.Instance.Models.filter((model) => this.isActiveOfType(model, decisionTypeID));
    }

    /** Whether the model is active and of the given model type. */
    private isActiveOfType(model: MJAIModelEntityExtended, modelTypeID: string): boolean {
        return model.IsActive && UUIDsEqual(model.AIModelTypeID, modelTypeID);
    }

    /** Factory method to create an AIDecisionRunner instance (extension point for unit testing). */
    protected CreateDecisionRunner(): AIDecisionRunner {
        return new AIDecisionRunner();
    }

    /** Builds decision questions (Likelihood, Choice, Score) from the spec outputs. */
    protected BuildQuestions(request: FeaturePipelineComputeRequest): Record<string, DecisionQuestion> {
        const questions: Record<string, DecisionQuestion> = {};

        for (const output of request.Spec?.Outputs ?? []) {
            const constraint = output.Constraint;
            if (!constraint) {
                continue;
            }
            const instructions = output.Description || output.Name;

            if (constraint.Type === 'boolean') {
                const question: LikelihoodQuestion = {
                    Kind: 'Likelihood',
                    Instructions: instructions,
                };
                questions[output.Name] = question;
            } else if (constraint.Type === 'enum') {
                let values = constraint.Values ? [...constraint.Values] : [];
                const descriptions: Record<string, string> = { ...(constraint.ValueDescriptions ?? {}) };

                if (output.Target?.Mode === 'field') {
                    const fieldName = output.Target.EntityFieldName;
                    if (fieldName) {
                        const efvs = request.FieldValues
                            ? request.FieldValues(fieldName)
                            : (() => {
                                  const entityID = request.Context.entityID ?? request.Record.EntityID;
                                  const provider = request.Context.provider ?? Metadata.Provider;
                                  const entity = entityID && provider ? provider.EntityByID(entityID) : undefined;
                                  return entity?.Fields?.find((f) => f.Name.toLowerCase() === fieldName.toLowerCase())?.EntityFieldValues;
                              })();
                        if (efvs && efvs.length > 0) {
                            if (values.length === 0) {
                                values = efvs.map((v) => v.Value);
                            }
                            for (const efv of efvs) {
                                if (efv.Description && !descriptions[efv.Value]) {
                                    descriptions[efv.Value] = efv.Description;
                                }
                            }
                        }
                    }
                }

                const question: ChoiceQuestion = {
                    Kind: 'Choice',
                    Instructions: instructions,
                    Options: values.map((v) => ({
                        Value: v,
                        Description: descriptions[v] || v,
                    })),
                };
                questions[output.Name] = question;
            } else if (constraint.Type === 'numeric') {
                const question: ScoreQuestion = {
                    Kind: 'Score',
                    Instructions: instructions,
                    Levels: constraint.Levels ?? [],
                };
                questions[output.Name] = question;
            }
        }

        return questions;
    }

    /** Maps the decision model's answers back to structured output values and per-output confidences. */
    protected MapAnswers(
        outputs: DataFeatureOutput[],
        answers: Record<string, DecisionAnswer>
    ): { rawResult: Record<string, unknown>; confidence: Record<string, number> } {
        const rawResult: Record<string, unknown> = {};
        const confidence: Record<string, number> = {};

        for (const output of outputs) {
            const answer = answers[output.Name];
            if (!answer) {
                continue;
            }

            let val: unknown;
            let conf: number | undefined;

            if (answer.Kind === 'Likelihood') {
                const threshold = (output.Constraint?.Type === 'boolean' ? output.Constraint.Threshold : undefined) ?? 0.5;
                const probability = answer.Probability;
                val = probability >= threshold;
                // Confidence is always in the value written: P(yes) for true, P(no) for false. A
                // confident "no" (P(yes) = 0.03) is 0.97, not 0.03.
                conf = val ? probability : 1 - probability;
            } else if (answer.Kind === 'Choice') {
                val = answer.Value;
                conf = answer.Confidence;
            } else if (answer.Kind === 'Score') {
                const constraint = output.Constraint;
                const levelsCount = constraint?.Type === 'numeric' && constraint.Levels ? constraint.Levels.length : 2;
                const t = levelsCount > 1 ? Math.max(0, Math.min(1, answer.Value / (levelsCount - 1))) : 0;
                const min = (constraint?.Type === 'numeric' ? constraint.Min : undefined) ?? 0;
                const max = (constraint?.Type === 'numeric' ? constraint.Max : undefined) ?? (levelsCount - 1);
                let scaled = min + t * (max - min);
                if (constraint?.Type === 'numeric' && constraint.Integer) {
                    scaled = Math.round(scaled);
                }
                val = scaled;
                conf = answer.Confidence;
            }

            rawResult[output.Name] = val;
            if (output.Ref?.startsWith('$.')) {
                // Along the path, so a nested Ref ('$.flags.hot') resolves where the processor reads it
                SetNestedValue(rawResult, output.Ref.substring(2), val);
            }
            if (conf !== undefined) {
                confidence[output.Name] = conf;
            }
        }

        return { rawResult, confidence };
    }
}
