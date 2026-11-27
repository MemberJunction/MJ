/**
 * @fileoverview Cohesive internal collaborator handling loop-body execution (`ForEach` / `While`
 * single iterations & multi-step bodies), loop validation, action lookup, loop-result injection &
 * spillover, and `Pipeline` registry/step execution.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s5`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import { ActionEngineBase, type MJActionEntityExtended } from '@memberjunction/actions-base';
import {
    type AgentChatMessage,
    type AgentChatMessageMetadata,
    type AgentConfiguration,
    type AgentPipelineRequest,
    type ArtifactToolArgs,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type ForEachOperation,
    type LoopBodyActionStep,
    ResolveLoopBodyParams,
    ValidateLoopOperationStructure,
    type WhileOperation,
} from '@memberjunction/ai-core-plus';
import { IsPlainObject, SafeExpressionEvaluator } from '@memberjunction/global';
import { ActionLifecycleResolver } from '../../ActionLifecycleResolver';
import type { LoopIterationError } from '../../AgentStepDispatcher';
import { ExtractUntrustedEnvelope } from '../../client-tool-results';
import {
    ActionInvocable,
    ArtifactToolInvocable,
    type PipelineExecutionResult,
    PipelineExecutor,
    type PipelineInvocable,
    type PipelineStage,
    PipelineToolRegistry,
    summarizePipelineStages,
} from '../../pipeline';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    ActionResultSummary,
    ForEachIterationResult,
    WhileIterationResult,
} from '../base-agent-types';

/**
 * Handles loop-body execution, loop validation, result formatting/injection, and pipeline
 * execution on behalf of {@link AgentIterationHelper}.
 */
export class AgentLoopBodyExecutor {
    // --- Pipeline execution ---

    public BuildPipelineRegistry(ctx: AgentRunContext, params: ExecuteAgentParams): PipelineToolRegistry {
        const registry = new PipelineToolRegistry();
        const register = (invocable: PipelineInvocable): void => {
            try {
                registry.Register(invocable);
            } catch (e) {
                ctx.Hooks.LogStatus(`[Pipeline] Skipped tool "${invocable.toolName}": ${(e as Error).message}`, true, params);
            }
        };

        ctx.Hooks.GetEffectiveActionsForValidation(params.agent.ID).forEach(actionEntity =>
            register(
                new ActionInvocable(actionEntity.Name, async p => {
                    const actionResult = await ctx.Hooks.ExecuteSingleAction(
                        params,
                        { name: actionEntity.Name, params: p },
                        actionEntity,
                        params.contextUser,
                        { skipCircuitBreaker: true }
                    );
                    const trustLevel = ctx.Hooks.ResolveActionTrustLevel(actionEntity.Name, actionEntity, params);
                    if (trustLevel === 'Untrusted' || trustLevel === 'SemiTrusted') {
                        const sourceName = `action:${actionEntity.Name}`;
                        ctx.Hooks.RecordTaintedSource(ctx.PromptTurnCount, sourceName, trustLevel);
                        registry.RecordTaint(sourceName, trustLevel);
                    }
                    return actionResult;
                })
            )
        );

        ctx.ArtifactToolManager.GetAvailableToolNames().forEach(toolName =>
            register(
                new ArtifactToolInvocable(toolName, async (tool, p) => {
                    const stored = await ctx.ArtifactToolManager.ExecuteSingleToolCall({
                        artifactId: String(p.artifactId ?? ''),
                        tool,
                        input: p as ArtifactToolArgs,
                    });
                    if (stored.trustLevel === 'Untrusted' || stored.trustLevel === 'SemiTrusted') {
                        const sourceName = stored.sourceName ?? `artifact:${stored.artifactId}`;
                        ctx.Hooks.RecordTaintedSource(ctx.PromptTurnCount, sourceName, stored.trustLevel);
                        registry.RecordTaint(sourceName, stored.trustLevel);
                    }
                    return stored.result;
                })
            )
        );

        return registry;
    }

