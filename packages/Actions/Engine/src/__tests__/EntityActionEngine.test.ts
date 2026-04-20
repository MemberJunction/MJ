import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MJGlobal
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
    RegisterClass: () => (target: Function) => target,
    SafeJSONParse: vi.fn((str: string) => {
        try { return JSON.parse(str); } catch { return null; }
    }),
}));

// Mock @memberjunction/core
vi.mock('@memberjunction/core', () => ({
    BaseEntity: class {},
    Metadata: vi.fn(),
    RunView: vi.fn(),
    LogError: vi.fn(),
    BaseEngine: class {
        static getInstance() { return new this(); }
        protected ContextUser = { ID: 'test-user' };
        protected Loaded = true;
        async Config() {}
        async Load() {}
        protected async AdditionalLoading() {}
        protected HandleSingleViewResult() {}
        protected RunViewProviderToUse = undefined;
    },
    UserInfo: class {},
    BaseEnginePropertyConfig: class {},
    CodeNameFromString: (s: string) => s.replace(/\s/g, '_'),
    IMetadataProvider: class {},
}));

// Mock @memberjunction/core-entities
vi.mock('@memberjunction/core-entities', () => ({
    MJActionParamEntity: class { ID = ''; Name = ''; ValueType = ''; Value = ''; Type = ''; ActionID = ''; },
    MJEntityActionParamEntity: class { ActionParamID = ''; ValueType = ''; Value = ''; EntityActionID = ''; },
    MJActionResultCodeEntity: class {},
    MJActionExecutionLogEntity: class {},
    MJActionFilterEntity: class {},
    MJActionCategoryEntity: class {},
    MJActionEntity: class {},
    MJActionLibraryEntity: class {},
    MJEntityActionFilterEntity: class {},
    MJEntityActionInvocationEntity: class {},
    MJEntityActionInvocationTypeEntity: class {},
    MJEntityActionEntity: class {},
}));

// Mock @memberjunction/actions-base
vi.mock('@memberjunction/actions-base', () => ({
    ActionEngineBase: class {
        static get Instance() { return new this(); }
        static getInstance() { return new this(); }
        get Actions() { return []; }
        get ActionParams() { return []; }
        get ActionResultCodes() { return []; }
        get ActionFilters() { return []; }
        async Config() {}
        async Load() {}
        protected async AdditionalLoading() {}
        protected HandleSingleViewResult() {}
        protected RunViewProviderToUse = undefined;
    },
    EntityActionEngineBase: class {
        static get Instance() { return new this(); }
        static getInstance() { return new this(); }
        get EntityActions() { return []; }
        get Filters() { return []; }
        get Invocations() { return []; }
        get Params() { return []; }
        async Config() {}
        async Load() {}
        protected async AdditionalLoading() {}
        protected HandleSingleViewResult() {}
        protected RunViewProviderToUse = undefined;
    },
    MJActionEntityExtended: class { ID = ''; Name = ''; DriverClass = ''; Params = []; },
    MJEntityActionEntityExtended: class { ID = ''; ActionID = ''; Filters = []; Params = []; },
    ActionParam: class { Name = ''; Value: unknown = null; Type = 'Input'; },
    ActionResult: class {},
    ActionResultSimple: class { Success = false; ResultCode = ''; Message = ''; },
    RunActionParams: class {},
    EntityActionInvocationParams: class {},
    EntityActionResult: class {},
}));

// Mock ActionEngineServer (from own package)
vi.mock('../generic/ActionEngine', () => ({
    ActionEngineServer: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Actions: [],
            ActionFilters: [],
            RunAction: vi.fn().mockResolvedValue({
                Success: true,
                Message: 'OK',
                RunParams: {},
                LogEntry: null,
            }),
        },
    },
}));

