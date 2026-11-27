/**
 * @fileoverview Collaborator owned by {@link AgentPromptHelper} encapsulating inline turn
 * tool execution (artifact tools, conversation tools, memory writes) and `finishIf`
 * completion gates.
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentFinishIf,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ActionResult } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { DEFAULT_LOOP_AGENT_PROMPT_PARAMS, ResolveFinishIfMode } from '../../agent-types/loop-agent-prompt-params';
import { AgentDecisionService } from '../../AgentDecisionService';
import type { ArtifactToolCall, StoredToolResult } from '../../ArtifactToolManager';
import {
    GetMaxConversationToolCallsPerTurn,
    type ConversationToolCall,
    type ConversationToolExecutionResult,
} from '../../ConversationToolManager';
import {
    BuildFinishIfQuestions,
    CapFinishIfState,
    FINISH_IF_STATE_EXCERPT,
    FormatActionForFinishIf,
    FormatSubAgentForFinishIf,
    JudgeFinishIf,
    type FinishIfOutcome,
    type SubAgentStepResult,
} from '../../finish-if-state';
import type { MemoryWriteManager, MemoryWriteRequest, MemoryWriteResult } from '../../MemoryWriteManager';
import { CarryForwardToolFamily, type CarryForwardToolStepOutput } from '../../tool-result-format';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    ActionResultSummary,
    FinishIfSettings,
    MemoryWriteSkip,
} from '../base-agent-types';

/**
 * Collaborator handling artifact/conversation/memory-write turn steps and `finishIf`
 * completion gates.
 */
export class AgentTurnToolsAndFinishIfHelper {
    // -------------------------------------------------------------------------
    // Artifact, Conversation & Memory-Write Turn Tools
    // -------------------------------------------------------------------------

    public async ExecuteArtifactToolCallsAsSteps(
        ctx: AgentRunContext,
        calls: ArtifactToolCall[],
        params: ExecuteAgentParams
    ): Promise<StoredToolResult[]> {
        const results = await Promise.all(
            calls.map(async (call) => {
                const toolStep = await ctx.Hooks.CreateStepEntity({
                    stepType: 'Tool',
                    stepName: `Artifact Tool: ${call.tool}`,
                    contextUser: params.contextUser,
                    inputData: {
                        artifactId: call.artifactId,
                        tool: call.tool,
                        input: call.input,
                    },
                });

                const stored = await ctx.ArtifactToolManager.ExecuteSingleToolCall(call);
                if (stored.trustLevel === 'Untrusted' || stored.trustLevel === 'SemiTrusted') {
                    ctx.Hooks.RecordTaintedSource(
                        toolStep?.StepNumber ?? ctx.PromptTurnCount,
                        stored.sourceName ?? `artifact:${stored.artifactId}`,
                        stored.trustLevel
                    );
                }

                const carryForwardOutput: CarryForwardToolStepOutput = {
                    toolFamily: CarryForwardToolFamily.Artifact,
                    artifactId: stored.artifactId,
                    tool: stored.tool,
                    input: stored.input,
                    result: stored.result,
                    durationMs: stored.durationMs,
                    ...(stored.trustLevel ? { trustLevel: stored.trustLevel } : {}),
                    ...(stored.sourceName ? { sourceName: stored.sourceName } : {}),
                };
                await ctx.Hooks.FinalizeStepEntity(
                    toolStep,
                    stored.result.success,
                    stored.result.success ? undefined : stored.result.errorMessage,
                    carryForwardOutput
                );

                return stored;
            })
        );
        return results;
    }

    public async ExecuteConversationToolCallsAsSteps(
        ctx: AgentRunContext,
        calls: ConversationToolCall[],
        params: ExecuteAgentParams
    ): Promise<ConversationToolExecutionResult[]> {
        const maxConversationToolCallsPerTurn = GetMaxConversationToolCallsPerTurn();
        const callsToExecute = calls.slice(0, maxConversationToolCallsPerTurn);
        const skippedCalls = calls.slice(maxConversationToolCallsPerTurn);
        if (skippedCalls.length > 0) {
            ctx.Hooks.LogStatus(
                `[ConversationTools] ${calls.length} calls requested — executing first ${callsToExecute.length}, skipping ${skippedCalls.length} (per-turn cap)`,
                true,
                params
            );
        }
        const executedResults = await Promise.all(
            callsToExecute.map(async (call) => {
                const toolStep = await ctx.Hooks.CreateStepEntity({
                    stepType: 'Tool',
                    stepName: `Conversation Tool: ${call.tool}`,
                    contextUser: params.contextUser,
                    inputData: {
                        tool: call.tool,
                        input: call.input,
                        conversationId: params.conversationId,
                    },
                });

                const executed = await ctx.ConversationToolManager.ExecuteSingleToolCall(call);

                if (executed.promptRunId) {
                    toolStep.TargetLogID = executed.promptRunId;
                }

                const carryForwardOutput: CarryForwardToolStepOutput = {
                    toolFamily: CarryForwardToolFamily.Conversation,
                    tool: executed.tool,
                    input: executed.input,
                    result: executed.result,
                    durationMs: executed.durationMs,
                    ...(executed.promptRunId && { promptRunId: executed.promptRunId }),
                };
                await ctx.Hooks.FinalizeStepEntity(
                    toolStep,
                    executed.result.success,
                    executed.result.success ? undefined : executed.result.errorMessage,
                    carryForwardOutput
                );

                return executed;
            })
        );

        const skippedResults: ConversationToolExecutionResult[] = skippedCalls.map((call) => ({
            tool: call.tool,
            input: call.input,
            result: {
                success: false,
                errorMessage: `Skipped — per-turn cap of ${maxConversationToolCallsPerTurn} conversation tool calls reached. Re-request this call on your next turn.`,
            },
            durationMs: 0,
        }));
        return [...executedResults, ...skippedResults];
    }