    public async ExecutePipelineAsStep(
        ctx: AgentRunContext,
        pipeline: AgentPipelineRequest,
        params: ExecuteAgentParams
    ): Promise<PipelineExecutionResult> {
        const stepEntity = await ctx.Hooks.CreateStepEntity({
            stepType: 'Tool',
            stepName: `Pipeline: ${pipeline.steps.length} step(s)`,
            contextUser: params.contextUser,
            inputData: { steps: pipeline.steps },
        });

        const registry = ctx.Hooks.BuildPipelineRegistry(params);
        let result: PipelineExecutionResult;
        try {
            const audience = await ctx.Hooks.AudienceReadersFor(params);
            if ('Error' in audience) {
                throw new Error(audience.Error);
            }
            result = await new PipelineExecutor(registry, undefined, {
                contextUser: params.contextUser,
                provider: ctx.ProviderToUse,
                audienceReaders: audience.Readers,
            }).Execute(pipeline.steps as PipelineStage[]);
        } catch (e) {
            result = {
                success: false,
                finalOutput: null,
                steps: [],
                error: `Pipeline crashed: ${(e as Error)?.message ?? String(e)}`,
                contextBytesSaved: 0,
            };
        }

        await ctx.Hooks.FinalizeStepEntity(stepEntity, result.success, result.success ? undefined : result.error, {
            success: result.success,
            toolChain: summarizePipelineStages(result.steps),
            steps: result.steps,
            contextBytesSaved: result.contextBytesSaved,
            totalBytesStreamed: result.steps.reduce((sum, s) => sum + s.outputSize, 0),
            totalDurationMs: result.steps.reduce((sum, s) => sum + s.durationMs, 0),
            failedStepIndex: result.failedStepIndex,
        });

        return result;
    }

    // --- Loop validation ---

    public ValidateWhileOperation(
        ctx: AgentRunContext,
        whileOp: WhileOperation,
        agentId: string = ctx.AgentRun?.AgentID ?? ''
    ): string | null {
        return ctx.StepDispatcher.ValidateWhileOperation(whileOp, (kind, op) =>
            this.ValidateLoopBodyOperation(ctx, kind, op, agentId)
        );
    }

    public ValidateForEachHeader(ctx: AgentRunContext, forEach: ForEachOperation): string | null {
        return ctx.StepDispatcher.ValidateForEachHeader(forEach);
    }

    public ValidateLoopBodyOperation(
        ctx: AgentRunContext,
        kind: 'ForEach' | 'While',
        op: ForEachOperation | WhileOperation,
        agentId: string = ctx.AgentRun?.AgentID ?? ''
    ): string | null {
        const structuralErrors = ValidateLoopOperationStructure(kind, op);
        if (structuralErrors.length > 0) {
            return structuralErrors[0].Message;
        }

        if (op.prompt) {
            return 'Prompt loop bodies are only supported in durable TaskGraph execution';
        }

        if (op.action) {
            return ctx.Hooks.ValidateActionInAgent(op.action.name, agentId);
        }

        if (op.steps !== undefined) {
            for (const step of op.steps) {
                const actionErr = ctx.Hooks.ValidateActionInAgent(step.name, agentId);
                if (actionErr) {
                    return actionErr;
                }
            }
            return null;
        }

        if (op.subAgent) {
            return ctx.Hooks.ValidateSubAgentInAgent(op.subAgent.name, agentId);
        }

        return null;
    }

    // --- Single-iteration & multi-step body execution ---

