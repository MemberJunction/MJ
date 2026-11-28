/**
 * @fileoverview Default `@RegisterClass(BaseAgentPayloadHelper, 'Default')` implementation
 * owning payload validation (starting & final), payload serialization, turn change application,
 * held completion drafts, payload change feedback checks, and binary/media placeholder handling.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s2`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import type { ActionParam, MJActionEntityExtended } from '@memberjunction/actions-base';
import {
    type AgentChatMessage,
    type AgentPayloadChangeRequest,
    type AIPromptRunResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type FileOutputRef,
    type MediaOutput,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    ParseFileOutputRef,
    ResolvePayloadAtEnd,
} from '@memberjunction/ai-core-plus';
import { IsVerboseLoggingEnabled, LogError, LogStatus } from '@memberjunction/core';
import { CleanAndParseJSON, IndexByUUID, JSONValidator, RegisterClass } from '@memberjunction/global';
import type { PayloadAnalysisResult } from '../../PayloadChangeAnalyzer';
import {
    PayloadFeedbackManager,
    type PayloadFeedbackContext,
    type PayloadFeedbackQuestion,
    type PayloadFeedbackResponse,
} from '../../PayloadFeedbackManager';
import type { PayloadChangeResultSummary, PayloadManagerResult } from '../../PayloadManager';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import { BaseAgentPayloadHelper } from './BaseAgentPayloadHelper';

/**
 * Extracts top-level `reasoning` and `message` strings from a prompt's JSON response, when present.
 */
function responseReasoningAndMessage(result: unknown): { Reasoning?: string; Message?: string } {
    const parsed: unknown = typeof result === 'string' ? CleanAndParseJSON<unknown>(result) : result;
    if (typeof parsed !== 'object' || parsed === null) {
        return {};
    }
    const reasoning = 'reasoning' in parsed ? parsed.reasoning : undefined;
    const message = 'message' in parsed ? parsed.message : undefined;
    return {
        Reasoning: typeof reasoning === 'string' ? reasoning : undefined,
        Message: typeof message === 'string' ? message : undefined,
    };
}

/**
 * Default pluggable implementation of {@link BaseAgentPayloadHelper}.
 */
