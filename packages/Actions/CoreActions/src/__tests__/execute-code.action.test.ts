/**
 * Tests for ExecuteCodeAction — regression coverage for a memory leak (Memory Leak
 * Audit Round 5/6, Critical): the action used to call `new CodeExecutionService()`
 * on every run, forking a fresh worker-process pool that was never torn down. It now
 * delegates to `ExecuteCodeServiceProvider.Instance.GetService()`, a shared,
 * process-lifetime singleton, so repeated action runs must reuse one service instance
 * rather than constructing a new one each time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', () => {
    // Minimal BaseSingleton + ShutdownRegistry so ExecuteCodeServiceProvider (a real,
    // unmocked collaborator of ExecuteCodeAction) can construct itself.
    class BaseSingleton<T> {
        private static _cache = new Map<string, unknown>();
        protected constructor() {}
        protected static getInstance<U>(this: new () => U, className?: string): U {
            const key = className ?? (this as unknown as { name: string }).name;
            if (!BaseSingleton._cache.has(key)) {
                BaseSingleton._cache.set(key, new this());
            }
            return BaseSingleton._cache.get(key) as U;
        }
    }
    class ShutdownRegistry {
        static Instance = { Register: () => {} };
    }
    return {
        RegisterClass: () => (target: unknown) => target,
        BaseSingleton,
        ShutdownRegistry,
    };
});

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        public async Run(params: unknown): Promise<unknown> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (this as any).InternalRunAction(params);
        }
    },
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
}));

const { constructedCount, executeMock } = vi.hoisted(() => {
    const state = { constructedCount: 0 };
    const executeMock = vi.fn(async () => ({
        success: true,
        output: 'ok',
        logs: [] as string[],
        executionTimeMs: 1,
    }));
    return { constructedCount: state, executeMock };
});

vi.mock('@memberjunction/code-execution', () => ({
    CodeExecutionService: class CodeExecutionServiceStub {
        constructor() {
            constructedCount.constructedCount++;
        }
        async execute(...args: unknown[]) {
            return executeMock(...args);
        }
    },
}));

import { ExecuteCodeAction } from '../custom/code-execution/execute-code.action';

function buildParams(overrides: Record<string, unknown> = {}): RunActionParams {
    const values: Record<string, unknown> = {
        code: 'output = 1 + 1;',
        language: 'javascript',
        ...overrides,
    };
    return {
        Params: Object.entries(values)
            .filter(([, v]) => v !== undefined)
            .map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as unknown as RunActionParams;
}

describe('ExecuteCodeAction', () => {
    beforeEach(() => {
        executeMock.mockClear();
    });

    it('runs successfully and reports output', async () => {
        const action = new ExecuteCodeAction();
        const result = (await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> }).InternalRunAction(
            buildParams()
        )) as ActionResultSimple;

        expect(result.Success).toBe(true);
        expect(executeMock).toHaveBeenCalledTimes(1);
    });

    it('reuses the shared ExecuteCodeServiceProvider instead of constructing a new CodeExecutionService per run', async () => {
        const before = constructedCount.constructedCount;

        const action1 = new ExecuteCodeAction();
        const action2 = new ExecuteCodeAction();
        await (action1 as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> }).InternalRunAction(buildParams());
        await (action2 as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> }).InternalRunAction(buildParams());
        await (action1 as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> }).InternalRunAction(buildParams());

        // Three action runs (across two action instances) must not construct more
        // than one CodeExecutionService — this is the actual leak fix under test.
        expect(constructedCount.constructedCount - before).toBeLessThanOrEqual(1);
        expect(executeMock).toHaveBeenCalledTimes(3);
    });

    it('returns a validation error when code is missing, without touching the execution service', async () => {
        const before = constructedCount.constructedCount;
        const action = new ExecuteCodeAction();
        const result = (await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> }).InternalRunAction(
            buildParams({ code: undefined })
        )) as ActionResultSimple;

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_CODE');
        expect(executeMock).not.toHaveBeenCalled();
        expect(constructedCount.constructedCount).toBe(before);
    });
});
