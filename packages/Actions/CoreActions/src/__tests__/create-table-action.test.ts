import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies to isolate the action under test.
// ---------------------------------------------------------------------------
vi.mock('@memberjunction/actions-base', () => ({
    ActionResultSimple: class {},
    RunActionParams: class {},
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        async Run(params: Record<string, unknown>) {
            return (this as Record<string, Function>)['InternalRunAction'](params);
        }
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

// Mock schema-engine: UserTablePipeline and RuntimeSchemaManager
const mockCreateTable = vi.fn();
const mockPreview = vi.fn();

vi.mock('@memberjunction/schema-engine', () => ({
    SchemaEngine: class {},
    RuntimeSchemaManager: {
        Instance: {
            IsEnabled: true,
            RunPipeline: vi.fn(),
        },
    },
    UserTablePipeline: class {
        CreateTable = mockCreateTable;
        Preview = mockPreview;
    },
    ValidateUserTableDefinition: vi.fn().mockReturnValue({ Valid: true, Errors: [], Warnings: [] }),
}));

// ---------------------------------------------------------------------------
// Import the classes under test AFTER mocks are in place.
// ---------------------------------------------------------------------------
import { CreateDatabaseTableAction, PreviewDatabaseTableAction } from '../custom/schema/create-table.action';

/**
 * Build a minimal RunActionParams-compatible object for testing.
 */
function makeParams(params: Array<{ Name: string; Value?: unknown; Type?: string }>) {
    return {
        Params: params.map(p => ({
            Name: p.Name,
            Value: p.Value,
            Type: p.Type ?? 'Input',
        })),
        ContextUser: { ID: 'test-user', Email: 'test@test.com' },
        Action: { ID: 'action-id', Name: 'Test Action' },
        Filters: [],
    };
}

function makeTableDefinition() {
    return {
        DisplayName: 'Test Projects',
        Description: 'Test table for projects',
        Columns: [
            { Name: 'ProjectName', Type: 'string', MaxLength: 200 },
            { Name: 'Status', Type: 'string', MaxLength: 50, DefaultValue: "'Active'" },
            { Name: 'Budget', Type: 'decimal', Precision: 18, Scale: 2 },
        ],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateDatabaseTableAction', () => {
    let action: CreateDatabaseTableAction;

    beforeEach(() => {
        vi.clearAllMocks();
        action = new CreateDatabaseTableAction();
    });

    describe('parameter extraction', () => {
        it('should return MISSING_PARAMETER when TableDefinition is not provided', async () => {
            const params = makeParams([]);
            const result = await action.Run(params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_PARAMETER');
            expect(result.Message).toContain('TableDefinition');
        });

        it('should accept TableDefinition as an object', async () => {
            mockCreateTable.mockResolvedValue({
                Success: true,
                SqlTableName: 'custom.UD_TestProjects',
                EntityName: 'User: Test Projects',
                PipelineResult: {
                    Success: true,
                    APIRestarted: false,
                    GitCommitSuccess: false,
                    Steps: [{ Name: 'Mock', Status: 'success', DurationMs: 1, Message: 'ok' }],
                    MigrationFilePath: 'test.sql',
                },
            });

            const params = makeParams([
                { Name: 'TableDefinition', Value: makeTableDefinition() },
            ]);

            const result = await action.Run(params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
            expect(mockCreateTable).toHaveBeenCalledOnce();
        });

        it('should accept TableDefinition as a JSON string', async () => {
            mockCreateTable.mockResolvedValue({
                Success: true,
                SqlTableName: 'custom.UD_TestProjects',
                EntityName: 'User: Test Projects',
                PipelineResult: {
                    Success: true,
                    APIRestarted: false,
                    GitCommitSuccess: false,
                    Steps: [],
                },
            });

            const params = makeParams([
                { Name: 'TableDefinition', Value: JSON.stringify(makeTableDefinition()) },
            ]);

            const result = await action.Run(params);
            expect(result.Success).toBe(true);
            expect(mockCreateTable).toHaveBeenCalledOnce();
        });
    });

    describe('preview mode', () => {
        it('should return preview results when Preview=true', async () => {
            mockPreview.mockReturnValue({
                Valid: true,
                ValidationErrors: [],
                SqlTableName: 'custom.UD_TestProjects',
                EntityName: 'User: Test Projects',
                MigrationSQL: 'CREATE TABLE [custom].[UD_TestProjects] (...)',
            });

            const params = makeParams([
                { Name: 'TableDefinition', Value: makeTableDefinition() },
                { Name: 'Preview', Value: 'true' },
            ]);

            const result = await action.Run(params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('PREVIEW_SUCCESS');
            expect(mockPreview).toHaveBeenCalledOnce();
            expect(mockCreateTable).not.toHaveBeenCalled();

            // Check output parameters
            const outputParams = params.Params.filter((p: Record<string, unknown>) => p.Type === 'Output');
            const sqlTableParam = outputParams.find((p: Record<string, unknown>) => p.Name === 'SqlTableName');
            expect(sqlTableParam?.Value).toBe('custom.UD_TestProjects');
        });

        it('should return validation errors in preview mode', async () => {
            mockPreview.mockReturnValue({
                Valid: false,
                ValidationErrors: ['DisplayName must start with a letter'],
                SqlTableName: 'custom.UD_123Bad',
                EntityName: 'User: 123Bad',
                MigrationSQL: '',
            });

            const params = makeParams([
                { Name: 'TableDefinition', Value: { DisplayName: '123Bad', Columns: [] } },
                { Name: 'Preview', Value: true },
            ]);

            const result = await action.Run(params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('VALIDATION_FAILED');
        });
    });

    describe('pipeline execution', () => {
        it('should return SUCCESS with output params on successful pipeline', async () => {
            mockCreateTable.mockResolvedValue({
                Success: true,
                SqlTableName: 'custom.UD_TestProjects',
                EntityName: 'User: Test Projects',
                PipelineResult: {
                    Success: true,
                    APIRestarted: true,
                    GitCommitSuccess: false,
                    Steps: [
                        { Name: 'ValidateEnvironment', Status: 'success', DurationMs: 1, Message: 'ok' },
                        { Name: 'ExecuteMigration', Status: 'success', DurationMs: 100, Message: 'ok' },
                    ],
                    MigrationFilePath: 'migrations/v2/V202603120000__RSU_test.sql',
                },
            });

            const params = makeParams([
                { Name: 'TableDefinition', Value: makeTableDefinition() },
            ]);

            const result = await action.Run(params);
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');

            // Verify output params
            const outputParams = params.Params.filter((p: Record<string, unknown>) => p.Type === 'Output');
            expect(outputParams.some((p: Record<string, unknown>) => p.Name === 'SqlTableName')).toBe(true);
            expect(outputParams.some((p: Record<string, unknown>) => p.Name === 'EntityName')).toBe(true);
            expect(outputParams.some((p: Record<string, unknown>) => p.Name === 'PipelineSteps')).toBe(true);
        });

        it('should return PIPELINE_FAILED when pipeline fails', async () => {
            mockCreateTable.mockResolvedValue({
                Success: false,
                ErrorMessage: 'Migration execution failed: syntax error',
            });

            const params = makeParams([
                { Name: 'TableDefinition', Value: makeTableDefinition() },
            ]);

            const result = await action.Run(params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('PIPELINE_FAILED');
            expect(result.Message).toContain('syntax error');
        });

        it('should return VALIDATION_FAILED when table definition is invalid', async () => {
            mockCreateTable.mockResolvedValue({
                Success: false,
                ValidationErrors: ['At least one column is required'],
                ErrorMessage: 'Validation failed: At least one column is required',
            });

            const params = makeParams([
                { Name: 'TableDefinition', Value: { DisplayName: 'Empty Table', Columns: [] } },
            ]);

            const result = await action.Run(params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('VALIDATION_FAILED');
        });

        it('should pass SkipRestart and SkipGitCommit options', async () => {
            mockCreateTable.mockResolvedValue({
                Success: true,
                SqlTableName: 'custom.UD_TestProjects',
                EntityName: 'User: Test Projects',
                PipelineResult: { Success: true, APIRestarted: false, GitCommitSuccess: false, Steps: [] },
            });

            const params = makeParams([
                { Name: 'TableDefinition', Value: makeTableDefinition() },
                { Name: 'SkipRestart', Value: 'true' },
                { Name: 'SkipGitCommit', Value: 'yes' },
            ]);

            await action.Run(params);

            // Verify the table definition passed to CreateTable includes skip options
            const callArg = mockCreateTable.mock.calls[0][0];
            expect(callArg.SkipRestart).toBe(true);
            expect(callArg.SkipGitCommit).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should return UNEXPECTED_ERROR on thrown exceptions', async () => {
            mockCreateTable.mockRejectedValue(new Error('Unexpected failure'));

            const params = makeParams([
                { Name: 'TableDefinition', Value: makeTableDefinition() },
            ]);

            const result = await action.Run(params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('UNEXPECTED_ERROR');
            expect(result.Message).toContain('Unexpected failure');
        });
    });
});

describe('PreviewDatabaseTableAction', () => {
    let action: PreviewDatabaseTableAction;

    beforeEach(() => {
        vi.clearAllMocks();
        action = new PreviewDatabaseTableAction();
    });

    it('should force Preview=true and delegate to CreateDatabaseTableAction', async () => {
        mockPreview.mockReturnValue({
            Valid: true,
            ValidationErrors: [],
            SqlTableName: 'custom.UD_TestProjects',
            EntityName: 'User: Test Projects',
            MigrationSQL: 'CREATE TABLE ...',
        });

        const params = makeParams([
            { Name: 'TableDefinition', Value: makeTableDefinition() },
        ]);

        const result = await action.Run(params);
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('PREVIEW_SUCCESS');
        expect(mockPreview).toHaveBeenCalledOnce();
        expect(mockCreateTable).not.toHaveBeenCalled();
    });

    it('should override Preview=false to Preview=true', async () => {
        mockPreview.mockReturnValue({
            Valid: true,
            ValidationErrors: [],
            SqlTableName: 'custom.UD_TestProjects',
            EntityName: 'User: Test Projects',
            MigrationSQL: 'CREATE TABLE ...',
        });

        const params = makeParams([
            { Name: 'TableDefinition', Value: makeTableDefinition() },
            { Name: 'Preview', Value: false },
        ]);

        const result = await action.Run(params);
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('PREVIEW_SUCCESS');
        // Even though Preview was false, PreviewDatabaseTableAction forces it to true
        expect(mockPreview).toHaveBeenCalledOnce();
    });
});
