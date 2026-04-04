import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mocks — vi.mock factories are hoisted; they MUST NOT reference module-scope
// variables. Use vi.hoisted() for shared mock fns that need to live above both
// the mock factories and the test code.
// ============================================================================

const {
    mockProviderAutotag,
    mockCreateInstance,
    mockContentSourceTypes,
    mockSources,
    mockConfig,
    mockGetAllSafe,
    mockVectorize,
} = vi.hoisted(() => ({
    mockProviderAutotag: vi.fn().mockResolvedValue(undefined),
    mockCreateInstance: vi.fn(),
    mockContentSourceTypes: [
        { ID: 'type-1', Name: 'Local File System', DriverClass: 'AutotagLocalFileSystem' },
        { ID: 'type-2', Name: 'RSS Feed', DriverClass: 'AutotagRSSFeed' },
        { ID: 'type-3', Name: 'Unlabeled', DriverClass: null },
    ],
    mockSources: [{ ID: 'src-1', Name: 'Test Source' }],
    mockConfig: vi.fn().mockResolvedValue(undefined),
    mockGetAllSafe: vi.fn(),
    mockVectorize: vi.fn().mockResolvedValue({ vectorized: 0, skipped: 0 }),
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        protected async InternalRunAction(): Promise<unknown> { return {}; }
    }
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    MJGlobal: {
        Instance: {
            ClassFactory: { CreateInstance: mockCreateInstance }
        }
    }
}));

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        async RunView() { return { Success: true, Results: [] }; }
    }
    return {
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: MockRunView,
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJContentItemEntity: class {}
}));

vi.mock('@memberjunction/content-autotagging', () => {
    return {
        AutotagBase: class AutotagBase {},
        AutotagBaseEngine: {
            Instance: {
                Config: mockConfig,
                ContentSourceTypes: mockContentSourceTypes,
                GetAllContentSourcesSafe: mockGetAllSafe.mockResolvedValue(mockSources),
                VectorizeContentItems: mockVectorize,
            }
        },
        AutotagProgressCallback: undefined,
    };
});

vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class ActionParam {
        Name: string = '';
        Value: unknown = null;
        Type: string = 'Input';
    },
    ActionResultSimple: class ActionResultSimple {
        Success: boolean = false;
        ResultCode: string = '';
        Message?: string;
    },
    RunActionParams: class RunActionParams {
        Params: { Name: string; Value: unknown; Type: string }[] = [];
        ContextUser: unknown = null;
    }
}));

vi.mock('@memberjunction/core-actions', () => ({
    VectorizeEntityAction: class VectorizeEntityAction {
        protected async InternalRunAction(): Promise<unknown> {
            return { Success: true, ResultCode: 'SUCCESS' };
        }
    }
}));

import { AutotagAndVectorizeContentAction } from '../generic/content-autotag-and-vectorize.action';

// Helper to call InternalRunAction via type cast
type InternalRunner = { InternalRunAction(p: unknown): Promise<{ Success: boolean; ResultCode: string; Message?: string }> };
function callInternal(action: AutotagAndVectorizeContentAction, params: unknown) {
    return (action as unknown as InternalRunner).InternalRunAction(params);
}

