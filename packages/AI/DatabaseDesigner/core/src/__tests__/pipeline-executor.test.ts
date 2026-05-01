import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoisted mock state ──────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    /** What RunPipeline returns. */
    pipelineResult: {
        Success: true,
        ErrorMessage: undefined as string | undefined,
        Steps: [] as Array<{ Name: string; Status: string; DurationMs: number; Message?: string }>,
    },
    /** Entities visible after Refresh(). */
    entities: [] as Array<{ ID: string; Name: string; BaseTable: string; SchemaName: string }>,
    /** Whether Refresh() should throw. */
    refreshShouldThrow: false,
    /** Records captured by the GetEntityObject / Save mock. */
    savedSettings: [] as Array<{ EntityID: string; Name: string; Value: string }>,
}));

// ─── Mock all external dependencies ─────────────────────────────────────────

vi.mock('@memberjunction/schema-engine', () => ({
    SchemaEngine: vi.fn().mockImplementation(function(this: unknown) {
        return {
            GenerateMigration: vi.fn().mockReturnValue({
                SQL: 'CREATE TABLE [__mj_UDT].[Products] (ID UNIQUEIDENTIFIER NOT NULL)',
                AffectedTables: ['__mj_UDT.Products'],
                FileName: 'V20240101__RSU_Products.sql',
            }),
        };
    }),
    SchemaEvolution: vi.fn(),
    RuntimeSchemaManager: {
        Instance: {
            RunPipeline: vi.fn().mockImplementation(async () => mockState.pipelineResult),
        },
    },
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn().mockImplementation(function(this: unknown) {
        return {
            Refresh: vi.fn().mockImplementation(async () => {
                if (mockState.refreshShouldThrow) {
                    throw new Error('Connection reset — metadata server unreachable');
                }
            }),
            // Simulate reading back entities after refresh
            get Entities() {
                return mockState.entities;
            },
            GetEntityObject: vi.fn().mockImplementation(async () => {
                // Return a closure-captured record so Save() can read the set properties
                const record = {
                    EntityID: '',
                    Name: '',
                    Value: '',
                    Comments: '',
                    LatestResult: null as null | { CompleteMessage: string },
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockImplementation(async () => {
                        mockState.savedSettings.push({
                            EntityID: record.EntityID,
                            Name: record.Name,
                            Value: record.Value,
                        });
                        return true;
                    }),
                };
                return record;
            }),
        };
    }),
    LogError: vi.fn(),
    UserInfo: vi.fn(),
    RunView: vi.fn().mockImplementation(function(this: unknown) {
        return {
            RunView: vi.fn().mockResolvedValue({ Success: false, Results: [] }),
        };
    }),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJEntitySettingEntity: class MJEntitySettingEntity {},
}));

