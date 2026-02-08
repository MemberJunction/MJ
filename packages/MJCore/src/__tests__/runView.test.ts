import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, RunViewParams } from '../views/runView';
import { MJGlobal } from '@memberjunction/global';

// Mock the IRunViewProvider
const mockRunViewFn = vi.fn().mockResolvedValue({
    Success: true,
    Results: [{ ID: '1', Name: 'Test' }],
    TotalRowCount: 1,
    RowCount: 1
});

const mockRunViewsFn = vi.fn().mockResolvedValue([{
    Success: true,
    Results: [{ ID: '1' }],
    TotalRowCount: 1,
    RowCount: 1
}]);

const mockProvider = {
    RunView: mockRunViewFn,
    RunViews: mockRunViewsFn,
    Entities: []
};

describe('RunViewParams', () => {
    describe('Equals', () => {
        it('should return true for same reference', () => {
            const params = new RunViewParams();
            params.EntityName = 'Users';

            expect(RunViewParams.Equals(params, params)).toBe(true);
        });

        it('should return true for both null', () => {
            expect(RunViewParams.Equals(null, null)).toBe(true);
        });

        it('should return true for both undefined', () => {
            expect(RunViewParams.Equals(undefined, undefined)).toBe(true);
        });

        it('should return false when one is null', () => {
            const params = new RunViewParams();
            expect(RunViewParams.Equals(params, null)).toBe(false);
            expect(RunViewParams.Equals(null, params)).toBe(false);
        });

        it('should return true for equivalent params', () => {
            const a: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: "IsActive=1",
                OrderBy: 'Name ASC',
                MaxRows: 100,
                ResultType: 'simple'
            };
            const b: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: "IsActive=1",
                OrderBy: 'Name ASC',
                MaxRows: 100,
                ResultType: 'simple'
            };

            expect(RunViewParams.Equals(a, b)).toBe(true);
        });

        it('should return false for different EntityName', () => {
            const a: RunViewParams = { EntityName: 'Users' };
            const b: RunViewParams = { EntityName: 'Roles' };

            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should return false for different ExtraFilter', () => {
            const a: RunViewParams = { EntityName: 'Users', ExtraFilter: 'A=1' };
            const b: RunViewParams = { EntityName: 'Users', ExtraFilter: 'B=2' };

            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should return false for different MaxRows', () => {
            const a: RunViewParams = { EntityName: 'Users', MaxRows: 10 };
            const b: RunViewParams = { EntityName: 'Users', MaxRows: 20 };

            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should return false for different ResultType', () => {
            const a: RunViewParams = { EntityName: 'Users', ResultType: 'simple' };
            const b: RunViewParams = { EntityName: 'Users', ResultType: 'entity_object' };

            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should compare Fields arrays', () => {
            const a: RunViewParams = { EntityName: 'Users', Fields: ['ID', 'Name'] };
            const b: RunViewParams = { EntityName: 'Users', Fields: ['ID', 'Name'] };
            const c: RunViewParams = { EntityName: 'Users', Fields: ['ID'] };

            expect(RunViewParams.Equals(a, b)).toBe(true);
            expect(RunViewParams.Equals(a, c)).toBe(false);
        });

        it('should compare CacheLocal and CacheLocalTTL', () => {
            const a: RunViewParams = { EntityName: 'Users', CacheLocal: true, CacheLocalTTL: 5000 };
            const b: RunViewParams = { EntityName: 'Users', CacheLocal: true, CacheLocalTTL: 5000 };
            const c: RunViewParams = { EntityName: 'Users', CacheLocal: false };

            expect(RunViewParams.Equals(a, b)).toBe(true);
            expect(RunViewParams.Equals(a, c)).toBe(false);
        });
    });
});

describe('RunView', () => {
    let globalStore: Record<string, unknown>;

    beforeEach(() => {
        globalStore = {};
        vi.spyOn(MJGlobal.Instance, 'GetGlobalObjectStore').mockReturnValue(globalStore);
        RunView.Provider = mockProvider as never;
        mockRunViewFn.mockClear();
        mockRunViewsFn.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should use the static provider by default', () => {
            const rv = new RunView();

            expect(rv.ProviderToUse).toBe(mockProvider);
        });

        it('should use an instance-specific provider when provided', () => {
            const customProvider = {
                RunView: vi.fn(),
                RunViews: vi.fn()
            };
            const rv = new RunView(customProvider as never);

            expect(rv.ProviderToUse).toBe(customProvider);
        });
    });

    describe('RunView', () => {
        it('should delegate to the provider', async () => {
            const rv = new RunView();
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: "IsActive=1"
            };

            const result = await rv.RunView(params);

            expect(mockRunViewFn).toHaveBeenCalledWith(params, undefined);
            expect(result.Success).toBe(true);
            expect(result.Results).toHaveLength(1);
        });

        it('should pass contextUser to provider', async () => {
            const rv = new RunView();
            const params: RunViewParams = { EntityName: 'Users' };
            const contextUser = { ID: 'u-1' } as never;

            await rv.RunView(params, contextUser);

            expect(mockRunViewFn).toHaveBeenCalledWith(params, contextUser);
        });
    });

    describe('RunViews', () => {
        it('should delegate to the provider', async () => {
            const rv = new RunView();
            const params: RunViewParams[] = [
                { EntityName: 'Users' },
                { EntityName: 'Roles' }
            ];

            await rv.RunViews(params);

            expect(mockRunViewsFn).toHaveBeenCalledWith(params, undefined);
        });
    });

    describe('Provider static property', () => {
        it('should get and set the static provider', () => {
            const newProvider = { RunView: vi.fn(), RunViews: vi.fn() };
            RunView.Provider = newProvider as never;

            expect(RunView.Provider).toBe(newProvider);
        });

        it('should throw when global store is unavailable (get)', () => {
            vi.spyOn(MJGlobal.Instance, 'GetGlobalObjectStore').mockReturnValue(null as never);

            expect(() => RunView.Provider).toThrow('No global object store');
        });

        it('should throw when global store is unavailable (set)', () => {
            vi.spyOn(MJGlobal.Instance, 'GetGlobalObjectStore').mockReturnValue(null as never);

            expect(() => { RunView.Provider = mockProvider as never; }).toThrow('No global object store');
        });
    });
});
