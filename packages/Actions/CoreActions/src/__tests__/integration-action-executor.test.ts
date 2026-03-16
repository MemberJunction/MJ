import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResultSimple } from '@memberjunction/actions-base';
import type {
    CRUDResult,
    ExternalRecord,
    SearchResult,
    ListResult,
} from '@memberjunction/integration-engine';

// ─── Mock Setup ─────────────────────────────────────────────────────

// Mock connector instance used across all tests
const mockConnector = {
    SupportsCreate: true,
    SupportsUpdate: true,
    SupportsDelete: true,
    SupportsSearch: true,
    SupportsListing: true,
    GetRecord: vi.fn(),
    CreateRecord: vi.fn(),
    UpdateRecord: vi.fn(),
    DeleteRecord: vi.fn(),
    SearchRecords: vi.fn(),
    ListRecords: vi.fn(),
};

// Configurable RunView responses per entity
const mockRunViewResults: Map<string, { Success: boolean; Results: unknown[] }> = new Map();

function defaultRunViewResult(entityName: string): { Success: boolean; Results: unknown[] } {
    if (entityName === 'Integrations') {
        return {
            Success: true,
            Results: [{ Name: 'TestCRM', ClassName: 'TestConnector' }],
        };
    }
    if (entityName === 'Company Integrations') {
        return {
            Success: true,
            Results: [{ ID: 'ci-1', Name: 'TestCRM Default' }],
        };
    }
    return { Success: true, Results: [] };
}

// ─── Module Mocks ───────────────────────────────────────────────────

vi.mock('@memberjunction/integration-engine', () => ({
    ConnectorFactory: {
        Resolve: vi.fn(() => mockConnector),
    },
    BaseIntegrationConnector: class {},
}));

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        async RunView(viewParams: Record<string, unknown>): Promise<{ Success: boolean; Results: unknown[] }> {
            const entityName = viewParams['EntityName'] as string;
            const stored = mockRunViewResults.get(entityName);
            return stored ?? defaultRunViewResult(entityName);
        }
    }

    class MockMetadata {
        async GetEntityObject(): Promise<Record<string, unknown>> {
            return {
                Load: vi.fn().mockResolvedValue(true),
                ID: 'ci-explicit',
                Name: 'Explicit CI',
            };
        }
    }

    return {
        RunView: MockRunView,
        Metadata: MockMetadata,
    };
});

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual('@memberjunction/global') as Record<string, unknown>;
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        protected async InternalRunAction(_params: unknown): Promise<ActionResultSimple> {
            return { Success: false, ResultCode: 'NOT_IMPLEMENTED' } as ActionResultSimple;
        }
    },
}));

// Import after mocks are set up
import { IntegrationActionExecutor } from '../custom/integration/integration-action-executor.js';

// ─── Test Helpers ───────────────────────────────────────────────────

interface MockActionParam {
    Name: string;
    Value: unknown;
    Type: 'Input' | 'Output' | 'Both';
}

interface MockRunActionParams {
    Action: { Config_?: string };
    ContextUser: { ID: string };
    Params: MockActionParam[];
    Filters: unknown[];
}

function param(name: string, value: unknown, type: 'Input' | 'Output' | 'Both' = 'Input'): MockActionParam {
    return { Name: name, Value: value, Type: type };
}

function makeParams(
    verb: string,
    objectName: string,
    integrationName: string,
    inputParams: MockActionParam[] = []
): MockRunActionParams {
    const config = JSON.stringify({ IntegrationName: integrationName, ObjectName: objectName, Verb: verb });
    return {
        Action: { Config_: config },
        ContextUser: { ID: 'user-1' },
        Params: inputParams,
        Filters: [],
    };
}

