import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mocks - must be declared before imports that use them
// ============================================================================

// Mock @memberjunction/core — use real module for transitive imports from
// RuntimeActionBridge (pulled in via the ActionEngine module graph) and only
// override the specific constructors / functions these tests exercise.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    const mockLogEntity = {
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        get ActionID() { return ''; },
        set ActionID(_v: string) {},
        get StartedAt() { return null; },
        set StartedAt(_v: Date | null) {},
        get EndedAt() { return null; },
        set EndedAt(_v: Date | null) {},
        get UserID() { return ''; },
        set UserID(_v: string) {},
        get Params() { return ''; },
        set Params(_v: string) {},
        get ResultCode() { return ''; },
        set ResultCode(_v: string | undefined) {},
        get Message() { return ''; },
        set Message(_v: string | undefined) {},
        get LatestResult() { return null; },
    };

    return {
        ...actual,
        // Override the specific exports these tests depend on behaviorally.
        Metadata: vi.fn(function() {
            return { GetEntityObject: vi.fn().mockResolvedValue(mockLogEntity) };
        }),
        LogError: vi.fn(),
        LogErrorEx: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogVerbose: vi.fn(),
        // RunView is overridden so tests don't hit the real data provider.
        RunView: vi.fn(),
        // RunQuery pulled in transitively by RuntimeActionBridge — stub so
        // nothing blows up at module init.
        RunQuery: vi.fn(),
        // Override BaseEngine with a simple shell so ActionEngineServer's
        // singleton path works under the mock.
        BaseEngine: class MockBaseEngine<T> {
            protected static getInstance<U>(_key?: string): U {
                return {} as U;
            }
            protected ContextUser = { ID: 'test-user-id', Name: 'Test User' };
            protected Loaded = true;
            protected async Load() {}
            protected async AdditionalLoading() {}
            protected HandleSingleViewResult() {}
            protected RunViewProviderToUse = undefined;
        }
    };
});

// Mock @memberjunction/core-entities — use the REAL module so transitive
// imports from RuntimeActionBridge (entity class references pulled in via
// `@memberjunction/ai-prompts` and `@memberjunction/aiengine`) resolve
// correctly. We only override `Metadata` calls through the core module
// mock above, which is the actual surface the ActionEngine tests care about.
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return actual;
});

// Mock @memberjunction/global
const { mockClassFactory } = vi.hoisted(() => ({
    mockClassFactory: {
        CreateInstance: vi.fn(),
        GetAllRegistrations: vi.fn().mockReturnValue([]),
    },
}));
vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: mockClassFactory,
        },
    },
    SafeJSONParse: vi.fn((str: string) => {
        try {
            return JSON.parse(str);
        } catch {
            return null;
        }
    }),
    RegisterClass: () => (target: Function) => target,
    // Case-insensitive UUID equality. Used by ActionEngineServer when
    // matching action result codes and by EntityActionInvocation*.MapParams.
    UUIDsEqual: (a: unknown, b: unknown): boolean =>
        typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(),
    NormalizeUUID: (value: unknown): string =>
        typeof value === 'string' ? value.toLowerCase() : String(value),
    // Minimal BaseSingleton — transitive dep from @memberjunction/action-runtime
    // which is pulled in as part of the ActionEngine module graph even though
    // the existing tests don't exercise Runtime actions directly.
    BaseSingleton: class BaseSingletonMock<T> {
        protected constructor() {}
        protected static getInstance<U>(this: new () => U): U {
            return new this();
        }
    },
}));