describe('AutotagAndVectorizeContentAction', () => {
    let action: AutotagAndVectorizeContentAction;

    beforeEach(() => {
        vi.clearAllMocks();
        action = new AutotagAndVectorizeContentAction();
        // Reset provider mock
        mockCreateInstance.mockReturnValue({ Autotag: mockProviderAutotag });
    });

    it('should be instantiable', () => {
        expect(action).toBeDefined();
    });

    // ========================================================================
    // Parameter Validation
    // ========================================================================

    describe('parameter validation', () => {
        it('should throw when Autotag param is missing', async () => {
            const params = { Params: [{ Name: 'Vectorize', Value: 1, Type: 'Input' }], ContextUser: {} };
            await expect(callInternal(action, params)).rejects.toThrow('Autotag and Vectorize params are required.');
        });

        it('should throw when Vectorize param is missing', async () => {
            const params = { Params: [{ Name: 'Autotag', Value: 1, Type: 'Input' }], ContextUser: {} };
            await expect(callInternal(action, params)).rejects.toThrow('Autotag and Vectorize params are required.');
        });
    });

    // ========================================================================
    // Both Disabled
    // ========================================================================

    describe('both flags disabled', () => {
        it('should return success immediately', async () => {
            const params = {
                Params: [
                    { Name: 'Autotag', Value: 0, Type: 'Input' },
                    { Name: 'Vectorize', Value: 0, Type: 'Input' }
                ],
                ContextUser: {}
            };
            const result = await callInternal(action, params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
            // No provider should have been called
            expect(mockProviderAutotag).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Plugin Architecture — Dynamic Provider Resolution
    // ========================================================================

    describe('plugin architecture', () => {
        const baseParams = {
            Params: [
                { Name: 'Autotag', Value: 1, Type: 'Input' },
                { Name: 'Vectorize', Value: 0, Type: 'Input' }
            ],
            ContextUser: { ID: 'user-1' }
        };

        it('should initialise the AutotagBaseEngine before running providers', async () => {
            await callInternal(action, baseParams);
            expect(mockConfig).toHaveBeenCalledWith(false, baseParams.ContextUser);
        });

        it('should iterate ContentSourceTypes and resolve providers via ClassFactory', async () => {
            await callInternal(action, baseParams);
            // type-3 has no DriverClass so should NOT trigger CreateInstance
            expect(mockCreateInstance).toHaveBeenCalledTimes(2);
        });

        it('should call Autotag on each resolved provider', async () => {
            await callInternal(action, baseParams);
            expect(mockProviderAutotag).toHaveBeenCalledTimes(2);
        });

        it('should skip source types without a DriverClass', async () => {
            await callInternal(action, baseParams);
            // Should not have attempted CreateInstance for type-3
            const calls = mockCreateInstance.mock.calls.map((c: unknown[]) => c[1]);
            expect(calls).not.toContain(null);
            expect(calls).not.toContain(undefined);
        });

        it('should skip source types with no configured sources', async () => {
            mockGetAllSafe
                .mockResolvedValueOnce([])      // type-1: empty
                .mockResolvedValueOnce(mockSources); // type-2: has sources

            await callInternal(action, baseParams);
            // Only type-2 should trigger CreateInstance
            expect(mockCreateInstance).toHaveBeenCalledTimes(1);
        });

        it('should log and continue when ClassFactory returns null for a DriverClass', async () => {
            mockCreateInstance.mockReturnValueOnce(null);
            const result = await callInternal(action, baseParams);
            expect(result.Success).toBe(true);
        });

        it('should continue processing remaining types when one provider throws', async () => {
            mockProviderAutotag
                .mockRejectedValueOnce(new Error('Provider 1 failed'))
                .mockResolvedValueOnce(undefined);

            const result = await callInternal(action, baseParams);
            expect(result.Success).toBe(true);
            expect(mockProviderAutotag).toHaveBeenCalledTimes(2);
        });
    });

    // ========================================================================
    // Vectorization
    // ========================================================================

    describe('vectorization', () => {
        it('should attempt vectorization when Vectorize is 1', async () => {
            const params = {
                Params: [
                    { Name: 'Autotag', Value: 0, Type: 'Input' },
                    { Name: 'Vectorize', Value: 1, Type: 'Input' }
                ],
                ContextUser: {}
            };
            // RunDirectVectorization calls RunView → VectorizeContentItems
            // The mock RunView returns success with empty results, so vectorize
            // is called with an empty array. The action should still succeed.
            const result = await callInternal(action, params);
            // The method internally calls RunView and then VectorizeContentItems
            // Since RunView mock returns empty, vectorize gets 0 items
            expect(result.Success).toBe(true);
        });
    });

    // ========================================================================
    // Error Handling
    // ========================================================================

    describe('error handling', () => {
        it('should return failure when engine Config throws', async () => {
            mockConfig.mockRejectedValueOnce(new Error('Config failed'));

            const params = {
                Params: [
                    { Name: 'Autotag', Value: 1, Type: 'Input' },
                    { Name: 'Vectorize', Value: 0, Type: 'Input' }
                ],
                ContextUser: {}
            };
            const result = await callInternal(action, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('FAILED');
            expect(result.Message).toContain('Config failed');
        });
    });
});
