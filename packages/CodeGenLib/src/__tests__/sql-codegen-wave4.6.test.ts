import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import {
    SQLCodeGenBase,
    PartitionEntitiesIntoConflictFreeWaves,
    type PrecomputedEntityPhasedSQL,
} from '../Database/sql_codegen';
import {
    ExecuteWithFallback,
    RunExclusiveDropCascade,
} from '../Database/providers/postgresql/viewFallback';
import type { PGQueryable } from '../Database/providers/postgresql/viewDependencyCapture';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { configInfo } from '../Config/config';

// ─── Test Helpers ────────────────────────────────────────────────────────────

interface TestAlternateViewInfo {
    ID: string;
    Name: string;
}

function makeTestEntity(params: {
    id: string;
    name: string;
    schemaName?: string;
    baseTable?: string;
    fields?: Array<{
        name: string;
        isPrimaryKey?: boolean;
        relatedEntityId?: string;
    }>;
    parentId?: string;
    parentChain?: Array<{ ID: string }>;
    baseViewGenerated?: boolean;
    hasLayeredBaseView?: boolean;
    alternateBaseViews?: TestAlternateViewInfo[];
    fullTextSearchEnabled?: boolean;
    allowCreateApi?: boolean;
    allowUpdateApi?: boolean;
    allowDeleteApi?: boolean;
}): EntityInfo {
    const schema = params.schemaName ?? '__mj';
    const codeName = params.baseTable ?? params.name.replace(/\s+/g, '');
    return new EntityInfo({
        ID: params.id,
        Name: params.name,
        SchemaName: schema,
        BaseTable: codeName,
        BaseTableCodeName: codeName,
        BaseView: `vw${codeName}`,
        GeneratedBaseViewName: params.hasLayeredBaseView ? `vw${codeName}Generated` : `vw${codeName}`,
        IncludeInAPI: true,
        VirtualEntity: false,
        BaseViewGenerated: params.baseViewGenerated ?? true,
        HasLayeredBaseView: params.hasLayeredBaseView ?? false,
        ParentID: params.parentId,
        ParentChain: params.parentChain ?? [],
        AlternateBaseViews: params.alternateBaseViews ?? [],
        FullTextSearchEnabled: params.fullTextSearchEnabled ?? false,
        FullTextIndexGenerated: false,
        FullTextSearchFunctionGenerated: true,
        AllowCreateAPI: params.allowCreateApi ?? true,
        AllowUpdateAPI: params.allowUpdateApi ?? true,
        AllowDeleteAPI: params.allowDeleteApi ?? true,
        spCreateGenerated: true,
        spUpdateGenerated: true,
        spDeleteGenerated: true,
        CascadeDeletes: false,
        EntityFields: (params.fields ?? [
            { name: 'ID', isPrimaryKey: true },
            { name: 'Name', isPrimaryKey: false },
        ]).map((f, idx) => ({
            ID: `f-${params.id}-${idx}`,
            Name: f.name,
            Type: f.isPrimaryKey ? 'uniqueidentifier' : 'nvarchar',
            Length: f.isPrimaryKey ? 16 : 100,
            IsPrimaryKey: f.isPrimaryKey ?? false,
            AllowsNull: !f.isPrimaryKey,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            DefaultValue: '',
            RelatedEntityID: f.relatedEntityId,
        })),
        EntityPermissions: [],
    });
}

class TestableSQLCodeGen extends SQLCodeGenBase {
    public async TestCheckBaseViewChangedInDB(pool: CodeGenConnection, entity: EntityInfo, generatedViewSQL: string): Promise<boolean> {
        return this.checkBaseViewChangedInDB(pool, entity, generatedViewSQL);
    }

    public async TestCheckBaseViewColumnsChangedPG(pool: CodeGenConnection, entity: EntityInfo, viewName: string): Promise<boolean> {
        return this.checkBaseViewColumnsChangedPG(pool, entity, viewName);
    }

