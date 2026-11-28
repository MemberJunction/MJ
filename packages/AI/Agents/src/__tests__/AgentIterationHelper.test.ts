/**
 * Dedicated interface-level unit tests for Slice s5 (`BaseAgentIterationHelper` / `AgentIterationHelper`
 * & `AgentLoopBodyExecutor`).
 * Exercises bounded-concurrency mapping, template/path resolution, ForEach & While loop validation,
 * sequential & parallel execution, governance pausing & cursor resumption, multi-step loop bodies,
 * output folding, pipeline execution, and `@RegisterClass` replacement-helper compliance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type {
    BaseAgentNextStep,
    ExecuteAgentParams,
    ForEachOperation,
    MJAIAgentEntityExtended,
    MJAIAgentRunStepEntityExtended,
    WhileOperation,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import type { BaseAgentType } from '../agent-types/base-agent-type';
import { AgentHelperCache, ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import type { PausedRunOutcome } from '../helpers/base-agent-types';
import { AgentIterationHelper } from '../helpers/iteration/AgentIterationHelper';
import { BaseAgentIterationHelper } from '../helpers/iteration/BaseAgentIterationHelper';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
    const partial: Partial<UserInfo> = { ID: 'u-iter-1', Name: 'Loop Tester', ...overrides };
    return partial as UserInfo;
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const partial: Partial<MJAIAgentEntityExtended> = {
        ID: 'a-iter-1',
        Name: 'LoopAgent',
        ...overrides,
    };
    return partial as MJAIAgentEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgent(),
        conversationMessages: [],
        contextUser: makeUser(),
        ...overrides,
    };
}

function makeStepEntity(id: string = 'loop-step-1'): MJAIAgentRunStepEntityExtended {
    const partial: Partial<MJAIAgentRunStepEntityExtended> = { ID: id, StepNumber: 1 };
    return partial as MJAIAgentRunStepEntityExtended;
}

function makePausedOutcome(summary: string): PausedRunOutcome {
    const checkpoint: Partial<PausedRunOutcome['PauseResult']['Checkpoint']> = {
        CheckpointID: 'chk-1',
        AgentRunID: 'run-1',
        PauseReason: 'ManualPause',
        Summary: summary,
        CompletedPromptTurns: 1,
        InFlightPayload: {},
    };
    const pauseResult: Partial<PausedRunOutcome['PauseResult']> = {
        Saved: true,
        Checkpoint: checkpoint as PausedRunOutcome['PauseResult']['Checkpoint'],
    };
    return {
        PauseReason: 'ManualPause',
        Payload: {},
        PausePersistencePending: false,
        PauseResult: pauseResult as PausedRunOutcome['PauseResult'],
    };
}

function makeActionResult(overrides: Partial<ActionResult> = {}): ActionResult {
    const partial: Partial<ActionResult> = {
        Success: true,
        Message: 'ok',
        Params: [],
        ...overrides,
    };
    return partial as ActionResult;
}

@RegisterClass(BaseAgentIterationHelper, 'TestCustomIterationHelper')
class TestCustomIterationHelper extends AgentIterationHelper {
    public override GetValueFromPath(_ctx: AgentRunContext, _obj: unknown, path: string): unknown {
        return `custom:${path}`;
    }
}

describe('AgentIterationHelper (Slice s5)', () => {
    const helper = new AgentIterationHelper();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves default AgentIterationHelper and throws on unimplemented BaseAgentIterationHelper token methods', () => {
        const resolved = ResolveAgentHelper({
            SeamKey: 'iteration',
            BaseClass: BaseAgentIterationHelper,
            DefaultClass: AgentIterationHelper,
        });
        expect(resolved).toBeInstanceOf(AgentIterationHelper);

        const baseToken = new BaseAgentIterationHelper();
        const ctx = CreateMockAgentRunContext();
        expect(() => baseToken.GetValueFromPath(ctx, {}, 'a')).toThrow(/must be implemented/);
        expect(() => baseToken.ResolveLoopParams(ctx, {}, {}, 0, {})).toThrow(/must be implemented/);
        expect(() => baseToken.FormatLoopErrors(ctx, [])).toThrow(/must be implemented/);
    });

    it('supports custom @RegisterClass(BaseAgentIterationHelper) replacement override via ResolveAgentHelper and AgentHelperCache', () => {
        expect(TestCustomIterationHelper).toBeDefined();
        const resolved = ResolveAgentHelper({
            SeamKey: 'iteration',
            BaseClass: BaseAgentIterationHelper,
            DefaultClass: AgentIterationHelper,
            DriverClass: 'TestCustomIterationHelper',
        });
        expect(resolved).toBeInstanceOf(TestCustomIterationHelper);
        expect(resolved.GetValueFromPath(CreateMockAgentRunContext(), {}, 'a.b')).toBe('custom:a.b');

        const cache = new AgentHelperCache();
        cache.ResetForRun([{ seam: 'iteration', driverClass: 'TestCustomIterationHelper' }]);
        expect(
            cache.GetOrResolve({
                SeamKey: 'iteration',
                BaseClass: BaseAgentIterationHelper,
                DefaultClass: AgentIterationHelper,
            })
        ).toBeInstanceOf(TestCustomIterationHelper);
    });

    it('maps items with bounded concurrency preserving order, clamping invalid limits, and propagating rejections', async () => {
        const ctx = CreateMockAgentRunContext();

        expect(await helper.MapWithConcurrency(ctx, [], 3, async (x: number) => x)).toEqual([]);

        let active = 0;
        let maxActive = 0;
        const out = await helper.MapWithConcurrency(ctx, [1, 2, 3, 4, 5], 2, async (n) => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((r) => setTimeout(r, (6 - n) * 2));
            active--;
            return n * 10;
        });
        expect(out).toEqual([10, 20, 30, 40, 50]);
        expect(maxActive).toBeLessThanOrEqual(2);

        // limit <= 0 clamps safely to 1
        const clamped = await helper.MapWithConcurrency(ctx, ['a', 'b'], 0, async (s, i) => `${s}-${i}`);
        expect(clamped).toEqual(['a-0', 'b-1']);

        // Worker error propagates
        await expect(
            helper.MapWithConcurrency(ctx, [1, 2], 2, async (n) => {
                if (n === 2) throw new Error('worker failed');
                return n;
            })
        ).rejects.toThrow('worker failed');
    });

    it('resolves loop parameters for item.*, payload.*, item, index, static values, and primitives', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetValueFromPath: (obj, path) => helper.GetValueFromPath(ctx, obj, path),
            },
        });

        const resolved = helper.ResolveLoopParams(
            ctx,
            {
                id: 'item.meta.id',
                missing: 'item.nonexistent.field',
                whole: 'item',
                idx: 'index',
                org: 'payload.org.name',
                mode: 'static',
                num: 42,
                flag: true,
            },
            { meta: { id: 'rec-9' } },
            3,
            { org: { name: 'Acme' } }
        );

        expect(resolved).toEqual({
            id: 'rec-9',
            missing: undefined,
            whole: { meta: { id: 'rec-9' } },
            idx: 3,
            org: 'Acme',
            mode: 'static',
            num: 42,
            flag: true,
        });
    });

    it('resolves nested templates, inline expressions, and deep paths cleanly', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetValueFromPath: (obj, path) => helper.GetValueFromPath(ctx, obj, path),
                ResolveValueFromContext: (val, c, iv) => helper.ResolveValueFromContext(ctx, val, c, iv),
                ResolveInlineTemplateExpressions: (tpl, c, iv) => helper.ResolveInlineTemplateExpressions(ctx, tpl, c, iv),
                ResolveTemplates: (obj, c, iv) => helper.ResolveTemplates(ctx, obj, c, iv),
            },
        });

        expect(helper.GetValueFromPath(ctx, { a: { b: { c: 'deep' } } }, 'a.b.c')).toBe('deep');
        expect(helper.GetValueFromPath(ctx, null, 'a.b')).toBeUndefined();

        const resolved = helper.ResolveTemplates(
            ctx,
            {
                title: 'Order {{order.id}} for {{payload.customer}}',
                nested: { rawId: 'order.id' },
            },
            { item: { id: 'ORD-7' }, payload: { customer: 'Ada' }, index: 0 },
            'order'
        );
        expect(resolved.title).toBe('Order ORD-7 for Ada');
        expect((resolved.nested as Record<string, unknown>).rawId).toBe('ORD-7');
    });

    it('extracts ForEach collection stripping payload. prefix and handling empty arrays and non-arrays', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetValueFromPath: (obj, path) => helper.GetValueFromPath(ctx, obj, path),
            },
        });

        expect(helper.GetCollectionFromPayload(ctx, { items: ['a', 'b'] }, 'payload.items')).toEqual(['a', 'b']);
        expect(helper.GetCollectionFromPayload(ctx, { nested: { list: [] } }, 'nested.list')).toEqual([]);
        expect(helper.GetCollectionFromPayload(ctx, { items: 'not-array' }, 'items')).toBeNull();
        expect(helper.GetCollectionFromPayload(ctx, {}, 'missing.path')).toBeNull();
    });

    it('validates ForEach headers, While operations, and loop body operations including prompt-body rejection', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ValidateActionInAgent: (name) => (name === 'ValidAction' ? null : `Unknown action '${name}'`),
                ValidateSubAgentInAgent: (name) => (name === 'ValidSub' ? null : `Unknown sub-agent '${name}'`),
            },
        });

        expect(helper.ValidateForEachHeader(ctx, { collectionPath: 'items', itemVariable: 'item', action: { name: 'ValidAction', params: {} } })).toBeNull();
        expect(helper.ValidateForEachHeader(ctx, { collectionPath: '', itemVariable: 'item', action: { name: 'ValidAction', params: {} } })).toBeTruthy();

        const promptOp: ForEachOperation = {
            collectionPath: 'items',
            itemVariable: 'item',
            prompt: { name: 'DoWorkPrompt' },
        };
        const promptBodyErr = helper.ValidateLoopBodyOperation(
            ctx,
            'ForEach',
            promptOp,
            'a1'
        );
        expect(promptBodyErr).toContain('only supported in durable TaskGraph');

        expect(helper.ValidateLoopBodyOperation(ctx, 'ForEach', { collectionPath: 'items', itemVariable: 'item', action: { name: 'ValidAction', params: {} } }, 'a1')).toBeNull();
        expect(helper.ValidateLoopBodyOperation(ctx, 'ForEach', { collectionPath: 'items', itemVariable: 'item', action: { name: 'BadAction', params: {} } }, 'a1')).toContain("Unknown action 'BadAction'");
        expect(helper.ValidateLoopBodyOperation(ctx, 'While', { condition: 'payload.x < 2', itemVariable: 'attempt', subAgent: { name: 'BadSub', message: 'go' } }, 'a1')).toContain("Unknown sub-agent 'BadSub'");
        expect(helper.ValidateWhileOperation(ctx, { condition: 'payload.x < 2', itemVariable: 'attempt', action: { name: 'ValidAction', params: {} } }, 'a1')).toBeNull();
    });

    it('fails cleanly in ExecuteForEachLoop on missing config, non-array path, or invalid body and injects error when configured', async () => {
        const agentType: Partial<BaseAgentType> = { InjectLoopResultsAsMessage: true };
        const ctx = CreateMockAgentRunContext({
            AgentTypeInstance: agentType as BaseAgentType,
            Hooks: {
                GetValueFromPath: (obj, path) => helper.GetValueFromPath(ctx, obj, path),
                ValidateActionInAgent: () => 'Action not allowed',
            },
        });
        const params = makeParams();

        const missing = await helper.ExecuteForEachLoop(ctx, params, { success: true }, { step: 'ForEach', terminate: false, previousPayload: {}, newPayload: {} });
        expect(missing.step).toBe('Failed');
        expect(missing.errorMessage).toContain('ForEach configuration missing');

        const nonArray = await helper.ExecuteForEachLoop(ctx, params, { success: true }, {
            step: 'ForEach',
            terminate: false,
            previousPayload: { items: 'scalar' },
            newPayload: { items: 'scalar' },
            forEach: { collectionPath: 'items', itemVariable: 'item', action: { name: 'DoWork', params: {} } },
        });
        expect(nonArray.step).toBe('Failed');
        expect(nonArray.errorMessage).toContain('not an array');
        expect(params.conversationMessages).toHaveLength(1);

        const invalidBody = await helper.ExecuteForEachLoop(ctx, params, { success: true }, {
            step: 'ForEach',
            terminate: false,
            previousPayload: { items: [1] },
            newPayload: { items: [1] },
            forEach: { collectionPath: 'items', itemVariable: 'item', action: { name: 'Forbidden', params: {} } },
        });
        expect(invalidBody.step).toBe('Failed');
        expect(invalidBody.errorMessage).toContain('Action not allowed');
    });

    it('executes ExecuteForEachLoop sequentially end-to-end, finalizing step and injecting loop summary message', async () => {
        const stepEntity = makeStepEntity('foreach-step-1');
        const finalizeSpy = vi.fn(async () => undefined);
        const agentType: Partial<BaseAgentType> = { InjectLoopResultsAsMessage: true };
        const ctx = CreateMockAgentRunContext({
            AgentTypeInstance: agentType as BaseAgentType,
            Hooks: {
                GetValueFromPath: (obj, path) => helper.GetValueFromPath(ctx, obj, path),
                CreateStepEntity: vi.fn(async () => stepEntity),
                FinalizeStepEntity: finalizeSpy,
                ExecuteSingleForEachIteration: vi.fn(async (_op, item, _idx, payload) => {
                    const p = payload as { items: number[]; sum: number };
                    const next = { ...p, sum: p.sum + (item as number) };
                    return { payload: next, result: { step: 'Retry' as const, terminate: false, newPayload: next } };
                }),
            },
        });
        const params = makeParams();
        const decision: BaseAgentNextStep = {
            step: 'ForEach',
            terminate: false,
            previousPayload: { items: [2, 3, 5], sum: 0 },
            newPayload: { items: [2, 3, 5], sum: 0 },
            forEach: { collectionPath: 'items', itemVariable: 'item', action: { name: 'Add', params: {} } },
        };

        const out = await helper.ExecuteForEachLoop(ctx, params, { success: true }, decision);
        expect(out.step).toBe('Retry');
        expect(out.newPayload).toEqual({ items: [2, 3, 5], sum: 10 });
        expect(finalizeSpy).toHaveBeenCalledWith(stepEntity, true, '', expect.objectContaining({ finalPayload: { items: [2, 3, 5], sum: 10 } }));
        expect(params.conversationMessages).toHaveLength(1);
        expect(String(params.conversationMessages[0].content)).toContain('**Processed:** 3, **Errors:** 0');
    });

    it('honors maxIterations and continueOnError true vs false in sequential ExecuteForEachIterations', async () => {
        const execIter = vi.fn(async (_op: ForEachOperation, item: unknown, index: number, payload: unknown) => {
            if (index === 1) {
                return { error: { index, item, message: 'boom on item 1' } };
            }
            return { payload, result: { step: 'Retry' as const, terminate: false, newPayload: payload } };
        });
        const ctx = CreateMockAgentRunContext({ Hooks: { ExecuteSingleForEachIteration: execIter } });

        // continueOnError: false stops immediately at index 1
        const stopOnErr = await helper.ExecuteForEachIterations(
            ctx,
            { collectionPath: 'items', continueOnError: false, maxIterations: 10, action: { name: 'A', params: {} } },
            ['a', 'b', 'c'],
            {},
            'p1',
            makeParams(),
            { success: true }
        );
        expect(stopOnErr.results).toHaveLength(1);
        expect(stopOnErr.errors).toHaveLength(1);
        expect(execIter).toHaveBeenCalledTimes(2);

        execIter.mockClear();
        // continueOnError: true processes up to maxIterations=3 despite error at index 1
        const keepGoing = await helper.ExecuteForEachIterations(
            ctx,
            { collectionPath: 'items', continueOnError: true, maxIterations: 3, action: { name: 'A', params: {} } },
            ['a', 'b', 'c', 'd'],
            {},
            'p1',
            makeParams(),
            { success: true }
        );
        expect(keepGoing.results).toHaveLength(2);
        expect(keepGoing.errors).toHaveLength(1);
        expect(execIter).toHaveBeenCalledTimes(3);
    });

    it('pauses ForEach mid-loop on governance signal and resumes from PendingLoopCursorToResume', async () => {
        const visited: number[] = [];
        const pauseOutcome = makePausedOutcome('Paused at item 2');
        const ctx = CreateMockAgentRunContext({
            PendingLoopCursorToResume: {
                LoopType: 'ForEach',
                ParentStepID: 'p-1',
                IterationIndex: 1,
                CompletedItemResults: [{ step: 'Retry', terminate: false, newPayload: { acc: ['first'] } }],
                WorkingPayload: { acc: ['first'] },
            },
            Hooks: {
                CheckInlineLoopIterationGovernance: vi.fn(async (args) => {
                    if (args.NextIndex === 2 && args.RecordProgressSample) {
                        ctx.PausedRunOutcome = pauseOutcome;
                        return pauseOutcome;
                    }
                    return null;
                }),
                ExecuteSingleForEachIteration: vi.fn(async (_op, item, idx, payload) => {
                    visited.push(idx);
                    const p = payload as { acc: string[] };
                    const next = { acc: [...p.acc, String(item)] };
                    return { payload: next, result: { step: 'Retry' as const, terminate: false, newPayload: next } };
                }),
            },
        });

        const res = await helper.ExecuteForEachIterations(
            ctx,
            { collectionPath: 'items', action: { name: 'A', params: {} } },
            ['first', 'second', 'third'],
            { acc: [] },
            'p-1',
            makeParams(),
            { success: true }
        );

        expect(visited).toEqual([1]); // resumed at index 1, paused after index 1 before index 2
        expect(res.results).toHaveLength(2);
        expect(res.finalPayload).toEqual({ acc: ['first', 'second'] });
        expect(ctx.PendingLoopCursorToResume).toBeNull();
    });

    it('executes parallel ForEach batches with bounded concurrency, preserves index order, and stops on batch error', async () => {
        const execIter = vi.fn(async (_op: ForEachOperation, item: unknown, index: number, payload: unknown) => {
            if (index === 1) {
                return { error: { index, item, message: 'batch 1 err' } };
            }
            return {
                payload,
                result: { step: 'Retry' as const, terminate: false, newPayload: { val: item } },
                appliedFolds: [{ output: { v: item }, mapping: 'collected[]' }],
            };
        });
        const ctx = CreateMockAgentRunContext({ Hooks: { ExecuteSingleForEachIteration: execIter } });

        const res = await helper.ExecuteForEachIterations(
            ctx,
            {
                collectionPath: 'items',
                executionMode: 'parallel',
                maxConcurrency: 2,
                continueOnError: false,
                action: { name: 'A', params: {} },
            },
            ['x', 'y', 'z', 'w'],
            { collected: [] },
            'p-par',
            makeParams(),
            { success: true }
        );

        // First batch of 2 ran (indices 0, 1); index 1 errored with continueOnError=false -> batch 2 skipped
        expect(execIter).toHaveBeenCalledTimes(2);
        expect(res.errors).toHaveLength(1);
        expect(res.results).toHaveLength(1);
    });

    it('executes single ForEach iterations for action, sub-agent, multi-step conditional bodies, and missing-body error', async () => {
        const execActions = vi.fn(async (_p, step: BaseAgentNextStep) => ({
            step: 'Retry' as const,
            terminate: false,
            newPayload: step.newPayload,
            priorStepResult: [{ actionName: step.actions?.[0]?.name ?? 'Act', success: true, params: [{ Name: 'out', Type: 'Output', Value: 99 }], resultCode: 'SUCCESS', message: 'ok' }],
        }));
        const procSub = vi.fn(async (): Promise<BaseAgentNextStep> => ({ step: 'Retry', terminate: false, newPayload: { fromSub: true } }));
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetAvailableActionsForAgent: () => [{ ID: 'a1', Name: 'StepOne' } as MJActionEntityExtended, { ID: 'a2', Name: 'StepTwo' } as MJActionEntityExtended],
                ExecuteActionsStep: execActions,
                ProcessSubAgentStep: procSub as AgentRunContext['Hooks']['ProcessSubAgentStep'],
                ApplyLoopOutputFold: (base, out, mapping) => helper.ApplyLoopOutputFold(ctx, base, out, mapping),
            },
        });
        const params = makeParams();

        // Multi-step body where step 2 is skipped by false condition
        const stepsRes = await helper.ExecuteSingleForEachIteration(
            ctx,
            {
                collectionPath: 'items',
                steps: [
                    { id: 's1', name: 'StepOne', params: {}, outputMapping: 'results[]' },
                    { id: 's2', name: 'StepTwo', params: {}, condition: 'false' },
                ],
            },
            { id: 1 },
            0,
            { results: [] },
            'p1',
            params,
            { success: true }
        );
        expect(stepsRes.error).toBeUndefined();
        expect(execActions).toHaveBeenCalledTimes(1);

        // Sub-agent body
        const subRes = await helper.ExecuteSingleForEachIteration(
            ctx,
            { collectionPath: 'items', subAgent: { name: 'WorkerSub', message: 'do it' } },
            { id: 2 },
            0,
            {},
            'p1',
            params,
            { success: true }
        );
        expect(subRes.error).toBeUndefined();
        expect(procSub).toHaveBeenCalledTimes(1);

        // Missing action/steps/subAgent returns structured iteration error
        const missingBody = await helper.ExecuteSingleForEachIteration(
            ctx,
            { collectionPath: 'items' },
            { id: 3 },
            0,
            {},
            'p1',
            params,
            { success: true }
        );
        expect(missingBody.error?.message).toContain('ForEach missing action/steps/subAgent');
    });

    it('fails cleanly in ExecuteWhileLoop on missing/invalid config and returns paused Success step when PausedRunOutcome is set', async () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ValidateActionInAgent: () => null,
                CreateStepEntity: vi.fn(async () => makeStepEntity('while-1')),
                CheckInlineLoopIterationGovernance: vi.fn(async () => {
                    const p = makePausedOutcome('While paused');
                    ctx.PausedRunOutcome = p;
                    return p;
                }),
            },
        });
        const params = makeParams();

        const missing = await helper.ExecuteWhileLoop(ctx, params, { success: true }, { step: 'While', terminate: false });
        expect(missing.step).toBe('Failed');
        expect(missing.errorMessage).toContain('While configuration missing');

        const paused = await helper.ExecuteWhileLoop(ctx, params, { success: true }, {
            step: 'While',
            terminate: false,
            previousPayload: { count: 0 },
            newPayload: { count: 0 },
            while: { condition: 'payload.count < 5', itemVariable: 'attempt', action: { name: 'Tick', params: {} } },
        });
        expect(paused.step).toBe('Success');
        expect(paused.terminate).toBe(true);
        expect(paused.message).toBe('While paused');
    });

    it('executes While iterations until false, enforces maxIterations, surfaces syntax errors, and resumes from cursor', async () => {
        const execIter = vi.fn(async (_op: WhileOperation, _attempt: { attemptNumber: number; totalAttempts: number }, _idx: number, payload: unknown) => {
            const p = payload as { count: number };
            const next = { count: p.count + 1 };
            return { payload: next, result: { step: 'Retry' as const, terminate: false, newPayload: next } };
        });
        const ctx = CreateMockAgentRunContext({ Hooks: { ExecuteSingleWhileIteration: execIter } });
        const params = makeParams();

        const res = await helper.ExecuteWhileIterations(ctx, { condition: 'payload.count < 3', maxIterations: 10 }, { count: 0 }, 'step-1', params, { success: true });
        expect(res.iterations).toBe(3);
        expect(res.errors).toHaveLength(0);
        expect(res.finalPayload).toEqual({ count: 3 });

        // Enforces maxIterations cap even while condition stays true
        const capped = await helper.ExecuteWhileIterations(ctx, { condition: 'true', maxIterations: 2 }, { count: 0 }, 'step-cap', params, { success: true });
        expect(capped.iterations).toBe(2);

        // Surfaces condition syntax errors
        const bad = await helper.ExecuteWhileIterations(ctx, { condition: 'payload.count ??? bad', maxIterations: 5 }, { count: 0 }, 'step-2', params, { success: true });
        expect(bad.iterations).toBe(0);
        expect(bad.conditionError).toContain('could not be evaluated');
        expect(bad.errors).toHaveLength(1);

        // Resumes from PendingLoopCursorToResume
        ctx.PendingLoopCursorToResume = {
            LoopType: 'While',
            ParentStepID: 'step-3',
            IterationIndex: 2,
            CompletedItemResults: [],
            WorkingPayload: { count: 2 },
        };
        const resumed = await helper.ExecuteWhileIterations(ctx, { condition: 'payload.count < 3', maxIterations: 5 }, { count: 0 }, 'step-3', params, { success: true });
        expect(resumed.iterations).toBe(3);
        expect(resumed.finalPayload).toEqual({ count: 3 });
    });

    it('honors continueOnError in ExecuteWhileIterations and stops immediately when continueOnError is false', async () => {
        let calls = 0;
        const execIter = vi.fn(async (_op: WhileOperation, _attempt: { attemptNumber: number; totalAttempts: number }, idx: number, payload: unknown) => {
            calls++;
            if (calls === 1) {
                return { error: { index: idx, item: _attempt, message: 'transient error' } };
            }
            const p = payload as { count: number };
            return { payload: { count: p.count + 1 }, result: { step: 'Retry' as const, terminate: false, newPayload: { count: p.count + 1 } } };
        });
        const ctx = CreateMockAgentRunContext({ Hooks: { ExecuteSingleWhileIteration: execIter } });

        const stopped = await helper.ExecuteWhileIterations(
            ctx,
            { condition: 'payload.count < 2', maxIterations: 5, continueOnError: false },
            { count: 0 },
            'w1',
            makeParams(),
            { success: true }
        );
        expect(stopped.errors).toHaveLength(1);
        expect(stopped.iterations).toBe(0);

        calls = 0;
        const continued = await helper.ExecuteWhileIterations(
            ctx,
            { condition: 'payload.count < 1', maxIterations: 5, continueOnError: true },
            { count: 0 },
            'w2',
            makeParams(),
            { success: true }
        );
        expect(continued.errors).toHaveLength(1);
        expect(continued.iterations).toBe(2);
        expect(continued.finalPayload).toEqual({ count: 1 });
    });

    it('executes ExecuteSingleWhileIteration for action, sub-agent, and error-contained missing body', async () => {
        const execActions = vi.fn(async () => ({ step: 'Retry' as const, terminate: false, newPayload: { done: true } }));
        const procSub = vi.fn(async (): Promise<BaseAgentNextStep> => ({ step: 'Retry', terminate: false, newPayload: { subDone: true } }));
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetAvailableActionsForAgent: () => [{ ID: 'a1', Name: 'PollJob' } as MJActionEntityExtended],
                ExecuteActionsStep: execActions,
                ProcessSubAgentStep: procSub as AgentRunContext['Hooks']['ProcessSubAgentStep'],
            },
        });
        const params = makeParams();
        const attempt = { attemptNumber: 1, totalAttempts: 0 };

        const actRes = await helper.ExecuteSingleWhileIteration(ctx, { condition: 'true', action: { name: 'PollJob', params: {} } }, attempt, 0, {}, 'p1', params, { success: true });
        expect(actRes.payload).toEqual({ done: true });

        const subRes = await helper.ExecuteSingleWhileIteration(ctx, { condition: 'true', subAgent: { name: 'Checker', message: 'check' } }, attempt, 0, {}, 'p1', params, { success: true });
        expect(subRes.payload).toEqual({ subDone: true });

        const missing = await helper.ExecuteSingleWhileIteration(ctx, { condition: 'true' }, attempt, 0, {}, 'p1', params, { success: true });
        expect(missing.error?.message).toContain('While missing action/steps/subAgent');
    });

    it('handles CompleteWhileLoop across 0-iteration condition error, mid-loop condition error, and normal completion', async () => {
        const finalizeSpy = vi.fn(async () => undefined);
        const ctx = CreateMockAgentRunContext({ Hooks: { FinalizeStepEntity: finalizeSpy } });
        const params = makeParams();
        const whileOp: WhileOperation = { condition: 'payload.ok', action: { name: 'Tick', params: {} } };
        const prev: BaseAgentNextStep = { step: 'While', terminate: false, previousPayload: { ok: true } };

        const failedAtZero = await helper.CompleteWhileLoop(
            ctx,
            whileOp,
            makeStepEntity(),
            { results: [], errors: [{ index: 0, message: 'bad expr' }], finalPayload: {}, iterations: 0, conditionError: 'bad expr' },
            prev,
            params
        );
        expect(failedAtZero.step).toBe('Failed');
        expect(failedAtZero.errorMessage).toBe('bad expr');

        const midError = await helper.CompleteWhileLoop(
            ctx,
            whileOp,
            makeStepEntity(),
            { results: [{ step: 'Retry', terminate: false }], errors: [{ index: 1, message: 'null ref' }], finalPayload: { a: 1 }, iterations: 1, conditionError: 'null ref' },
            prev,
            params
        );
        expect(midError.step).toBe('Retry');
        expect(midError.retryInstructions).toContain('stopped after 1 iteration(s): null ref');

        const clean = await helper.CompleteWhileLoop(
            ctx,
            whileOp,
            makeStepEntity(),
            { results: [], errors: [], finalPayload: { done: true }, iterations: 2 },
            prev,
            params
        );
        expect(clean.step).toBe('Retry');
        expect(clean.retryInstructions).toContain('Completed While loop request');
    });

    it('formats loop errors/markdown, folds outputs, and resolves loop expiration metadata', () => {
        const ctx = CreateMockAgentRunContext({ PromptTurnCount: 4 });

        expect(helper.FormatLoopErrors(ctx, [])).toBe('');
        expect(helper.FormatLoopErrors(ctx, [{ index: 2, message: 'timeout' }])).toContain('timeout');

        const md = helper.FormatLoopResultsAsMarkdown(ctx, [{ step: 'Retry', terminate: false }], [{ index: 0, message: 'warn' }]);
        expect(md).toContain('warn');

        const folded = helper.ApplyLoopOutputFold(ctx, { items: [1] }, { id: 2 }, 'items[]');
        expect(Array.isArray(folded.items)).toBe(true);

        const meta = helper.ResolveLoopExpirationMetadata(ctx, makeParams(), ['Search']);
        expect(meta.turnAdded).toBe(4);
    });

    it('builds PipelineToolRegistry with taint tracking and runs ExecutePipelineAsStep handling success and audience failure', async () => {
        const actionEntity = { ID: 'act-1', Name: 'FetchFeed' } as MJActionEntityExtended;
        const execAction = vi.fn(async (): Promise<ActionResult> =>
            makeActionResult({
                Success: true,
                Message: 'fetched',
                Params: [{ Name: 'Rows', Type: 'Output', Value: [{ id: 1 }, { id: 2 }] }],
            })
        );
        const taintSpy = vi.fn();
        const finalizeSpy = vi.fn(async () => undefined);
        const stepEntity = makeStepEntity('pipe-step-1');

        const ctx = CreateMockAgentRunContext({
            PromptTurnCount: 2,
            Hooks: {
                GetEffectiveActionsForValidation: () => [actionEntity],
                ExecuteSingleAction: execAction,
                ResolveActionTrustLevel: () => 'Untrusted',
                RecordTaintedSource: taintSpy,
                CreateStepEntity: vi.fn(async () => stepEntity),
                FinalizeStepEntity: finalizeSpy,
                BuildPipelineRegistry: (p) => helper.BuildPipelineRegistry(ctx, p),
            },
        });
        const params = makeParams();

        const registry = helper.BuildPipelineRegistry(ctx, params);
        expect(registry.Resolve('FetchFeed')).toBeDefined();

        const okRes = await helper.ExecutePipelineAsStep(ctx, { steps: [{ tool: 'FetchFeed', args: {} }] }, params);
        expect(okRes.success).toBe(true);
        expect(taintSpy).toHaveBeenCalledWith(2, 'action:FetchFeed', 'Untrusted');
        expect(finalizeSpy).toHaveBeenCalledWith(stepEntity, true, undefined, expect.objectContaining({ success: true }));

        // Audience resolution error is contained as failed PipelineExecutionResult
        ctx.Hooks.AudienceReadersFor = vi.fn(async () => ({ Error: 'Audience policy denied' }));
        const errRes = await helper.ExecutePipelineAsStep(ctx, { steps: [{ tool: 'FetchFeed', args: {} }] }, params);
        expect(errRes.success).toBe(false);
        expect(errRes.error).toContain('Audience policy denied');
    });
});