import { EntityActionEngineServer } from '../entity-actions/EntityActionEngine';
import {
    EntityActionInvocationBase,
    EntityActionInvocationSingleRecord,
    EntityActionInvocationMultipleRecords,
    EntityActionInvocationValidate,
} from '../entity-actions/EntityActionInvocationTypes';

describe('EntityActionEngineServer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('RunEntityAction', () => {
        it('should throw when EntityAction is not provided', async () => {
            const engine = new EntityActionEngineServer();
            const params = { EntityAction: null, InvocationType: { Name: 'Read' } };

            await expect(engine.RunEntityAction(params as unknown as Record<string, Function>)).rejects.toThrow('EntityAction is required');
        });

        it('should throw when InvocationType is not provided', async () => {
            const engine = new EntityActionEngineServer();
            const params = { EntityAction: { ID: 'ea-1' }, InvocationType: null };

            await expect(engine.RunEntityAction(params as unknown as Record<string, Function>)).rejects.toThrow('Invalid invocation type');
        });

        it('should throw when ClassFactory fails to create invocation instance', async () => {
            mockClassFactory.CreateInstance.mockReturnValue(null);

            const engine = new EntityActionEngineServer();
            const params = {
                EntityAction: { ID: 'ea-1' },
                InvocationType: { Name: 'Read' },
            };

            await expect(engine.RunEntityAction(params as unknown as Record<string, Function>)).rejects.toThrow('Error creating instance');
        });

        it('should invoke action on the created instance', async () => {
            const mockInvocation = {
                InvokeAction: vi.fn().mockResolvedValue({ Success: true, Message: 'OK' }),
            };
            mockClassFactory.CreateInstance.mockReturnValue(mockInvocation);

            const engine = new EntityActionEngineServer();
            const params = {
                EntityAction: { ID: 'ea-1' },
                InvocationType: { Name: 'SingleRecord' },
            };

            const result = await engine.RunEntityAction(params as unknown as Record<string, Function>);

            expect(mockInvocation.InvokeAction).toHaveBeenCalledWith(params);
            expect(result.Success).toBe(true);
        });
    });
});