    public async TestLoadExistingBaseViews(pool: CodeGenConnection, entities: EntityInfo[]): Promise<void> {
        return this.loadExistingBaseViews(pool, entities);
    }

    public GetExistingBaseViewDefinitions(): Map<string, string> | null {
        return this.existingBaseViewDefinitions;
    }

    public SetExistingBaseViewDefinitions(map: Map<string, string> | null): void {
        this.existingBaseViewDefinitions = map;
    }

    public GetExistingBaseViewColumnsPG(): Map<string, Set<string>> | null {
        return this.existingBaseViewColumnsPG;
    }

    public SetExistingBaseViewColumnsPG(map: Map<string, Set<string>> | null): void {
        this.existingBaseViewColumnsPG = map;
    }

    public override async generateSPDelete(entity: EntityInfo, pool: CodeGenConnection): Promise<string> {
        return super.generateSPDelete(entity, pool);
    }
}

function makeMockConnection(queryFn: (sql: string) => Promise<CodeGenQueryResult>): CodeGenConnection {
    const pgProvider = new PostgreSQLCodeGenProvider();
    return {
        Dialect: pgProvider.Dialect,
        query: queryFn,
        queryWithParams: async () => ({ recordset: [] }),
        executeStoredProcedure: async () => ({ recordset: [] }),
        beginTransaction: async () => {
            throw new Error('Transaction not implemented in mock');
        },
    };
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

describe('Wave 4.6 SQL CodeGen Enhancements', () => {

    describe('1. PartitionEntitiesIntoConflictFreeWaves', () => {
        it('ensures direct FK parent-child entities never share a wave and parent runs earlier', () => {
            const parent = makeTestEntity({ id: 'parent-1', name: 'Users' });
            const child = makeTestEntity({
                id: 'child-1',
                name: 'Orders',
                fields: [
                    { name: 'ID', isPrimaryKey: true },
                    { name: 'UserID', relatedEntityId: parent.ID },
                ],
            });

            // Pass in child first to verify topological ordering places parent earlier
            const waves = PartitionEntitiesIntoConflictFreeWaves([child, parent], 4);
            expect(waves.length).toBeGreaterThanOrEqual(2);

            const parentWave = waves.findIndex(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(parent.ID)));
            const childWave = waves.findIndex(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(child.ID)));

            expect(parentWave).toBeGreaterThanOrEqual(0);
            expect(childWave).toBeGreaterThanOrEqual(0);
            expect(parentWave).toBeLessThan(childWave);
        });

        it('ensures IS-A parent-child entities never share a wave and parent runs earlier', () => {
            const parent = makeTestEntity({ id: 'parent-isa', name: 'BaseItems' });
            const child = makeTestEntity({
                id: 'child-isa',
                name: 'SpecialItems',
                parentId: parent.ID,
                parentChain: [{ ID: parent.ID }],
            });

            const waves = PartitionEntitiesIntoConflictFreeWaves([child, parent], 4);
            expect(waves.length).toBeGreaterThanOrEqual(2);

            const parentWave = waves.findIndex(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(parent.ID)));
            const childWave = waves.findIndex(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(child.ID)));

            expect(parentWave).toBeLessThan(childWave);
        });

        it('enforces 2-hop shared-dependent conflict: two entities joined into a third entity never share a wave', () => {
            const entityA = makeTestEntity({ id: 'ent-a', name: 'Vendors' });
            const entityB = makeTestEntity({ id: 'ent-b', name: 'Categories' });
            // entityC references both A and B, so A and B have a 2-hop shared-dependent conflict
            const entityC = makeTestEntity({
                id: 'ent-c',
                name: 'Products',
                fields: [
                    { name: 'ID', isPrimaryKey: true },
                    { name: 'VendorID', relatedEntityId: entityA.ID },
                    { name: 'CategoryID', relatedEntityId: entityB.ID },
                ],
            });

            const waves = PartitionEntitiesIntoConflictFreeWaves([entityA, entityB, entityC], 4);

            const waveA = waves.findIndex(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(entityA.ID)));
            const waveB = waves.findIndex(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(entityB.ID)));
            const waveC = waves.findIndex(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(entityC.ID)));

            // A and B must NOT share a wave even though neither directly references the other
            expect(waveA).not.toBe(waveB);
            // C must run after both A and B
            expect(waveC).toBeGreaterThan(waveA);
            expect(waveC).toBeGreaterThan(waveB);
        });

        it('isolates custom, layered, and alternate base view entities into singleton waves', () => {
            const customEntity = makeTestEntity({ id: 'iso-custom', name: 'CustomViewEntity', baseViewGenerated: false });
            const layeredEntity = makeTestEntity({ id: 'iso-layered', name: 'LayeredEntity', hasLayeredBaseView: true });
            const altViewEntity = makeTestEntity({
                id: 'iso-alt',
                name: 'AltViewEntity',
                alternateBaseViews: [{ ID: 'alt-view-1', Name: 'vwSpecialAlt' }],
            });
            const std1 = makeTestEntity({ id: 'std-1', name: 'Standard1' });
            const std2 = makeTestEntity({ id: 'std-2', name: 'Standard2' });

            const waves = PartitionEntitiesIntoConflictFreeWaves(
                [customEntity, layeredEntity, altViewEntity, std1, std2],
                5
            );

            // Verify isolated entities are in waves of length exactly 1
            const customWave = waves.find(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(customEntity.ID)));
            const layeredWave = waves.find(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(layeredEntity.ID)));
            const altWave = waves.find(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(altViewEntity.ID)));

            expect(customWave?.length).toBe(1);
            expect(layeredWave?.length).toBe(1);
            expect(altWave?.length).toBe(1);

            // Verify standard entities pack together
            const std1Wave = waves.find(w => w.some(e => NormalizeUUID(e.ID) === NormalizeUUID(std1.ID)));
            expect(std1Wave?.some(e => NormalizeUUID(e.ID) === NormalizeUUID(std2.ID))).toBe(true);
        });

        it('packs independent entities up to maxWaveSize', () => {
            const e1 = makeTestEntity({ id: 'ind-1', name: 'Entity1' });
            const e2 = makeTestEntity({ id: 'ind-2', name: 'Entity2' });
            const e3 = makeTestEntity({ id: 'ind-3', name: 'Entity3' });
            const e4 = makeTestEntity({ id: 'ind-4', name: 'Entity4' });
            const e5 = makeTestEntity({ id: 'ind-5', name: 'Entity5' });

            const waves = PartitionEntitiesIntoConflictFreeWaves([e1, e2, e3, e4, e5], 3);
            expect(waves.length).toBe(2);
            expect(waves[0].length).toBe(3);
            expect(waves[1].length).toBe(2);
        });

        it('terminates deterministically on cyclic foreign keys and assigns them to separate waves', () => {
            const eA = makeTestEntity({
                id: 'cycle-a',
                name: 'CycleA',
                fields: [
                    { name: 'ID', isPrimaryKey: true },
                    { name: 'RefB', relatedEntityId: 'cycle-b' },
                ],
            });
            const eB = makeTestEntity({
                id: 'cycle-b',
                name: 'CycleB',
                fields: [
                    { name: 'ID', isPrimaryKey: true },
                    { name: 'RefA', relatedEntityId: 'cycle-a' },
                ],
            });

            const waves = PartitionEntitiesIntoConflictFreeWaves([eA, eB], 4);
            expect(waves.length).toBe(2);
            expect(waves[0].length).toBe(1);
            expect(waves[1].length).toBe(1);
        });

        it('handles boundary conditions: empty, single entity, and maxWaveSize <= 1', () => {
            expect(PartitionEntitiesIntoConflictFreeWaves([], 5)).toEqual([]);

            const single = makeTestEntity({ id: 'single-1', name: 'Single' });
            expect(PartitionEntitiesIntoConflictFreeWaves([single], 5)).toEqual([[single]]);

            const e1 = makeTestEntity({ id: 'bw-1', name: 'BW1' });
            const e2 = makeTestEntity({ id: 'bw-2', name: 'BW2' });
            const singleWaves = PartitionEntitiesIntoConflictFreeWaves([e1, e2], 1);
            expect(singleWaves.length).toBe(2);
            expect(singleWaves[0].length).toBe(1);
            expect(singleWaves[1].length).toBe(1);
        });
    });

    describe('2. Single-pass Precomputed Phased Execution', () => {
        it('computes SQL pieces once during GenerateSingleEntitySQLToSeparateFiles and reuses them in ExecuteEntityInPhases', async () => {
            const codeGen = new TestableSQLCodeGen();
            const mockPGProvider = new PostgreSQLCodeGenProvider();

            let executedPhasedOptions: {
                entity: EntityInfo;
                tvfSQL: string;
                viewSQL: string;
                crudCreateSQL: string;
                crudUpdateSQL: string;
                crudDeleteSQL: string;
                ftsSQL: string;
                viewPermSQL: string;
            } | null = null;

            mockPGProvider.executeEntityPhased = vi.fn().mockImplementation(async (opts) => {
                executedPhasedOptions = opts;
                return { success: true, phase: null };
            });

            codeGen.DBProvider = mockPGProvider;

            const entity = makeTestEntity({
                id: 'single-pass-ent',
                name: 'CustomerAccounts',
                fullTextSearchEnabled: true,
                allowCreateApi: true,
                allowUpdateApi: true,
                allowDeleteApi: true,
            });

            const mockPool = makeMockConnection(async () => ({ recordset: [] }));

            const viewPiecesSpy = vi.spyOn(codeGen, 'GenerateBaseViewPieces').mockResolvedValue({
                viewSQL: 'CREATE VIEW __mj.vwCustomerAccounts AS SELECT 1 AS ID;',
                viewPermSQL: 'GRANT SELECT ON __mj.vwCustomerAccounts TO public;',
            });
            const ftsSpy = vi.spyOn(codeGen, 'GenerateEntityFullTextSearchSQL').mockResolvedValue({
                sql: 'CREATE FUNCTION __mj.fn_fts_customer_accounts() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;',
                functionName: 'fn_fts_customer_accounts',
            });
            const deleteSPSpy = vi.spyOn(codeGen, 'generateSPDelete').mockResolvedValue(
                'CREATE FUNCTION __mj.spDeleteCustomerAccount() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;'
            );
            const executeInPhasesSpy = vi.spyOn(codeGen, 'ExecuteEntityInPhases');

            const res = await codeGen.GenerateAndExecuteSingleEntitySQLToSeparateFiles({
                pool: mockPool,
                entity,
                directory: '/tmp/test-mj-output',
                onlyPermissions: false,
                writeFiles: false,
                skipExecution: false,
            });

            expect(res.Success).toBe(true);

            // Verified: Each SQL generation method was called EXACTLY ONCE
            expect(viewPiecesSpy).toHaveBeenCalledTimes(1);
            expect(ftsSpy).toHaveBeenCalledTimes(1);
            expect(deleteSPSpy).toHaveBeenCalledTimes(1);

            // Verified: ExecuteEntityInPhases was called with precomputed SQL passed through
            expect(executeInPhasesSpy).toHaveBeenCalledTimes(1);
            const passedPrecomputed = executeInPhasesSpy.mock.calls[0][3];
            expect(passedPrecomputed).toBeDefined();
            expect(passedPrecomputed?.ViewSQL).toBe('CREATE VIEW __mj.vwCustomerAccounts AS SELECT 1 AS ID;');
            expect(passedPrecomputed?.FtsSQL).toContain('fn_fts_customer_accounts');
            expect(passedPrecomputed?.CrudDeleteSQL).toContain('spDeleteCustomerAccount');

            // Verified: The provider's executeEntityPhased received the exact precomputed SQL
            expect(executedPhasedOptions).not.toBeNull();
            expect(executedPhasedOptions?.viewSQL).toBe('CREATE VIEW __mj.vwCustomerAccounts AS SELECT 1 AS ID;');
            expect(executedPhasedOptions?.ftsSQL).toContain('fn_fts_customer_accounts');
        });

        it('ExecuteEntityInPhases directly dispatches precomputed SQL without calling generation methods', async () => {
            const codeGen = new TestableSQLCodeGen();
            const mockPGProvider = new PostgreSQLCodeGenProvider();

            mockPGProvider.executeEntityPhased = vi.fn().mockResolvedValue({ success: true, phase: null });
            codeGen.DBProvider = mockPGProvider;

            const entity = makeTestEntity({ id: 'direct-precomputed-ent', name: 'DirectPrecomputed' });
            const mockPool = makeMockConnection(async () => ({ recordset: [] }));

            const viewPiecesSpy = vi.spyOn(codeGen, 'GenerateBaseViewPieces');
            const ftsSpy = vi.spyOn(codeGen, 'GenerateEntityFullTextSearchSQL');

            const precomputed: PrecomputedEntityPhasedSQL = {
                TvfSQL: '-- tvf sql',
                ViewSQL: '-- view sql',
                CrudCreateSQL: '-- create sql',
                CrudUpdateSQL: '-- update sql',
                CrudDeleteSQL: '-- delete sql',
                FtsSQL: '-- fts sql',
                ViewPermSQL: '-- perm sql',
            };

            const result = await codeGen.ExecuteEntityInPhases(mockPool, entity, undefined, precomputed);
            expect(result.success).toBe(true);

            expect(viewPiecesSpy).not.toHaveBeenCalled();
            expect(ftsSpy).not.toHaveBeenCalled();
            expect(mockPGProvider.executeEntityPhased).toHaveBeenCalledWith(
                expect.objectContaining({
                    entity,
                    viewSQL: '-- view sql',
                    ftsSQL: '-- fts sql',
                })
            );
        });
    });

    describe('3. Preloaded Live Base-View Definitions and PG Columns', () => {
        let savedPlatform: string | undefined;

        beforeEach(() => {
            savedPlatform = configInfo.dbPlatform;
        });

        afterEach(() => {
            configInfo.dbPlatform = savedPlatform;
        });

        it('preloads and checks SQL Server base view definitions with 0 per-entity queries', async () => {
            const codeGen = new TestableSQLCodeGen();
            const sqlServerProvider = new SQLServerCodeGenProvider();
            codeGen.DBProvider = sqlServerProvider;
            configInfo.dbPlatform = 'sqlserver';

            const entity = makeTestEntity({ id: 'ent-sqlserver', name: 'TestSqlServer' });
            const viewSql = 'CREATE VIEW [__mj].[vwTestSqlServer] AS\nSELECT ID, Name FROM [__mj].[TestSqlServer]\nGO';

            let queryCount = 0;
            const mockPool = makeMockConnection(async (sql) => {
                queryCount++;
                if (sql.includes('sys.views')) {
                    return {
                        recordset: [
                            {
                                schema_name: '__mj',
                                view_name: 'vwTestSqlServer',
                                view_definition: 'CREATE VIEW [__mj].[vwTestSqlServer] AS\nSELECT ID, Name FROM [__mj].[TestSqlServer]',
                            },
                        ],
                    };
                }
                return { recordset: [] };
            });

            await codeGen.TestLoadExistingBaseViews(mockPool, [entity]);
            expect(queryCount).toBe(1);

            // With preloaded definitions, checkBaseViewChangedInDB runs 0 database queries!
            queryCount = 0;
            const unchanged = await codeGen.TestCheckBaseViewChangedInDB(mockPool, entity, viewSql);
            expect(queryCount).toBe(0);
            expect(unchanged).toBe(false);

            // Definition difference detected with 0 queries
            const changedSql = 'CREATE VIEW [__mj].[vwTestSqlServer] AS\nSELECT ID, Name, ExtraField FROM [__mj].[TestSqlServer]\nGO';
            const changed = await codeGen.TestCheckBaseViewChangedInDB(mockPool, entity, changedSql);
            expect(queryCount).toBe(0);
            expect(changed).toBe(true);

            // Invalidate cache: falls back to per-entity query
            codeGen.SetExistingBaseViewDefinitions(null);
            await codeGen.TestCheckBaseViewChangedInDB(mockPool, entity, viewSql);
            expect(queryCount).toBe(1);

            configInfo.dbPlatform = savedPlatform;
        });

        it('preloads and checks PostgreSQL base view column sets with 0 per-entity queries', async () => {
            const codeGen = new TestableSQLCodeGen();
            const pgProvider = new PostgreSQLCodeGenProvider();
            codeGen.DBProvider = pgProvider;
            configInfo.dbPlatform = 'postgresql';

            const entity = makeTestEntity({
                id: 'ent-pg',
                name: 'TestPostgres',
                fields: [
                    { name: 'ID', isPrimaryKey: true },
                    { name: 'Name', isPrimaryKey: false },
                ],
            });

            let queryCount = 0;
            const mockPool = makeMockConnection(async (sql) => {
                queryCount++;
                if (sql.includes('information_schema.columns')) {
                    return {
                        recordset: [
                            { table_schema: '__mj', table_name: 'vwtestpostgres', column_name: 'id' },
                            { table_schema: '__mj', table_name: 'vwtestpostgres', column_name: 'name' },
                        ],
                    };
                }
                return { recordset: [] };
            });

            await codeGen.TestLoadExistingBaseViews(mockPool, [entity]);
            expect(queryCount).toBe(1);

            // With preloaded columns, checkBaseViewColumnsChangedPG runs 0 queries!
            queryCount = 0;
            const unchanged = await codeGen.TestCheckBaseViewColumnsChangedPG(mockPool, entity, 'vwtestpostgres');
            expect(queryCount).toBe(0);
            expect(unchanged).toBe(false);

            // An entity expecting an extra column flags as changed with 0 queries
            const entityWithExtraField = makeTestEntity({
                id: 'ent-pg',
                name: 'TestPostgres',
                fields: [
                    { name: 'ID', isPrimaryKey: true },
                    { name: 'Name', isPrimaryKey: false },
                    { name: 'ExtraCol', isPrimaryKey: false },
                ],
            });
            const changed = await codeGen.TestCheckBaseViewColumnsChangedPG(mockPool, entityWithExtraField, 'vwtestpostgres');
            expect(queryCount).toBe(0);
            expect(changed).toBe(true);

            // Missing view (not in preloaded set) flags as true with 0 queries
            const missing = await codeGen.TestCheckBaseViewColumnsChangedPG(mockPool, entity, 'vwNonExistent');
            expect(queryCount).toBe(0);
            expect(missing).toBe(true);

            // Invalidate cache: falls back to pool.query
            codeGen.SetExistingBaseViewColumnsPG(null);
            await codeGen.TestCheckBaseViewColumnsChangedPG(mockPool, entity, 'vwtestpostgres');
            expect(queryCount).toBe(1);

            configInfo.dbPlatform = savedPlatform;
        });
    });

    describe('4. ExecuteWithFallback 42P16 Fallback Mutex', () => {
        it('RunExclusiveDropCascade serializes async critical sections without interleaving', async () => {
            let activeCount = 0;
            let maxConcurrency = 0;
            const executionOrder: number[] = [];

            const task = async (id: number, delayMs: number) => {
                return RunExclusiveDropCascade(async () => {
                    activeCount++;
                    maxConcurrency = Math.max(maxConcurrency, activeCount);
                    executionOrder.push(id);
                    await new Promise(r => setTimeout(r, delayMs));
                    activeCount--;
                    return id;
                });
            };

            const results = await Promise.all([
                task(1, 30),
                task(2, 20),
                task(3, 10),
            ]);

            expect(results).toEqual([1, 2, 3]);
            expect(executionOrder).toEqual([1, 2, 3]);
            expect(maxConcurrency).toBe(1);
        });

        it('RunExclusiveDropCascade continues executing subsequent tasks if a previous task throws', async () => {
            let secondExecuted = false;

            const failingTask = RunExclusiveDropCascade(async () => {
                throw new Error('Fallback failed');
            });

            const succeedingTask = RunExclusiveDropCascade(async () => {
                secondExecuted = true;
                return 'success';
            });

            await expect(failingTask).rejects.toThrow('Fallback failed');
            const result = await succeedingTask;
            expect(result).toBe('success');
            expect(secondExecuted).toBe(true);
        });

        it('serializes 42P16 fallback recovery while non-42P16 CREATE OR REPLACE VIEW runs concurrently', async () => {
            let activeFallbackCount = 0;
            let maxFallbackConcurrency = 0;

            interface PostgresTestError extends Error {
                code?: string;
            }

            const createMockClient = (options: { throw42P16: boolean; delayMs: number }): PGQueryable => {
                let threw = false;
                return {
                    query: vi.fn().mockImplementation(async (sql: string) => {
                        if (typeof sql === 'string' && sql.startsWith('CREATE OR REPLACE VIEW')) {
                            if (options.throw42P16 && !threw) {
                                threw = true;
                                const err: PostgresTestError = new Error('invalid table definition');
                                err.code = '42P16';
                                throw err;
                            }
                            await new Promise(r => setTimeout(r, options.delayMs));
                            return { rowCount: 1, rows: [] };
                        }
                        if (sql.includes('SELECT c.oid::int AS oid')) {
                            return { rowCount: 1, rows: [{ oid: 4242 }] };
                        }
                        if (sql.includes('DROP VIEW IF EXISTS')) {
                            activeFallbackCount++;
                            maxFallbackConcurrency = Math.max(maxFallbackConcurrency, activeFallbackCount);
                            await new Promise(r => setTimeout(r, options.delayMs));
                            activeFallbackCount--;
                            return { rowCount: 1, rows: [] };
                        }
                        if (sql.includes('pg_get_userbyid')) {
                            return { rowCount: 1, rows: [{ owner: 'postgres', comment: null }] };
                        }
                        return { rowCount: 0, rows: [] };
                    }),
                };
            };

            const fallbackClient1 = createMockClient({ throw42P16: true, delayMs: 25 });
            const fallbackClient2 = createMockClient({ throw42P16: true, delayMs: 25 });

            // Concurrent 42P16 fallback executions
            await Promise.all([
                ExecuteWithFallback({
                    Client: fallbackClient1,
                    schema: '__mj',
                    ViewName: 'vwFallback1',
                    CreateOrReplaceSQL: 'CREATE OR REPLACE VIEW __mj.vwFallback1 AS SELECT 1 AS ID',
                }),
                ExecuteWithFallback({
                    Client: fallbackClient2,
                    schema: '__mj',
                    ViewName: 'vwFallback2',
                    CreateOrReplaceSQL: 'CREATE OR REPLACE VIEW __mj.vwFallback2 AS SELECT 2 AS ID',
                }),
            ]);

            // The DROP CASCADE critical section was strictly serialized!
            expect(maxFallbackConcurrency).toBe(1);
        });
    });
});