    public MemoryWriteOptions(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Parameters<MemoryWriteManager['ExecuteWrite']>[1] {
        return {
            agentId: params.agent.ID,
            contextUser: params.contextUser,
            agentRunId: ctx.AgentRun?.ID,
            conversationId: ctx.AgentRun?.ConversationID || undefined,
            conversationDetailId: params.conversationDetailId,
            userId: params.userId || params.contextUser?.ID,
            companyId: params.companyId,
            verbose: params.verbose,
            provider: ctx.ProviderToUse,
            isRunTainted: ctx.TaintedSources.length > 0,
            taintedSources: ctx.TaintedSources,
        };
    }

    public async ExecuteMemoryWritesAsSteps(
        ctx: AgentRunContext,
        writes: MemoryWriteRequest[],
        params: ExecuteAgentParams
    ): Promise<MemoryWriteResult[]> {
        const results: MemoryWriteResult[] = [];
        for (const write of writes) {
            const writeStep = await ctx.Hooks.CreateStepEntity({
                stepType: 'Tool',
                stepName: 'Memory Write',
                contextUser: params.contextUser,
                inputData: {
                    note: write.note,
                    type: write.type,
                    scopeHint: write.scopeHint,
                },
            });

            const result = await ctx.MemoryWriteManager.ExecuteWrite(write, this.MemoryWriteOptions(ctx, params));

            const failed = result.disposition === 'error' || result.disposition === 'rejected-type';
            await ctx.Hooks.FinalizeStepEntity(writeStep, !failed, failed ? result.reason : undefined, {
                disposition: result.disposition,
                noteId: result.noteId,
                finalScope: result.finalScope,
                reason: result.reason,
                durationMs: result.durationMs,
            });
            results.push(result);
        }
        return results;
    }

    public async ProcessMemoryWritesForTurn(
        ctx: AgentRunContext,
        memoryWrites: MemoryWriteRequest[],
        params: ExecuteAgentParams
    ): Promise<void> {
        const skip = this.MemoryWriteSkip(ctx, params);
        if (skip) {
            await this.SkipMemoryWrites(ctx, memoryWrites.length, skip, params);
            return;
        }

        ctx.Hooks.LogStatus(`[MemoryWrites] LLM requested ${memoryWrites.length} memory write(s)`, true, params);
        const writeResults = await ctx.Hooks.ExecuteMemoryWritesAsSteps(memoryWrites, params);
        ctx.Hooks.InjectMemoryWriteResultsMessage(params, writeResults);
    }

    public IsArtifactSupportEnabled(ctx: AgentRunContext, agent: MJAIAgentEntityExtended): boolean {
        if (!agent.ArtifactCreationMode || agent.ArtifactCreationMode !== 'Never') {
            return true;
        }
        if (ctx.ArtifactToolManager.HasArtifacts()) {
            return true;
        }
        if (agent.ParentID) {
            const parentAgent = AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, agent.ParentID));
            if (parentAgent && parentAgent.ArtifactCreationMode === 'Always') {
                return true;
            }
        }
        return false;
    }

    public MemoryWriteSkip(ctx: AgentRunContext, params: ExecuteAgentParams): MemoryWriteSkip | null {
        if (params.agent.AllowMemoryWrite !== true) {
            return { Reason: 'AllowMemoryWrite=false', Told: 'this agent does not have durable memory writes enabled' };
        }
        if (ctx.Hooks.RunAudienceAddsReader(params)) {
            return { Reason: 'shared conversation', Told: 'memory writes are not available in a shared conversation' };
        }
        return null;
    }

    public async SkipMemoryWrites(
        ctx: AgentRunContext,
        requestedWriteCount: number,
        skip: MemoryWriteSkip,
        params: ExecuteAgentParams
    ): Promise<void> {
        ctx.Hooks.LogStatus(
            `[MemoryWrites] LLM emitted ${requestedWriteCount} memory write(s) but ${skip.Reason} — skipping`,
            true,
            params
        );
        await ctx.Hooks.CreateStepEntity({
            stepType: 'Tool',
            stepName: `Memory Writes: skipped (${skip.Reason})`,
            contextUser: params.contextUser,
            inputData: { requestedWriteCount },
            completed: {
                success: true,
                outputData: { skipped: true, reason: skip.Reason },
            },
        });
        params.conversationMessages.push({
            role: 'user',
            content: `Memory write result: ${skip.Told} — the requested memories were NOT saved. Do not emit memoryWrites again.`,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: 'tool-result',
                expirationTurns: 3, // short-lived refusal reminder expires after 3 turns
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 200, // concise compacted summary length
                compactPromptId: '',
            },
        });
    }


    // -------------------------------------------------------------------------
    // finishIf Completion Gates
    // -------------------------------------------------------------------------

    public FinishIfSettings(ctx: AgentRunContext): FinishIfSettings {
        const promptParams = ctx.AgentTypePromptParams;
        const rules = promptParams?.includeResponseTypeDefinition as Record<string, unknown> | undefined;
        const threshold = promptParams?.finishIfThreshold;
        const mode = ResolveFinishIfMode(promptParams?.finishIfMode);
        return {
            Enabled: ctx.Hooks.DecisionsEnabled(promptParams) && mode !== 'off' && rules?.finishIf !== false,
            Mode: mode,
            Threshold:
                typeof threshold === 'number' && threshold > 0 && threshold <= 1
                    ? threshold
                    : DEFAULT_LOOP_AGENT_PROMPT_PARAMS.finishIfThreshold,
            PromptName:
                typeof promptParams?.decisionPromptName === 'string'
                    ? promptParams.decisionPromptName
                    : AgentDecisionService.DEFAULT_PROMPT_NAME,
        };
    }

    public FinishIfActs(ctx: AgentRunContext): boolean {
        const settings = this.FinishIfSettings(ctx);
        return settings.Enabled && settings.Mode === 'on';
    }

    public GateEndsRun(ctx: AgentRunContext, outcome: FinishIfOutcome, params: ExecuteAgentParams): boolean {
        if (!outcome.Passed) {
            return false;
        }
        if (!this.FinishIfActs(ctx)) {
            ctx.Hooks.LogStatus(
                '[finishIf] Shadow mode: the gate passed, and the run continues as it would have',
                true,
                params
            );
            return false;
        }
        return true;
    }

    public async FinishAfterActions<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        decision: BaseAgentNextStep<P>,
        actionResults: Array<{ success: boolean; result?: ActionResult }>,
        actionSummaries: ActionResultSummary[],
        payload: P,
        parentStepId: string | undefined,
        addConversationMessage: boolean
    ): Promise<BaseAgentNextStep<P> | undefined> {
        const finishIf = decision.finishIf;
        if (!finishIf || !addConversationMessage || !this.FinishIfSettings(ctx).Enabled) {
            return undefined;
        }
        if (!actionResults.every((r) => r.success && r.result?.Success === true)) {
            return undefined;
        }
        const withDirectives = actionSummaries.filter((a) => (a.aiDirectives?.length ?? 0) > 0).map((a) => a.actionName);
        if (withDirectives.length > 0) {
            ctx.Hooks.LogStatus(
                `[finishIf] Gate skipped: ${withDirectives.join(', ')} returned AIDirectives, which the model must see on its next turn`,
                false,
                params
            );
            return undefined;
        }
        const state = CapFinishIfState(actionSummaries.map(FormatActionForFinishIf).join('\n\n'));
        const outcome = await this.EvaluateFinishIf(ctx, finishIf, state, params, decision, payload, parentStepId);
        return this.GateEndsRun(ctx, outcome, params)
            ? { ...this.FinishIfSuccessStep(finishIf, decision, payload), priorStepResult: actionSummaries }
            : undefined;
    }

    public async FinishAfterSubAgent<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        decision: BaseAgentNextStep<P>,
        result: SubAgentStepResult<P>
    ): Promise<BaseAgentNextStep<P> | undefined> {
        const finishIf = decision.finishIf;
        if (!finishIf || result.terminate || result.step !== 'Success' || !this.FinishIfSettings(ctx).Enabled) {
            return undefined;
        }
        const outcome = await this.EvaluateFinishIf(
            ctx,
            finishIf,
            FormatSubAgentForFinishIf(result),
            params,
            decision,
            result.newPayload
        );
        return this.GateEndsRun(ctx, outcome, params) ? { ...result, terminate: true, message: finishIf.message } : undefined;
    }

    public async EvaluateFinishIf<P>(
        ctx: AgentRunContext,
        finishIf: AgentFinishIf,
        state: string,
        params: ExecuteAgentParams,
        decision: BaseAgentNextStep<P>,
        payload: P,
        parentStepId?: string
    ): Promise<FinishIfOutcome> {
        const settings = this.FinishIfSettings(ctx);
        let step: MJAIAgentRunStepEntityExtended | undefined;
        let outcome: FinishIfOutcome;
        try {
            step = await ctx.Hooks.CreateStepEntity({
                stepType: 'Decision',
                stepName: 'Finish check',
                contextUser: params.contextUser,
                inputData: { questions: finishIf.questions, state: state.slice(0, FINISH_IF_STATE_EXCERPT) },
                parentId: parentStepId,
            });
            outcome = await this.AskFinishIf(ctx, finishIf, state, settings, params, step);
            if (outcome.Passed) {
                const refusal = await this.FinishIfValidationRefusal(
                    ctx,
                    params,
                    this.FinishIfSuccessStep(finishIf, decision, payload),
                    payload,
                    step
                );
                if (refusal) {
                    outcome = { ...outcome, Passed: false, Reason: refusal };
                }
            }
        } catch (error) {
            outcome = { Passed: false, Probabilities: {}, Reason: error instanceof Error ? error.message : String(error) };
            LogError(`finishIf gate failed, so the run continues: ${outcome.Reason}`);
        }
        await this.FinalizeFinishCheckStep(ctx, step, outcome, settings);
        return outcome;
    }

    public async AskFinishIf(
        ctx: AgentRunContext,
        finishIf: AgentFinishIf,
        state: string,
        settings: FinishIfSettings,
        params: ExecuteAgentParams,
        step: MJAIAgentRunStepEntityExtended
    ): Promise<FinishIfOutcome> {
        const questions = BuildFinishIfQuestions(finishIf);
        const result = await ctx.AgentDecisionService.Ask({
            State: state,
            Questions: questions,
            ContextUser: params.contextUser,
            AgentID: params.agent?.ID,
            PromptName: settings.PromptName,
            CancellationToken: params.cancellationToken,
            ExecutionScope: ctx.Hooks.RunPromptExecutionScope(params),
        });
        ctx.Hooks.AttachDecisionPromptRun(step, result);
        if (!result.success) {
            return { Passed: false, Probabilities: {}, Reason: `The decision call failed: ${result.errorMessage ?? 'no error message'}` };
        }
        return JudgeFinishIf(result.Answers, questions, settings.Threshold);
    }

    public async FinishIfValidationRefusal<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        successStep: BaseAgentNextStep<P>,
        payload: P,
        step: MJAIAgentRunStepEntityExtended
    ): Promise<string | undefined> {
        if (!ctx.AgentRun) {
            return 'There is no agent run to validate against';
        }
        const generalRetries = ctx.GeneralValidationRetryCount;
        const payloadRetries = ctx.ValidationRetryCount;
        try {
            const validated = await ctx.Hooks.ValidateSuccessNextStep<P>(params, successStep, payload, ctx.AgentRun, step);
            if (validated.step === 'Success') {
                return undefined;
            }
            return validated.errorMessage || validated.retryInstructions || `Success validation returned '${validated.step}'`;
        } finally {
            ctx.GeneralValidationRetryCount = generalRetries;
            ctx.ValidationRetryCount = payloadRetries;
        }
    }

    public FinishIfSuccessStep<P>(
        finishIf: AgentFinishIf,
        decision: BaseAgentNextStep<P>,
        payload: P
    ): BaseAgentNextStep<P> {
        return {
            step: 'Success',
            terminate: true,
            message: finishIf.message,
            payloadChangeRequest: decision.payloadChangeRequest,
            previousPayload: decision.previousPayload,
            newPayload: payload,
            scratchpad: decision.scratchpad,
            responseForm: decision.responseForm,
            actionableCommands: decision.actionableCommands,
            automaticCommands: decision.automaticCommands,
            artifactDirective: decision.artifactDirective,
        };
    }

    public async FinalizeFinishCheckStep(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended | undefined,
        outcome: FinishIfOutcome,
        settings: FinishIfSettings
    ): Promise<void> {
        if (!step) {
            return;
        }
        try {
            await ctx.Hooks.FinalizeStepEntity(step, true, undefined, {
                passed: outcome.Passed,
                mode: settings.Mode,
                endedRun: outcome.Passed && settings.Mode === 'on',
                threshold: settings.Threshold,
                probabilities: outcome.Probabilities,
                reason: outcome.Reason,
            });
        } catch (error) {
            LogError(`Could not save the finishIf step: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