describe('EntityActionInvocationBase', () => {
    describe('FindActionParam', () => {
        it('should find param by valueType (case insensitive)', () => {
            // We need a concrete class that doesn't use the abstract method
            const invocation = new EntityActionInvocationSingleRecord();

            const params = [
                { ValueType: ' Scalar ', Name: 'p1', ID: '1' },
                { ValueType: 'Simple Object', Name: 'p2', ID: '2' },
                { ValueType: 'BaseEntity Sub-Class', Name: 'p3', ID: '3' },
            ];

            const result = invocation.FindActionParam(params as never, 'Scalar');
            expect(result).toBeDefined();
            expect((result as Record<string, unknown>).Name).toBe('p1');
        });

        it('should return undefined when no match found', () => {
            const invocation = new EntityActionInvocationSingleRecord();
            const params = [{ ValueType: 'Scalar', Name: 'p1', ID: '1' }];

            const result = invocation.FindActionParam(params as never, 'Other');
            expect(result).toBeUndefined();
        });
    });

    describe('MapActionResultToEntityActionResult', () => {
        it('should map fields correctly', () => {
            const invocation = new EntityActionInvocationSingleRecord();
            const actionResult = {
                Success: true,
                Message: 'Done',
                RunParams: { Action: { Name: 'Test' } },
                LogEntry: { ID: 'log-1' },
            };

            const result = invocation.MapActionResultToEntityActionResult(actionResult as unknown as Record<string, Function>);

            expect(result.Success).toBe(true);
            expect(result.Message).toBe('Done');
            expect(result.RunParams).toBe(actionResult.RunParams);
            expect(result.LogEntry).toBe(actionResult.LogEntry);
        });
    });

    describe('MapParams', () => {
        it('should handle Static valueType with JSON', async () => {
            const invocation = new EntityActionInvocationSingleRecord();

            const params = [{ ID: 'p1', Name: 'param1', Type: 'Input' }];
            const entityActionParams = [
                { ActionParamID: 'p1', ValueType: 'Static', Value: '{"key":"val"}' },
            ];

            const result = await invocation.MapParams(params as never, entityActionParams as never, {} as unknown as Record<string, Function>);

            expect(result).toHaveLength(1);
            expect(result[0].Name).toBe('param1');
            expect(result[0].Value).toEqual({ key: 'val' });
        });

        it('should handle Static valueType with non-JSON string', async () => {
            const invocation = new EntityActionInvocationSingleRecord();

            const params = [{ ID: 'p1', Name: 'param1', Type: 'Input' }];
            const entityActionParams = [
                { ActionParamID: 'p1', ValueType: 'Static', Value: 'plain-string' },
            ];

            const result = await invocation.MapParams(params as never, entityActionParams as never, {} as unknown as Record<string, Function>);

            expect(result[0].Value).toBe('plain-string');
        });

        it('should handle Entity Object valueType', async () => {
            const invocation = new EntityActionInvocationSingleRecord();
            const entityObject = { ID: 'entity-1', Name: 'MJTestEntity' };

            const params = [{ ID: 'p1', Name: 'entity', Type: 'Input' }];
            const entityActionParams = [
                { ActionParamID: 'p1', ValueType: 'Entity Object', Value: '' },
            ];

            const result = await invocation.MapParams(params as never, entityActionParams as never, entityObject as unknown as Record<string, Function>);

            expect(result[0].Value).toBe(entityObject);
        });

        it('should handle Entity Field valueType', async () => {
            const invocation = new EntityActionInvocationSingleRecord();
            const entityObject = { ID: 'entity-1', Name: 'MJTestEntity', Status: 'Active' };

            const params = [{ ID: 'p1', Name: 'status', Type: 'Input' }];
            const entityActionParams = [
                { ActionParamID: 'p1', ValueType: 'Entity Field', Value: 'Status' },
            ];

            const result = await invocation.MapParams(params as never, entityActionParams as never, entityObject as unknown as Record<string, Function>);

            expect(result[0].Value).toBe('Active');
        });

        it('should handle Script valueType', async () => {
            const invocation = new EntityActionInvocationSingleRecord();
            // Override SafeEvalScript to avoid actual eval
            vi.spyOn(invocation, 'SafeEvalScript').mockResolvedValue('script-result');

            const params = [{ ID: 'p1', Name: 'computed', Type: 'Input' }];
            const entityActionParams = [
                { ActionParamID: 'p1', ValueType: 'Script', Value: 'return 42', ID: 'eap-1' },
            ];

            const result = await invocation.MapParams(params as never, entityActionParams as never, {} as unknown as Record<string, Function>);

            expect(result[0].Value).toBe('script-result');
        });
    });

    describe('SafeEvalScript', () => {
        it('should execute simple scripts and return result', async () => {
            const invocation = new EntityActionInvocationSingleRecord();

            const result = await invocation.SafeEvalScript(
                'test-1',
                'EntityActionContext.result = 42;',
                {} as never
            );

            expect(result).toBe(42);
        });

        it('should return null on script error', async () => {
            const invocation = new EntityActionInvocationSingleRecord();

            const result = await invocation.SafeEvalScript(
                'test-err',
                'throw new Error("boom");',
                {} as never
            );

            expect(result).toBeNull();
        });

        it('should cache compiled scripts by EntityActionID', async () => {
            const invocation = new EntityActionInvocationSingleRecord();

            await invocation.SafeEvalScript('cache-test', 'EntityActionContext.result = 1;', {} as unknown as Record<string, Function>);
            await invocation.SafeEvalScript('cache-test', 'EntityActionContext.result = 2;', {} as unknown as Record<string, Function>);

            // Second call should use cached version (same ID), so result stays 1
            const result = await invocation.SafeEvalScript('cache-test', 'EntityActionContext.result = 3;', {} as unknown as Record<string, Function>);
            expect(result).toBe(1); // The cached first script
        });

        it('should pass entity object via EntityActionContext', async () => {
            const invocation = new EntityActionInvocationSingleRecord();
            const entity = { Name: 'MJTestEntity' };

            const result = await invocation.SafeEvalScript(
                'entity-test',
                'EntityActionContext.result = EntityActionContext.entityObject.Name;',
                entity as never
            );

            expect(result).toBe('MJTestEntity');
        });
    });
});