    public async ExecuteLoopStepsIteration(
        ctx: AgentRunContext,
        args: {
            steps: readonly LoopBodyActionStep[];
            item: unknown;
            itemVariable: string;
            index: number;
            attemptContext?: { attemptNumber: number; totalAttempts: number };
            currentPayload: unknown;
            parentStepId: string;
            params: ExecuteAgentParams;
        }
    ): Promise<{
        payload: unknown;
        result: BaseAgentNextStep;
        appliedFolds: Array<{ output: Record<string, unknown>; mapping: string }>;
    }> {
        const { steps, item, itemVariable, index, attemptContext, currentPayload, parentStepId, params } = args;
        const stepsOutputs: Record<string, Record<string, unknown>> = {};
        const appliedFolds: Array<{ output: Record<string, unknown>; mapping: string }> = [];
        const aggregatedSummaries: ActionResultSummary[] = [];
        const evaluator = new SafeExpressionEvaluator();

        let workingPayload: Record<string, unknown> = IsPlainObject(currentPayload)
            ? ctx.Hooks.CloneSubAgentPayload(currentPayload as Record<string, unknown>)
            : {};

        for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
            const step = steps[stepIdx];
            const stepKey = step.id?.trim() || `step_${stepIdx}`;
            const stepBindings: Record<string, unknown> = {
                ...(attemptContext
                    ? { attemptNumber: attemptContext.attemptNumber, totalAttempts: attemptContext.totalAttempts }
                    : {}),
                item,
                [itemVariable]: item,
                index,
                steps: stepsOutputs,
            };

            if (step.condition?.trim()) {
                const conditionScope: Record<string, unknown> = {
                    ...workingPayload,
                    ...stepBindings,
                    payload: { ...workingPayload, ...stepBindings },
                    steps: stepsOutputs,
                    index,
                    iteration: index,
                    ...(params.data !== undefined ? { data: params.data } : {}),
                    ...(params.context !== undefined ? { context: params.context } : {}),
                };
                const evalResult = evaluator.evaluate(step.condition.trim(), conditionScope);
                if (!evalResult.success) {
                    throw new Error(
                        `Loop step "${stepKey}" condition "${step.condition}" could not be evaluated: ${evalResult.error ?? 'unknown error'}`
                    );
                }
                if (!evalResult.value) {
                    continue;
                }
            }

            const matchedAction = this.FindAgentActionForLoop(ctx, step.name, params.agent.ID, params.agent.Name, params);
            const stepPayload = { ...workingPayload, ...stepBindings };
            const resolvedParams = ResolveLoopBodyParams(step.params ?? {}, stepBindings, {
                payload: stepPayload,
                data: params.data,
                context: params.context,
            });

            const actionStep: BaseAgentNextStep = {
                step: 'Actions',
                actions: [{ name: matchedAction.Action, params: resolvedParams }],
                newPayload: workingPayload,
                previousPayload: workingPayload,
                terminate: false,
            };
            const stepResult = await ctx.Hooks.ExecuteActionsStep(params, actionStep, parentStepId, false, 0, {
                skipCircuitBreaker: true,
            });
            const summaries = Array.isArray(stepResult.priorStepResult)
                ? (stepResult.priorStepResult as ActionResultSummary[])
                : [];
            aggregatedSummaries.push(...summaries);

            const failedSummary = summaries.find(s => !s.success);
            if (failedSummary) {
                throw new Error(
                    `Loop step "${stepKey}" (${matchedAction.Action}) failed: ${failedSummary.message || failedSummary.resultCode || 'Action failed'}`
                );
            }

            const stepOutput = ctx.StepDispatcher.ExtractActionOutputObject(summaries);
            stepsOutputs[stepKey] = stepOutput;
            if (stepKey !== `step_${stepIdx}`) {
                stepsOutputs[`step_${stepIdx}`] ??= stepOutput;
            }

            if (step.outputMapping?.trim()) {
                workingPayload = ctx.Hooks.ApplyLoopOutputFold(workingPayload, stepOutput, step.outputMapping);
                appliedFolds.push({ output: stepOutput, mapping: step.outputMapping });
            } else if (IsPlainObject(stepResult.newPayload)) {
                workingPayload = stepResult.newPayload as Record<string, unknown>;
            }
        }

