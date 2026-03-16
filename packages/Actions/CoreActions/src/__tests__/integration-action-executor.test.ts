import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionParam, RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';
import type { MJActionEntity } from '@memberjunction/core-entities';
import type {
    CRUDResult,
    ExternalRecord,
    SearchResult,
    ListResult,
} from '@memberjunction/integration-engine';

// ─── Mock Setup ─────────────────────────────────────────────────────
// We mock external dependencies so the executor can be tested in isolation.

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

// Mock ConnectorFactory.Resolve
vi.mock('@memberjunction/integration-engine', () => ({
    ConnectorFactory: {
        Resolve: vi.fn(() => mockConnector),
    },
    BaseIntegrationConnector: class {},
}));

// Mock RunView
const mockRunViewResults: Map<string, { Success: boolean; Results: unknown[] }> = new Map();

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual('@memberjunction/core') as Record<string, unknown>;
    return {
        ...actual,
        RunView: vi.fn().mockImplementation(() => ({
            RunView: vi.fn().mockImplementation((viewParams: Record<string, unknown>) => {
                const entityName = viewParams['EntityName'] as string;
                const stored = mockRunViewResults.get(entityName);
                if (stored) return Promise.resolve(stored);
                // Default: return a mock entity
                if (entityName === 'Integrations') {
                    return Promise.resolve({
                        Success: true,
                        Results: [{ Name: 'TestCRM', ClassName: 'TestConnector', Get: vi.fn(() => null) }],
                    });
                }
                if (entityName === 'Company Integrations') {
                    return Promise.resolve({
                        Success: true,
                        Results: [{ ID: 'ci-1', Name: 'TestCRM Default' }],
                    });
                }
                return Promise.resolve({ Success: true, Results: [] });
            }),
        })),
        Metadata: vi.fn().mockImplementation(() => ({
            GetEntityObject: vi.fn().mockResolvedValue({
                Load: vi.fn().mockResolvedValue(true),
                ID: 'ci-explicit',
                Name: 'Explicit CI',
            }),
        })),
    };
});

// Mock entity modules
vi.mock('@memberjunction/core-entities', () => ({}));

// ─── Import after mocks ─────────────────────────────────────────────

// We need to import the class dynamically after mocking
// The executor uses @RegisterClass which needs @memberjunction/global
vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual('@memberjunction/global') as Record<string, unknown>;
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target, // No-op decorator
    };
});

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        protected async InternalRunAction(_params: RunActionParams): Promise<ActionResultSimple> {
            return { Success: false, ResultCode: 'NOT_IMPLEMENTED', Message: 'base' } as ActionResultSimple;
        }
    },
}));

// Now import the executor
import { IntegrationActionExecutor } from '../custom/integration/integration-action-executor.js';

// ─── Test Helpers ───────────────────────────────────────────────────

function createActionParam(name: string, value: unknown, type: 'Input' | 'Output' | 'Both' = 'Input'): ActionParam {
    return { Name: name, Value: value, Type: type } as ActionParam;
}

function createRunParams(
    verb: string,
    objectName: string,
    integrationName: string,
    inputParams: ActionParam[] = []
): RunActionParams {
    const config = JSON.stringify({ IntegrationName: integrationName, ObjectName: objectName, Verb: verb });
    return {
        Action: { Config: config } as unknown as MJActionEntity,
        ContextUser: { ID: 'user-1' } as unknown as RunActionParams['ContextUser'],
        Params: inputParams,
        Filters: [],
    } as RunActionParams;
}