// Mock @memberjunction/actions-base
vi.mock('@memberjunction/actions-base', () => {
    class MockActionEngineBase {
        private _Actions: Array<Record<string, unknown>> = [];
        private _ActionCategories: Array<Record<string, unknown>> = [];
        private _Filters: Array<Record<string, unknown>> = [];
        private _Params: Array<Record<string, unknown>> = [];
        private _ActionResultCodes: Array<Record<string, unknown>> = [];
        private _ActionLibraries: Array<Record<string, unknown>> = [];
        protected ContextUser = { ID: 'test-user-id', Name: 'Test User' };
        protected Loaded = true;

        static getInstance<T>(): T {
            return new MockActionEngineBase() as unknown as T;
        }

        get Actions() { return this._Actions; }
        get ActionCategories() { return this._ActionCategories; }
        get ActionParams() { return this._Params; }
        get ActionFilters() { return this._Filters; }
        get ActionResultCodes() { return this._ActionResultCodes; }
        get ActionLibraries() { return this._ActionLibraries; }

        async Config() {}
        async Load() {}
        protected async LoadMultipleEntityConfigs() {}
        protected HandleSingleViewResult() {}
        protected RunViewProviderToUse = undefined;
        protected async AdditionalLoading() {}
    }

    class MockEntityActionEngineBase {
        static get Instance() { return new MockEntityActionEngineBase(); }
        static getInstance<T>(): T { return new MockEntityActionEngineBase() as unknown as T; }
        async Config() {}
        async Load() {}
        protected async AdditionalLoading() {}
        protected HandleSingleViewResult() {}
        protected RunViewProviderToUse = undefined;
    }

    return {
        ActionEngineBase: MockActionEngineBase,
        MJActionEntityExtended: class {
            Params: Array<Record<string, unknown>> = [];
            Name = '';
            ID = '';
            DriverClass = '';
        },
        ActionParam: class { Name = ''; Value: unknown = null; Type: string = 'Input'; },
        ActionResult: class {},
        ActionResultSimple: class { Success = false; ResultCode = ''; Message = ''; },
        RunActionParams: class {
            Action: Record<string, unknown> = {};
            ContextUser: Record<string, unknown> = {};
            Filters: Array<Record<string, unknown>> = [];
            Params: Array<Record<string, unknown>> = [];
            SkipActionLog = false;
        },
        EntityActionEngineBase: MockEntityActionEngineBase,
        EntityActionInvocationParams: class {},
        EntityActionResult: class {},
    };
});

// ============================================================================
// Now import the modules under test
// ============================================================================
import { ActionEngineServer } from '../generic/ActionEngine';
import { BaseAction } from '../generic/BaseAction';
import { Metadata, LogError, LogErrorEx } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

// ============================================================================
// Create a concrete subclass of BaseAction for testing
// ============================================================================
class TestAction extends BaseAction {
    public mockResult = { Success: true, ResultCode: 'SUCCESS', Message: 'Test passed' };
    protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string; Message: string }> {
        return this.mockResult;
    }
}

class FailingAction extends BaseAction {
    protected async InternalRunAction(): Promise<never> {
        throw new Error('Action blew up');
    }
}

// ============================================================================
// Tests
// ============================================================================

