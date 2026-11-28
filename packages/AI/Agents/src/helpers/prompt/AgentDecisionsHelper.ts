/**
 * @fileoverview Collaborator owned by {@link AgentPromptHelper} encapsulating inline & Flow
 * decision requests, concurrency & per-turn call budgeting, forEach item evaluation,
 * and held decision lifecycle.
 *
 * @module @memberjunction/ai-agents
 */

import {
    SummarizeDecisionAnswers,
    type AgentDecisionRequest,
    type AgentDecisionResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { DecisionQuestion } from '@memberjunction/ai';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { LimitsConfigResolver, LogError } from '@memberjunction/core';
import _ from 'lodash';
import { AgentDecisionService, type DecisionQuestionMapping } from '../../AgentDecisionService';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    DecisionAnswerSummarizer,
    DecisionCallAllowance,
    DecisionLimitParam,
    DecisionOutcome,
} from '../base-agent-types';

/**
 * Collaborator handling inline & Flow decision execution, budgeting, and held decisions.
 */
export class AgentDecisionsHelper {
    // -------------------------------------------------------------------------
    // Inline & Flow Decision Requests + Held Decisions
    // -------------------------------------------------------------------------

    public async RunWithConcurrencyLimit<T, R>(
        items: T[],
        limit: number,
        fn: (item: T, index: number) => Promise<R>,
        onError: (error: unknown, item: T, index: number) => R
    ): Promise<R[]> {
        const results = new Array<R>(items.length);
        let next = 0;
        const worker = async (): Promise<void> => {
            while (next < items.length) {
                const index = next++;
                try {
                    results[index] = await fn(items[index], index);
                } catch (error) {
                    results[index] = onError(error, items[index], index);
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
        return results;
    }

    public async ExecuteDecisionRequestsAsSteps(
        ctx: AgentRunContext,
        requests: AgentDecisionRequest[],
        finalPayload: unknown,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams
    ): Promise<AgentDecisionResult[]> {
        const cap = this.DecisionRequestCap(agentTypePromptParams);
        const toRun = requests.slice(0, cap);
        const overCap = requests.slice(cap);
        if (overCap.length > 0) {
            ctx.Hooks.LogStatus(
                `[Decisions] ${requests.length} decision requests on one turn — answering the first ${cap}, skipping ${overCap.length} (per-turn cap)`,
                true,
                params
            );
        }
        const budget = this.DecisionCallBudget(agentTypePromptParams);
        const allowances = this.AllotDecisionCalls(ctx, toRun, finalPayload, agentTypePromptParams, budget, params);
        const results = await this.RunWithConcurrencyLimit(
            toRun,
            ctx.DecisionConcurrency,
            async (req, index) =>
                allowances[index].Wanted > 0 && allowances[index].Allowed === 0
                    ? this.OverBudgetDecisionResult(req, index, budget)
                    : ctx.Hooks.ExecuteSingleDecisionRequestAsStep(
                          req,
                          finalPayload,
                          agentTypePromptParams,
                          params,
                          allowances[index].Allowed
                      ),
            (error, req, index): AgentDecisionResult => ({
                id: this.DecisionRequestId(req, index),
                success: false,
                error: `The decision request failed: ${error instanceof Error ? error.message : String(error)}`,
            })
        );
        const skipped = overCap.map((req, i): AgentDecisionResult => ({
            id: this.DecisionRequestId(req, cap + i),
            success: false,
            error: `Not run: at most ${cap} decision requests are answered per turn. Ask again next turn if you still need it.`,
        }));
        return [...results, ...skipped];
    }

    public DecisionRequestCap(agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this.DecisionLimit(
            agentTypePromptParams,
            'decisionsMaxRequests',
            LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxDecisionRequestsPerTurn
        );
    }

    public DecisionCallBudget(agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this.DecisionLimit(
            agentTypePromptParams,
            'decisionsMaxCallsPerTurn',
            LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxDecisionCallsPerTurn
        );
    }

    public DecisionMaxItems(agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this.DecisionLimit(
            agentTypePromptParams,
            'decisionsMaxItems',
            LimitsConfigResolver.Resolve().Limits.Tuning.DecisionsMaxItems
        );
    }

    public DecisionLimit(
        agentTypePromptParams: Record<string, unknown> | undefined,
        name: DecisionLimitParam,
        fallback: number
    ): number {
        const configured = agentTypePromptParams?.[name];
        return typeof configured === 'number' && Number.isInteger(configured) && configured >= 0 ? configured : fallback;
    }

    public AllotDecisionCalls(
        ctx: AgentRunContext,
        requests: AgentDecisionRequest[],
        finalPayload: unknown,
        agentTypePromptParams: Record<string, unknown> | undefined,
        budget: number,
        params: ExecuteAgentParams
    ): DecisionCallAllowance[] {
        let remaining = budget;
        const allowances = requests.map((request): DecisionCallAllowance => {
            const wanted = this.DecisionCallsWanted(request, finalPayload, agentTypePromptParams);
            const allowed = Math.min(wanted, remaining);
            remaining -= allowed;
            return { Wanted: wanted, Allowed: allowed };
        });
        const cut = allowances.reduce((sum, allowance) => sum + allowance.Wanted - allowance.Allowed, 0);
        if (cut > 0) {
            ctx.Hooks.LogStatus(
                `[Decisions] The turn's decision requests want ${budget + cut} decision calls — making ${budget}, skipping ${cut} (per-turn call budget)`,
                true,
                params
            );
        }
        return allowances;
    }

    public DecisionCallsWanted(
        request: AgentDecisionRequest,
        finalPayload: unknown,
        agentTypePromptParams: Record<string, unknown> | undefined
    ): number {
        if (!request || typeof request !== 'object') {
            return 0;
        }
        if (!request.forEachItemIn) {
            return 1;
        }
        const target =
            typeof request.forEachItemIn === 'string'
                ? this.ResolvePayloadPath(request.forEachItemIn, finalPayload)
                : undefined;
        return Array.isArray(target) ? Math.min(target.length, this.DecisionMaxItems(agentTypePromptParams)) : 0;
    }

    public OverBudgetDecisionResult(request: AgentDecisionRequest, index: number, budget: number): AgentDecisionResult {
        const error =
            budget === 0
                ? "Not run: this agent's decision-call budget is 0 (decisionsMaxCallsPerTurn), so it makes no decision calls on any turn. Asking again will not help: carry on without the answer."
                : `Not run: one turn's decisions make at most ${budget} decision calls in total, counting each forEachItemIn item, and the requests before this one used them all. Ask again next turn if you still need it.`;
        return { id: this.DecisionRequestId(request, index), success: false, error };
    }

    public DecisionRequestId(request: AgentDecisionRequest, index: number): string {
        const id = request && typeof request === 'object' ? request.id : undefined;
        return typeof id === 'string' && id.length > 0 ? id : `request ${index + 1}`;
    }

    public async ExecuteDecisionStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        decision: BaseAgentNextStep<P>
    ): Promise<BaseAgentNextStep<P>> {
        const payload = decision.newPayload ?? decision.previousPayload;
        const promptParams = decision.decisionPromptName ? { decisionPromptName: decision.decisionPromptName } : undefined;
        const results = await this.RunWithConcurrencyLimit(
            decision.decisions ?? [],
            ctx.DecisionConcurrency,
            (request) =>
                ctx.Hooks.ExecuteSingleDecisionRequestAsStep(
                    request,
                    payload,
                    promptParams,
                    params,
                    Number.POSITIVE_INFINITY,
                    SummarizeDecisionAnswers
                ),
            (error, request, index): AgentDecisionResult => ({
                id: this.DecisionRequestId(request, index),
                success: false,
                error: `The decision request failed: ${error instanceof Error ? error.message : String(error)}`,
            })
        );
        return { step: 'Retry', terminate: false, decisionResults: results, previousPayload: payload, newPayload: payload };
    }

    public async ExecuteSingleDecisionRequestAsStep(
        ctx: AgentRunContext,
        request: AgentDecisionRequest,
        finalPayload: unknown,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams,
        callAllowance: number = Number.POSITIVE_INFINITY,
        summarize: DecisionAnswerSummarizer = AgentDecisionService.SummarizeAnswers
    ): Promise<AgentDecisionResult> {
        const step = await ctx.Hooks.CreateStepEntity({
            stepType: 'Decision',
            stepName: `Decision: ${request.id}`,
            contextUser: params.contextUser,
            inputData: {
                id: request.id,
                state: request.state,
                forEachItemIn: request.forEachItemIn,
                questions: request.questions,
            },
        });
        try {
            const mapping: DecisionQuestionMapping =
                request.questions && typeof request.questions === 'object'
                    ? AgentDecisionService.ToDecisionQuestions(request.questions)
                    : { Questions: {}, Invalid: [] };
            if (Object.keys(mapping.Questions).length === 0) {
                const error =
                    mapping.Invalid.length > 0
                        ? `No valid questions: ${mapping.Invalid.join('; ')}`
                        : 'At least one question is required';
                return await this.FinishDecisionStep(ctx, step, request, { Error: error });
            }
            if (mapping.Invalid.length > 0) {
                ctx.Hooks.LogStatus(
                    `[Decisions] "${request.id}": dropped ${mapping.Invalid.length} invalid question(s): ${mapping.Invalid.join('; ')}`,
                    true,
                    params
                );
            }
            const ask = this.DecisionAsker(ctx, mapping.Questions, agentTypePromptParams, params);
            const outcome = request.forEachItemIn
                ? await this.AskForEachItem(ctx, request, finalPayload, agentTypePromptParams, callAllowance, params, step, ask, summarize)
                : await this.AskOnce(ctx, request, finalPayload, step, ask, summarize);
            return await this.FinishDecisionStep(ctx, step, request, outcome, mapping.Invalid);
        } catch (error) {
            const message = `The decision request failed: ${error instanceof Error ? error.message : String(error)}`;
            return this.FinishDecisionStep(ctx, step, request, { Error: message });
        }
    }

    public DecisionAsker(
        ctx: AgentRunContext,
        questions: Record<string, DecisionQuestion>,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams
    ): (state: string) => Promise<AIDecisionRunResult> {
        const promptName =
            typeof agentTypePromptParams?.decisionPromptName === 'string'
                ? agentTypePromptParams.decisionPromptName
                : AgentDecisionService.DEFAULT_PROMPT_NAME;
        return (state: string): Promise<AIDecisionRunResult> =>
            ctx.AgentDecisionService.Ask({
                State: state,
                Questions: questions,
                ContextUser: params.contextUser,
                AgentID: params.agent?.ID ?? ctx.AgentRun?.AgentID,
                PromptName: promptName,
                CancellationToken: params.cancellationToken,
                ExecutionScope: ctx.Hooks.RunPromptExecutionScope(params),
            });
    }

    public async AskOnce(
        ctx: AgentRunContext,
        request: AgentDecisionRequest,
        finalPayload: unknown,
        step: MJAIAgentRunStepEntityExtended,
        ask: (state: string) => Promise<AIDecisionRunResult>,
        summarize: DecisionAnswerSummarizer
    ): Promise<DecisionOutcome> {
        const state = this.ResolveDecisionState(request.state, finalPayload);
        if ('Error' in state) {
            return state;
        }
        const result = await ask(state.State);
        ctx.Hooks.AttachDecisionPromptRun(step, result);
        if (!result.success) {
            return { Error: result.errorMessage || 'Decision evaluation failed' };
        }
        return { Answers: summarize(result.Answers), Results: [result] };
    }

    public async AskForEachItem(
        ctx: AgentRunContext,
        request: AgentDecisionRequest,
        finalPayload: unknown,
        agentTypePromptParams: Record<string, unknown> | undefined,
        callAllowance: number,
        params: ExecuteAgentParams,
        step: MJAIAgentRunStepEntityExtended,
        ask: (state: string) => Promise<AIDecisionRunResult>,
        summarize: DecisionAnswerSummarizer
    ): Promise<DecisionOutcome> {
        const target = this.ResolvePayloadPath(request.forEachItemIn ?? '', finalPayload);
        if (!Array.isArray(target)) {
            return { Error: `forEachItemIn target "${request.forEachItemIn}" is not an array` };
        }
        const maxItems = this.DecisionMaxItems(agentTypePromptParams);
        const limit = Math.min(maxItems, callAllowance);
        const items = target.slice(0, limit);
        const skippedCount = target.length > limit ? target.length - limit : undefined;
        if (skippedCount) {
            const why = limit < maxItems ? "the turn's decision-call budget" : 'decisionsMaxItems';
            ctx.Hooks.LogStatus(
                `[Decisions] "${request.forEachItemIn}" has ${target.length} items; asking the first ${limit} (${skippedCount} skipped: ${why})`,
                true,
                params
            );
        }
        const results = await this.RunWithConcurrencyLimit(
            items,
            ctx.DecisionConcurrency,
            (item, index) => this.AskItemAsStep(ctx, request, item, index, step, ask, params),
            (error): AIDecisionRunResult => ({
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error),
                Answers: {},
            })
        );
        const failedIndex = results.findIndex((r) => !r.success);
        if (failedIndex >= 0) {
            return { Error: `Item ${failedIndex}: ${results[failedIndex].errorMessage || 'decision evaluation failed'}` };
        }
        return { Answers: results.map((r) => summarize(r.Answers)), Results: results, SkippedCount: skippedCount };
    }

    public async AskItemAsStep(
        ctx: AgentRunContext,
        request: AgentDecisionRequest,
        item: unknown,
        index: number,
        parentStep: MJAIAgentRunStepEntityExtended,
        ask: (state: string) => Promise<AIDecisionRunResult>,
        params: ExecuteAgentParams
    ): Promise<AIDecisionRunResult> {
        const itemStep = await ctx.Hooks.CreateStepEntity({
            stepType: 'Decision',
            stepName: `Decision: ${request.id} (item ${index})`,
            contextUser: params.contextUser,
            inputData: { id: request.id, item: index },
            parentId: parentStep.ID,
        });
        let result: AIDecisionRunResult;
        try {
            result = await ask(this.DecisionStateText(item));
        } catch (error) {
            result = {
                success: false,
                errorMessage: `The decision call failed: ${error instanceof Error ? error.message : String(error)}`,
                Answers: {},
            };
        }
        ctx.Hooks.AttachDecisionPromptRun(itemStep, result);
        await ctx.Hooks.FinalizeStepEntity(
            itemStep,
            result.success,
            result.success ? undefined : result.errorMessage,
            result.success ? { answers: AgentDecisionService.SummarizeAnswers(result.Answers) } : undefined
        );
        return result;
    }

    public AttachDecisionPromptRun(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended,
        result: AIDecisionRunResult
    ): void {
        if (result.promptRun?.ID) {
            step.TargetLogID = result.promptRun.ID;
            step.PromptRun = result.promptRun;
        }
        if (result.promptRun) {
            ctx.Hooks.RecordPromptUsageInTreeBudget(result.promptRun, undefined, ctx.ExecuteParams);
        }
    }

    public LinkLateDecisionPromptRun(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended | undefined,
        late: Promise<AIDecisionRunResult | undefined>
    ): void {
        if (!step) {
            return;
        }
        late.then((result) => {
            const promptRunID = result?.promptRun?.ID;
            if (!result || !promptRunID || step.TargetLogID === promptRunID) {
                return;
            }
            ctx.Hooks.AttachDecisionPromptRun(step, result);
            ctx.Hooks.QueueStepSave(step, (s) => {
                s.TargetLogID = promptRunID;
            });
        }).catch((error) => {
            LogError(
                `Could not link a stopped decision call's prompt run to its step: ${error instanceof Error ? error.message : String(error)}`
            );
        });
    }

    public ResolveDecisionState(state: string | undefined, finalPayload: unknown): { State: string } | { Error: string } {
        if (typeof state !== 'string') {
            return { Error: 'Either state or forEachItemIn is required' };
        }
        if (state.trim() !== 'payload' && !state.startsWith('payload.')) {
            return { State: state };
        }
        const value = this.ResolvePayloadPath(state, finalPayload);
        return value === undefined
            ? { Error: `Path "${state}" not found in payload` }
            : { State: this.DecisionStateText(value) };
    }

    public ResolvePayloadPath(path: string, finalPayload: unknown): unknown {
        const trimmed = path.trim();
        if (trimmed === 'payload') {
            return finalPayload;
        }
        return _.get(finalPayload, trimmed.startsWith('payload.') ? trimmed.substring('payload.'.length) : trimmed);
    }

    public DecisionStateText(value: unknown): string {
        return typeof value === 'string'
            ? value
            : value !== null && typeof value === 'object'
            ? JSON.stringify(value, undefined, 1)
            : String(value ?? '');
    }

    public async FinishDecisionStep(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended,
        request: AgentDecisionRequest,
        outcome: DecisionOutcome,
        droppedQuestions: string[] = []
    ): Promise<AgentDecisionResult> {
        if ('Error' in outcome) {
            await ctx.Hooks.FinalizeStepEntity(step, false, outcome.Error, { error: outcome.Error });
            return { id: request.id, success: false, error: outcome.Error };
        }
        const first = outcome.Results[0];
        await ctx.Hooks.FinalizeStepEntity(step, true, undefined, {
            answers: outcome.Answers,
            skippedCount: outcome.SkippedCount,
            executionTimeMS: outcome.Results.reduce((sum, r) => sum + (r.executionTimeMS ?? 0), 0),
            tokensUsed: outcome.Results.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0),
            model: first?.DecisionResult?.ResolvedModel ?? first?.modelInfo?.modelName,
            promptRunId: first?.promptRun?.ID,
            driverClass: first?.DriverClass,
            ...(droppedQuestions.length > 0 && { droppedQuestions }),
        });
        return { id: request.id, success: true, answers: outcome.Answers, skippedCount: outcome.SkippedCount };
    }

