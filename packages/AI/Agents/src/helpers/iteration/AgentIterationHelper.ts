/**
 * @fileoverview Default `@RegisterClass(BaseAgentIterationHelper, 'Default')` implementation
 * owning `ForEach` / `While` loop orchestration, bounded-concurrency mapping, template/path
 * resolution, loop result formatting/folding, and delegation to {@link AgentLoopBodyExecutor}.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s5`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import {
    type AgentChatMessageMetadata,
    type AgentConfiguration,
    type AgentPipelineRequest,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ForEachOperation,
    GetValueFromPath,
    type MJAIAgentRunStepEntityExtended,
    type WhileOperation,
} from '@memberjunction/ai-core-plus';
import { IsPlainObject, RegisterClass, SafeExpressionEvaluator } from '@memberjunction/global';
import type { LoopIterationError } from '../../AgentStepDispatcher';
import type { PipelineExecutionResult, PipelineToolRegistry } from '../../pipeline';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    ForEachIterationResult,
    ForEachLoopResults,
    WhileIterationResult,
    WhileLoopResults,
} from '../base-agent-types';
import { AgentLoopBodyExecutor } from './AgentLoopBodyExecutor';
import { BaseAgentIterationHelper } from './BaseAgentIterationHelper';

/**
 * Default pluggable implementation of {@link BaseAgentIterationHelper}.
 */
