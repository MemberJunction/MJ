import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks: CodeExecutionService is the real sandbox runner — for unit tests we
// replace it with a controllable stub so we can exercise every error-type
// branch and every approval-gate branch without spinning up isolated-vm
// child processes.
// ---------------------------------------------------------------------------

const { executeMock, capturedParams } = vi.hoisted(() => ({
    executeMock: vi.fn(),
    capturedParams: { value: null as Record<string, unknown> | null }
}));

vi.mock('@memberjunction/code-execution', () => ({
    CodeExecutionService: class MockCodeExecutionService {
        async execute(params: Record<string, unknown>) {
            capturedParams.value = params;
            return executeMock(params);
        }
    }
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    BaseEngine: class BaseEngine {},
    BaseEntity: class BaseEntity {},
    Metadata: class Metadata {},
    RunView: class RunView {},
    UserInfo: class UserInfo {},
    IMetadataProvider: class IMetadataProvider {},
    BaseEnginePropertyConfig: class BaseEnginePropertyConfig {}
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJActionEntity: class {},
    MJActionCategoryEntity: class {},
    MJActionExecutionLogEntity: class {},
    MJActionFilterEntity: class {},
    MJActionLibraryEntity: class {},
    MJActionParamEntity: class {},
    MJActionResultCodeEntity: class {}
}));

// Stub actions-base entirely — the executor only uses ActionParam as a
// constructor, and types leak through via `type-only` imports elsewhere.
vi.mock('@memberjunction/actions-base', () => {
    class ActionParam {
        public Name: string = '';
        public Value: unknown = undefined;
        public Type: 'Input' | 'Output' | 'Both' = 'Input';
    }
    class RunActionParams {}
    return { ActionParam, RunActionParams };
});

vi.mock('@memberjunction/global', () => {
    // Minimal BaseSingleton — just enough to construct the executor once.
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
    return { BaseSingleton };
});

import { RuntimeActionExecutor } from '../RuntimeActionExecutor';
import { RuntimeActionResultCode } from '../types';

// Minimal action shape — only the fields the executor touches.
type TestAction = {
    Name: string;
    Type: 'Runtime' | 'Custom' | 'Generated';
    Status: 'Active' | 'Pending' | 'Disabled';
    CodeApprovalStatus: 'Approved' | 'Pending' | 'Rejected';
    Code: string | null;
};

function buildAction(overrides: Partial<TestAction> = {}): TestAction {
    return {
        Name: 'Test Runtime Action',
        Type: 'Runtime',
        Status: 'Active',
        CodeApprovalStatus: 'Approved',
        Code: 'return { ok: true };',
        ...overrides
    };
}