describe('EntityActionInvocationSingleRecord', () => {
    describe('ValidateParams', () => {
        it('should throw when EntityObject is null', async () => {
            const invocation = new EntityActionInvocationSingleRecord();
            const params = { EntityObject: null };

            await expect(invocation.ValidateParams(params as unknown as Record<string, Function>)).rejects.toThrow(
                'EntityObject is required'
            );
        });

        it('should return true when EntityObject is present', async () => {
            const invocation = new EntityActionInvocationSingleRecord();
            const params = { EntityObject: { ID: 'e-1' } };

            const result = await invocation.ValidateParams(params as unknown as Record<string, Function>);
            expect(result).toBe(true);
        });
    });
});

describe('EntityActionInvocationMultipleRecords', () => {
    describe('ValidateParams', () => {
        it('should throw when InvocationType=List and no ListID', async () => {
            const invocation = new EntityActionInvocationMultipleRecords();
            const params = {
                InvocationType: { Name: 'List' },
                ListID: null,
            };

            await expect(invocation.ValidateParams(params as unknown as Record<string, Function>)).rejects.toThrow(
                'ListID is required'
            );
        });

        it('should throw when InvocationType=View and no ViewID', async () => {
            const invocation = new EntityActionInvocationMultipleRecords();
            const params = {
                InvocationType: { Name: 'View' },
                ViewID: null,
            };

            await expect(invocation.ValidateParams(params as unknown as Record<string, Function>)).rejects.toThrow(
                'ViewID is required'
            );
        });

        it('should throw for unsupported invocation types', async () => {
            const invocation = new EntityActionInvocationMultipleRecords();
            const params = {
                InvocationType: { Name: 'Unknown' },
            };

            await expect(invocation.ValidateParams(params as unknown as Record<string, Function>)).rejects.toThrow(
                'only supports invocation types of List or View'
            );
        });

        it('should return true for List with valid ListID', async () => {
            const invocation = new EntityActionInvocationMultipleRecords();
            const params = {
                InvocationType: { Name: 'List' },
                ListID: 'list-1',
            };

            const result = await invocation.ValidateParams(params as unknown as Record<string, Function>);
            expect(result).toBe(true);
        });

        it('should return true for View with valid ViewID', async () => {
            const invocation = new EntityActionInvocationMultipleRecords();
            const params = {
                InvocationType: { Name: 'View' },
                ViewID: 'view-1',
            };

            const result = await invocation.ValidateParams(params as unknown as Record<string, Function>);
            expect(result).toBe(true);
        });

        it('should be case insensitive for invocation type name', async () => {
            const invocation = new EntityActionInvocationMultipleRecords();
            const params = {
                InvocationType: { Name: '  LIST  ' },
                ListID: 'list-1',
            };

            const result = await invocation.ValidateParams(params as unknown as Record<string, Function>);
            expect(result).toBe(true);
        });
    });

    describe('GetRecordList', () => {
        it('should return empty array by default', async () => {
            const invocation = new EntityActionInvocationMultipleRecords();
            const result = await (invocation as unknown as Record<string, Function>)['GetRecordList']();
            expect(result).toEqual([]);
        });
    });
});

describe('EntityActionInvocationValidate', () => {
    it('should extend EntityActionInvocationSingleRecord', () => {
        const invocation = new EntityActionInvocationValidate();
        expect(invocation).toBeInstanceOf(EntityActionInvocationSingleRecord);
    });
});