describe('ActionEngineServer', () => {
    let engine: ActionEngineServer;

    beforeEach(() => {
        vi.clearAllMocks();
        // Create a fresh instance by calling the constructor directly
        engine = new ActionEngineServer();
        // Set up internal state
        (engine as Record<string, unknown>)['ContextUser'] = { ID: 'test-user-id', Name: 'Test User' };
    });

    describe('RunAction', () => {
        it('should return failure when ValidateInputs returns false', async () => {
            const validateSpy = vi.spyOn(engine as never, 'ValidateInputs' as never).mockResolvedValue(false as never);

            const params = {
                Action: { ID: 'action-1', Name: 'Test Action', DriverClass: 'TestDriver' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [{ Name: 'input1', Value: 'val', Type: 'Input' }],
                SkipActionLog: true,
            };

            const result = await engine.RunAction(params as unknown as Record<string, Function>);

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Input validation failed');
            expect(validateSpy).toHaveBeenCalledWith(params);
        });

        it('should log when SkipActionLog is false and validation fails', async () => {
            vi.spyOn(engine as never, 'ValidateInputs' as never).mockResolvedValue(false as never);
            const startAndEndSpy = vi.spyOn(engine as never, 'StartAndEndActionLog' as never).mockResolvedValue({} as unknown as Record<string, Function>);

            const params = {
                Action: { ID: 'action-1', Name: 'Test Action', DriverClass: 'TestDriver' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: false,
            };

            const result = await engine.RunAction(params as unknown as Record<string, Function>);

            expect(result.Success).toBe(false);
            expect(startAndEndSpy).toHaveBeenCalled();
        });

        it('should NOT log when SkipActionLog is true and validation fails', async () => {
            vi.spyOn(engine as never, 'ValidateInputs' as never).mockResolvedValue(false as never);
            const startAndEndSpy = vi.spyOn(engine as never, 'StartAndEndActionLog' as never);

            const params = {
                Action: { ID: 'action-1', Name: 'Test Action', DriverClass: 'TestDriver' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: true,
            };

            await engine.RunAction(params as unknown as Record<string, Function>);

            expect(startAndEndSpy).not.toHaveBeenCalled();
        });

        it('should call InternalRunAction when inputs valid and filters pass', async () => {
            vi.spyOn(engine as never, 'ValidateInputs' as never).mockResolvedValue(true as never);
            vi.spyOn(engine as never, 'RunFilters' as never).mockResolvedValue(true as never);
            const internalSpy = vi.spyOn(engine as never, 'InternalRunAction' as never).mockResolvedValue({
                Success: true,
                Message: 'Done',
                Params: [],
                RunParams: {},
            } as unknown as Record<string, Function>);

            const params = {
                Action: { ID: 'action-1', Name: 'Test Action', DriverClass: 'TestDriver' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: true,
            };

            const result = await engine.RunAction(params as unknown as Record<string, Function>);

            expect(internalSpy).toHaveBeenCalledWith(params);
            expect(result.Success).toBe(true);
        });
    });

    describe('ValidateInputs', () => {
        it('should return true by default', async () => {
            const result = await (engine as unknown as Record<string, Function>)['ValidateInputs']({} as unknown as Record<string, Function>);
            expect(result).toBe(true);
        });
    });

    describe('RunFilters', () => {
        it('should return true when no filters are provided', async () => {
            const params = { Filters: undefined };
            const result = await (engine as unknown as Record<string, Function>)['RunFilters'](params as unknown as Record<string, Function>);
            expect(result).toBe(true);
        });

        it('should return true when filters array is empty', async () => {
            const params = { Filters: [] };
            const result = await (engine as unknown as Record<string, Function>)['RunFilters'](params as unknown as Record<string, Function>);
            expect(result).toBe(true);
        });

        it('should return true when all filters pass', async () => {
            vi.spyOn(engine as never, 'RunSingleFilter' as never).mockResolvedValue(true as never);

            const params = { Filters: [{ ID: 'f1' }, { ID: 'f2' }] };
            const result = await (engine as unknown as Record<string, Function>)['RunFilters'](params as unknown as Record<string, Function>);
            expect(result).toBe(true);
        });

        it('should return false when any filter fails', async () => {
            vi.spyOn(engine as never, 'RunSingleFilter' as never)
                .mockResolvedValueOnce(true as never)
                .mockResolvedValueOnce(false as never);

            const params = { Filters: [{ ID: 'f1' }, { ID: 'f2' }] };
            const result = await (engine as unknown as Record<string, Function>)['RunFilters'](params as unknown as Record<string, Function>);
            expect(result).toBe(false);
        });

        it('should short-circuit on first failing filter', async () => {
            const singleFilterSpy = vi.spyOn(engine as never, 'RunSingleFilter' as never)
                .mockResolvedValueOnce(false as never);

            const params = { Filters: [{ ID: 'f1' }, { ID: 'f2' }, { ID: 'f3' }] };
            await (engine as unknown as Record<string, Function>)['RunFilters'](params as unknown as Record<string, Function>);
            expect(singleFilterSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('RunSingleFilter', () => {
        it('should return true (stub implementation)', async () => {
            const result = await (engine as unknown as Record<string, Function>)['RunSingleFilter']({} as never, {} as unknown as Record<string, Function>);
            expect(result).toBe(true);
        });
    });

    describe('GetActionParamsForAction', () => {
        it('should map Scalar ValueType to default value directly', () => {
            const action = {
                Name: 'TestAction',
                Params: [{ Name: 'param1', ValueType: 'Scalar', DefaultValue: 'hello', Type: 'Input' }],
            };

            const result = (engine as unknown as Record<string, Function>)['GetActionParamsForAction'](action as unknown as Record<string, Function>);
            expect(result).toEqual([{ Name: 'param1', Value: 'hello', Type: 'Input' }]);
        });

        it('should parse JSON for Simple Object ValueType', () => {
            const action = {
                Name: 'TestAction',
                Params: [{ Name: 'param1', ValueType: 'Simple Object', DefaultValue: '{"key":"val"}', Type: 'Input' }],
            };

            const result = (engine as unknown as Record<string, Function>)['GetActionParamsForAction'](action as unknown as Record<string, Function>);
            expect(result).toEqual([{ Name: 'param1', Value: { key: 'val' }, Type: 'Input' }]);
        });

        it('should use raw string for Simple Object when JSON parse fails', () => {
            const action = {
                Name: 'TestAction',
                Params: [{ Name: 'param1', ValueType: 'Simple Object', DefaultValue: 'not-json', Type: 'Input' }],
            };

            const result = (engine as unknown as Record<string, Function>)['GetActionParamsForAction'](action as unknown as Record<string, Function>);
            expect(result).toEqual([{ Name: 'param1', Value: 'not-json', Type: 'Input' }]);
        });

        it('should pass through BaseEntity Sub-Class ValueType', () => {
            const action = {
                Name: 'TestAction',
                Params: [{ Name: 'param1', ValueType: 'BaseEntity Sub-Class', DefaultValue: 'entity-ref', Type: 'Input' }],
            };

            const result = (engine as unknown as Record<string, Function>)['GetActionParamsForAction'](action as unknown as Record<string, Function>);
            expect(result).toEqual([{ Name: 'param1', Value: 'entity-ref', Type: 'Input' }]);
        });

        it('should pass through Other ValueType', () => {
            const action = {
                Name: 'TestAction',
                Params: [{ Name: 'param1', ValueType: 'Other', DefaultValue: 'other-val', Type: 'Both' }],
            };

            const result = (engine as unknown as Record<string, Function>)['GetActionParamsForAction'](action as unknown as Record<string, Function>);
            expect(result).toEqual([{ Name: 'param1', Value: 'other-val', Type: 'Both' }]);
        });

        it('should log error and use default for unknown ValueType', () => {
            const action = {
                Name: 'TestAction',
                Params: [{ Name: 'param1', ValueType: 'UnknownType', DefaultValue: 'fallback', Type: 'Output' }],
            };

            const result = (engine as unknown as Record<string, Function>)['GetActionParamsForAction'](action as unknown as Record<string, Function>);
            expect(result).toEqual([{ Name: 'param1', Value: 'fallback', Type: 'Output' }]);
            expect(LogError).toHaveBeenCalledWith(expect.stringContaining('Unknown ValueType'));
        });

        it('should handle multiple params', () => {
            const action = {
                Name: 'TestAction',
                Params: [
                    { Name: 'p1', ValueType: 'Scalar', DefaultValue: 'a', Type: 'Input' },
                    { Name: 'p2', ValueType: 'Scalar', DefaultValue: 'b', Type: 'Output' },
                ],
            };

            const result = (engine as unknown as Record<string, Function>)['GetActionParamsForAction'](action as unknown as Record<string, Function>);
            expect(result).toHaveLength(2);
            expect(result[0].Name).toBe('p1');
            expect(result[1].Name).toBe('p2');
        });

        it('should handle empty params array', () => {
            const action = { Name: 'TestAction', Params: [] };
            const result = (engine as unknown as Record<string, Function>)['GetActionParamsForAction'](action as unknown as Record<string, Function>);
            expect(result).toEqual([]);
        });
    });

    describe('InternalRunAction', () => {
        it('should create action via ClassFactory and run it', async () => {
            const testAction = new TestAction();
            mockClassFactory.CreateInstance.mockReturnValue(testAction);

            // Set up the engine's ActionResultCodes
            (engine as Record<string, unknown>)['_ActionResultCodes'] = [
                { ActionID: 'action-1', ResultCode: 'SUCCESS' },
            ];

            const params = {
                Action: { ID: 'action-1', Name: 'Test Action', DriverClass: 'TestAction' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [{ Name: 'input1', Value: 'val', Type: 'Input' }],
                SkipActionLog: true,
            };

            const result = await (engine as unknown as Record<string, Function>)['InternalRunAction'](params as unknown as Record<string, Function>);

            expect(result.Success).toBe(true);
            expect(mockClassFactory.CreateInstance).toHaveBeenCalledWith(
                BaseAction, 'TestAction', { ID: 'user-1', Name: 'Test' }
            );
        });

        it('should throw when ClassFactory returns null', async () => {
            mockClassFactory.CreateInstance.mockReturnValue(null);

            const params = {
                Action: { ID: 'action-1', Name: 'Test Action', DriverClass: 'TestAction' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: true,
            };

            const result = await (engine as unknown as Record<string, Function>)['InternalRunAction'](params as unknown as Record<string, Function>);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Could not find a class for action');
        });

        it('should throw when ClassFactory returns base BaseAction', async () => {
            // Create a plain BaseAction-like object whose constructor === BaseAction
            const baseAction = Object.create(BaseAction.prototype);
            Object.defineProperty(baseAction, 'constructor', { value: BaseAction });
            mockClassFactory.CreateInstance.mockReturnValue(baseAction);

            const params = {
                Action: { ID: 'action-1', Name: 'Test Action', DriverClass: 'TestAction' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: true,
            };

            const result = await (engine as unknown as Record<string, Function>)['InternalRunAction'](params as unknown as Record<string, Function>);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Could not find a class');
        });

        it('should catch errors from action execution', async () => {
            const failAction = new FailingAction();
            mockClassFactory.CreateInstance.mockReturnValue(failAction);

            const params = {
                Action: { ID: 'action-1', Name: 'Failing Action', DriverClass: 'FailAction' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: true,
            };

            const result = await (engine as unknown as Record<string, Function>)['InternalRunAction'](params as unknown as Record<string, Function>);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Action blew up');
            expect(LogErrorEx).toHaveBeenCalled();
        });

        it('should use Action.Name when DriverClass is not provided', async () => {
            const testAction = new TestAction();
            mockClassFactory.CreateInstance.mockReturnValue(testAction);

            (engine as Record<string, unknown>)['_ActionResultCodes'] = [];

            const params = {
                Action: { ID: 'action-1', Name: 'FallbackName', DriverClass: '' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: true,
            };

            await (engine as unknown as Record<string, Function>)['InternalRunAction'](params as unknown as Record<string, Function>);
            expect(mockClassFactory.CreateInstance).toHaveBeenCalledWith(
                BaseAction, 'FallbackName', expect.anything()
            );
        });

        it('should match result codes case-insensitively', async () => {
            const testAction = new TestAction();
            testAction.mockResult = { Success: true, ResultCode: 'success', Message: 'ok' };
            mockClassFactory.CreateInstance.mockReturnValue(testAction);

            (engine as Record<string, unknown>)['_ActionResultCodes'] = [
                { ActionID: 'action-1', ResultCode: '  SUCCESS  ' },
            ];

            const params = {
                Action: { ID: 'action-1', Name: 'Test', DriverClass: 'TestAction' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: true,
            };

            const result = await (engine as unknown as Record<string, Function>)['InternalRunAction'](params as unknown as Record<string, Function>);
            expect(result.Result).toBeDefined();
            expect(result.Result.ResultCode).toBe('  SUCCESS  ');
        });

        it('should create and end action log when SkipActionLog is false', async () => {
            const testAction = new TestAction();
            mockClassFactory.CreateInstance.mockReturnValue(testAction);
            (engine as Record<string, unknown>)['_ActionResultCodes'] = [];

            const startSpy = vi.spyOn(engine as never, 'StartActionLog' as never).mockResolvedValue({
                Save: vi.fn().mockResolvedValue(true),
            } as unknown as Record<string, Function>);
            const endSpy = vi.spyOn(engine as never, 'EndActionLog' as never).mockResolvedValue(undefined as never);

            const params = {
                Action: { ID: 'action-1', Name: 'Test', DriverClass: 'TestAction' },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: false,
            };

            await (engine as unknown as Record<string, Function>)['InternalRunAction'](params as unknown as Record<string, Function>);
            expect(startSpy).toHaveBeenCalled();
            expect(endSpy).toHaveBeenCalled();
        });
    });

    describe('StartActionLog', () => {
        it('should create and save a log entity', async () => {
            const mockEntity = {
                NewRecord: vi.fn(),
                Save: vi.fn().mockResolvedValue(true),
                set ActionID(_v: string) {},
                set StartedAt(_v: Date) {},
                set UserID(_v: string) {},
                set Params(_v: string) {},
            };
            (Metadata as unknown as ReturnType<typeof vi.fn>).mockImplementation(function() {
                return { GetEntityObject: vi.fn().mockResolvedValue(mockEntity) };
            });

            const params = {
                Action: { ID: 'action-1', Name: 'Test' },
                Params: [{ Name: 'p1', Value: 'v1' }],
            };

            const logEntry = await (engine as unknown as Record<string, Function>)['StartActionLog'](params as never, true);

            expect(mockEntity.NewRecord).toHaveBeenCalled();
            expect(mockEntity.Save).toHaveBeenCalled();
            expect(logEntry).toBe(mockEntity);
        });

        it('should not save when saveRecord is false', async () => {
            const mockEntity = {
                NewRecord: vi.fn(),
                Save: vi.fn().mockResolvedValue(true),
                set ActionID(_v: string) {},
                set StartedAt(_v: Date) {},
                set UserID(_v: string) {},
                set Params(_v: string) {},
            };
            (Metadata as unknown as ReturnType<typeof vi.fn>).mockImplementation(function() {
                return { GetEntityObject: vi.fn().mockResolvedValue(mockEntity) };
            });

            const params = {
                Action: { ID: 'action-1', Name: 'Test' },
                Params: [],
            };

            await (engine as unknown as Record<string, Function>)['StartActionLog'](params as never, false);

            expect(mockEntity.NewRecord).toHaveBeenCalled();
            expect(mockEntity.Save).not.toHaveBeenCalled();
        });

        it('should log error when save fails', async () => {
            const mockEntity = {
                NewRecord: vi.fn(),
                Save: vi.fn().mockResolvedValue(false),
                LatestResult: { Message: 'DB error' },
                set ActionID(_v: string) {},
                set StartedAt(_v: Date) {},
                set UserID(_v: string) {},
                set Params(_v: string) {},
            };
            (Metadata as unknown as ReturnType<typeof vi.fn>).mockImplementation(function() {
                return { GetEntityObject: vi.fn().mockResolvedValue(mockEntity) };
            });

            const params = { Action: { ID: 'a1', Name: 'Test' }, Params: [] };
            await (engine as unknown as Record<string, Function>)['StartActionLog'](params as never, true);

            expect(LogError).toHaveBeenCalled();
        });
    });

    describe('EndActionLog', () => {
        it('should set end time and save', async () => {
            const logEntity = {
                Save: vi.fn().mockResolvedValue(true),
                set EndedAt(_v: Date) {},
                set Params(_v: string) {},
                set ResultCode(_v: string | undefined) {},
                set Message(_v: string | undefined) {},
            };

            const params = { Params: [{ Name: 'p1', Value: 'v1' }] };
            const result = { Result: { ResultCode: 'OK' }, Message: 'Done' };

            await (engine as unknown as Record<string, Function>)['EndActionLog'](logEntity as never, params as never, result as unknown as Record<string, Function>);

            expect(logEntity.Save).toHaveBeenCalled();
        });

        it('should log error when save fails', async () => {
            const logEntity = {
                Save: vi.fn().mockResolvedValue(false),
                LatestResult: { Message: 'save error' },
                set EndedAt(_v: Date) {},
                set Params(_v: string) {},
                set ResultCode(_v: string | undefined) {},
                set Message(_v: string | undefined) {},
            };

            const params = { Action: { Name: 'Test' }, Params: [] };
            const result = { Result: undefined, Message: 'fail' };

            await (engine as unknown as Record<string, Function>)['EndActionLog'](logEntity as never, params as never, result as unknown as Record<string, Function>);

            expect(LogError).toHaveBeenCalled();
        });
    });

    describe('StartAndEndActionLog', () => {
        it('should call StartActionLog with saveRecord=false then EndActionLog', async () => {
            const mockLogEntity = { Save: vi.fn().mockResolvedValue(true) };
            const startSpy = vi.spyOn(engine as never, 'StartActionLog' as never).mockResolvedValue(mockLogEntity as unknown as Record<string, Function>);
            const endSpy = vi.spyOn(engine as never, 'EndActionLog' as never).mockResolvedValue(undefined as never);

            const params = { Action: { ID: 'a1', Name: 'Test' }, Params: [] };
            const result = { Message: 'ok' };

            const logEntry = await (engine as unknown as Record<string, Function>)['StartAndEndActionLog'](params as never, result as unknown as Record<string, Function>);

            expect(startSpy).toHaveBeenCalledWith(params, false);
            expect(endSpy).toHaveBeenCalledWith(mockLogEntity, params, result);
            expect(logEntry).toBe(mockLogEntity);
        });
    });

    describe('Instance (singleton)', () => {
        it('should return an instance from static getter', () => {
            const instance = ActionEngineServer.Instance;
            expect(instance).toBeDefined();
        });
    });

    // ========================================================================
    // Universal MaxExecutionTimeMS + AbortSignal (Phase 1b)
    // ========================================================================
    describe('RunActionWithTimeout', () => {
        // Stand-up helpers: bypass validation/filter plumbing so tests only
        // exercise the timeout wrapper.
        beforeEach(() => {
            vi.spyOn(engine as never, 'ValidateInputs' as never).mockResolvedValue(true as never);
            vi.spyOn(engine as never, 'RunFilters' as never).mockResolvedValue(true as never);
        });

        function buildParams(
            overrides: Partial<{ MaxExecutionTimeMS: number | null; AbortSignal: AbortSignal; Name: string }> = {}
        ) {
            return {
                Action: {
                    ID: 'action-1',
                    Name: overrides.Name ?? 'Slow Test Action',
                    DriverClass: 'TestDriver',
                    MaxExecutionTimeMS: overrides.MaxExecutionTimeMS ?? null
                },
                ContextUser: { ID: 'user-1', Name: 'Test' },
                Filters: [],
                Params: [],
                SkipActionLog: true,
                AbortSignal: overrides.AbortSignal
            };
        }

        it('propagates params.AbortSignal to InternalRunAction', async () => {
            let observedSignal: AbortSignal | undefined;
            const internalSpy = vi
                .spyOn(engine as never, 'InternalRunAction' as never)
                .mockImplementation(async (passedParams: never) => {
                    observedSignal = (passedParams as { AbortSignal?: AbortSignal }).AbortSignal;
                    return {
                        Success: true,
                        Message: 'ok',
                        LogEntry: null,
                        Params: [],
                        RunParams: passedParams
                    } as never;
                });

            const params = buildParams();
            await engine.RunAction(params as unknown as Record<string, Function>);

            expect(internalSpy).toHaveBeenCalledTimes(1);
            expect(observedSignal).toBeInstanceOf(AbortSignal);
            expect(observedSignal?.aborted).toBe(false);
        });

        it('returns Success=false and a timeout message when MaxExecutionTimeMS fires first', async () => {
            // InternalRunAction sleeps far longer than the timeout — the wrapper
            // should race ahead and return a TIMEOUT-style result.
            vi.spyOn(engine as never, 'InternalRunAction' as never).mockImplementation(
                () =>
                    new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({ Success: true, Message: 'late', LogEntry: null, Params: [], RunParams: null } as never);
                        }, 500);
                    })
            );

            const params = buildParams({ MaxExecutionTimeMS: 50, Name: 'Times Out' });
            const result = await engine.RunAction(params as unknown as Record<string, Function>);

            expect(result.Success).toBe(false);
            expect(result.Message).toMatch(/MaxExecutionTimeMS \(50ms\)/);
            expect(result.Message).toContain('Times Out');
        });

        it('returns Success=false with the upstream reason when the caller aborts via params.AbortSignal', async () => {
            const upstream = new AbortController();
            vi.spyOn(engine as never, 'InternalRunAction' as never).mockImplementation(
                () =>
                    new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({ Success: true, Message: 'late', LogEntry: null, Params: [], RunParams: null } as never);
                        }, 500);
                    })
            );

            const params = buildParams({ AbortSignal: upstream.signal });
            // Fire the upstream abort shortly after the call starts.
            setTimeout(() => upstream.abort('user-initiated cancel'), 20);
            const result = await engine.RunAction(params as unknown as Record<string, Function>);

            expect(result.Success).toBe(false);
            expect(result.Message).toBe('user-initiated cancel');
        });

        it('does not corrupt caller-visible params after the run', async () => {
            vi.spyOn(engine as never, 'InternalRunAction' as never).mockResolvedValue({
                Success: true,
                Message: 'ok',
                LogEntry: null,
                Params: [],
                RunParams: null
            } as never);

            const upstream = new AbortController();
            const params = buildParams({ AbortSignal: upstream.signal });
            await engine.RunAction(params as unknown as Record<string, Function>);

            // The wrapper should have restored the original AbortSignal (or undefined)
            // on `params` so callers don't see our internal merged signal leaked.
            expect(params.AbortSignal).toBe(upstream.signal);
        });
    });
});