// Access the private InternalRunAction through prototype
async function runAction(executor: IntegrationActionExecutor, params: RunActionParams): Promise<ActionResultSimple> {
    // InternalRunAction is protected, so we access it via the prototype
    return (executor as Record<string, unknown>)['InternalRunAction'].call(executor, params) as Promise<ActionResultSimple>;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('IntegrationActionExecutor', () => {
    let executor: IntegrationActionExecutor;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRunViewResults.clear();
        executor = new IntegrationActionExecutor();
    });

    describe('Config parsing', () => {
        it('should throw when Action.Config is missing', async () => {
            const params = {
                Action: {} as MJActionEntity,
                ContextUser: {} as RunActionParams['ContextUser'],
                Params: [],
                Filters: [],
            } as RunActionParams;

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('Action.Config is required');
        });

        it('should throw when Config JSON is missing required fields', async () => {
            const params = {
                Action: { Config: '{"IntegrationName":"X"}' } as unknown as MJActionEntity,
                ContextUser: {} as RunActionParams['ContextUser'],
                Params: [],
                Filters: [],
            } as RunActionParams;

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('Invalid Action.Config');
        });

        it('should throw for invalid JSON in Config', async () => {
            const params = {
                Action: { Config: 'not json' } as unknown as MJActionEntity,
                ContextUser: {} as RunActionParams['ContextUser'],
                Params: [],
                Filters: [],
            } as RunActionParams;

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
        });
    });

    describe('Get verb', () => {
        it('should return SUCCESS with record fields when found', async () => {
            const record: ExternalRecord = {
                ExternalID: 'ext-123',
                ObjectType: 'contacts',
                Fields: { email: 'test@example.com', firstname: 'John' },
            };
            mockConnector.GetRecord.mockResolvedValue(record);

            const params = createRunParams('Get', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-123'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');

            // Check output params were set
            const recordOutput = result.Params?.find(p => p.Name === 'Record' && p.Type === 'Output');
            expect(recordOutput).toBeDefined();
            expect(recordOutput!.Value).toEqual({ email: 'test@example.com', firstname: 'John' });

            const idOutput = result.Params?.find(p => p.Name === 'ExternalID' && p.Type === 'Output');
            expect(idOutput).toBeDefined();
            expect(idOutput!.Value).toBe('ext-123');
        });

        it('should return NOT_FOUND when record does not exist', async () => {
            mockConnector.GetRecord.mockResolvedValue(null);

            const params = createRunParams('Get', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-999'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('NOT_FOUND');
        });

        it('should throw when ExternalID param is missing', async () => {
            const params = createRunParams('Get', 'contacts', 'TestCRM', []);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('ExternalID');
        });
    });

    describe('Create verb', () => {
        it('should return SUCCESS with ExternalID on successful create', async () => {
            const crudResult: CRUDResult = { Success: true, ExternalID: 'new-123', StatusCode: 201 };
            mockConnector.CreateRecord.mockResolvedValue(crudResult);

            const params = createRunParams('Create', 'contacts', 'TestCRM', [
                createActionParam('email', 'new@example.com'),
                createActionParam('firstname', 'Jane'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');

            const idOutput = result.Params?.find(p => p.Name === 'ExternalID' && p.Type === 'Output');
            expect(idOutput?.Value).toBe('new-123');
        });

        it('should return CREATE_FAILED when connector fails', async () => {
            const crudResult: CRUDResult = { Success: false, ErrorMessage: 'Duplicate email', StatusCode: 409 };
            mockConnector.CreateRecord.mockResolvedValue(crudResult);

            const params = createRunParams('Create', 'contacts', 'TestCRM', [
                createActionParam('email', 'dup@example.com'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('CREATE_FAILED');
            expect(result.Message).toContain('Duplicate email');
        });

        it('should return NOT_SUPPORTED when connector does not support create', async () => {
            mockConnector.SupportsCreate = false;

            const params = createRunParams('Create', 'contacts', 'TestCRM', [
                createActionParam('email', 'test@test.com'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('NOT_SUPPORTED');

            mockConnector.SupportsCreate = true; // restore
        });

        it('should exclude system params from attributes', async () => {
            const crudResult: CRUDResult = { Success: true, ExternalID: 'new-1', StatusCode: 201 };
            mockConnector.CreateRecord.mockResolvedValue(crudResult);

            const params = createRunParams('Create', 'contacts', 'TestCRM', [
                createActionParam('email', 'test@test.com'),
                createActionParam('CompanyIntegrationID', 'ci-override'), // System param
                createActionParam('ExternalID', 'should-be-ignored'), // System param for Create
            ]);

            await runAction(executor, params);

            // Verify attributes passed to connector exclude system params
            const callCtx = mockConnector.CreateRecord.mock.calls[0][0];
            expect(callCtx.Attributes).toHaveProperty('email', 'test@test.com');
            expect(callCtx.Attributes).not.toHaveProperty('CompanyIntegrationID');
            expect(callCtx.Attributes).not.toHaveProperty('ExternalID');
        });
    });

    describe('Update verb', () => {
        it('should return SUCCESS on successful update', async () => {
            const crudResult: CRUDResult = { Success: true, ExternalID: 'ext-123', StatusCode: 200 };
            mockConnector.UpdateRecord.mockResolvedValue(crudResult);

            const params = createRunParams('Update', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-123'),
                createActionParam('firstname', 'Updated'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
        });

        it('should return UPDATE_FAILED on failure', async () => {
            const crudResult: CRUDResult = { Success: false, ErrorMessage: 'Not found', StatusCode: 404 };
            mockConnector.UpdateRecord.mockResolvedValue(crudResult);

            const params = createRunParams('Update', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-999'),
                createActionParam('firstname', 'Updated'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('UPDATE_FAILED');
        });

        it('should pass ExternalID and Attributes correctly', async () => {
            const crudResult: CRUDResult = { Success: true, ExternalID: 'ext-1', StatusCode: 200 };
            mockConnector.UpdateRecord.mockResolvedValue(crudResult);

            const params = createRunParams('Update', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-1'),
                createActionParam('email', 'changed@test.com'),
                createActionParam('firstname', 'Changed'),
            ]);

            await runAction(executor, params);

            const callCtx = mockConnector.UpdateRecord.mock.calls[0][0];
            expect(callCtx.ExternalID).toBe('ext-1');
            expect(callCtx.Attributes).toEqual({ email: 'changed@test.com', firstname: 'Changed' });
        });
    });

    describe('Delete verb', () => {
        it('should return SUCCESS on successful delete', async () => {
            const crudResult: CRUDResult = { Success: true, StatusCode: 204 };
            mockConnector.DeleteRecord.mockResolvedValue(crudResult);

            const params = createRunParams('Delete', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-123'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
        });

        it('should return DELETE_FAILED on failure', async () => {
            const crudResult: CRUDResult = { Success: false, ErrorMessage: 'Permission denied', StatusCode: 403 };
            mockConnector.DeleteRecord.mockResolvedValue(crudResult);

            const params = createRunParams('Delete', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-123'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('DELETE_FAILED');
        });

        it('should require ExternalID', async () => {
            const params = createRunParams('Delete', 'contacts', 'TestCRM', []);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('ExternalID');
        });
    });

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

            const params = createRunParams('Search', 'contacts', 'TestCRM', [
                createActionParam('email', 'test.com'),
                createActionParam('PageSize', '10'),
                createActionParam('Page', '1'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');

            const records = result.Params?.find(p => p.Name === 'Records' && p.Type === 'Output');
            expect(records?.Value).toHaveLength(2);

            const totalCount = result.Params?.find(p => p.Name === 'TotalCount' && p.Type === 'Output');
            expect(totalCount?.Value).toBe(50);

            const hasMore = result.Params?.find(p => p.Name === 'HasMore' && p.Type === 'Output');
            expect(hasMore?.Value).toBe(true);
        });

        it('should pass filters (non-system input params) to connector', async () => {
            const searchResult: SearchResult = { Records: [], TotalCount: 0, HasMore: false };
            mockConnector.SearchRecords.mockResolvedValue(searchResult);

            const params = createRunParams('Search', 'contacts', 'TestCRM', [
                createActionParam('email', 'test@test.com'),
                createActionParam('firstname', 'John'),
                createActionParam('PageSize', '25'),
                createActionParam('Sort', 'email ASC'),
            ]);

            await runAction(executor, params);

            const callCtx = mockConnector.SearchRecords.mock.calls[0][0];
            expect(callCtx.Filters).toEqual({ email: 'test@test.com', firstname: 'John' });
            expect(callCtx.PageSize).toBe(25);
            expect(callCtx.Sort).toBe('email ASC');
        });

        it('should return NOT_SUPPORTED when connector does not support search', async () => {
            mockConnector.SupportsSearch = false;

            const params = createRunParams('Search', 'contacts', 'TestCRM', []);
            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('NOT_SUPPORTED');

            mockConnector.SupportsSearch = true; // restore
        });
    });

    describe('List verb', () => {
        it('should return SUCCESS with records, HasMore, NextCursor', async () => {
            const listResult: ListResult = {
                Records: [
                    { ExternalID: 'ext-1', ObjectType: 'contacts', Fields: { email: 'a@test.com' } },
                ],
                HasMore: true,
                NextCursor: 'cursor-abc',
                TotalCount: 100,
            };
            mockConnector.ListRecords.mockResolvedValue(listResult);

            const params = createRunParams('List', 'contacts', 'TestCRM', [
                createActionParam('PageSize', '50'),
                createActionParam('Cursor', 'cursor-prev'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');

            const records = result.Params?.find(p => p.Name === 'Records' && p.Type === 'Output');
            expect(records?.Value).toHaveLength(1);

            const nextCursor = result.Params?.find(p => p.Name === 'NextCursor' && p.Type === 'Output');
            expect(nextCursor?.Value).toBe('cursor-abc');

            const hasMore = result.Params?.find(p => p.Name === 'HasMore' && p.Type === 'Output');
            expect(hasMore?.Value).toBe(true);
        });

        it('should return NOT_SUPPORTED when connector does not support listing', async () => {
            mockConnector.SupportsListing = false;

            const params = createRunParams('List', 'contacts', 'TestCRM', []);
            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('NOT_SUPPORTED');

            mockConnector.SupportsListing = true; // restore
        });

        it('should pass cursor and pageSize to connector', async () => {
            const listResult: ListResult = { Records: [], HasMore: false };
            mockConnector.ListRecords.mockResolvedValue(listResult);

            const params = createRunParams('List', 'contacts', 'TestCRM', [
                createActionParam('PageSize', '20'),
                createActionParam('Cursor', 'cur-xyz'),
                createActionParam('Sort', 'created DESC'),
            ]);

            await runAction(executor, params);

            const callCtx = mockConnector.ListRecords.mock.calls[0][0];
            expect(callCtx.PageSize).toBe(20);
            expect(callCtx.Cursor).toBe('cur-xyz');
            expect(callCtx.Sort).toBe('created DESC');
        });
    });

    describe('Unsupported verb', () => {
        it('should return EXECUTOR_ERROR for unknown verb', async () => {
            const params = createRunParams('Patch', 'contacts', 'TestCRM', []);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('Unsupported verb');
        });
    });

    describe('Integration resolution', () => {
        it('should return EXECUTOR_ERROR when integration is not found', async () => {
            mockRunViewResults.set('Integrations', { Success: true, Results: [] });

            const params = createRunParams('Get', 'contacts', 'NonExistentCRM', [
                createActionParam('ExternalID', 'ext-1'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('not found');
        });
    });

    describe('CompanyIntegration resolution', () => {
        it('should return EXECUTOR_ERROR when no CompanyIntegration exists', async () => {
            mockRunViewResults.set('Company Integrations', { Success: true, Results: [] });

            const params = createRunParams('Get', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-1'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('No CompanyIntegration found');
        });
    });

    describe('Parameter helpers', () => {
        it('should handle case-insensitive parameter names', async () => {
            const record: ExternalRecord = {
                ExternalID: 'ext-1',
                ObjectType: 'contacts',
                Fields: { email: 'test@test.com' },
            };
            mockConnector.GetRecord.mockResolvedValue(record);

            const params = createRunParams('Get', 'contacts', 'TestCRM', [
                createActionParam('externalid', 'ext-1'), // lowercase
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(true);
        });

        it('should handle whitespace in parameter names', async () => {
            const record: ExternalRecord = {
                ExternalID: 'ext-1',
                ObjectType: 'contacts',
                Fields: {},
            };
            mockConnector.GetRecord.mockResolvedValue(record);

            const params = createRunParams('Get', 'contacts', 'TestCRM', [
                createActionParam('  ExternalID  ', 'ext-1'), // padded
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(true);
        });

        it('should skip null/undefined input values in CollectInputAttributes', async () => {
            const crudResult: CRUDResult = { Success: true, ExternalID: 'new-1', StatusCode: 201 };
            mockConnector.CreateRecord.mockResolvedValue(crudResult);

            const params = createRunParams('Create', 'contacts', 'TestCRM', [
                createActionParam('email', 'test@test.com'),
                createActionParam('firstname', null),
                createActionParam('lastname', undefined),
            ]);

            await runAction(executor, params);

            const callCtx = mockConnector.CreateRecord.mock.calls[0][0];
            expect(callCtx.Attributes).toEqual({ email: 'test@test.com' });
            // null and undefined should be excluded
            expect(callCtx.Attributes).not.toHaveProperty('firstname');
            expect(callCtx.Attributes).not.toHaveProperty('lastname');
        });
    });

    describe('Error handling', () => {
        it('should catch connector exceptions and return EXECUTOR_ERROR', async () => {
            mockConnector.GetRecord.mockRejectedValue(new Error('Connection timeout'));

            const params = createRunParams('Get', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-1'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('Connection timeout');
        });

        it('should handle non-Error throws', async () => {
            mockConnector.GetRecord.mockRejectedValue('string error');

            const params = createRunParams('Get', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-1'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('EXECUTOR_ERROR');
            expect(result.Message).toContain('string error');
        });
    });

    describe('Output param behavior', () => {
        it('should update existing output params rather than duplicating', async () => {
            const record: ExternalRecord = {
                ExternalID: 'ext-1',
                ObjectType: 'contacts',
                Fields: { email: 'test@test.com' },
            };
            mockConnector.GetRecord.mockResolvedValue(record);

            // Pre-populate output params (as would happen with metadata-defined params)
            const params = createRunParams('Get', 'contacts', 'TestCRM', [
                createActionParam('ExternalID', 'ext-1'),
                createActionParam('Record', null, 'Output'),
                createActionParam('ExternalID', null, 'Output'),
            ]);

            const result = await runAction(executor, params);
            expect(result.Success).toBe(true);

            // Should update existing output params, not create new ones
            const recordOutputs = result.Params?.filter(p => p.Name === 'Record' && p.Type === 'Output');
            expect(recordOutputs).toHaveLength(1);
            expect(recordOutputs![0].Value).toEqual({ email: 'test@test.com' });
        });
    });
});
