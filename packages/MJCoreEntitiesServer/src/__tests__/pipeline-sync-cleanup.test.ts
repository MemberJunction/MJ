/**
 * Regression tests for the extraction pipeline's sync stage.
 *
 * Verifies that stale Query Fields and Query Entities are cleaned up
 * when the extraction pipeline produces no fields or no entities.
 * This prevents the "union of old and new" bug where changing a query's
 * SQL left behind orphaned field/entity records from the previous version.
 *
 * Strategy: mock the sync and enrich modules so we can control what the
 * pipeline sees, then assert that RemoveAllRecords is called for the
 * correct entity types when extraction produces null/empty results.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider, IRunViewProvider } from '@memberjunction/core';
import type { QuerySyncContext } from '../custom/query-extraction/types';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const {
    mockSyncParameters,
    mockSyncFields,
    mockSyncEntities,
    mockSyncDependencies,
    mockRemoveAllRecords,
    mockRunLLMEnrichment,
    mockMergeParametersWithLLM,
} = vi.hoisted(() => ({
    mockSyncParameters: vi.fn().mockResolvedValue(undefined),
    mockSyncFields: vi.fn().mockResolvedValue(undefined),
    mockSyncEntities: vi.fn().mockResolvedValue(undefined),
    mockSyncDependencies: vi.fn().mockResolvedValue(undefined),
    mockRemoveAllRecords: vi.fn().mockResolvedValue(undefined),
    mockRunLLMEnrichment: vi.fn().mockResolvedValue(null),
    mockMergeParametersWithLLM: vi.fn().mockReturnValue([]),
}));

// Mock the sync module
vi.mock('../custom/query-extraction/sync', () => ({
    SyncParameters: mockSyncParameters,
    SyncFields: mockSyncFields,
    SyncEntities: mockSyncEntities,
    SyncDependencies: mockSyncDependencies,
    RemoveAllRecords: mockRemoveAllRecords,
}));

// Mock the enrich module (LLM calls)
vi.mock('../custom/query-extraction/enrich', () => ({
    RunLLMEnrichment: mockRunLLMEnrichment,
    MergeParametersWithLLM: mockMergeParametersWithLLM,
    GenerateParameterDescription: vi.fn(),
    BuildPassthroughDescription: vi.fn(),
    GenerateSampleValue: vi.fn(),
}));

// Mock Metadata.Provider.Queries (used by resolve stage for composition refs)
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: {
            Provider: {
                Queries: [],
                Entities: [],
            },
        },
    };
});

// Now import the function under test (after mocks are set up)
import { RunExtractionPipeline } from '../custom/query-extraction/pipeline';

// ─── Test Helpers ────────────────────────────────────────────────────────────

const QUERY_ID = 'test-query-id-1234';

function buildCtx(sqlOverride?: string): QuerySyncContext {
    return {
        queryID: QUERY_ID,
        queryName: 'Test Query',
        sql: sqlOverride ?? 'SELECT col1 FROM SomeTable WHERE x = 1',
        isSaved: true,
        contextUser: { ID: 'user-1' } as UserInfo,
        metadataProvider: {
            Entities: [],
            GetEntityObject: vi.fn(),
            SQLDialects: [],
        } as unknown as IMetadataProvider,
        runViewProvider: {} as IRunViewProvider,
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Pipeline sync stage — stale record cleanup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('when extraction produces no fields (finalFields is null)', () => {
        it('should preserve existing fields (NOT call RemoveAllRecords) when finalFields is null', async () => {
            // Use a SQL statement that produces no parseable SELECT columns (e.g., EXEC)
            // so that both deterministic extraction AND LLM return null.
            mockRunLLMEnrichment.mockResolvedValue(null);

            const ctx = buildCtx('EXEC sp_SomeStoredProc @Param1 = 1');
            await RunExtractionPipeline(ctx);

            // With the fix: when finalFields is null, existing fields are preserved
            const fieldCleanupCall = mockRemoveAllRecords.mock.calls.find(
                (call: unknown[]) => call[1] === 'MJ: Query Fields'
            );
            expect(fieldCleanupCall).toBeUndefined();
            expect(mockSyncFields).not.toHaveBeenCalled();
        });
    });

    describe('when deterministic extraction produces fields (even without LLM)', () => {
        it('should call SyncFields with deterministic fields when LLM is null', async () => {
            // SELECT col1 produces deterministic fields via BuildFieldsFromSelectColumns
            mockRunLLMEnrichment.mockResolvedValue(null);

            const ctx = buildCtx('SELECT col1 FROM SomeTable WHERE x = 1');
            await RunExtractionPipeline(ctx);

            expect(mockSyncFields).toHaveBeenCalled();

            // RemoveAllRecords should NOT be called for fields
            const fieldCleanupCall = mockRemoveAllRecords.mock.calls.find(
                (call: unknown[]) => call[1] === 'MJ: Query Fields'
            );
            expect(fieldCleanupCall).toBeUndefined();
        });
    });

    describe('when extraction produces fields', () => {
        it('should call SyncFields and NOT RemoveAllRecords for fields', async () => {
            // LLM returns a selectClause → finalFields will be populated
            mockRunLLMEnrichment.mockResolvedValue({
                selectClause: [
                    { name: 'ID', type: 'string', description: 'Primary key' },
                    { name: 'Name', type: 'string', description: 'Display name' },
                ],
                parameters: [],
            });

            const ctx = buildCtx('SELECT ID, Name FROM SomeTable');
            await RunExtractionPipeline(ctx);

            expect(mockSyncFields).toHaveBeenCalled();

            // RemoveAllRecords should NOT be called for fields
            const fieldCleanupCall = mockRemoveAllRecords.mock.calls.find(
                (call: unknown[]) => call[1] === 'MJ: Query Fields'
            );
            expect(fieldCleanupCall).toBeUndefined();
        });
    });

    describe('when extraction produces no entities', () => {
        it('should call RemoveAllRecords for Query Entities', async () => {
            // SQL references no real tables (or tables don't match metadata)
            mockRunLLMEnrichment.mockResolvedValue(null);

            const ctx = buildCtx('SELECT 1 AS Value');
            await RunExtractionPipeline(ctx);

            const entityCleanupCall = mockRemoveAllRecords.mock.calls.find(
                (call: unknown[]) => call[1] === 'MJ: Query Entities'
            );
            expect(entityCleanupCall).toBeDefined();
            expect(entityCleanupCall![0]).toBe(QUERY_ID);
        });

        it('should NOT call SyncEntities when there are no entities', async () => {
            mockRunLLMEnrichment.mockResolvedValue(null);

            const ctx = buildCtx('SELECT 1 AS Value');
            await RunExtractionPipeline(ctx);

            expect(mockSyncEntities).not.toHaveBeenCalled();
        });
    });

    describe('when extraction produces no parameters', () => {
        it('should call RemoveAllRecords for Query Parameters (existing behavior)', async () => {
            // Plain SQL with no template parameters
            mockRunLLMEnrichment.mockResolvedValue(null);

            const ctx = buildCtx('SELECT col1 FROM SomeTable WHERE x = 1');
            await RunExtractionPipeline(ctx);

            const paramCleanupCall = mockRemoveAllRecords.mock.calls.find(
                (call: unknown[]) => call[1] === 'MJ: Query Parameters'
            );
            expect(paramCleanupCall).toBeDefined();
            expect(paramCleanupCall![0]).toBe(QUERY_ID);
        });

        it('should NOT call SyncParameters when there are no parameters', async () => {
            mockRunLLMEnrichment.mockResolvedValue(null);

            const ctx = buildCtx('SELECT col1 FROM SomeTable WHERE x = 1');
            await RunExtractionPipeline(ctx);

            expect(mockSyncParameters).not.toHaveBeenCalled();
        });
    });

    describe('when extraction produces parameters', () => {
        it('should call SyncParameters and NOT RemoveAllRecords for params', async () => {
            mockMergeParametersWithLLM.mockReturnValue([
                { name: 'State', type: 'string', isRequired: false },
            ]);
            mockRunLLMEnrichment.mockResolvedValue({ parameters: [], selectClause: [] });

            const ctx = buildCtx(`SELECT * FROM t WHERE State = {{ State | sqlString }}`);
            await RunExtractionPipeline(ctx);

            expect(mockSyncParameters).toHaveBeenCalled();

            const paramCleanupCall = mockRemoveAllRecords.mock.calls.find(
                (call: unknown[]) => call[1] === 'MJ: Query Parameters'
            );
            expect(paramCleanupCall).toBeUndefined();
        });
    });

    describe('dependencies always sync', () => {
        it('should always call SyncDependencies regardless of composition refs', async () => {
            mockRunLLMEnrichment.mockResolvedValue(null);

            const ctx = buildCtx('SELECT 1 AS Value');
            await RunExtractionPipeline(ctx);

            expect(mockSyncDependencies).toHaveBeenCalled();
        });
    });
});
