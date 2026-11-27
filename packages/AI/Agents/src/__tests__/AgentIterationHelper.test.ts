import { describe, expect, it, vi } from 'vitest';
import type { BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { AgentIterationHelper } from '../helpers/iteration/AgentIterationHelper';
import { BaseAgentIterationHelper } from '../helpers/iteration/BaseAgentIterationHelper';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('AgentIterationHelper (Slice s5)', () => {
    it('resolves default AgentIterationHelper via ClassFactory', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'iteration',
            BaseClass: BaseAgentIterationHelper,
            DefaultClass: AgentIterationHelper,
        });
        expect(helper).toBeInstanceOf(AgentIterationHelper);
    });

    it('maps items with bounded concurrency while preserving input order', async () => {
        const helper = new AgentIterationHelper();
        const ctx = CreateMockAgentRunContext();
        let active = 0;
        let maxActive = 0;

        const out = await helper.MapWithConcurrency(ctx, [1, 2, 3, 4, 5], 2, async (n) => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise(r => setTimeout(r, (6 - n) * 2));
            active--;
            return n * 10;
        });

        expect(out).toEqual([10, 20, 30, 40, 50]);
        expect(maxActive).toBeLessThanOrEqual(2);
    });

    it('resolves loop parameters for item.*, payload.*, item, index, and static values', () => {
        const helper = new AgentIterationHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetValueFromPath: (obj, path) => helper.GetValueFromPath(ctx, obj, path),
            },
        });

        const resolved = helper.ResolveLoopParams(
            ctx,
            {
                id: 'item.id',
                whole: 'item',
                idx: 'index',
                org: 'payload.org.name',
                mode: 'static',
            },
            { id: 'rec-9' },
            3,
            { org: { name: 'Acme' } }
        );

        expect(resolved).toEqual({
            id: 'rec-9',
            whole: { id: 'rec-9' },
            idx: 3,
            org: 'Acme',
            mode: 'static',
        });
    });

    it('extracts ForEach collection from payload stripping leading payload. prefix', () => {
        const helper = new AgentIterationHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetValueFromPath: (obj, path) => helper.GetValueFromPath(ctx, obj, path),
            },
        });

        expect(helper.GetCollectionFromPayload(ctx, { items: ['a', 'b'] }, 'payload.items')).toEqual(['a', 'b']);
        expect(helper.GetCollectionFromPayload(ctx, { items: 'not-array' }, 'items')).toBeNull();
    });

    it('executes While iterations until condition evaluates false and surfaces condition evaluation errors', async () => {
        const helper = new AgentIterationHelper();
        const execIter = vi.fn(async (_op, _attempt, idx, payload) => {
            const p = payload as { count: number };
            return {
                payload: { count: p.count + 1 },
                result: { step: 'Retry' as const, terminate: false, newPayload: { count: p.count + 1 } },
            };
        });
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ExecuteSingleWhileIteration: execIter,
            },
        });
        const params = { conversationMessages: [] } as unknown as ExecuteAgentParams;

        const res = await helper.ExecuteWhileIterations(
            ctx,
            { condition: 'payload.count < 3', maxIterations: 10 },
            { count: 0 },
            'step-1',
            params,
            {}
        );

        expect(res.iterations).toBe(3);
        expect(res.errors).toHaveLength(0);
        expect(res.finalPayload).toEqual({ count: 3 });
        expect(execIter).toHaveBeenCalledTimes(3);

        const bad = await helper.ExecuteWhileIterations(
            ctx,
            { condition: 'payload.count ??? bad syntax', maxIterations: 5 },
            { count: 0 },
            'step-2',
            params,
            {}
        );
        expect(bad.iterations).toBe(0);
        expect(bad.conditionError).toContain('could not be evaluated');
        expect(bad.errors).toHaveLength(1);
    });

    it('fails cleanly when ExecuteForEachLoop receives missing forEach config', async () => {
        const helper = new AgentIterationHelper();
        const ctx = CreateMockAgentRunContext();
        const params = { conversationMessages: [] } as unknown as ExecuteAgentParams;
        const decision: BaseAgentNextStep = {
            step: 'ForEach',
            terminate: false,
            previousPayload: {},
            newPayload: {},
        };

        const result = await helper.ExecuteForEachLoop(ctx, params, {}, decision);
        expect(result.step).toBe('Failed');
        expect(result.errorMessage).toContain('ForEach configuration missing');
    });
});