vi.mock('@memberjunction/global', () => ({
    LogError: vi.fn(),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { DatabaseDesignerPipelineExecutor } from '../pipeline-executor.js';
import { UDT_SETTINGS } from '../interfaces.js';
import type { TableDefinition } from '@memberjunction/schema-engine';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const CONTEXT_USER = { ID: 'user-1', Email: 'test@example.com' } as ReturnType<typeof vi.fn>;

const VALID_TABLE_DEFINITION: TableDefinition = {
    SchemaName: '__mj_UDT',
    TableName: 'Products',
    EntityName: 'Products',
    Description: 'Test product catalog',
    Columns: [{ Name: 'Name', Type: 'string', IsNullable: false }],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DatabaseDesignerPipelineExecutor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.pipelineResult = { Success: true, ErrorMessage: undefined, Steps: [] };
        mockState.entities = [];
        mockState.refreshShouldThrow = false;
        mockState.savedSettings = [];
    });

    describe('CreateEntity — happy path', () => {
        beforeEach(() => {
            // Simulate entity appearing in metadata after Refresh
            mockState.entities = [{
                ID: 'entity-abc',
                Name: 'Products',
                BaseTable: 'Products',
                SchemaName: '__mj_UDT',
            }];
        });

        it('returns Success=true when pipeline succeeds', async () => {
            const result = await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER
            );

            expect(result.Success).toBe(true);
            expect(result.EntityID).toBe('entity-abc');
            expect(result.EntityName).toBe('Products');
            expect(result.SchemaName).toBe('__mj_UDT');
            expect(result.TableName).toBe('Products');
        });

        it('writes MJ:UDT:Owner EntitySettings with contextUser.ID', async () => {
            await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER
            );

            const ownerSetting = mockState.savedSettings.find(
                s => s.Name === UDT_SETTINGS.OWNER_KEY
            );
            expect(ownerSetting).toBeDefined();
            expect(ownerSetting?.EntityID).toBe('entity-abc');
            expect(ownerSetting?.Value).toBe('user-1');
        });

        it('writes MJ:UDT:Source EntitySettings defaulting to DatabaseDesigner', async () => {
            await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER
            );

            const sourceSetting = mockState.savedSettings.find(
                s => s.Name === UDT_SETTINGS.SOURCE_KEY
            );
            expect(sourceSetting).toBeDefined();
            expect(sourceSetting?.Value).toBe(UDT_SETTINGS.SOURCE_DATABASE_DESIGNER);
        });

        it('writes MJ:UDT:Source as AgentManager when Source option is overridden', async () => {
            await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER, { Source: UDT_SETTINGS.SOURCE_AGENT_MANAGER }
            );

            const sourceSetting = mockState.savedSettings.find(
                s => s.Name === UDT_SETTINGS.SOURCE_KEY
            );
            expect(sourceSetting?.Value).toBe(UDT_SETTINGS.SOURCE_AGENT_MANAGER);
        });

        it('writes provenance for entity-abc EntityID (the created entity)', async () => {
            await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER
            );

            // Both provenance records must target the same EntityID
            const ownerSetting = mockState.savedSettings.find(s => s.Name === UDT_SETTINGS.OWNER_KEY);
            const sourceSetting = mockState.savedSettings.find(s => s.Name === UDT_SETTINGS.SOURCE_KEY);
            expect(ownerSetting?.EntityID).toBe('entity-abc');
            expect(sourceSetting?.EntityID).toBe('entity-abc');
        });
    });

    describe('CreateEntity — pipeline failure', () => {
        it('returns Success=false when pipeline fails', async () => {
            mockState.pipelineResult = {
                Success: false,
                ErrorMessage: 'SQL execution error: duplicate table',
                Steps: [{ Name: 'RunMigration', Status: 'failed', DurationMs: 100 }],
            };

            const result = await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER
            );

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('SQL execution error');
        });

        it('does not write provenance when pipeline fails', async () => {
            mockState.pipelineResult = { Success: false, ErrorMessage: 'Pipeline failed', Steps: [] };

            await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER
            );

            expect(mockState.savedSettings).toHaveLength(0);
        });
    });

    describe('CreateEntity — metadata refresh failure', () => {
        beforeEach(() => {
            mockState.refreshShouldThrow = true;
            // Entity NOT visible after failed refresh — simulates real failure
            mockState.entities = [];
        });

        it('keeps Success=true even when Refresh() throws', async () => {
            const result = await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER
            );

            expect(result.Success).toBe(true);
        });

        it('populates Warnings when Refresh() throws', async () => {
            const result = await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER
            );

            expect(result.Warnings).toBeDefined();
            expect(result.Warnings!.length).toBeGreaterThan(0);
            expect(result.Warnings![0]).toContain('Metadata refresh failed');
        });

        it('returns TableName and SchemaName even without EntityID when refresh fails', async () => {
            const result = await DatabaseDesignerPipelineExecutor.CreateEntity(
                VALID_TABLE_DEFINITION, CONTEXT_USER
            );

            // No EntityID since entity not in metadata, but schema info is still returned
            expect(result.EntityID).toBeUndefined();
            expect(result.SchemaName).toBe('__mj_UDT');
            expect(result.TableName).toBe('Products');
        });
    });
});