/** Calls the protected InternalRunAction via bracket access */
async function run(executor: IntegrationActionExecutor, params: MockRunActionParams): Promise<ActionResultSimple> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (executor as Record<string, (...args: unknown[]) => Promise<ActionResultSimple>>)['InternalRunAction'](params);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('IntegrationActionExecutor', () => {
    let executor: IntegrationActionExecutor;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRunViewResults.clear();
        // Restore capability flags
        mockConnector.SupportsCreate = true;
        mockConnector.SupportsUpdate = true;
        mockConnector.SupportsDelete = true;
        mockConnector.SupportsSearch = true;
        mockConnector.SupportsListing = true;
        executor = new IntegrationActionExecutor();
    });

    // ─── Config Parsing ─────────────────────────────────────────────

    describe('Config parsing', () => {
        it('should return EXECUTOR_ERROR when Action.Config is missing', async () => {
            const p = { Action: {}, ContextUser: { ID: 'u' }, Params: [], Filters: [] };
            const result = await run(executor, p as MockRunActionParams);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('Action.Config_ is required');
        });

        it('should return EXECUTOR_ERROR when Config JSON is missing required fields', async () => {
            const p = { Action: { Config_: '{"IntegrationName":"X"}' }, ContextUser: { ID: 'u' }, Params: [], Filters: [] };
            const result = await run(executor, p as MockRunActionParams);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('Invalid Action.Config_');
        });

        it('should return EXECUTOR_ERROR for invalid JSON in Config', async () => {
            const p = { Action: { Config_: 'not json' }, ContextUser: { ID: 'u' }, Params: [], Filters: [] };
            const result = await run(executor, p as MockRunActionParams);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
        });
    });

    // ─── Get Verb ───────────────────────────────────────────────────

    describe('Get verb', () => {
        it('should return SUCCESS with record fields when found', async () => {
            const record: ExternalRecord = {
                ExternalID: 'ext-123', ObjectType: 'contacts',
                Fields: { email: 'test@example.com', firstname: 'John' },
            };
            mockConnector.GetRecord.mockResolvedValue(record);

            const result = await run(executor, makeParams('Get', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-123'),
            ]));

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');

            const recordOut = result.Params?.find(p => p.Name === 'Record' && p.Type === 'Output');
            expect(recordOut?.Value).toEqual({ email: 'test@example.com', firstname: 'John' });

            const idOut = result.Params?.find(p => p.Name === 'ExternalID' && p.Type === 'Output');
            expect(idOut?.Value).toBe('ext-123');
        });

        it('should return NOT_FOUND when record does not exist', async () => {
            mockConnector.GetRecord.mockResolvedValue(null);
            const result = await run(executor, makeParams('Get', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-999'),
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('NOT_FOUND');
        });

        it('should return EXECUTOR_ERROR when ExternalID is missing', async () => {
            const result = await run(executor, makeParams('Get', 'contacts', 'TestCRM', []));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('ExternalID');
        });
    });

    // ─── Create Verb ────────────────────────────────────────────────

    describe('Create verb', () => {
        it('should return SUCCESS with ExternalID on successful create', async () => {
            mockConnector.CreateRecord.mockResolvedValue({ Success: true, ExternalID: 'new-123', StatusCode: 201 } as CRUDResult);

            const result = await run(executor, makeParams('Create', 'contacts', 'TestCRM', [
                param('email', 'new@example.com'),
                param('firstname', 'Jane'),
            ]));

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
            const idOut = result.Params?.find(p => p.Name === 'ExternalID' && p.Type === 'Output');
            expect(idOut?.Value).toBe('new-123');
        });

        it('should return CREATE_FAILED when connector fails', async () => {
            mockConnector.CreateRecord.mockResolvedValue({ Success: false, ErrorMessage: 'Duplicate email', StatusCode: 409 } as CRUDResult);

            const result = await run(executor, makeParams('Create', 'contacts', 'TestCRM', [
                param('email', 'dup@example.com'),
            ]));

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('CREATE_FAILED');
            expect(result.Message).toContain('Duplicate email');
        });

        it('should return NOT_SUPPORTED when connector does not support create', async () => {
            mockConnector.SupportsCreate = false;
            const result = await run(executor, makeParams('Create', 'contacts', 'TestCRM', [
                param('email', 'test@test.com'),
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('NOT_SUPPORTED');
        });

        it('should exclude system params from attributes', async () => {
            mockConnector.CreateRecord.mockResolvedValue({ Success: true, ExternalID: 'new-1', StatusCode: 201 } as CRUDResult);

            await run(executor, makeParams('Create', 'contacts', 'TestCRM', [
                param('email', 'test@test.com'),
                param('CompanyIntegrationID', 'ci-override'),
                param('ExternalID', 'should-be-ignored'),
            ]));

            const callCtx = mockConnector.CreateRecord.mock.calls[0][0];
            expect(callCtx.Attributes).toHaveProperty('email', 'test@test.com');
            expect(callCtx.Attributes).not.toHaveProperty('CompanyIntegrationID');
            expect(callCtx.Attributes).not.toHaveProperty('ExternalID');
        });
    });

    // ─── Update Verb ────────────────────────────────────────────────

    describe('Update verb', () => {
        it('should return SUCCESS on successful update', async () => {
            mockConnector.UpdateRecord.mockResolvedValue({ Success: true, ExternalID: 'ext-123', StatusCode: 200 } as CRUDResult);

            const result = await run(executor, makeParams('Update', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-123'),
                param('firstname', 'Updated'),
            ]));
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
        });

        it('should return UPDATE_FAILED on failure', async () => {
            mockConnector.UpdateRecord.mockResolvedValue({ Success: false, ErrorMessage: 'Not found', StatusCode: 404 } as CRUDResult);

            const result = await run(executor, makeParams('Update', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-999'),
                param('firstname', 'Updated'),
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('UPDATE_FAILED');
        });

        it('should pass ExternalID and Attributes correctly', async () => {
            mockConnector.UpdateRecord.mockResolvedValue({ Success: true, ExternalID: 'ext-1', StatusCode: 200 } as CRUDResult);

            await run(executor, makeParams('Update', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-1'),
                param('email', 'changed@test.com'),
                param('firstname', 'Changed'),
            ]));

            const callCtx = mockConnector.UpdateRecord.mock.calls[0][0];
            expect(callCtx.ExternalID).toBe('ext-1');
            expect(callCtx.Attributes).toEqual({ email: 'changed@test.com', firstname: 'Changed' });
        });
    });

    // ─── Delete Verb ────────────────────────────────────────────────

    describe('Delete verb', () => {
        it('should return SUCCESS on successful delete', async () => {
            mockConnector.DeleteRecord.mockResolvedValue({ Success: true, StatusCode: 204 } as CRUDResult);

            const result = await run(executor, makeParams('Delete', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-123'),
            ]));
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
        });

        it('should return DELETE_FAILED on failure', async () => {
            mockConnector.DeleteRecord.mockResolvedValue({ Success: false, ErrorMessage: 'Permission denied', StatusCode: 403 } as CRUDResult);

            const result = await run(executor, makeParams('Delete', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-123'),
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('DELETE_FAILED');
        });

        it('should require ExternalID', async () => {
            const result = await run(executor, makeParams('Delete', 'contacts', 'TestCRM', []));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('ExternalID');
        });
    });

    // ─── Search Verb ────────────────────────────────────────────────

    describe('Search verb', () => {
        it('should return SUCCESS with records, TotalCount, HasMore', async () => {
            const searchResult: SearchResult = {
                Records: [
                    { ExternalID: 'ext-1', ObjectType: 'contacts', Fields: { email: 'a@test.com' } },
                    { ExternalID: 'ext-2', ObjectType: 'contacts', Fields: { email: 'b@test.com' } },
                ],
                TotalCount: 50,
                HasMore: true,
            };
            mockConnector.SearchRecords.mockResolvedValue(searchResult);

            const result = await run(executor, makeParams('Search', 'contacts', 'TestCRM', [
                param('email', 'test.com'),
                param('PageSize', '10'),
                param('Page', '1'),
            ]));

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');

            expect(result.Params?.find(p => p.Name === 'Records' && p.Type === 'Output')?.Value).toHaveLength(2);
            expect(result.Params?.find(p => p.Name === 'TotalCount' && p.Type === 'Output')?.Value).toBe(50);
            expect(result.Params?.find(p => p.Name === 'HasMore' && p.Type === 'Output')?.Value).toBe(true);
        });

        it('should pass filters (non-system input params) to connector', async () => {
            mockConnector.SearchRecords.mockResolvedValue({ Records: [], TotalCount: 0, HasMore: false } as SearchResult);

            await run(executor, makeParams('Search', 'contacts', 'TestCRM', [
                param('email', 'test@test.com'),
                param('firstname', 'John'),
                param('PageSize', '25'),
                param('Sort', 'email ASC'),
            ]));

            const callCtx = mockConnector.SearchRecords.mock.calls[0][0];
            expect(callCtx.Filters).toEqual({ email: 'test@test.com', firstname: 'John' });
            expect(callCtx.PageSize).toBe(25);
            expect(callCtx.Sort).toBe('email ASC');
        });

        it('should return NOT_SUPPORTED when connector does not support search', async () => {
            mockConnector.SupportsSearch = false;
            const result = await run(executor, makeParams('Search', 'contacts', 'TestCRM', []));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('NOT_SUPPORTED');
        });
    });

    // ─── List Verb ──────────────────────────────────────────────────

    describe('List verb', () => {
        it('should return SUCCESS with records, HasMore, NextCursor', async () => {
            const listResult: ListResult = {
                Records: [{ ExternalID: 'ext-1', ObjectType: 'contacts', Fields: { email: 'a@test.com' } }],
                HasMore: true,
                NextCursor: 'cursor-abc',
                TotalCount: 100,
            };
            mockConnector.ListRecords.mockResolvedValue(listResult);

            const result = await run(executor, makeParams('List', 'contacts', 'TestCRM', [
                param('PageSize', '50'),
                param('Cursor', 'cursor-prev'),
            ]));

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
            expect(result.Params?.find(p => p.Name === 'Records' && p.Type === 'Output')?.Value).toHaveLength(1);
            expect(result.Params?.find(p => p.Name === 'NextCursor' && p.Type === 'Output')?.Value).toBe('cursor-abc');
            expect(result.Params?.find(p => p.Name === 'HasMore' && p.Type === 'Output')?.Value).toBe(true);
        });

        it('should return NOT_SUPPORTED when connector does not support listing', async () => {
            mockConnector.SupportsListing = false;
            const result = await run(executor, makeParams('List', 'contacts', 'TestCRM', []));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('NOT_SUPPORTED');
        });

        it('should pass cursor and pageSize to connector', async () => {
            mockConnector.ListRecords.mockResolvedValue({ Records: [], HasMore: false } as ListResult);

            await run(executor, makeParams('List', 'contacts', 'TestCRM', [
                param('PageSize', '20'),
                param('Cursor', 'cur-xyz'),
                param('Sort', 'created DESC'),
            ]));

            const callCtx = mockConnector.ListRecords.mock.calls[0][0];
            expect(callCtx.PageSize).toBe(20);
            expect(callCtx.Cursor).toBe('cur-xyz');
            expect(callCtx.Sort).toBe('created DESC');
        });
    });

    // ─── Edge Cases ─────────────────────────────────────────────────

    describe('Unsupported verb', () => {
        it('should return EXECUTOR_ERROR for unknown verb', async () => {
            const result = await run(executor, makeParams('Patch', 'contacts', 'TestCRM', []));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('Unsupported verb');
        });
    });

    describe('Integration resolution', () => {
        it('should return EXECUTOR_ERROR when integration is not found', async () => {
            mockRunViewResults.set('Integrations', { Success: true, Results: [] });
            const result = await run(executor, makeParams('Get', 'contacts', 'NonExistentCRM', [
                param('ExternalID', 'ext-1'),
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('not found');
        });
    });

    describe('CompanyIntegration resolution', () => {
        it('should return EXECUTOR_ERROR when no CompanyIntegration exists', async () => {
            mockRunViewResults.set('Company Integrations', { Success: true, Results: [] });
            const result = await run(executor, makeParams('Get', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-1'),
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('No CompanyIntegration found');
        });
    });

    describe('Parameter helpers', () => {
        it('should handle case-insensitive parameter names', async () => {
            mockConnector.GetRecord.mockResolvedValue({
                ExternalID: 'ext-1', ObjectType: 'contacts', Fields: { email: 'test@test.com' },
            } as ExternalRecord);

            const result = await run(executor, makeParams('Get', 'contacts', 'TestCRM', [
                param('externalid', 'ext-1'),
            ]));
            expect(result.Success).toBe(true);
        });

        it('should handle whitespace in parameter names', async () => {
            mockConnector.GetRecord.mockResolvedValue({
                ExternalID: 'ext-1', ObjectType: 'contacts', Fields: {},
            } as ExternalRecord);

            const result = await run(executor, makeParams('Get', 'contacts', 'TestCRM', [
                param('  ExternalID  ', 'ext-1'),
            ]));
            expect(result.Success).toBe(true);
        });

        it('should skip null/undefined input values in CollectInputAttributes', async () => {
            mockConnector.CreateRecord.mockResolvedValue({ Success: true, ExternalID: 'new-1', StatusCode: 201 } as CRUDResult);

            await run(executor, makeParams('Create', 'contacts', 'TestCRM', [
                param('email', 'test@test.com'),
                param('firstname', null),
                param('lastname', undefined),
            ]));

            const callCtx = mockConnector.CreateRecord.mock.calls[0][0];
            expect(callCtx.Attributes).toEqual({ email: 'test@test.com' });
            expect(callCtx.Attributes).not.toHaveProperty('firstname');
            expect(callCtx.Attributes).not.toHaveProperty('lastname');
        });
    });

    describe('Error handling', () => {
        it('should catch connector exceptions and return EXECUTOR_ERROR', async () => {
            mockConnector.GetRecord.mockRejectedValue(new Error('Connection timeout'));

            const result = await run(executor, makeParams('Get', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-1'),
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('Connection timeout');
        });

        it('should handle non-Error throws', async () => {
            mockConnector.GetRecord.mockRejectedValue('string error');

            const result = await run(executor, makeParams('Get', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-1'),
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('string error');
        });
    });

    describe('Output param behavior', () => {
        it('should update existing output params rather than duplicating', async () => {
            mockConnector.GetRecord.mockResolvedValue({
                ExternalID: 'ext-1', ObjectType: 'contacts', Fields: { email: 'test@test.com' },
            } as ExternalRecord);

            const result = await run(executor, makeParams('Get', 'contacts', 'TestCRM', [
                param('ExternalID', 'ext-1'),
                param('Record', null, 'Output'),
                param('ExternalID', null, 'Output'),
            ]));

            expect(result.Success).toBe(true);
            const recordOutputs = result.Params?.filter(p => p.Name === 'Record' && p.Type === 'Output');
            expect(recordOutputs).toHaveLength(1);
            expect(recordOutputs![0].Value).toEqual({ email: 'test@test.com' });
        });
    });
});
