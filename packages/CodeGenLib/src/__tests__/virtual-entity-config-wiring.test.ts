/**
 * Wiring tests for config-declared virtual entities in manage-metadata.ts. A stub connection
 * answers the queries; SQLLogging is real, so assertions read the CodeGen_Run capture file.
 *   - processVirtualEntityConfig: logged creation, NewEntityList, and the entity-name check that
 *     keeps a failing Entity INSERT out of the capture
 *   - applyVirtualEntitySoftKeys: VirtualEntities keys, missing columns, IsUnique on composite keys
 *   - applyConfiguredVirtualEntityKeys: relationships rebuilt only when a key changed
 *   - applySoftPKFKConfig: table entries only
 *   - manageSingleVirtualEntity: view columns matched without regard to case
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { EntityInfo, Metadata, UserInfo } from '@memberjunction/core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { configInfo, currentWorkingDirectory } from '../Config/config';
import { SQLLogging } from '../Misc/sql_logging';
import { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';

type Row = Record<string, unknown>;

/** Real class; application, permission and relationship writers record their calls instead. */
class TestableVirtualEntityWiring extends ManageMetadataBase {
   public LinkedToApplication: string[] = [];
   public PermissionsGranted: string[] = [];
   public RelationshipPasses = 0;

   protected async addEntityToApplicationForSchema(_pool: CodeGenConnection, _entityId: string, entityName: string): Promise<void> {
      this.LinkedToApplication.push(entityName);
   }
   protected async addDefaultPermissionsForEntity(_pool: CodeGenConnection, _entityId: string, entityName: string): Promise<void> {
      this.PermissionsGranted.push(entityName);
   }
   protected async manageEntityRelationships(): Promise<boolean> {
      this.RelationshipPasses++;
      return true;
   }

   public CallProcessVirtualEntityConfig(pool: CodeGenConnection, md: Metadata) {
      return this.processVirtualEntityConfig(pool, new UserInfo(), md);
   }
   public CallApplyVirtualEntitySoftKeys(pool: CodeGenConnection) {
      return this.applyVirtualEntitySoftKeys(pool);
   }
   public CallApplyConfiguredVirtualEntityKeys(pool: CodeGenConnection, md: Metadata) {
      return this.applyConfiguredVirtualEntityKeys(pool, [], md);
   }
   public CallApplySoftPKFKConfig(pool: CodeGenConnection) {
      return this.applySoftPKFKConfig(pool);
   }
   public CallManageSingleVirtualEntity(pool: CodeGenConnection, entity: EntityInfo) {
      return this.manageSingleVirtualEntity(pool, entity);
   }
}

const VE_ID = 'E1000000-0000-0000-0000-000000000001';
const REGION_ID = 'E2000000-0000-0000-0000-000000000002';
const SEED_FIELD_ID = 'F1000000-0000-0000-0000-000000000001';