    public async ProcessTurnDecisions(
        ctx: AgentRunContext,
        decisions: AgentDecisionRequest[],
        nextStep: BaseAgentNextStep,
        finalPayload: unknown,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams,
        finishIfActs: () => boolean
    ): Promise<void> {
        if (!ctx.Hooks.DecisionsEnabled(agentTypePromptParams)) {
            ctx.Hooks.LogStatus(
                `[Decisions] LLM requested decisions but decision-model use is off for this agent (decisionsEnabled is not true) — skipped`,
                true,
                params
            );
            return;
        }
        const responseTypeRules = agentTypePromptParams?.includeResponseTypeDefinition as Record<string, unknown> | undefined;
        if (responseTypeRules?.decisions === false) {
            ctx.Hooks.LogStatus(
                `[Decisions] LLM requested decisions but feature is disabled (includeResponseTypeDefinition.decisions=false) — skipped`,
                true,
                params
            );
            return;
        }
        if (!Array.isArray(decisions)) {
            ctx.Hooks.InjectDecisionResultsMessage(params, [
                { id: 'decisions', success: false, error: '"decisions" must be an array of decision requests' },
            ]);
            return;
        }
        const ids = decisions.map((d, i) => this.DecisionRequestId(d, i)).join(', ');
        const holdReason = this.DecisionsHoldReason(ctx, nextStep, finishIfActs);
        if (holdReason) {
            ctx.HeldDecisions = { Requests: decisions, Payload: finalPayload, PromptParams: agentTypePromptParams, Reason: holdReason };
            ctx.Hooks.LogStatus(
                `[Decisions] Holding ${decisions.length} decision request(s) (${ids}) until the step has run: ${holdReason}`,
                true,
                params
            );
            return;
        }
        ctx.Hooks.LogStatus(`[Decisions] LLM requested ${decisions.length} decision request(s): ${ids}`, true, params);
        const decisionResults = await ctx.Hooks.ExecuteDecisionRequestsAsSteps(decisions, finalPayload, agentTypePromptParams, params);
        ctx.Hooks.InjectDecisionResultsMessage(params, decisionResults);
    }