@RegisterClass(BaseAgentIterationHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentIterationHelper extends BaseAgentIterationHelper {
    private readonly _body = new AgentLoopBodyExecutor();

    // --- Pipeline delegates (no `async` wrapper on 1-line pass-throughs) ---

    public override BuildPipelineRegistry(ctx: AgentRunContext, params: ExecuteAgentParams): PipelineToolRegistry {
        return this._body.BuildPipelineRegistry(ctx, params);
    }

    public override ExecutePipelineAsStep(
        ctx: AgentRunContext,
        pipeline: AgentPipelineRequest,
        params: ExecuteAgentParams
    ): Promise<PipelineExecutionResult> {
        return this._body.ExecutePipelineAsStep(ctx, pipeline, params);
    }

    // --- Concurrency & template/path utilities ---

    public override async MapWithConcurrency<T, R>(
        _ctx: AgentRunContext,
        items: T[],
        limit: number,
        worker: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        if (items.length === 0) return [];
        const effectiveLimit = Math.max(1, Math.min(limit, items.length));
        const results: R[] = new Array(items.length);
        let next = 0;
        const runners: Promise<void>[] = [];
        for (let i = 0; i < effectiveLimit; i++) {
            runners.push(
                (async () => {
                    while (true) {
                        const idx = next++;
                        if (idx >= items.length) return;
                        results[idx] = await worker(items[idx], idx);
                    }
                })()
            );
        }
        await Promise.all(runners);
        return results;
    }

    public override ResolveLoopParams(
        ctx: AgentRunContext,
        params: Record<string, unknown>,
        item: unknown,
        index: number,
        payload: unknown
    ): Record<string, unknown> {
        const resolved: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                if (value.startsWith('item.')) {
                    resolved[key] = ctx.Hooks.GetValueFromPath(item, value.substring(5));
                } else if (value.startsWith('payload.')) {
                    resolved[key] = ctx.Hooks.GetValueFromPath(payload, value.substring(8));
                } else if (value === 'item') {
                    resolved[key] = item;
                } else if (value === 'index') {
                    resolved[key] = index;
                } else {
                    resolved[key] = value;
                }
            } else {
                resolved[key] = value;
            }
        }
        return resolved;
    }

    public override ResolveTemplates(
        ctx: AgentRunContext,
        obj: Record<string, unknown>,
        context: Record<string, unknown>,
        itemVariable: string
    ): Record<string, unknown> {
        return ctx.StepDispatcher.ResolveTemplates(
            obj,
            context,
            itemVariable,
            (val, c, iv) => ctx.Hooks.ResolveValueFromContext(val, c, iv),
            (nested, c, iv) => ctx.Hooks.ResolveTemplates(nested, c, iv)
        );
    }

    public override ResolveValueFromContext(
        ctx: AgentRunContext,
        value: string,
        context: Record<string, unknown>,
        itemVariable: string
    ): unknown {
        return ctx.StepDispatcher.ResolveValueFromContext(value, context, itemVariable, {
            resolveInline: (tpl, c, iv) => ctx.Hooks.ResolveInlineTemplateExpressions(tpl, c, iv),
            getPath: (obj, path) => ctx.Hooks.GetValueFromPath(obj, path),
        });
    }

    public override ResolveInlineTemplateExpressions(
        ctx: AgentRunContext,
        template: string,
        context: Record<string, unknown>,
        itemVariable: string
    ): string {
        return ctx.StepDispatcher.ResolveInlineTemplateExpressions(template, context, itemVariable, (val, c, iv) =>
            ctx.Hooks.ResolveValueFromContext(val, c, iv)
        );
    }

    public override GetValueFromPath(_ctx: AgentRunContext, obj: unknown, path: string): unknown {
        return GetValueFromPath(obj, path);
    }

    // --- Validation delegates ---

    public override ValidateWhileOperation(
        ctx: AgentRunContext,
        whileOp: WhileOperation,
        agentId?: string
    ): string | null {
        return this._body.ValidateWhileOperation(ctx, whileOp, agentId);
    }

    public override ValidateForEachHeader(ctx: AgentRunContext, forEach: ForEachOperation): string | null {
        return this._body.ValidateForEachHeader(ctx, forEach);
    }

    public override ValidateLoopBodyOperation(
        ctx: AgentRunContext,
        kind: 'ForEach' | 'While',
        op: ForEachOperation | WhileOperation,
        agentId?: string
    ): string | null {
        return this._body.ValidateLoopBodyOperation(ctx, kind, op, agentId);
    }

    // --- Formatting, folding & collection extraction ---

    public override GetCollectionFromPayload(ctx: AgentRunContext, payload: unknown, path: string): unknown[] | null {
        return ctx.StepDispatcher.GetCollectionFromPayload(payload, path, (obj, p) => ctx.Hooks.GetValueFromPath(obj, p));
    }

    public override ApplyForEachResultsSequentially(
        ctx: AgentRunContext,
        sortedResults: Array<{
            index: number;
            result?: BaseAgentNextStep;
            error?: LoopIterationError;
            payload?: unknown;
            appliedFolds?: Array<{ output: Record<string, unknown>; mapping: string }>;
        }>,
        initialPayload: unknown,
        continueOnError: boolean
    ): { results: BaseAgentNextStep[]; errors: LoopIterationError[]; finalPayload: unknown } {
        return ctx.StepDispatcher.ApplyForEachResultsSequentially(sortedResults, initialPayload, continueOnError, p =>
            ctx.Hooks.CloneSubAgentPayload(p)
        );
    }

    public override ApplyLoopOutputFold(
        ctx: AgentRunContext,
        basePayload: unknown,
        output: Record<string, unknown>,
        mapping: string
    ): Record<string, unknown> {
        return ctx.StepDispatcher.ApplyLoopOutputFold(basePayload, output, mapping, p => ctx.Hooks.CloneSubAgentPayload(p));
    }

    public override FormatLoopErrors(ctx: AgentRunContext, errors: LoopIterationError[]): string {
        return ctx.StepDispatcher.FormatLoopErrors(errors);
    }

    public override FormatLoopResultsAsMarkdown(
        ctx: AgentRunContext,
        results: BaseAgentNextStep[],
        errors: LoopIterationError[]
    ): string {
        return ctx.StepDispatcher.FormatLoopResultsAsMarkdown(results, errors, ctx.ActionResultCrush, summaries =>
            ctx.Hooks.FormatActionResultsAsMarkdown(summaries)
        );
    }

    public override ResolveLoopExpirationMetadata(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        actionNames?: string | readonly string[]
    ): AgentChatMessageMetadata {
        return this._body.ResolveLoopExpirationMetadata(ctx, params, actionNames);
    }

    // --- ForEach loop orchestration ---

    public override async ExecuteForEachLoop(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const forEach = previousDecision.forEach as ForEachOperation;
        if (!forEach) {
            return ctx.StepDispatcher.CreateFailedStep('ForEach configuration missing', previousDecision);
        }

        const loopActionNames = this._body.GetLoopActionNames(forEach);
        const headerMessage = this._body.ValidateForEachHeader(ctx, forEach);
        if (headerMessage) {
            return this._body.FailLoopBeforeFirstIteration(
                ctx,
                'ForEach',
                forEach.collectionPath,
                `ForEach configuration invalid: ${headerMessage}`,
                previousDecision,
                params,
                loopActionNames
            );
        }

        const currentPayload = previousDecision.newPayload || previousDecision.previousPayload;
        const collection = this.GetCollectionFromPayload(ctx, currentPayload, forEach.collectionPath);

        if (!collection) {
            return this._body.FailLoopBeforeFirstIteration(
                ctx,
                'ForEach',
                forEach.collectionPath,
                `Collection path "${forEach.collectionPath}" not an array`,
                previousDecision,
                params,
                loopActionNames
            );
        }

        const agentId = params.agent?.ID ?? ctx.AgentRun?.AgentID ?? '';
        const bodyMessage = this._body.ValidateLoopBodyOperation(ctx, 'ForEach', forEach, agentId);
        if (bodyMessage) {
            return this._body.FailLoopBeforeFirstIteration(
                ctx,
                'ForEach',
                forEach.collectionPath,
                `ForEach configuration invalid: ${bodyMessage}`,
                previousDecision,
                params,
                loopActionNames
            );
        }

        const loopStepEntity = await this.createForEachLoopStep(ctx, forEach, collection, currentPayload, params);
        const loopResults = await this.ExecuteForEachIterations(
            ctx,
            forEach,
            collection,
            currentPayload,
            loopStepEntity.ID,
            params,
            config
        );

        if (ctx.PausedRunOutcome) {
            return {
                step: 'Success',
                terminate: true,
                previousPayload: currentPayload,
                newPayload: loopResults.finalPayload,
                message: ctx.PausedRunOutcome.PauseResult.Checkpoint.Summary,
            };
        }

        return this.completeForEachLoop(ctx, forEach, loopStepEntity, loopResults, previousDecision, params);
    }

    private createForEachLoopStep(
        ctx: AgentRunContext,
        forEach: ForEachOperation,
        collection: unknown[],
        payload: unknown,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        return ctx.Hooks.CreateStepEntity({
            stepType: 'ForEach',
            stepName: `ForEach: ${forEach.collectionPath} (${collection.length} items)`,
            contextUser: params.contextUser,
            inputData: { forEach, count: collection.length },
            payloadAtStart: payload,
        });
    }

    public override ExecuteForEachIterations(
        ctx: AgentRunContext,
        forEach: ForEachOperation,
        collection: unknown[],
        initialPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<ForEachLoopResults> {
        const executionMode = forEach.executionMode || 'sequential';
        if (executionMode === 'parallel') {
            return this.executeForEachIterationsParallel(ctx, forEach, collection, initialPayload, parentStepId, params, config);
        }
        return this.executeForEachIterationsSequential(ctx, forEach, collection, initialPayload, parentStepId, params, config);
    }

    private async executeForEachIterationsSequential(
        ctx: AgentRunContext,
        forEach: ForEachOperation,
        collection: unknown[],
        initialPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<ForEachLoopResults> {
        const resumedCursor =
            ctx.PendingLoopCursorToResume?.LoopType === 'ForEach' ? ctx.PendingLoopCursorToResume : null;
        if (resumedCursor) {
            ctx.PendingLoopCursorToResume = null;
        }
        let currentPayload =
            resumedCursor && resumedCursor.WorkingPayload !== undefined ? resumedCursor.WorkingPayload : initialPayload;
        const maxIterations = forEach.maxIterations ?? ctx.Hooks.ResolvedLimits(params).ForEachMaxIterations;
        const results: BaseAgentNextStep[] = resumedCursor
            ? resumedCursor.CompletedItemResults.map(item => {
                  if (IsPlainObject(item) && typeof item['step'] === 'string') {
                      return {
                          step: item['step'] as BaseAgentNextStep['step'],
                          terminate: item['terminate'] === true,
                          previousPayload: item['previousPayload'],
                          newPayload: item['newPayload'],
                          priorStepResult: item['priorStepResult'],
                      };
                  }
                  return { step: 'Retry' as const, terminate: false, newPayload: item };
              })
            : [];
        const errors: LoopIterationError[] = [];
        const startIndex = resumedCursor ? Math.max(0, resumedCursor.IterationIndex) : 0;
        const loopDecision: BaseAgentNextStep = {
            step: 'ForEach',
            forEach,
            terminate: false,
            previousPayload: initialPayload,
            newPayload: currentPayload,
        };
        let prevTokensTotal = ctx.Hooks.CalculateTokenStats().TotalTokens;

        for (let i = startIndex; i < Math.min(collection.length, maxIterations); i++) {
            const prePaused = await ctx.Hooks.CheckInlineLoopIterationGovernance({
                LoopType: 'ForEach',
                ParentStepID: parentStepId,
                NextIndex: i,
                CompletedResults: results,
                WorkingPayload: currentPayload,
                LoopDecision: { ...loopDecision, newPayload: currentPayload },
                Params: params,
                DelayBetweenIterationsMs: forEach.delayBetweenIterationsMs,
                ContinueOnError: forEach.continueOnError,
            });
            if (prePaused) {
                return { results, errors, finalPayload: currentPayload };
            }

            if (i > startIndex && forEach.delayBetweenIterationsMs) {
                await new Promise(resolve => setTimeout(resolve, forEach.delayBetweenIterationsMs));
            }

            const iterResult = await ctx.Hooks.ExecuteSingleForEachIteration(
                forEach,
                collection[i],
                i,
                currentPayload,
                parentStepId,
                params,
                config
            );

            if (iterResult.error) {
                errors.push(iterResult.error);
                if (!forEach.continueOnError) break;
            } else if (iterResult.result) {
                results.push(iterResult.result);
                currentPayload = iterResult.payload;
            }

            const nowTokens = ctx.Hooks.CalculateTokenStats().TotalTokens;
            const tokensDelta = Math.max(0, nowTokens - prevTokensTotal);
            prevTokensTotal = nowTokens;

            const postPaused = await ctx.Hooks.CheckInlineLoopIterationGovernance({
                LoopType: 'ForEach',
                ParentStepID: parentStepId,
                NextIndex: i + 1,
                CompletedResults: results,
                WorkingPayload: currentPayload,
                LoopDecision: { ...loopDecision, newPayload: currentPayload },
                Params: params,
                RecordProgressSample: true,
                LastIterResult: iterResult.result ?? {
                    step: 'Failed',
                    terminate: false,
                    errorMessage: iterResult.error?.message,
                },
                TokensDelta: tokensDelta,
                DelayBetweenIterationsMs: forEach.delayBetweenIterationsMs,
                ContinueOnError: forEach.continueOnError,
                TotalItems: Math.min(collection.length, maxIterations),
            });
            if (postPaused) {
                return { results, errors, finalPayload: currentPayload };
            }
        }

        return { results, errors, finalPayload: currentPayload };
    }

    private async executeForEachIterationsParallel(
        ctx: AgentRunContext,
        forEach: ForEachOperation,
        collection: unknown[],
        initialPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<ForEachLoopResults> {
        const limits = ctx.Hooks.ResolvedLimits(params);
        const maxIterations = forEach.maxIterations ?? limits.ForEachMaxIterations;
        const maxConcurrency = forEach.maxConcurrency ?? limits.ResourceGuards.MaxLoopConcurrency;
        const itemsToProcess = Math.min(collection.length, maxIterations);

        const batches = ctx.StepDispatcher.CreateBatches(collection.slice(0, itemsToProcess), maxConcurrency);

        const allResults: Array<{
            index: number;
            result?: BaseAgentNextStep;
            error?: LoopIterationError;
            payload?: unknown;
            appliedFolds?: Array<{ output: Record<string, unknown>; mapping: string }>;
        }> = [];

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            const batchPromises = batch.map(({ item, index }) =>
                ctx.Hooks.ExecuteSingleForEachIteration(
                    forEach,
                    item,
                    index,
                    initialPayload,
                    parentStepId,
                    params,
                    config
                ).then(iterResult => ({
                    index,
                    result: iterResult.result,
                    error: iterResult.error,
                    payload: iterResult.payload,
                    appliedFolds: iterResult.appliedFolds,
                }))
            );

            const batchResults = await Promise.all(batchPromises);
            allResults.push(...batchResults);

            if (forEach.delayBetweenIterationsMs && batchIndex < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, forEach.delayBetweenIterationsMs));
            }

            const hasFailure = batchResults.some(r => r.error);
            if (hasFailure && !forEach.continueOnError) {
                break;
            }
        }

        allResults.sort((a, b) => a.index - b.index);
        return this.ApplyForEachResultsSequentially(ctx, allResults, initialPayload, forEach.continueOnError || false);
    }

    public override ExecuteSingleForEachIteration(
        ctx: AgentRunContext,
        forEach: ForEachOperation,
        item: unknown,
        index: number,
        currentPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<ForEachIterationResult> {
        return this._body.ExecuteSingleForEachIteration(
            ctx,
            forEach,
            item,
            index,
            currentPayload,
            parentStepId,
            params,
            config
        );
    }

    private async completeForEachLoop(
        ctx: AgentRunContext,
        forEach: ForEachOperation,
        loopStepEntity: MJAIAgentRunStepEntityExtended,
        loopResults: ForEachLoopResults,
        previousDecision: BaseAgentNextStep,
        params: ExecuteAgentParams
    ): Promise<BaseAgentNextStep> {
        loopStepEntity.PayloadAtEnd = ctx.Hooks.SerializePayloadAtEnd(loopResults.finalPayload);
        await ctx.Hooks.FinalizeStepEntity(
            loopStepEntity,
            loopResults.errors.length === 0,
            this.FormatLoopErrors(ctx, loopResults.errors),
            loopResults
        );

        if (ctx.AgentTypeInstance?.InjectLoopResultsAsMessage) {
            this._body.InjectLoopResultsMessage(
                ctx,
                'ForEach',
                forEach.collectionPath,
                loopResults.results,
                loopResults.errors,
                params,
                this._body.GetLoopActionNames(forEach)
            );
        }

        return {
            step: 'Retry',
            retryInstructions: `Completed ForEach loop request using collection at '${forEach.collectionPath}'`,
            terminate: false,
            newPayload: loopResults.finalPayload,
            previousPayload: previousDecision.previousPayload,
        };
    }

    // --- While loop orchestration ---

    public override async ExecuteWhileLoop(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const whileOp = previousDecision.while as WhileOperation;
        if (!whileOp) {
            return ctx.StepDispatcher.CreateFailedStep('While configuration missing', previousDecision);
        }

        const loopActionNames = this._body.GetLoopActionNames(whileOp);
        const agentId = params.agent?.ID ?? ctx.AgentRun?.AgentID ?? '';
        const validationMessage = this._body.ValidateWhileOperation(ctx, whileOp, agentId);
        if (validationMessage) {
            return this._body.FailLoopBeforeFirstIteration(
                ctx,
                'While',
                whileOp.condition,
                `While configuration invalid: ${validationMessage}`,
                previousDecision,
                params,
                loopActionNames
            );
        }

        const currentPayload = previousDecision.newPayload || previousDecision.previousPayload;
        const loopStepEntity = await this.createWhileLoopStep(ctx, whileOp, currentPayload, params);
        const loopResults = await this.ExecuteWhileIterations(
            ctx,
            whileOp,
            currentPayload,
            loopStepEntity.ID,
            params,
            config
        );

        if (ctx.PausedRunOutcome) {
            return {
                step: 'Success',
                terminate: true,
                previousPayload: currentPayload,
                newPayload: loopResults.finalPayload,
                message: ctx.PausedRunOutcome.PauseResult.Checkpoint.Summary,
            };
        }

        return this.CompleteWhileLoop(ctx, whileOp, loopStepEntity, loopResults, previousDecision, params);
    }

    private createWhileLoopStep(
        ctx: AgentRunContext,
        whileOp: WhileOperation,
        payload: unknown,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        return ctx.Hooks.CreateStepEntity({
            stepType: 'While',
            stepName: `While: ${whileOp.condition}`,
            contextUser: params.contextUser,
            inputData: { while: whileOp },
            payloadAtStart: payload,
        });
    }

    public override async ExecuteWhileIterations(
        ctx: AgentRunContext,
        whileOp: WhileOperation,
        initialPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<WhileLoopResults> {
        const resumedCursor =
            ctx.PendingLoopCursorToResume?.LoopType === 'While' ? ctx.PendingLoopCursorToResume : null;
        if (resumedCursor) {
            ctx.PendingLoopCursorToResume = null;
        }
        let currentPayload =
            resumedCursor && resumedCursor.WorkingPayload !== undefined ? resumedCursor.WorkingPayload : initialPayload;
        const maxIterations = whileOp.maxIterations ?? ctx.Hooks.ResolvedLimits(params).WhileLoopMaxIterations;
        const results: BaseAgentNextStep[] = resumedCursor
            ? resumedCursor.CompletedItemResults.map(item => {
                  if (IsPlainObject(item) && typeof item['step'] === 'string') {
                      return {
                          step: item['step'] as BaseAgentNextStep['step'],
                          terminate: item['terminate'] === true,
                          previousPayload: item['previousPayload'],
                          newPayload: item['newPayload'],
                          priorStepResult: item['priorStepResult'],
                      };
                  }
                  return { step: 'Retry' as const, terminate: false, newPayload: item };
              })
            : [];
        const errors: LoopIterationError[] = [];
        const startIndex = resumedCursor ? Math.max(0, resumedCursor.IterationIndex) : 0;
        let iterationCount = startIndex;
        let conditionError: string | undefined;
        const loopDecision: BaseAgentNextStep = {
            step: 'While',
            while: whileOp,
            terminate: false,
            previousPayload: initialPayload,
            newPayload: currentPayload,
        };
        let prevTokensTotal = ctx.Hooks.CalculateTokenStats().TotalTokens;

        const evaluator = new SafeExpressionEvaluator();

        while (iterationCount < maxIterations) {
            const prePaused = await ctx.Hooks.CheckInlineLoopIterationGovernance({
                LoopType: 'While',
                ParentStepID: parentStepId,
                NextIndex: iterationCount,
                CompletedResults: results,
                WorkingPayload: currentPayload,
                LoopDecision: { ...loopDecision, newPayload: currentPayload },
                Params: params,
                DelayBetweenIterationsMs: whileOp.delayBetweenIterationsMs,
                ContinueOnError: whileOp.continueOnError,
            });
            if (prePaused) {
                return { results, errors, finalPayload: currentPayload, iterations: iterationCount, conditionError };
            }

            if (iterationCount > startIndex && whileOp.delayBetweenIterationsMs) {
                await new Promise(resolve => setTimeout(resolve, whileOp.delayBetweenIterationsMs));
            }

            const evalResult = evaluator.evaluate(whileOp.condition, { payload: currentPayload, results, errors });
            if (!evalResult.success) {
                conditionError = `While condition '${whileOp.condition}' could not be evaluated: ${evalResult.error ?? 'unknown error'}`;
                errors.push({ index: iterationCount, message: conditionError });
                break;
            }
            if (!evalResult.value) {
                break;
            }

            const attemptContext = { attemptNumber: iterationCount + 1, totalAttempts: iterationCount };
            const iterResult = await ctx.Hooks.ExecuteSingleWhileIteration(
                whileOp,
                attemptContext,
                iterationCount,
                currentPayload,
                parentStepId,
                params,
                config
            );

            if (iterResult.error) {
                errors.push(iterResult.error);
                if (!whileOp.continueOnError) break;
            } else if (iterResult.result) {
                results.push(iterResult.result);
                currentPayload = iterResult.payload;
            }

            iterationCount++;

            const nowTokens = ctx.Hooks.CalculateTokenStats().TotalTokens;
            const tokensDelta = Math.max(0, nowTokens - prevTokensTotal);
            prevTokensTotal = nowTokens;

            const postPaused = await ctx.Hooks.CheckInlineLoopIterationGovernance({
                LoopType: 'While',
                ParentStepID: parentStepId,
                NextIndex: iterationCount,
                CompletedResults: results,
                WorkingPayload: currentPayload,
                LoopDecision: { ...loopDecision, newPayload: currentPayload },
                Params: params,
                RecordProgressSample: true,
                LastIterResult: iterResult.result ?? {
                    step: 'Failed',
                    terminate: false,
                    errorMessage: iterResult.error?.message,
                },
                TokensDelta: tokensDelta,
                DelayBetweenIterationsMs: whileOp.delayBetweenIterationsMs,
                ContinueOnError: whileOp.continueOnError,
            });
            if (postPaused) {
                return { results, errors, finalPayload: currentPayload, iterations: iterationCount, conditionError };
            }
        }

        return { results, errors, finalPayload: currentPayload, iterations: iterationCount, conditionError };
    }

    public override ExecuteSingleWhileIteration(
        ctx: AgentRunContext,
        whileOp: WhileOperation,
        attemptContext: { attemptNumber: number; totalAttempts: number },
        index: number,
        currentPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<WhileIterationResult> {
        return this._body.ExecuteSingleWhileIteration(
            ctx,
            whileOp,
            attemptContext,
            index,
            currentPayload,
            parentStepId,
            params,
            config
        );
    }

    public override async CompleteWhileLoop(
        ctx: AgentRunContext,
        whileOp: WhileOperation,
        loopStepEntity: MJAIAgentRunStepEntityExtended,
        loopResults: WhileLoopResults,
        previousDecision: BaseAgentNextStep,
        params: ExecuteAgentParams
    ): Promise<BaseAgentNextStep> {
        loopStepEntity.PayloadAtEnd = ctx.Hooks.SerializePayloadAtEnd(loopResults.finalPayload);

        await ctx.Hooks.FinalizeStepEntity(
            loopStepEntity,
            loopResults.errors.length === 0,
            this.FormatLoopErrors(ctx, loopResults.errors),
            loopResults
        );

        if (ctx.AgentTypeInstance?.InjectLoopResultsAsMessage) {
            this._body.InjectLoopResultsMessage(
                ctx,
                'While',
                whileOp.condition,
                loopResults.results,
                loopResults.errors,
                params,
                this._body.GetLoopActionNames(whileOp)
            );
        }

        if (loopResults.conditionError && loopResults.iterations === 0) {
            return ctx.StepDispatcher.CreateFailedStep(loopResults.conditionError, previousDecision);
        }

        const retryInstructions = loopResults.conditionError
            ? `While loop request using condition '${whileOp.condition}' stopped after ${loopResults.iterations} iteration(s): ${loopResults.conditionError}`
            : `Completed While loop request using condition '${whileOp.condition}' after ${loopResults.iterations} iteration(s)`;
        return {
            step: 'Retry',
            retryInstructions,
            terminate: false,
            newPayload: loopResults.finalPayload,
            previousPayload: previousDecision.previousPayload,
        };
    }
}