describe('virtual entity config wiring (manage-metadata)', () => {
   let tmpDir: string;
   let configFile: string;
   let executed: string[];
   let origAdditionalSchemaInfo: string | undefined;
   let origSQLOutput: typeof configInfo.SQLOutput;

   beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-ve-wiring-'));
      configFile = path.join(tmpDir, 'schema-info.json');
      executed = [];
      origAdditionalSchemaInfo = configInfo.additionalSchemaInfo;
      origSQLOutput = configInfo.SQLOutput;
      configInfo.SQLOutput = {
         enabled: true,
         folderPath: tmpDir,
         omitRecurringScriptsFromLog: true,
         appendToFile: false,
         convertCoreSchemaToFlywayMigrationFile: false,
         fileName: 'CodeGen_Run_Test.sql',
      };
      SQLLogging.ResetForTests();
      SQLLogging.sqlOutputDirFlag = tmpDir;
      SQLLogging.InitSQLLogging();
      ManageMetadataBase.NewEntityList = [];
   });

   afterEach(() => {
      configInfo.additionalSchemaInfo = origAdditionalSchemaInfo;
      configInfo.SQLOutput = origSQLOutput;
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
      ManageMetadataBase.NewEntityList = [];
      SQLLogging.ResetForTests();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      vi.restoreAllMocks();
   });

   function useConfig(config: Record<string, unknown>): void {
      fs.writeFileSync(configFile, JSON.stringify(config));
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
      configInfo.additionalSchemaInfo = path.relative(currentWorkingDirectory, configFile);
   }

   function stubConnection(handler: (sql: string) => Row[]): CodeGenConnection {
      const answer = async (sql: string): Promise<CodeGenQueryResult> => {
         executed.push(sql);
         return { recordset: handler(sql) };
      };
      return {
         Dialect: new SQLServerDialect(),
         query: answer,
         queryWithParams: answer,
         executeStoredProcedure: async () => ({ recordset: [] }),
         beginTransaction: async () => ({ query: answer, commit: async () => {}, rollback: async () => {} }),
      };
   }

   function captured(): string {
      const file = SQLLogging.SQLLoggingFilePath;
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
   }

   const updates = () => executed.filter(s => s.trim().startsWith('UPDATE'));

   /** Metadata whose entity list holds the given names. */
   function metadataWith(...names: string[]): Metadata {
      vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue(
         names.map((name, i) => new EntityInfo({ ID: `D000000${i}-0000-0000-0000-000000000000`, Name: name }))
      );
      return new Metadata();
   }

   /** No entity exists for any view yet, and every view exists. */
   const creationHandler = (sql: string): Row[] => {
      if (sql.includes('[vwEntities]')) return [];
      if (sql.includes('INFORMATION_SCHEMA.VIEWS')) return [{ ViewExists: 1 }];
      return [];
   };

   describe('processVirtualEntityConfig', () => {
      it('captures the Entity INSERT before the key seed and registers the new entity', async () => {
         useConfig({ VirtualEntities: [{ ViewName: 'vwMonthlyRegionSales', SchemaName: 'sales', EntityName: 'Monthly Region Sales', PrimaryKey: ['RegionID', 'SaleYear'] }] });
         const mm = new TestableVirtualEntityWiring();

         const result = await mm.CallProcessVirtualEntityConfig(stubConnection(creationHandler), metadataWith('Regions'));

         const capture = captured();
         const entityInsert = capture.indexOf('INSERT INTO [__mj].[Entity] (');
         const seedInsert = capture.indexOf('INSERT INTO [__mj].[EntityField] (');
         expect(entityInsert).toBeGreaterThanOrEqual(0);
         expect(seedInsert).toBeGreaterThan(entityInsert);
         expect(capture).toContain("'Monthly Region Sales'");
         expect(result.createdEntityNames).toEqual(['Monthly Region Sales']);
         expect(ManageMetadataBase.NewEntityList).toEqual(['Monthly Region Sales']);
         expect(mm.LinkedToApplication).toEqual(['Monthly Region Sales']);
         expect(mm.PermissionsGranted).toEqual(['Monthly Region Sales']);
      });

      it('skips an entry whose EntityName is already taken, ignoring case, and captures nothing', async () => {
         useConfig({ VirtualEntities: [{ ViewName: 'vwRegionList', SchemaName: 'sales', EntityName: 'Regions', PrimaryKey: ['ID'] }] });
         const mm = new TestableVirtualEntityWiring();

         const result = await mm.CallProcessVirtualEntityConfig(stubConnection(creationHandler), metadataWith('REGIONS'));

         expect(captured()).not.toContain('INSERT INTO');
         expect(executed.some(s => s.includes('INSERT INTO'))).toBe(false);
         expect(result.createdEntityNames).toEqual([]);
         expect(ManageMetadataBase.NewEntityList).toEqual([]);
         expect(mm.LinkedToApplication).toEqual([]);
      });

      it('creates only the first of two entries that share an EntityName', async () => {
         useConfig({
            VirtualEntities: [
               { ViewName: 'vwSalesA', SchemaName: 'sales', EntityName: 'Sales Summary', PrimaryKey: ['ID'] },
               { ViewName: 'vwSalesB', SchemaName: 'sales', EntityName: 'sales summary', PrimaryKey: ['ID'] },
            ],
         });
         const mm = new TestableVirtualEntityWiring();

         const result = await mm.CallProcessVirtualEntityConfig(stubConnection(creationHandler), metadataWith());

         expect(result.createdEntityNames).toEqual(['Sales Summary']);
         expect(captured().split('INSERT INTO [__mj].[Entity] (').length - 1).toBe(1);
         expect(captured()).not.toContain("'vwSalesB'");
      });

      it('adds the schema suffix to a name derived from the view when that name is taken', async () => {
         useConfig({ VirtualEntities: [{ ViewName: 'vwRegions', SchemaName: 'sales', PrimaryKey: ['ID'] }] });
         const mm = new TestableVirtualEntityWiring();

         const result = await mm.CallProcessVirtualEntityConfig(stubConnection(creationHandler), metadataWith('Regions'));

         expect(result.createdEntityNames).toEqual(['Regions__sales']);
         expect(captured()).toContain("'Regions__sales'");
      });
   });

   describe('applyVirtualEntitySoftKeys', () => {
      const compositeConfig = {
         VirtualEntities: [{
            ViewName: 'vwMonthlyRegionSales',
            SchemaName: 'sales',
            PrimaryKey: ['RegionID', 'SaleYear'],
            ForeignKeys: [{ FieldName: 'RegionID', RelatedTable: 'Region', RelatedField: 'ID' }],
         }],
      };

      /** Entity and field rows for the composite-key view; `fields` maps a field name to its row. */
      const keyHandler = (fields: Record<string, Row>) => (sql: string): Row[] => {
         if (sql.includes('FROM [__mj].[Entity]') && sql.includes("BaseTable = 'vwMonthlyRegionSales'")) return [{ ID: VE_ID }];
         if (sql.includes('FROM [__mj].[Entity]') && sql.includes("BaseTable = 'Region'")) return [{ ID: REGION_ID }];
         if (sql.includes('FROM [__mj].[EntityField]')) {
            const name = Object.keys(fields).find(n => sql.includes(`'${n}'`));
            return name ? [fields[name]] : [];
         }
         return [];
      };

      it('applies the second key column and the foreign key of a VirtualEntities entry', async () => {
         useConfig(compositeConfig);
         const pool = stubConnection(keyHandler({
            RegionID: { IsPrimaryKey: true, IsSoftPrimaryKey: true, IsUnique: false, RelatedEntityID: null, RelatedEntityFieldName: null, IsSoftForeignKey: false, AutoUpdateRelatedEntityInfo: true },
            SaleYear: { IsPrimaryKey: false, IsSoftPrimaryKey: false, IsUnique: false },
         }));

         const result = await new TestableVirtualEntityWiring().CallApplyVirtualEntitySoftKeys(pool);

         expect(result).toEqual({ success: true, writeCount: 2 });
         const [pkUpdate, fkUpdate] = updates();
         expect(pkUpdate).toContain("[Name] = 'SaleYear'");
         expect(pkUpdate).toContain('[IsPrimaryKey] = 1');
         expect(fkUpdate).toContain("[Name] = 'RegionID'");
         expect(fkUpdate).toContain(`[RelatedEntityID] = '${REGION_ID}'`);
         expect(captured()).toContain("[Name] = 'SaleYear'");
      });

      it('writes nothing when every key is already set', async () => {
         useConfig(compositeConfig);
         const pool = stubConnection(keyHandler({
            RegionID: { IsPrimaryKey: true, IsSoftPrimaryKey: true, IsUnique: false, RelatedEntityID: REGION_ID, RelatedEntityFieldName: 'ID', IsSoftForeignKey: true, AutoUpdateRelatedEntityInfo: false },
            SaleYear: { IsPrimaryKey: true, IsSoftPrimaryKey: true, IsUnique: false },
         }));

         const result = await new TestableVirtualEntityWiring().CallApplyVirtualEntitySoftKeys(pool);

         expect(result).toEqual({ success: true, writeCount: 0 });
         expect(updates()).toEqual([]);
      });

      it('writes nothing for configured key columns that are not in the view', async () => {
         useConfig({
            VirtualEntities: [{
               ViewName: 'vwMonthlyRegionSales',
               SchemaName: 'sales',
               PrimaryKey: ['SaleYeer'],
               ForeignKeys: [{ FieldName: 'RegionIDD', RelatedTable: 'Region', RelatedField: 'ID' }],
            }],
         });
         const pool = stubConnection(keyHandler({}));

         const result = await new TestableVirtualEntityWiring().CallApplyVirtualEntitySoftKeys(pool);

         expect(result).toEqual({ success: true, writeCount: 0 });
         expect(updates()).toEqual([]);
      });

      it('clears IsUnique on a column of a composite key', async () => {
         useConfig(compositeConfig);
         const pool = stubConnection(keyHandler({
            RegionID: { IsPrimaryKey: true, IsSoftPrimaryKey: true, IsUnique: true, RelatedEntityID: REGION_ID, RelatedEntityFieldName: 'ID', IsSoftForeignKey: true, AutoUpdateRelatedEntityInfo: false },
            SaleYear: { IsPrimaryKey: true, IsSoftPrimaryKey: true, IsUnique: false },
         }));

         await new TestableVirtualEntityWiring().CallApplyVirtualEntitySoftKeys(pool);

         expect(updates()).toHaveLength(1);
         expect(updates()[0]).toContain("[Name] = 'RegionID'");
         expect(updates()[0]).toContain('[IsUnique] = 0');
      });

      it('keeps IsUnique on a single-column key', async () => {
         useConfig({ VirtualEntities: [{ ViewName: 'vwMonthlyRegionSales', SchemaName: 'sales', PrimaryKey: ['RegionID'] }] });
         const pool = stubConnection(keyHandler({
            RegionID: { IsPrimaryKey: true, IsSoftPrimaryKey: true, IsUnique: true },
         }));

         await new TestableVirtualEntityWiring().CallApplyVirtualEntitySoftKeys(pool);

         expect(updates()).toEqual([]);
      });
   });

   describe('applyConfiguredVirtualEntityKeys', () => {
      const config = { VirtualEntities: [{ ViewName: 'vwMonthlyRegionSales', SchemaName: 'sales', PrimaryKey: ['RegionID'] }] };
      const handler = (isPrimaryKey: boolean) => (sql: string): Row[] => {
         if (sql.includes('FROM [__mj].[Entity]')) return [{ ID: VE_ID }];
         if (sql.includes('FROM [__mj].[EntityField]')) return [{ IsPrimaryKey: isPrimaryKey, IsSoftPrimaryKey: isPrimaryKey, IsUnique: true }];
         return [];
      };

      it('refreshes metadata and rebuilds relationships when a key was written', async () => {
         useConfig(config);
         const refresh = vi.spyOn(Metadata.prototype, 'Refresh').mockResolvedValue(true);
         const mm = new TestableVirtualEntityWiring();

         expect(await mm.CallApplyConfiguredVirtualEntityKeys(stubConnection(handler(false)), new Metadata())).toBe(true);

         expect(refresh).toHaveBeenCalledTimes(1);
         expect(mm.RelationshipPasses).toBe(1);
      });

      it('skips the relationship pass when every key is already set', async () => {
         useConfig(config);
         vi.spyOn(Metadata.prototype, 'Refresh').mockResolvedValue(true);
         const mm = new TestableVirtualEntityWiring();

         expect(await mm.CallApplyConfiguredVirtualEntityKeys(stubConnection(handler(true)), new Metadata())).toBe(true);

         expect(mm.RelationshipPasses).toBe(0);
      });
   });

   describe('applySoftPKFKConfig', () => {
      it('leaves VirtualEntities entries to the pass after the field sync', async () => {
         useConfig({ VirtualEntities: [{ ViewName: 'vwMonthlyRegionSales', SchemaName: 'sales', PrimaryKey: ['RegionID'] }] });

         await new TestableVirtualEntityWiring().CallApplySoftPKFKConfig(stubConnection(() => []));

         expect(executed.some(s => s.includes('vwMonthlyRegionSales'))).toBe(false);
      });

      it('writes nothing for table key columns that do not exist', async () => {
         useConfig({ sales: [{ TableName: 'Sale', PrimaryKey: [{ FieldName: 'SaleIDD' }], ForeignKeys: [{ FieldName: 'RegionIDD', RelatedTable: 'Region', RelatedField: 'ID' }] }] });
         const pool = stubConnection(sql => (sql.includes('FROM [__mj].[Entity]') ? [{ ID: VE_ID }] : []));

         expect(await new TestableVirtualEntityWiring().CallApplySoftPKFKConfig(pool)).toBe(true);

         expect(updates()).toEqual([]);
      });

      it('does not change IsUnique for a table entry with a composite key', async () => {
         useConfig({ sales: [{ TableName: 'SaleLine', PrimaryKey: [{ FieldName: 'SaleID' }, { FieldName: 'LineNo' }] }] });
         const pool = stubConnection(sql => {
            if (sql.includes('FROM [__mj].[Entity]')) return [{ ID: VE_ID }];
            if (sql.includes('FROM [__mj].[EntityField]')) return [{ IsPrimaryKey: true, IsSoftPrimaryKey: true, IsUnique: true }];
            return [];
         });

         await new TestableVirtualEntityWiring().CallApplySoftPKFKConfig(pool);

         expect(updates()).toEqual([]);
      });
   });

   describe('manageSingleVirtualEntity', () => {
      const intColumn = (name: string): Row => ({ FieldName: name, Type: 'int', Length: 4, Precision: 10, Scale: 0, AllowsNull: false });
      const entityWithField = (fieldName: string) => new EntityInfo({
         ID: VE_ID,
         Name: 'Monthly Region Sales',
         SchemaName: 'sales',
         BaseView: 'vwMonthlyRegionSales',
         VirtualEntity: true,
         Fields: [{ ID: SEED_FIELD_ID, EntityID: VE_ID, Name: fieldName, Type: 'int', Length: 4, Precision: 10, Scale: 0, AllowsNull: false, Sequence: 1, IsPrimaryKey: true, IsUnique: false }],
      });
      const viewHandler = (sql: string): Row[] => (sql.includes('sys.columns') ? [intColumn('RegionID'), intColumn('SaleYear')] : []);

      it('keeps a key field whose name differs from the view column only in case, and takes the view casing', async () => {
         const entity = entityWithField('regionid');
         vi.spyOn(Metadata.prototype, 'EntityByName').mockReturnValue(entity);

         const result = await new TestableVirtualEntityWiring().CallManageSingleVirtualEntity(stubConnection(viewHandler), entity);

         expect(result.success).toBe(true);
         expect(executed.some(s => s.trim().startsWith('DELETE'))).toBe(false);
         const rename = updates().find(s => s.includes(`ID = '${SEED_FIELD_ID}'`));
         expect(rename).toBeDefined();
         expect(rename).toContain("Name='RegionID'");
         expect(executed.some(s => s.includes('INSERT INTO') && s.includes("'RegionID'"))).toBe(false);
      });

      it('does not rewrite a field whose name already matches the view column', async () => {
         const entity = entityWithField('RegionID');
         vi.spyOn(Metadata.prototype, 'EntityByName').mockReturnValue(entity);

         await new TestableVirtualEntityWiring().CallManageSingleVirtualEntity(stubConnection(viewHandler), entity);

         expect(updates().some(s => s.includes(`ID = '${SEED_FIELD_ID}'`))).toBe(false);
      });
   });
});
