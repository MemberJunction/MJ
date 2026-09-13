import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import { configInfo } from '../../Config/config';
import { SQLLogging } from '../../Misc/sql_logging';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';
import { canonicalJSONStringify } from '../../Misc/util';

// Subclass exposing protected methods for testing
class TestableManageMetadataForConfigWriters extends ManageMetadataBase {
   public async callApplySoftPKFKConfig(pool: CodeGenConnection): Promise<boolean> {
      return this.applySoftPKFKConfig(pool);
   }

   public async callProcessEntityConfigs(pool: CodeGenConnection): Promise<{ success: boolean; updatedCount: number }> {
      return this.processEntityConfigs(pool);
   }

   public async callApplyCategoryInfoSettings(
      pool: CodeGenConnection,
      entityId: string,
      categoryInfo: Record<string, { icon?: string; description?: string }>,
      entityName?: string
   ): Promise<void> {
      return this.applyCategoryInfoSettings(pool, entityId, categoryInfo, entityName);
   }
}

describe('T20 — Every-Run Config Writers Compare-First & Captured (C9)', () => {
   let tmpDir: string;
   let dummyConfigFile: string;
   let origAdditionalSchemaInfo: string | undefined;
   let executedStatements: string[];
   let executedParams: Array<{ sql: string; params?: Record<string, unknown> }>;
   let queryHandler: (sql: string, params?: Record<string, unknown>) => CodeGenQueryResult;

   beforeEach(async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-config-writers-test-'));
      dummyConfigFile = path.join(tmpDir, 'schema-info.json');
      fs.writeFileSync(dummyConfigFile, '{}');
      origAdditionalSchemaInfo = configInfo.additionalSchemaInfo;

      executedStatements = [];
      executedParams = [];

      configInfo.SQLOutput = {
         enabled: true,
         folderPath: tmpDir,
         omitRecurringScriptsFromLog: true,
         appendToFile: false,
         convertCoreSchemaToFlywayMigrationFile: false,
         fileName: 'CodeGen_Run_Test.sql',
      };

      SQLLogging.resetForTests();
      SQLLogging.sqlOutputDirFlag = tmpDir;
      SQLLogging.initSQLLogging();
   });

   afterEach(async () => {
      configInfo.additionalSchemaInfo = origAdditionalSchemaInfo;
      SQLLogging.resetForTests();
      try {
         fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
         // ignore
      }
      vi.restoreAllMocks();
   });

   function createMockConnection(): CodeGenConnection {
      return {
         query: async (sql: string) => {
            executedStatements.push(sql);
            if (queryHandler) {
               return queryHandler(sql);
            }
            return { recordset: [] };
         },
         queryWithParams: async (sql: string, params?: Record<string, unknown>) => {
            executedParams.push({ sql, params });
            if (queryHandler) {
               return queryHandler(sql, params);
            }
            return { recordset: [] };
         },
         beginTransaction: async () => ({
            commit: async () => {},
            rollback: async () => {},
         }),
      };
   }

   describe('applySoftPKFKConfig', () => {
      it('captures NO UPDATE when row is already IsPrimaryKey = 1 and IsSoftPrimaryKey = 1', async () => {
         const mm = new TestableManageMetadataForConfigWriters();
         const pool = createMockConnection();

         // Mock config
         vi.spyOn(ManageMetadataBase, 'getSoftPKFKConfig').mockReturnValue({
            Tables: [
               {
                  SchemaName: 'dbo',
                  TableName: 'TestTable',
                  PrimaryKey: [{ FieldName: 'TestID' }],
               },
            ],
         });
         configInfo.additionalSchemaInfo = path.relative(process.cwd(), dummyConfigFile);

         queryHandler = (sql: string) => {
            if (sql.includes("FROM [__mj].[Entity]") && sql.includes("BaseTable = 'TestTable'")) {
               return { recordset: [{ ID: 'E1000000-0000-0000-0000-000000000001' }] };
            }
            if (sql.includes("FROM [__mj].[EntityField]") && sql.includes("'TestID'")) {
               return {
                  recordset: [
                     {
                        IsPrimaryKey: true,
                        IsSoftPrimaryKey: true,
                     },
                  ],
               };
            }
            return { recordset: [] };
         };

         const success = await mm.callApplySoftPKFKConfig(pool);
         expect(success).toBe(true);

         // Assert NO UPDATE was executed
         const updates = executedStatements.filter((s) => s.trim().startsWith('UPDATE'));
         expect(updates.length).toBe(0);
      });

      it('captures exactly one UPDATE when IsPrimaryKey = 0', async () => {
         const mm = new TestableManageMetadataForConfigWriters();
         const pool = createMockConnection();

         vi.spyOn(ManageMetadataBase, 'getSoftPKFKConfig').mockReturnValue({
            Tables: [
               {
                  SchemaName: 'dbo',
                  TableName: 'TestTable',
                  PrimaryKey: [{ FieldName: 'TestID' }],
               },
            ],
         });
         configInfo.additionalSchemaInfo = path.relative(process.cwd(), dummyConfigFile);

         queryHandler = (sql: string) => {
            if (sql.includes("FROM [__mj].[Entity]") && sql.includes("BaseTable = 'TestTable'")) {
               return { recordset: [{ ID: 'E1000000-0000-0000-0000-000000000001' }] };
            }
            if (sql.includes("FROM [__mj].[EntityField]") && sql.includes("'TestID'")) {
               return {
                  recordset: [
                     {
                        IsPrimaryKey: false,
                        IsSoftPrimaryKey: false,
                     },
                  ],
               };
            }
            return { recordset: [] };
         };

         const success = await mm.callApplySoftPKFKConfig(pool);
         expect(success).toBe(true);

         // Assert exactly ONE UPDATE was executed
         const updates = executedStatements.filter((s) => s.trim().startsWith('UPDATE'));
         expect(updates.length).toBe(1);
         expect(updates[0]).toContain('[IsPrimaryKey] = 1');
         expect(updates[0]).toContain('[IsSoftPrimaryKey] = 1');
         expect(updates[0]).toContain("TestID");
      });

      it('soft-FK UPDATE carries AutoUpdateRelatedEntityInfo = 0 and IsSoftForeignKey = 1', async () => {
         const mm = new TestableManageMetadataForConfigWriters();
         const pool = createMockConnection();

         vi.spyOn(ManageMetadataBase, 'getSoftPKFKConfig').mockReturnValue({
            Tables: [
               {
                  SchemaName: 'dbo',
                  TableName: 'Orders',
                  ForeignKeys: [
                     {
                        FieldName: 'CustomerID',
                        RelatedTable: 'Customers',
                        RelatedField: 'ID',
                     },
                  ],
               },
            ],
         });
         configInfo.additionalSchemaInfo = path.relative(process.cwd(), dummyConfigFile);

         queryHandler = (sql: string) => {
            if (sql.includes("FROM [__mj].[Entity]") && sql.includes("BaseTable = 'Orders'")) {
               return { recordset: [{ ID: 'E1000000-0000-0000-0000-000000000001' }] };
            }
            if (sql.includes("FROM [__mj].[Entity]") && sql.includes("BaseTable = 'Customers'")) {
               return { recordset: [{ ID: 'E2000000-0000-0000-0000-000000000002' }] };
            }
            if (sql.includes("FROM [__mj].[EntityField]") && sql.includes("'CustomerID'")) {
               // Differing FK state: AutoUpdateRelatedEntityInfo is still true
               return {
                  recordset: [
                     {
                        RelatedEntityID: null,
                        RelatedEntityFieldName: null,
                        IsSoftForeignKey: false,
                        AutoUpdateRelatedEntityInfo: true,
                     },
                  ],
               };
            }
            return { recordset: [] };
         };

         const success = await mm.callApplySoftPKFKConfig(pool);
         expect(success).toBe(true);

         const updates = executedStatements.filter((s) => s.trim().startsWith('UPDATE'));
         expect(updates.length).toBe(1);
         expect(updates[0]).toContain('[IsSoftForeignKey] = 1');
         expect(updates[0]).toContain('[AutoUpdateRelatedEntityInfo] = 0');
         expect(updates[0]).toContain("E2000000-0000-0000-0000-000000000002");
         expect(updates[0]).toContain("RelatedEntityFieldName] = 'ID'");
      });
   });

   describe('processEntityConfigs', () => {
      it('captures nothing when entity attributes already match', async () => {
         const mm = new TestableManageMetadataForConfigWriters();
         const pool = createMockConnection();

         vi.spyOn(ManageMetadataBase, 'getSoftPKFKConfig').mockReturnValue({
            Entities: [
               {
                  BaseTable: 'Organizations',
                  SchemaName: 'dbo',
                  TrackRecordChanges: true,
               },
            ],
         });

         queryHandler = (sql: string) => {
            if (sql.includes('FROM [__mj].[vwEntities]')) {
               return {
                  recordset: [
                     {
                        ID: 'E3000000-0000-0000-0000-000000000003',
                        Name: 'Organizations',
                        TrackRecordChanges: true,
                     },
                  ],
               };
            }
            return { recordset: [] };
         };

         const result = await mm.callProcessEntityConfigs(pool);
         expect(result.updatedCount).toBe(0);

         const updates = executedStatements.filter((s) => s.trim().startsWith('UPDATE'));
         expect(updates.length).toBe(0);
      });

      it('captures one LogSQLAndExecute UPDATE naming only differing attributes', async () => {
         const mm = new TestableManageMetadataForConfigWriters();
         const pool = createMockConnection();

         vi.spyOn(ManageMetadataBase, 'getSoftPKFKConfig').mockReturnValue({
            Entities: [
               {
                  BaseTable: 'Organizations',
                  SchemaName: 'dbo',
                  TrackRecordChanges: true,
                  Description: 'Unchanged Org Description',
               },
            ],
         });

         queryHandler = (sql: string) => {
            if (sql.includes('FROM [__mj].[vwEntities]')) {
               return {
                  recordset: [
                     {
                        ID: 'E3000000-0000-0000-0000-000000000003',
                        Name: 'Organizations',
                        TrackRecordChanges: false, // Differs!
                        Description: 'Unchanged Org Description', // Matches!
                     },
                  ],
               };
            }
            return { recordset: [] };
         };

         const result = await mm.callProcessEntityConfigs(pool);
         expect(result.updatedCount).toBe(1);

         const updates = executedStatements.filter((s) => s.trim().startsWith('UPDATE'));
         expect(updates.length).toBe(1);
         expect(updates[0]).toContain('[TrackRecordChanges] = 1');
         expect(updates[0]).not.toContain('Description');
         expect(updates[0]).toContain("ID] = 'E3000000-0000-0000-0000-000000000003'");
      });
   });

   describe('applyCategoryInfoSettings', () => {
      it('writes nothing when stored value is canonical-equal JSON', async () => {
         const mm = new TestableManageMetadataForConfigWriters();
         const pool = createMockConnection();

         const catInfo = {
            General: { icon: 'fa-info', description: 'General info' },
         };

         queryHandler = (sql: string) => {
            if (sql.includes('FieldCategoryInfo')) {
               return {
                  recordset: [
                     {
                        ID: 'SETTING-1',
                        Value: canonicalJSONStringify(catInfo, 2),
                     },
                  ],
               };
            }
            if (sql.includes('FieldCategoryIcons')) {
               return {
                  recordset: [
                     {
                        ID: 'SETTING-2',
                        Value: canonicalJSONStringify({ General: 'fa-info' }, 2),
                     },
                  ],
               };
            }
            return { recordset: [] };
         };

         await mm.callApplyCategoryInfoSettings(pool, 'E1000000-0000-0000-0000-000000000001', catInfo, 'TestEntity');

         const writes = executedStatements.filter(
            (s) => s.trim().startsWith('UPDATE') || s.trim().startsWith('INSERT') || s.includes('IF NOT EXISTS')
         );
         expect(writes.length).toBe(0);
      });

      it('INSERT carries a uuidv5 ID (identical across two calls) inside IF NOT EXISTS', async () => {
         const mm = new TestableManageMetadataForConfigWriters();
         const pool = createMockConnection();

         const catInfo = {
            System: { icon: 'fa-cog', description: 'System settings' },
         };

         // Neither setting exists initially
         queryHandler = () => ({ recordset: [] });

         await mm.callApplyCategoryInfoSettings(pool, 'E4000000-0000-0000-0000-000000000004', catInfo, 'SystemEntity');

         const inserts = executedStatements.filter(
            (s) => s.includes('INSERT INTO [__mj].[EntitySetting]') && s.includes('IF NOT EXISTS')
         );
         expect(inserts.length).toBeGreaterThanOrEqual(1);

         // Extract the minted UUID from the first insert
         const uuidMatch = /VALUES \('([0-9a-f-]{36})'/i.exec(inserts[0]);
         expect(uuidMatch).not.toBeNull();
         const firstMintedId = uuidMatch![1];

         // Second call with the same entity ID produces identical UUID
         executedStatements = [];
         await mm.callApplyCategoryInfoSettings(pool, 'E4000000-0000-0000-0000-000000000004', catInfo, 'SystemEntity');

         const secondInserts = executedStatements.filter(
            (s) => s.includes('INSERT INTO [__mj].[EntitySetting]') && s.includes('IF NOT EXISTS')
         );
         expect(secondInserts.length).toBeGreaterThanOrEqual(1);
         const secondUuidMatch = /VALUES \('([0-9a-f-]{36})'/i.exec(secondInserts[0]);
         expect(secondUuidMatch).not.toBeNull();
         expect(secondUuidMatch![1]).toBe(firstMintedId);
      });
   });
});