@RegisterClass(BaseAgentPayloadHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentPayloadHelper extends BaseAgentPayloadHelper {
    /** Minimum character length (~7.5KB decoded base64) before inline binary payloads are extracted as media references. */
    public static readonly LARGE_BINARY_THRESHOLD = 10000;

    /** Whether a step is a completion that carries a payload change, held until the completion is accepted. */
    public static CarriesCompletionChange(step: BaseAgentNextStep): boolean {
        return step.step === 'Success' && !!step.payloadChangeRequest;
    }

    /** JSON with object keys sorted deterministically, so two equal values serialize identically. */
    public static StableJSON(value: unknown): string {
        return JSON.stringify(value, (_key, v: unknown) =>
            v && typeof v === 'object' && !Array.isArray(v)
                ? Object.fromEntries(
                      Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                  )
                : v
        );
    }

    /**
     * Resolves the last non-empty `PayloadAtEnd` across a run's steps (examining highest `StepNumber` down),
     * dereferencing 1-hop `PayloadAtEndSourceStepID` pointers when needed.
     */
    public static LastStepPayload(
        steps:
            | ReadonlyArray<{
                  ID?: string;
                  StepNumber: number;
                  PayloadAtStart?: string | null;
                  PayloadAtEnd: string | null;
                  PayloadAtStartSourceStepID?: string | null;
                  PayloadAtEndSourceStepID?: string | null;
              }>
            | null
            | undefined
    ): string | null {
        if (!steps || steps.length === 0) {
            return null;
        }
        const ordered = [...steps].sort((a, b) => (b.StepNumber ?? 0) - (a.StepNumber ?? 0));
        for (const s of ordered) {
            if (typeof s.PayloadAtEnd === 'string' && s.PayloadAtEnd.length > 0) {
                return s.PayloadAtEnd;
            }
            if (s.PayloadAtEndSourceStepID && s.ID) {
                const stepsWithIds = steps.filter(
                    (
                        item
                    ): item is {
                        ID: string;
                        StepNumber: number;
                        PayloadAtStart: string | null;
                        PayloadAtEnd: string | null;
                        PayloadAtStartSourceStepID: string | null;
                        PayloadAtEndSourceStepID: string | null;
                    } => typeof item.ID === 'string' && item.ID.length > 0
                );
                const resolved = ResolvePayloadAtEnd(
                    s as {
                        ID: string;
                        PayloadAtStart: string | null;
                        PayloadAtEnd: string | null;
                        PayloadAtStartSourceStepID: string | null;
                        PayloadAtEndSourceStepID: string | null;
                    },
                    IndexByUUID(stepsWithIds)
                );
                if (typeof resolved === 'string' && resolved.length > 0) {
                    return resolved;
                }
            }
        }
        return null;
    }

    // --- Media outputs & file output detection ---

    public override PromoteMediaOutputs(ctx: AgentRunContext, mediaOutputs: MediaOutput[]): void {
        if (mediaOutputs && mediaOutputs.length > 0) {
            ctx.MediaOutputs.push(...mediaOutputs);
            ctx.Hooks.LogStatus(`📎 Promoted ${mediaOutputs.length} media output(s) to agent results`, true);
        }
    }

    public override DetectFileOutputs(_ctx: AgentRunContext, outputParams: ActionParam[]): FileOutputRef[] {
        const results: FileOutputRef[] = [];
        for (const param of outputParams) {
            if (param.Value == null) continue;
            const ref = ParseFileOutputRef(param.Value);
            if (ref) results.push(ref);
        }
        return results;
    }

    public override InterceptLargeBinaryContent(
        ctx: AgentRunContext,
        actionParams: ActionParam[],
        actionEntity?: MJActionEntityExtended
    ): ActionParam[] {
        if (!actionParams || actionParams.length === 0) {
            return actionParams;
        }

        const sanitizedParams: ActionParam[] = [];

        for (const param of actionParams) {
            if (param.Type !== 'Output' && param.Type !== 'Both') {
                sanitizedParams.push(param);
                continue;
            }

            const paramMetadata = actionEntity?.Params?.Items.find(p => p.Name === param.Name);
            const valueType = paramMetadata?.ValueType as string | undefined;
            const isMediaOutputParam = valueType === 'MediaOutput';

            if (isMediaOutputParam && Array.isArray(param.Value)) {
                const mediaItems = param.Value as MediaOutput[];
                const references: string[] = [];
                let extractedCount = 0;

                for (let i = 0; i < mediaItems.length; i++) {
                    const media = mediaItems[i];
                    if (media.fileId || (media.data && media.data.length > AgentPayloadHelper.LARGE_BINARY_THRESHOLD)) {
                        const refId = `media-${Date.now().toString(36)}-${i}-${Math.random().toString(36).substring(2, 8)}`;
                        ctx.MediaOutputs.push({
                            ...media,
                            refId,
                        });
                        references.push(`\${media:${refId}}`);
                        extractedCount++;
                    }
                }

                if (extractedCount > 0) {
                    sanitizedParams.push({
                        Name: param.Name,
                        Type: param.Type,
                        Value: {
                            mediaReferences: references,
                            count: mediaItems.length,
                            note: `${extractedCount} media item(s) extracted and will be displayed to the user automatically.`,
                        },
                    });
                    ctx.Hooks.LogStatus(`📦 Extracted ${extractedCount} ${param.Name} item(s) to media references`, true);
                    continue;
                }
            }

            if (typeof param.Value === 'string' && param.Value.length > AgentPayloadHelper.LARGE_BINARY_THRESHOLD) {
                const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
                if (isMediaOutputParam || base64Pattern.test(param.Value.substring(0, 1000))) {
                    const refId = `data-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
                    ctx.MediaOutputs.push({
                        modality: 'Image',
                        mimeType: 'application/octet-stream',
                        data: param.Value,
                        label: `Media data from ${param.Name}`,
                        refId,
                    });
                    sanitizedParams.push({
                        Name: param.Name,
                        Type: param.Type,
                        Value: `\${media:${refId}}`,
                    });
                    ctx.Hooks.LogStatus(`📦 Extracted large binary content from '${param.Name}' to media reference`, true);
                    continue;
                }
            }

            sanitizedParams.push(param);
        }

        return sanitizedParams;
    }

    public override ResolveMediaPlaceholdersInString(ctx: AgentRunContext, text: string): string {
        const hasRefIds = ctx.MediaOutputs.some(m => m.refId);
        if (!text || !hasRefIds) {
            return text;
        }

        const placeholderRegex = /\$\{media:([a-z0-9-]+)\}/g;

        return text.replace(placeholderRegex, (match, refId: string) => {
            const media = ctx.MediaOutputs.find(m => m.refId === refId);
            if (media?.data) {
                return `data:${media.mimeType};base64,${media.data}`;
            }
            if (media?.fileId) {
                return media.fileId;
            }
            ctx.Hooks.LogStatus(`⚠️ Media reference '${refId}' not found in registry`, true);
            return match;
        });
    }

    public override ResolveMediaPlaceholdersInPayload<T>(ctx: AgentRunContext, payload: T): T {
        const hasRefIds = ctx.MediaOutputs.some(m => m.refId);
        if (!hasRefIds) {
            return payload;
        }
        return this.resolveMediaPlaceholdersRecursive(ctx, payload);
    }

    private resolveMediaPlaceholdersRecursive<T>(ctx: AgentRunContext, value: T): T {
        if (value === null || value === undefined) {
            return value;
        }
        if (typeof value === 'string') {
            return this.ResolveMediaPlaceholdersInString(ctx, value) as T;
        }
        if (Array.isArray(value)) {
            return value.map(item => this.resolveMediaPlaceholdersRecursive(ctx, item)) as T;
        }
        if (typeof value === 'object') {
            const result: Record<string, unknown> = {};
            for (const key of Object.keys(value as object)) {
                result[key] = this.resolveMediaPlaceholdersRecursive(ctx, (value as Record<string, unknown>)[key]);
            }
            return result as T;
        }
        return value;
    }

    // --- Starting & final payload validation + serialization ---

    public override async InitializeStartingPayload<P = unknown>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams<unknown, P>
    ): Promise<void> {
        // Default no-op; subclasses override to initialize starting payload.
    }

    public override async HandleStartingPayloadValidation<P = unknown>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams<unknown, P>
    ): Promise<ExecuteAgentResult | null> {
        const agent = params.agent;
        if (!agent.StartingPayloadValidation || params.payload === undefined) {
            return null;
        }

        try {
            let validationSchema: unknown;
            try {
                validationSchema = JSON.parse(agent.StartingPayloadValidation);
            } catch (parseError) {
                const msg = parseError instanceof Error ? parseError.message : String(parseError);
                ctx.Hooks.LogError(`Invalid StartingPayloadValidation JSON for agent ${agent.Name}: ${msg}`, {
                    category: 'StartingPayloadValidation',
                    metadata: {
                        agentName: agent.Name,
                        agentId: agent.ID,
                        validationSchema: agent.StartingPayloadValidation,
                    },
                });
                return null;
            }

            const jsonValidator = new JSONValidator();
            const validationResult = jsonValidator.validate(params.payload, validationSchema);

            if (!validationResult.Success) {
                const errorMessages = validationResult.Errors.map(e => e.Message);
                return this.handleStartingValidationFailure(ctx, params, errorMessages);
            }

            ctx.Hooks.LogStatus(`✅ Starting payload validation passed for agent ${agent.Name}`, true, params);
            return null;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            ctx.Hooks.LogError(`Unexpected error during starting payload validation: ${msg}`, {
                category: 'StartingPayloadValidation',
                metadata: {
                    agentName: agent.Name,
                    agentId: agent.ID,
                    error: msg,
                },
            });
            return null;
        }
    }

    private handleStartingValidationFailure(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        errorMessages: string[]
    ): ExecuteAgentResult | null {
        const mode = params.agent.StartingPayloadValidationMode || 'Fail';
        const validationFeedback = `Starting payload validation failed:\n${errorMessages.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

        if (mode === 'Fail') {
            ctx.Hooks.LogError(`Starting payload validation failed for agent ${params.agent.Name}`, {
                agent: params.agent,
                category: 'StartingPayloadValidation',
                metadata: { errors: errorMessages },
            });

            if (ctx.AgentRun) {
                ctx.AgentRun.ErrorMessage = validationFeedback;
                ctx.AgentRun.Status = 'Failed';
                ctx.AgentRun.Success = false;
                ctx.AgentRun.FinalStep = 'Failed';
            }

            return {
                success: false,
                agentRun: ctx.AgentRun!,
                payload: params.payload,
            };
        }

        ctx.Hooks.LogStatus(`⚠️ WARNING: ${validationFeedback}`, false, params);
        return null;
    }

    public override async ValidateSuccessNextStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const minViolations = await ctx.Hooks.CheckMinimumExecutionRequirements(params.agent, agentRun);
        if (minViolations.length > 0) {
            const violationMessage = `Minimum execution requirements not met:\n${minViolations.join('\n')}`;
            ctx.Hooks.LogError(violationMessage, {
                agent: params.agent,
                category: 'MinimumExecutionValidation',
            });

            if (nextStep.step !== 'Retry') {
                ctx.GeneralValidationRetryCount++;
            }

            return {
                step: 'Retry',
                terminate: false,
                errorMessage: violationMessage,
                ...(nextStep.nativeTurn ? { nativeTurn: nextStep.nativeTurn, payloadToolCallId: nextStep.payloadToolCallId } : {}),
            };
        }

        const agent = params.agent;
        if (!agent.FinalPayloadValidation || !currentPayload) {
            return nextStep;
        }

        try {
            let validationSchema: unknown;
            try {
                validationSchema = JSON.parse(agent.FinalPayloadValidation);
            } catch (parseError) {
                const msg = parseError instanceof Error ? parseError.message : String(parseError);
                ctx.Hooks.LogError(`Invalid FinalPayloadValidation JSON for agent ${agent.Name}: ${msg}`, {
                    category: 'PayloadValidation',
                    metadata: {
                        agentName: agent.Name,
                        agentId: agent.ID,
                        validationSchema: agent.FinalPayloadValidation,
                    },
                });
                return nextStep;
            }

            let payloadToValidate = currentPayload;
            if (agent.PayloadScope) {
                payloadToValidate = ctx.PayloadManager.applyPayloadScope(currentPayload, agent.PayloadScope) as P;
                if (payloadToValidate === null) {
                    const errorMessage = `PayloadScope '${agent.PayloadScope}' not found in payload`;
                    return ctx.Hooks.HandleFinalPayloadValidationFailure(
                        params,
                        nextStep,
                        currentPayload,
                        agent.FinalPayloadValidationMode || 'Retry',
                        [errorMessage],
                        agentRun,
                        currentStep
                    );
                }
            }

            const jsonValidator = new JSONValidator();
            const validationResult = jsonValidator.validate(payloadToValidate, validationSchema);

            if (!validationResult.Success) {
                const mode = agent.FinalPayloadValidationMode || 'Retry';
                const errorMessages = validationResult.Errors.map(e => e.Message);

                ctx.Hooks.LogStatus(`⚠️ Final payload validation failed for agent ${agent.Name} (mode: ${mode}):`, true, params);
                errorMessages.forEach((error, index) => {
                    ctx.Hooks.LogStatus(`   ${index + 1}. ${error}`, true, params);
                });

                return ctx.Hooks.HandleFinalPayloadValidationFailure(
                    params,
                    nextStep,
                    currentPayload,
                    mode,
                    errorMessages,
                    agentRun,
                    currentStep
                );
            }

            ctx.Hooks.LogStatus(`✅ Final payload validation passed for agent ${agent.Name}`, true, params);

            try {
                currentStep.FinalPayloadValidationResult = 'Pass';
                currentStep.FinalPayloadValidationMessages = null;
                ctx.Hooks.QueueStepSave(currentStep, (s) => {
                    s.FinalPayloadValidationResult = 'Pass';
                    s.FinalPayloadValidationMessages = null;
                });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                ctx.Hooks.LogError(`Failed to save validation success result: ${msg}`, {
                    category: 'PayloadValidation',
                    metadata: { stepId: currentStep.ID },
                });
            }

            return nextStep;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            ctx.Hooks.LogError(`Unexpected error during final payload validation: ${msg}`, {
                category: 'PayloadValidation',
                metadata: {
                    agentName: agent.Name,
                    agentId: agent.ID,
                    error: msg,
                },
            });
            return nextStep;
        }
    }

    public override async HandleFinalPayloadValidationFailure<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        mode: string,
        errorMessages: string[],
        _agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const validationFeedback = `Final payload validation failed:\n${errorMessages.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

        try {
            const joinedMessages = errorMessages.join('; ');
            currentStep.FinalPayloadValidationMessages = joinedMessages;
            const queueValidationUpdate = (resultValue: MJAIAgentRunStepEntityExtended['FinalPayloadValidationResult']) => {
                currentStep.FinalPayloadValidationResult = resultValue;
                ctx.Hooks.QueueStepSave(currentStep, (s) => {
                    s.FinalPayloadValidationMessages = joinedMessages;
                    s.FinalPayloadValidationResult = resultValue;
                });
            };

            switch (mode) {
                case 'Retry': {
                    ctx.ValidationRetryCount++;
                    const maxRetries =
                        params.agent.FinalPayloadValidationMaxRetries ||
                        ctx.Hooks.ResolvedLimits(params).ResourceGuards.FinalPayloadValidationMaxRetries;
                    if (ctx.ValidationRetryCount >= maxRetries) {
                        ctx.Hooks.LogStatus(`❌ Max validation retries (${maxRetries}) exceeded, forcing failure`, false, params);
                        queueValidationUpdate('Fail');
                        return {
                            ...nextStep,
                            step: 'Failed',
                            message: `${validationFeedback}\n\nMax validation retries (${maxRetries}) exceeded.`,
                            terminate: true,
                        };
                    }

                    queueValidationUpdate('Retry');
                    ctx.Hooks.LogStatus(`🔄 Validation retry ${ctx.ValidationRetryCount}/${maxRetries}`, true, params);
                    return {
                        ...nextStep,
                        step: 'Retry',
                        retryInstructions: `${validationFeedback}\n\nRetry attempt ${ctx.ValidationRetryCount} of ${maxRetries}`,
                        terminate: false,
                    };
                }

                case 'Fail':
                    queueValidationUpdate('Fail');
                    return {
                        ...nextStep,
                        step: 'Failed',
                        message: validationFeedback,
                        terminate: true,
                    };

                case 'Warn':
                    ctx.Hooks.LogStatus(`⚠️ WARNING: ${validationFeedback}`, false, params);
                    queueValidationUpdate('Warn');
                    return nextStep;

                default:
                    ctx.ValidationRetryCount++;
                    queueValidationUpdate('Retry');
                    return {
                        ...nextStep,
                        step: 'Retry',
                        retryInstructions: validationFeedback,
                        terminate: false,
                    };
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            ctx.Hooks.LogError(`Failed to save validation results: ${msg}`, {
                category: 'PayloadValidation',
                metadata: { stepId: currentStep.ID },
            });
            return mode === 'Warn'
                ? nextStep
                : {
                      ...nextStep,
                      step: mode === 'Fail' ? 'Failed' : 'Retry',
                      message: validationFeedback,
                      terminate: mode === 'Fail',
                  };
        }
    }

    public override SerializePayloadAtStart(_ctx: AgentRunContext, payload: unknown): string | null {
        return payload ? JSON.stringify(payload) : null;
    }

    public override SerializePayloadAtEnd(_ctx: AgentRunContext, payload: unknown): string | null {
        return payload ? JSON.stringify(payload) : null;
    }

    // --- Payload change feedback check ---

    public override IsPayloadFeedbackCheckOn(
        ctx: AgentRunContext,
        agentTypePromptParams: Record<string, unknown> | undefined
    ): boolean {
        return ctx.Hooks.DecisionsEnabled(agentTypePromptParams) && agentTypePromptParams?.payloadFeedbackCheck === true;
    }

    public override async CheckPayloadChangesWhenOn(
        ctx: AgentRunContext,
        changeResult: Pick<PayloadManagerResult, 'requiresFeedback' | 'analysis'>,
        nextStep: BaseAgentNextStep,
        promptResult: AIPromptRunResult,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams
    ): Promise<void> {
        if (!changeResult.requiresFeedback || !this.IsPayloadFeedbackCheckOn(ctx, agentTypePromptParams)) {
            return;
        }
        if (this.stepEndsRun(nextStep)) {
            ctx.Hooks.LogStatus(`[Payload check] Skipped: the ${nextStep.step} step ends the run, so no turn would read the result`, true, params);
            return;
        }
        await this.checkPayloadChanges(ctx, changeResult.analysis, nextStep, promptResult, agentTypePromptParams, params);
    }

    private stepEndsRun(step: BaseAgentNextStep): boolean {
        return step.terminate === true || step.step === 'Success' || step.step === 'Chat';
    }

    private async checkPayloadChanges(
        ctx: AgentRunContext,
        analysis: PayloadAnalysisResult | undefined,
        nextStep: BaseAgentNextStep,
        promptResult: AIPromptRunResult,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams
    ): Promise<void> {
        const promptName = agentTypePromptParams?.decisionPromptName;
        const manager = new PayloadFeedbackManager(
            { decisionPromptName: typeof promptName === 'string' ? promptName : undefined },
            ctx.AgentDecisionService
        );
        const questions = manager.GenerateQuestions(analysis?.warnings ?? []);
        if (questions.length === 0) {
            return;
        }
        let step: MJAIAgentRunStepEntityExtended | undefined;
        try {
            step = await ctx.Hooks.CreateStepEntity({
                stepType: 'Decision',
                stepName: 'Payload change check',
                contextUser: params.contextUser,
                inputData: {
                    questions: questions.map(q => ({
                        id: q.id,
                        path: q.warning.path,
                        type: q.warning.type,
                        change: manager.DescribeChange(q.warning),
                    })),
                },
            });
            const responses = await manager.QueryAgent(
                questions,
                this.payloadFeedbackContext(ctx, nextStep, promptResult, params),
                params.contextUser
            );
            if (manager.LastDecisionResult) {
                ctx.Hooks.AttachDecisionPromptRun(step, manager.LastDecisionResult);
            }
            await this.finalizePayloadCheckStep(ctx, step, questions, responses, manager.IntendedThreshold);
            const message = manager.BuildUnintendedChangesMessage(questions, responses);
            if (message) {
                this.injectPayloadCheckMessage(ctx, params, message);
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            LogError(`The payload change check failed, so every change stands: ${reason}`);
            if (step) {
                await ctx.Hooks.FinalizeStepEntity(step, false, reason);
            }
        }
    }

    private payloadFeedbackContext(
        ctx: AgentRunContext,
        nextStep: BaseAgentNextStep,
        promptResult: AIPromptRunResult,
        params: ExecuteAgentParams
    ): PayloadFeedbackContext {
        const response = responseReasoningAndMessage(promptResult?.result);
        return {
            Reasoning: response.Reasoning ?? nextStep.reasoning,
            ChangeReasoning: nextStep.payloadChangeRequest?.reasoning,
            Message: response.Message,
            AgentID: params.agent?.ID ?? ctx.AgentRun?.AgentID,
            CancellationToken: params.cancellationToken,
            ExecutionScope: ctx.Hooks.RunPromptExecutionScope(params),
        };
    }

    private async finalizePayloadCheckStep(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended,
        questions: PayloadFeedbackQuestion[],
        responses: PayloadFeedbackResponse[],
        threshold: number
    ): Promise<void> {
        const answered = responses.filter(r => typeof r.probability === 'number');
        const unintended = responses
            .filter(r => !r.intended)
            .map(r => questions.find(q => q.id === r.questionId)?.warning.path);
        try {
            await ctx.Hooks.FinalizeStepEntity(
                step,
                answered.length > 0,
                answered.length > 0 ? undefined : responses[0]?.explanation,
                {
                    threshold,
                    probabilities: Object.fromEntries(answered.map(r => [r.questionId, r.probability])),
                    responses,
                    unintendedPaths: unintended,
                }
            );
        } catch (error) {
            LogError(`Could not save the payload change check step: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private injectPayloadCheckMessage(ctx: AgentRunContext, params: ExecuteAgentParams, content: string): void {
        const message: AgentChatMessage = {
            role: 'user',
            content,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: 'tool-result',
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            },
        };
        params.conversationMessages.push(message);
    }

    // --- Turn payload changes, summaries & held completion drafts ---

    public override BuildPayloadChangeResultSummary(
        _ctx: AgentRunContext,
        changeResult: PayloadManagerResult<unknown>
    ): PayloadChangeResultSummary {
        return {
            applied: changeResult.applied,
            warnings: changeResult.warnings,
            requiresFeedback: changeResult.requiresFeedback,
            timestamp: changeResult.timestamp,
            payloadValidation:
                changeResult.blockedOperations && changeResult.blockedOperations.length > 0
                    ? {
                          selfWriteViolations: {
                              deniedOperations: changeResult.blockedOperations,
                              timestamp: changeResult.timestamp.toISOString(),
                          },
                      }
                    : undefined,
            analysis: changeResult.analysis
                ? {
                      totalWarnings: changeResult.analysis.summary.totalWarnings,
                      warningsByType: changeResult.analysis.summary.warningsByType,
                      suspiciousChanges: changeResult.analysis.summary.suspiciousChanges,
                      criticalWarnings: changeResult.analysis.criticalWarnings.map(w => ({
                          type: w.type,
                          severity: w.severity,
                          path: w.path,
                          message: w.message,
                      })),
                  }
                : undefined,
            diffSummary: changeResult.diff
                ? {
                      added: changeResult.diff.summary.added,
                      removed: changeResult.diff.summary.removed,
                      modified: changeResult.diff.summary.modified,
                      totalChanges: changeResult.diff.summary.totalPaths,
                  }
                : undefined,
        };
    }

    public override GetDefaultPayloadSelfWritePaths(_ctx: AgentRunContext): string[] | undefined {
        return undefined;
    }

    public override ApplyTurnPayloadChange<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        step: BaseAgentNextStep<P>,
        current: P,
        isUnmodifiedInheritedPayload: boolean
    ): PayloadManagerResult<P> {
        const change = step.payloadChangeRequest!;
        const allowedPaths = params.agent.PayloadSelfWritePaths
            ? JSON.parse(params.agent.PayloadSelfWritePaths)
            : this.GetDefaultPayloadSelfWritePaths(ctx);
        const basePayload =
            step.artifactDirective?.behavior === 'create-new' &&
            (ctx.PromptTurnCount <= 1 || isUnmodifiedInheritedPayload || Boolean(change.replaceElements))
                ? ({} as P)
                : current;
        const changeResult = ctx.PayloadManager.applyAgentChangeRequest(basePayload, change, {
            validateChanges: true,
            logChanges: true,
            agentName: params.agent.Name,
            analyzeChanges: true,
            generateDiff: true,
            allowedPaths,
            verbose: params.verbose === true || IsVerboseLoggingEnabled(),
        });
        if (changeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
            LogStatus(`Payload warnings: ${changeResult.warnings.join('; ')}`);
        }
        return changeResult;
    }

    public override BuildCompletionDraft<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        step: BaseAgentNextStep<P>,
        committed: P,
        isUnmodifiedInheritedPayload: boolean
    ): { payload: P; summary: PayloadChangeResultSummary | undefined } {
        const working = this.WithHeldCompletionChanges(ctx, params, committed);
        const change = step.payloadChangeRequest;
        if (!change || this.IsHeldCompletionChange(ctx, change)) {
            return { payload: working, summary: undefined };
        }
        const changeResult = this.ApplyTurnPayloadChange(
            ctx,
            params,
            step,
            working,
            isUnmodifiedInheritedPayload && ctx.HeldCompletionChanges.length === 0
        );
        return {
            payload: changeResult.result,
            summary: this.BuildPayloadChangeResultSummary(ctx, changeResult),
        };
    }

    public override WithHeldCompletionChanges<P>(ctx: AgentRunContext, params: ExecuteAgentParams, payload: P): P {
        return ctx.HeldCompletionChanges.reduce<P>((current, held) => {
            const step: BaseAgentNextStep<P> = {
                step: 'Success',
                terminate: false,
                payloadChangeRequest: held.Change as AgentPayloadChangeRequest<P>,
            };
            return this.ApplyTurnPayloadChange(ctx, params, step, current, held.UnmodifiedInheritedPayload).result;
        }, payload);
    }

    public override UpdateHeldCompletionChanges<P>(
        ctx: AgentRunContext,
        step: BaseAgentNextStep<P>,
        committedDraft: boolean,
        isUnmodifiedInheritedPayload: boolean
    ): void {
        if (committedDraft) {
            ctx.HeldCompletionChanges = [];
            return;
        }
        const change = AgentPayloadHelper.CarriesCompletionChange(step) ? step.payloadChangeRequest : undefined;
        if (change && !this.IsHeldCompletionChange(ctx, change)) {
            ctx.HeldCompletionChanges.push({
                Change: change as AgentPayloadChangeRequest<unknown>,
                UnmodifiedInheritedPayload: isUnmodifiedInheritedPayload && ctx.HeldCompletionChanges.length === 0,
            });
        }
    }

    public override IsHeldCompletionChange<P>(ctx: AgentRunContext, change: AgentPayloadChangeRequest<P>): boolean {
        const key = AgentPayloadHelper.StableJSON(change);
        return ctx.HeldCompletionChanges.some(held => AgentPayloadHelper.StableJSON(held.Change) === key);
    }

    public override ResolveTurnPayload<P>(
        _ctx: AgentRunContext,
        step: BaseAgentNextStep<P>,
        committed: P,
        draft: { payload: P } | undefined
    ): { payload: P; committedDraft: boolean } {
        if (!draft) {
            return { payload: step.newPayload || committed, committedDraft: false };
        }
        if (step.step === 'Success') {
            return { payload: step.newPayload || draft.payload, committedDraft: true };
        }
        const own = step.newPayload && step.newPayload !== draft.payload ? step.newPayload : undefined;
        return { payload: own || committed, committedDraft: false };
    }
}