    public DecisionsHoldReason(ctx: AgentRunContext, step: BaseAgentNextStep, finishIfActs: () => boolean): string | undefined {
        const isSingleSubAgent = step.step === 'Sub-Agent' && !!step.subAgent && !step.subAgents?.length;
        if (step.finishIf && (step.step === 'Actions' || isSingleSubAgent) && finishIfActs()) {
            return `the ${step.step} step carries a finishIf gate, and a passing gate ends the run`;
        }
        if (step.step === 'Sub-Agent' && ctx.Hooks.GetRequestedSubAgents(step).some((r) => r.terminateAfter === true)) {
            return 'the Sub-Agent step has terminateAfter, which ends the run after it';
        }
        if ((step.step as string) === 'ClientTools' && step.terminate === true) {
            return 'the client tools were sent with taskComplete, which ends the run once they return';
        }
        return undefined;
    }

    public async RunHeldDecisions(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        const held = ctx.HeldDecisions;
        if (!held) {
            return;
        }
        ctx.HeldDecisions = undefined;
        ctx.Hooks.LogStatus(
            `[Decisions] The run continues, so answering ${held.Requests.length} held decision request(s)`,
            true,
            params
        );
        const results = await ctx.Hooks.ExecuteDecisionRequestsAsSteps(held.Requests, held.Payload, held.PromptParams, params);
        ctx.Hooks.InjectDecisionResultsMessage(params, results);
    }

    public SkipHeldDecisions(ctx: AgentRunContext, params: ExecuteAgentParams, runEnd: string): void {
        const held = ctx.HeldDecisions;
        if (!held) {
            return;
        }
        ctx.HeldDecisions = undefined;
        const ids = held.Requests.map((d, i) => this.DecisionRequestId(d, i)).join(', ');
        ctx.Hooks.LogStatus(
            `[Decisions] Skipped ${held.Requests.length} held decision request(s) (${ids}) without asking them: ${runEnd}, so no turn would read the answers (they were held because ${held.Reason})`,
            false,
            params
        );
    }

    public RunEndForHeldDecisions(ctx: AgentRunContext): string {
        switch (ctx.Hooks.DeriveRunOutcome()) {
            case 'cancelled':
                return 'the run was cancelled before they were asked';
            case 'failure':
                return 'the run failed before they were asked';
            default:
                return 'the run ended before they were asked';
        }
    }

}