describe('RuntimeActionExecutor', () => {
    let executor: RuntimeActionExecutor;

    beforeEach(() => {
        executeMock.mockReset();
        capturedParams.value = null;
        executor = RuntimeActionExecutor.Instance;
    });

    describe('approval + status gating', () => {
        it('refuses Action.Type !== Runtime', async () => {
            const action = buildAction({ Type: 'Custom' });
            const result = await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never
            });
            expect(result.success).toBe(false);
            expect(result.resultCode).toBe(RuntimeActionResultCode.INVALID_TYPE);
            expect(executeMock).not.toHaveBeenCalled();
        });

        it('refuses empty/missing Code', async () => {
            const action = buildAction({ Code: '' });
            const result = await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never
            });
            expect(result.success).toBe(false);
            expect(result.resultCode).toBe(RuntimeActionResultCode.MISSING_CODE);
            expect(executeMock).not.toHaveBeenCalled();
        });

        it('refuses inactive actions', async () => {
            const action = buildAction({ Status: 'Disabled' });
            const result = await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never
            });
            expect(result.success).toBe(false);
            expect(result.resultCode).toBe(RuntimeActionResultCode.INACTIVE);
        });

        it('refuses unapproved actions', async () => {
            const action = buildAction({ CodeApprovalStatus: 'Pending' });
            const result = await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never
            });
            expect(result.success).toBe(false);
            expect(result.resultCode).toBe(RuntimeActionResultCode.NOT_APPROVED);
            expect(executeMock).not.toHaveBeenCalled();
        });

        it('refuses when the caller-supplied abort signal is already aborted', async () => {
            const action = buildAction();
            const controller = new AbortController();
            controller.abort();
            const result = await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never,
                abortSignal: controller.signal
            });
            expect(result.success).toBe(false);
            expect(result.resultCode).toBe(RuntimeActionResultCode.TIMEOUT);
            expect(executeMock).not.toHaveBeenCalled();
        });
    });

    describe('input wiring', () => {
        it('exposes Input + Both params to the sandbox as the `input` object', async () => {
            executeMock.mockResolvedValue({ success: true, output: { ok: true } });
            const action = buildAction();
            await executor.execute({
                action: action as never,
                params: [
                    { Name: 'region', Value: 'EMEA', Type: 'Input' },
                    { Name: 'maxRows', Value: 25, Type: 'Both' },
                    { Name: 'result', Value: undefined, Type: 'Output' }
                ] as never,
                contextUser: {} as never
            });
            expect(capturedParams.value).toBeTruthy();
            const passed = capturedParams.value as { inputData?: Record<string, unknown> };
            expect(passed.inputData).toEqual({ region: 'EMEA', maxRows: 25 });
        });

        it('wraps the user code in an async IIFE that captures the return value into `output`', async () => {
            executeMock.mockResolvedValue({ success: true, output: null });
            const action = buildAction({ Code: 'return 42;' });
            await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never
            });
            const passed = capturedParams.value as { code: string };
            // User code is inlined inside an async IIFE. The IIFE's return
            // value (if defined) is assigned to the outer `output`. Bare
            // `output = ...` assignments inside the IIFE also work via closure.
            expect(passed.code).toContain('return 42;');
            expect(passed.code).toContain('const __runtimeReturn = await (async function(input) {');
            expect(passed.code).toContain('if (typeof __runtimeReturn !== "undefined") output = __runtimeReturn;');
        });
    });

    describe('output wiring', () => {
        it('promotes an object return value into Output ActionParams', async () => {
            executeMock.mockResolvedValue({
                success: true,
                output: { totalSales: 1000, transactionCount: 42 }
            });
            const action = buildAction();
            const result = await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never
            });
            expect(result.success).toBe(true);
            expect(result.resultCode).toBe(RuntimeActionResultCode.SUCCESS);
            const totalSales = result.params.find((p) => p.Name === 'totalSales');
            const txCount = result.params.find((p) => p.Name === 'transactionCount');
            expect(totalSales?.Value).toBe(1000);
            expect(totalSales?.Type).toBe('Output');
            expect(txCount?.Value).toBe(42);
        });

        it('packages a scalar return value under a `result` output param', async () => {
            executeMock.mockResolvedValue({ success: true, output: 'done' });
            const action = buildAction();
            const result = await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never
            });
            expect(result.success).toBe(true);
            const out = result.params.find((p) => p.Name === 'result');
            expect(out?.Value).toBe('done');
            expect(out?.Type).toBe('Output');
        });

        it('upgrades an existing Input param to Both when the user code returns a matching key', async () => {
            executeMock.mockResolvedValue({ success: true, output: { region: 'EMEA' } });
            const action = buildAction();
            const result = await executor.execute({
                action: action as never,
                params: [{ Name: 'region', Value: 'initial', Type: 'Input' }] as never,
                contextUser: {} as never
            });
            const region = result.params.find((p) => p.Name === 'region');
            expect(region?.Value).toBe('EMEA');
            expect(region?.Type).toBe('Both');
        });
    });

    describe('error mapping', () => {
        it('maps TIMEOUT from the sandbox to RuntimeActionResultCode.TIMEOUT', async () => {
            executeMock.mockResolvedValue({
                success: false,
                errorType: 'TIMEOUT',
                error: 'Wall-clock exceeded'
            });
            const action = buildAction();
            const result = await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never
            });
            expect(result.success).toBe(false);
            expect(result.resultCode).toBe(RuntimeActionResultCode.TIMEOUT);
            expect(result.message).toBe('Wall-clock exceeded');
        });

        it('maps SYNTAX_ERROR, MEMORY_LIMIT, SECURITY_ERROR, RUNTIME_ERROR', async () => {
            const mappings: Array<[string, string]> = [
                ['SYNTAX_ERROR', RuntimeActionResultCode.SYNTAX_ERROR],
                ['MEMORY_LIMIT', RuntimeActionResultCode.MEMORY_LIMIT],
                ['SECURITY_ERROR', RuntimeActionResultCode.SECURITY_ERROR],
                ['RUNTIME_ERROR', RuntimeActionResultCode.RUNTIME_ERROR]
            ];
            for (const [fromErrorType, toResultCode] of mappings) {
                executeMock.mockResolvedValueOnce({
                    success: false,
                    errorType: fromErrorType,
                    error: `simulated ${fromErrorType}`
                });
                const result = await executor.execute({
                    action: buildAction() as never,
                    params: [],
                    contextUser: {} as never
                });
                expect(result.resultCode).toBe(toResultCode);
            }
        });

        it('returns UNEXPECTED_ERROR if the sandbox service itself throws', async () => {
            executeMock.mockRejectedValue(new Error('boom'));
            const action = buildAction();
            const result = await executor.execute({
                action: action as never,
                params: [],
                contextUser: {} as never
            });
            expect(result.success).toBe(false);
            expect(result.resultCode).toBe(RuntimeActionResultCode.UNEXPECTED_ERROR);
            expect(result.message).toBe('boom');
        });
    });
});