        const outPayload: unknown = IsPlainObject(currentPayload) || appliedFolds.length > 0 ? workingPayload : currentPayload;
        const syntheticStep: BaseAgentNextStep = {
            step: 'Retry',
            terminate: false,
            previousPayload: currentPayload,
            newPayload: outPayload,
            priorStepResult: aggregatedSummaries,
        };
        return { payload: outPayload, result: syntheticStep, appliedFolds };
    }

    public async ExecuteSingleForEachIteration(
        ctx: AgentRunContext,
        forEach: ForEachOperation,
        item: unknown,
        index: number,
        currentPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<ForEachIterationResult> {
        try {
            if (Array.isArray(forEach.steps) && forEach.steps.length > 0) {
                return await this.ExecuteLoopStepsIteration(ctx, {
                    steps: forEach.steps,
                    item,
                    itemVariable: forEach.itemVariable || 'item',
                    index,
                    currentPayload,
                    parentStepId,
                    params,
                });
            }

            const beforeHook = ctx.AgentTypeInstance?.BeforeLoopIteration?.({
                item,
                itemVariable: forEach.itemVariable,
                index,
                payload: currentPayload,
                loopType: 'ForEach',
                actionParams: forEach.action?.params || {},
            });
            let resolvedParams = beforeHook?.actionParams || forEach.action?.params || {};

            let result: BaseAgentNextStep;
            if (forEach.action) {
                const matchedAction = this.FindAgentActionForLoop(
                    ctx,
                    forEach.action.name,
                    params.agent.ID,
                    params.agent.Name,
                    params
                );
                const context = {
                    item,
                    index,
                    payload: currentPayload,
                    data: params.data,
                };
                resolvedParams = ctx.Hooks.ResolveTemplates(resolvedParams, context, forEach.itemVariable);
                const resolvedAction = {
                    name: matchedAction.Action,
                    params: resolvedParams,
                };
                const actionStep: BaseAgentNextStep = {
                    step: 'Actions',
                    actions: [resolvedAction],
                    newPayload: currentPayload,
                    previousPayload: currentPayload,
                    terminate: false,
                };
                result = await ctx.Hooks.ExecuteActionsStep(params, actionStep, parentStepId, false, 0, {
                    skipCircuitBreaker: true,
                });
            } else if (forEach.subAgent) {
                const subAgentStep: BaseAgentNextStep = {
                    step: 'Sub-Agent',
                    subAgent: { ...forEach.subAgent, terminateAfter: false },
                    newPayload: currentPayload,
                    previousPayload: currentPayload,
                    terminate: false,
                };
                result = await ctx.Hooks.ProcessSubAgentStep(params, subAgentStep, parentStepId, item);
                result.priorStepResult = ctx.Hooks.FormatSubAgentResultAsMarkdown(
                    forEach.subAgent.name,
                    result as unknown as ExecuteAgentResult
                );
            } else {
                throw new Error('ForEach missing action/steps/subAgent');
            }

            const iterPayload = result.newPayload || currentPayload;
            const afterHook = ctx.AgentTypeInstance?.AfterLoopIteration?.({
                currentPayload: iterPayload,
                item,
                itemVariable: forEach.itemVariable,
                index,
                loopContext: { actionOutputMapping: forEach.action?.outputMapping },
            });
            if (afterHook) {
                return { payload: afterHook, result };
            }
            if (forEach.action?.outputMapping?.trim() && Array.isArray(result.priorStepResult)) {
                const stepOutput = ctx.StepDispatcher.ExtractActionOutputObject(result.priorStepResult as ActionResultSummary[]);
                const folded = ctx.Hooks.ApplyLoopOutputFold(iterPayload, stepOutput, forEach.action.outputMapping);
                return {
                    payload: folded,
                    result,
                    appliedFolds: [{ output: stepOutput, mapping: forEach.action.outputMapping }],
                };
            }

            return { payload: iterPayload, result };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { error: { index, item, message } };
        }
    }

    public async ExecuteSingleWhileIteration(
        ctx: AgentRunContext,
        whileOp: WhileOperation,
        attemptContext: { attemptNumber: number; totalAttempts: number },
        index: number,
        currentPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<WhileIterationResult> {
        try {
            if (Array.isArray(whileOp.steps) && whileOp.steps.length > 0) {
                const stepsOutcome = await this.ExecuteLoopStepsIteration(ctx, {
                    steps: whileOp.steps,
                    item: attemptContext,
                    itemVariable: whileOp.itemVariable || 'attempt',
                    index,
                    attemptContext,
                    currentPayload,
                    parentStepId,
                    params,
                });
                return { payload: stepsOutcome.payload, result: stepsOutcome.result };
            }

            const beforeHook = ctx.AgentTypeInstance?.BeforeLoopIteration?.({
                item: attemptContext,
                index,
                itemVariable: whileOp.itemVariable,
                payload: currentPayload,
                loopType: 'While',
                actionParams: whileOp.action?.params || {},
            });
            let resolvedParams = beforeHook?.actionParams || whileOp.action?.params || {};

            let result: BaseAgentNextStep;
            if (whileOp.action) {
                const matchedAction = this.FindAgentActionForLoop(
                    ctx,
                    whileOp.action.name,
                    params.agent.ID,
                    params.agent.Name,
                    params
                );
                const context = {
                    item: attemptContext,
                    index,
                    payload: currentPayload,
                    data: params.data,
                };
                resolvedParams = ctx.Hooks.ResolveTemplates(resolvedParams, context, whileOp.itemVariable || 'item');
                const resolvedAction = {
                    name: matchedAction.Action,
                    params: resolvedParams,
                };
                const actionStep: BaseAgentNextStep = {
                    step: 'Actions',
                    actions: [resolvedAction],
                    newPayload: currentPayload,
                    previousPayload: currentPayload,
                    terminate: false,
                };
                result = await ctx.Hooks.ExecuteActionsStep(params, actionStep, parentStepId, false, 0, {
                    skipCircuitBreaker: true,
                });
            } else if (whileOp.subAgent) {
                const subAgentStep: BaseAgentNextStep = {
                    step: 'Sub-Agent',
                    subAgent: { ...whileOp.subAgent, terminateAfter: false },
                    newPayload: currentPayload,
                    previousPayload: currentPayload,
                    terminate: false,
                };
                result = await ctx.Hooks.ProcessSubAgentStep(params, subAgentStep, parentStepId, attemptContext);
                result.priorStepResult = ctx.Hooks.FormatSubAgentResultAsMarkdown(
                    whileOp.subAgent.name,
                    result as unknown as ExecuteAgentResult
                );
            } else {
                throw new Error('While missing action/steps/subAgent');
            }

            const iterPayload = result.newPayload || currentPayload;
            const afterHook = ctx.AgentTypeInstance?.AfterLoopIteration?.({
                currentPayload: iterPayload,
                item: attemptContext,
                itemVariable: whileOp.itemVariable,
                index,
                loopContext: { actionOutputMapping: whileOp.action?.outputMapping },
            });
            if (afterHook) {
                return { payload: afterHook, result };
            }
            if (whileOp.action?.outputMapping?.trim() && Array.isArray(result.priorStepResult)) {
                const stepOutput = ctx.StepDispatcher.ExtractActionOutputObject(result.priorStepResult as ActionResultSummary[]);
                const folded = ctx.Hooks.ApplyLoopOutputFold(iterPayload, stepOutput, whileOp.action.outputMapping);
                return { payload: folded, result };
            }

            return { payload: iterPayload, result };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { error: { index, item: attemptContext, message } };
        }
    }

    // --- Loop result injection, spillover, expiration metadata & action lookup ---

    public GetLoopActionNames(op: Pick<ForEachOperation, 'action' | 'steps'>): string[] {
        if (op.action?.name) {
            return [op.action.name];
        }
        return (op.steps ?? []).map(s => s.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
    }

    public QueueLoopResultSpillover(
        ctx: AgentRunContext,
        loopType: 'ForEach' | 'While',
        actionNames: readonly string[],
        content: string,
        metadata: AgentChatMessageMetadata
    ): void {
        const envelope = ExtractUntrustedEnvelope(content);
        const actionLabel = actionNames.length > 0 ? `${loopType}: ${actionNames.join(' → ')}` : `${loopType} Loop`;
        ctx.ActionSpilloverManager.QueueDeferred(
            metadata,
            {
                ActionName: actionLabel,
                OutputParams: [],
                Message: envelope ? envelope.UnwrappedText : content,
                StepNumber: ctx.PromptTurnCount,
                ExpirationConfig: ActionLifecycleResolver.MetadataToExpirationConfig(metadata),
                TrustLevel: envelope ? envelope.TrustLevel : 'Trusted',
                SourceName: envelope?.Source,
            },
            ctx.ArtifactToolManager
        );
    }

    public InjectLoopResultsMessage(
        ctx: AgentRunContext,
        loopType: 'ForEach' | 'While',
        collectionOrCondition: string,
        results: BaseAgentNextStep[],
        errors: LoopIterationError[],
        params: ExecuteAgentParams,
        actionNames?: string | readonly string[]
    ): void {
        const label = loopType === 'ForEach' ? 'Collection' : 'Condition';
        const content =
            `## Loop Completed\n**Type:** ${loopType}\n**${label}:** ${collectionOrCondition}\n` +
            `**Processed:** ${results.length}, **Errors:** ${errors.length}\n\n` +
            ctx.Hooks.FormatLoopResultsAsMarkdown(results, errors);

        const names = typeof actionNames === 'string' ? [actionNames] : [...(actionNames ?? [])];
        const metadata = ctx.Hooks.ResolveLoopExpirationMetadata(params, names);

        if (results.length > 0 && ctx.Hooks.AreArtifactToolsEnabled(params)) {
            this.QueueLoopResultSpillover(ctx, loopType, names, content, metadata);
        }

        params.conversationMessages.push({
            role: 'user',
            content,
            metadata,
        } as AgentChatMessage);
    }

    public FailLoopBeforeFirstIteration(
        ctx: AgentRunContext,
        loopType: 'ForEach' | 'While',
        collectionOrCondition: string,
        errorMessage: string,
        previousDecision: BaseAgentNextStep,
        params: ExecuteAgentParams,
        actionNames?: string | readonly string[]
    ): BaseAgentNextStep {
        if (ctx.AgentTypeInstance?.InjectLoopResultsAsMessage) {
            this.InjectLoopResultsMessage(
                ctx,
                loopType,
                collectionOrCondition,
                [],
                [{ index: 0, message: errorMessage }],
                params,
                actionNames
            );
        }
        return ctx.StepDispatcher.CreateFailedStep(errorMessage, previousDecision);
    }

    public ResolveLoopExpirationMetadata(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        actionNames?: string | readonly string[]
    ): AgentChatMessageMetadata {
        const names = typeof actionNames === 'string' ? [actionNames] : [...(actionNames ?? [])];
        const effectiveActions = ctx.Hooks.GetEffectiveActionsForValidation(params.agent.ID);
        const allActions = ActionEngineBase.Instance?.Actions ?? [];
        const matchedActions = names
            .map(
                name =>
                    ctx.Hooks.ResolveActionEntityForAgent(name, effectiveActions, params) ??
                    ctx.Hooks.ResolveActionEntityForAgent(name, allActions, params)
            )
            .filter((a): a is MJActionEntityExtended => a != null);
        return ActionLifecycleResolver.ResolveLoopExpirationMetadata(
            params,
            ctx.PromptTurnCount,
            matchedActions,
            ctx.Hooks.IndexEffectiveAgentActions(params.agent.ID)
        );
    }

    public FindAgentActionForLoop(
        ctx: AgentRunContext,
        actionName: string,
        agentId: string,
        agentName: string,
        params: ExecuteAgentParams
    ): { Action: string } {
        const effectiveActions = ctx.Hooks.GetAvailableActionsForAgent(agentId);
        const normalizedName = actionName.trim().toLowerCase();

        let matchedAction = effectiveActions.find(a => a.Name.trim().toLowerCase() === normalizedName);

        if (!matchedAction) {
            const sanitizedMatch = ctx.Hooks.MatchNamedBySanitizedToolName(actionName, effectiveActions);
            if (sanitizedMatch.match) {
                matchedAction = sanitizedMatch.match;
                ctx.Hooks.LogStatus(`Action native tool name matched: '${actionName}' → '${matchedAction.Name}'`, true, params);
            } else if (sanitizedMatch.ambiguous) {
                throw new Error(
                    `Ambiguous action '${actionName}'. Matches: ${sanitizedMatch.ambiguous.map(a => a.Name).join(', ')}`
                );
            }
        }

        if (!matchedAction) {
            const containsMatches = effectiveActions.filter(a => a.Name.trim().toLowerCase().includes(normalizedName));

            if (containsMatches.length === 1) {
                matchedAction = containsMatches[0];
                ctx.Hooks.LogStatus(`Action fuzzy matched: '${actionName}' → '${matchedAction.Name}'`, true, params);
            } else if (containsMatches.length > 1) {
                throw new Error(`Ambiguous action '${actionName}'. Matches: ${containsMatches.map(a => a.Name).join(', ')}`);
            } else {
                throw new Error(
                    `Action '${actionName}' not found for agent '${agentName}'. Available: ${effectiveActions.map(a => a.Name).join(', ')}`
                );
            }
        }

        return { Action: matchedAction.Name };
    }
}
