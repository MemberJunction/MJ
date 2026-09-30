/**
 * Unit tests for the config-driven virtual entity path in manage-metadata.ts.
 *   - virtualEntityConfigsAsTableConfigs: VirtualEntities entries become soft PK/FK table configs,
 *     so the soft key writer applies them with no duplicate table entry
 *   - resolveVirtualEntitySchema: a missing SchemaName means dbo, as the docs promise
 *   - buildVirtualEntityInsertSQL / buildVirtualEntityPlaceholderPKSQL: the logged, replayable
 *     creation statements that replace the unlogged spCreateVirtualEntity call
 *   - virtualEntityHasPrimaryKey: the key check ignores fields the sync just removed
 *
 * Pure methods only; nothing here touches a database. The dialect is a real SQLServerDialect
 * so the asserted quoting is what ships. Mock block mirrors isa-parentid-detection.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: {},
   currentWorkingDirectory: '/tmp',
   GetSettingValue: vi.fn(),
    get getSettingValue() { return this.GetSettingValue; },
   MjCoreSchema: () => '__mj',
    get mj_core_schema() { return this.MjCoreSchema; },
   DbPlatform: () => 'sqlserver',
    get dbPlatform() { return this.DbPlatform; },
   OutputDir: '/tmp',
    get outputDir() { return this.OutputDir; },
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
   return { ...actual };
});
vi.mock('../Misc/status_logging', () => ({
   logError: vi.fn(),
   LogMessage: vi.fn(),
    get logMessage() { return this.LogMessage; },
   logStatus: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('@memberjunction/global', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/global')>();
   return { ...actual };
});
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase, SoftPKFKTableConfig, VirtualEntityConfig } from '../Database/manage-metadata';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';

/** Thin subclass: real SQL Server dialect, identity qsql (no dbProvider), protected methods exposed. */
class TestableVirtualEntities extends ManageMetadataBase {
   protected get dialect(): SQLDialect { return new SQLServerDialect(); }
   protected qsql(sql: string): string { return sql; }

   public testSchema(ve: VirtualEntityConfig): string { return this.resolveVirtualEntitySchema(ve); }
   public testKeyConfigs(config: Record<string, unknown>): SoftPKFKTableConfig[] { return this.virtualEntityConfigsAsTableConfigs(config); }
   public testInsertSQL(id: string, name: string, schema: string, view: string, description: string | null): string {
      return this.buildVirtualEntityInsertSQL(id, name, schema, view, description);
   }
   public testPlaceholderSQL(fieldId: string, entityId: string, pk: string, single: boolean): string {
      return this.buildVirtualEntityPlaceholderPKSQL(fieldId, entityId, pk, single);
   }
   public testHasPK(fields: ReadonlyArray<{ ID: string; IsPrimaryKey: boolean }>, removed: ReadonlySet<string>): boolean {
      return this.virtualEntityHasPrimaryKey(fields, removed);
   }
}

const ENTITY_ID = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
const FIELD_ID = 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB';
const flat = (sql: string) => sql.replace(/\s+/g, ' ').trim();

const configWithBoth: Record<string, unknown> = {
   VirtualEntities: [
      {
         ViewName: 'vwMonthlyRegionSales',
         SchemaName: 'sales',
         EntityName: 'Monthly Region Sales',
         PrimaryKey: ['RegionID', 'SaleYear', 'SaleMonth'],
         ForeignKeys: [{ FieldName: 'RegionID', SchemaName: 'sales', RelatedTable: 'Region', RelatedField: 'ID' }],
      },
      { ViewName: 'vwNoKeys', SchemaName: 'sales' },
      { ViewName: 'vwDefaultSchema', PrimaryKey: ['ID'] },
   ],
   sales: [
      { TableName: 'Region', PrimaryKey: [{ FieldName: 'ID' }], ForeignKeys: [] },
   ],
};

describe('virtual entity config keys (manage-metadata)', () => {
   describe('resolveVirtualEntitySchema', () => {
      it('defaults to dbo when SchemaName is missing', () => {
         expect(new TestableVirtualEntities().testSchema({ ViewName: 'vwX' })).toBe('dbo');
      });
      it('defaults to dbo when SchemaName is blank', () => {
         expect(new TestableVirtualEntities().testSchema({ ViewName: 'vwX', SchemaName: '   ' })).toBe('dbo');
      });
      it('returns the trimmed SchemaName when present', () => {
         expect(new TestableVirtualEntities().testSchema({ ViewName: 'vwX', SchemaName: ' sales ' })).toBe('sales');
      });
   });

   describe('virtualEntityConfigsAsTableConfigs', () => {
      it('lists only the VirtualEntities entries that declare keys, with the view as TableName', () => {
         const result = new TestableVirtualEntities().testKeyConfigs(configWithBoth);
         expect(result.map(t => `${t.SchemaName}.${t.TableName}`)).toEqual([
            'sales.vwMonthlyRegionSales',
            'dbo.vwDefaultSchema',
         ]);
      });
      it('turns PrimaryKey strings into { FieldName } objects and keeps every column', () => {
         const ve = new TestableVirtualEntities().testKeyConfigs(configWithBoth)[0];
         expect(ve.PrimaryKey).toEqual([{ FieldName: 'RegionID' }, { FieldName: 'SaleYear' }, { FieldName: 'SaleMonth' }]);
      });
      it('passes ForeignKeys through unchanged', () => {
         const ve = new TestableVirtualEntities().testKeyConfigs(configWithBoth)[0];
         expect(ve.ForeignKeys).toEqual([{ FieldName: 'RegionID', SchemaName: 'sales', RelatedTable: 'Region', RelatedField: 'ID' }]);
      });
      it('returns nothing when there is no VirtualEntities section', () => {
         expect(new TestableVirtualEntities().testKeyConfigs({ sales: configWithBoth.sales })).toEqual([]);
      });
   });

   describe('buildVirtualEntityInsertSQL', () => {
      const sql = flat(new TestableVirtualEntities().testInsertSQL(ENTITY_ID, 'Monthly Region Sales', 'sales', 'vwMonthlyRegionSales', "Sales by month, O'Brien region"));

      it('targets the core Entity table with dialect quoting', () => {
         expect(sql).toContain('INSERT INTO [__mj].[Entity] (');
      });
      it('writes the fixed ID as a typed literal so the capture replays with the same ID', () => {
         expect(sql).toContain(`CAST('${ENTITY_ID}' AS uniqueidentifier)`);
      });
      it('uses the view name for BaseTable and BaseView and keeps the schema', () => {
         expect(sql).toContain("'vwMonthlyRegionSales', 'vwMonthlyRegionSales', 'sales'");
      });
      it('keeps the description and escapes quotes', () => {
         expect(sql).toContain("'Sales by month, O''Brien region'");
      });
      it('marks the entity virtual, read-only, in the API, no record changes', () => {
         // VirtualEntity, IncludeInAPI, AllowCreateAPI, AllowUpdateAPI, AllowDeleteAPI, AllowRecordMerge, TrackRecordChanges
         expect(sql).toMatch(/'sales', 1, 1, 0, 0, 0, 0, 0, GETUTCDATE\(\), GETUTCDATE\(\) \)$/);
      });
      it('writes NULL when there is no description', () => {
         const noDesc = flat(new TestableVirtualEntities().testInsertSQL(ENTITY_ID, 'X', 'dbo', 'vwX', null));
         expect(noDesc).toContain("'X', NULL, 'vwX'");
      });
   });

   describe('buildVirtualEntityPlaceholderPKSQL', () => {
      it('seeds the first key column with an apply-time Sequence, never a literal', () => {
         const sql = flat(new TestableVirtualEntities().testPlaceholderSQL(FIELD_ID, ENTITY_ID, 'RegionID', true));
         expect(sql).toContain('INSERT INTO [__mj].[EntityField] (');
         expect(sql).toContain(`(SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = '${ENTITY_ID}')`);
         expect(sql).toContain("'RegionID', 1, 1, 'int'");
      });
      it('is not unique when the configured key has several columns', () => {
         const sql = flat(new TestableVirtualEntities().testPlaceholderSQL(FIELD_ID, ENTITY_ID, 'RegionID', false));
         expect(sql).toContain("'RegionID', 1, 0, 'int'");
      });
      it('escapes a quote in the key column name', () => {
         const sql = flat(new TestableVirtualEntities().testPlaceholderSQL(FIELD_ID, ENTITY_ID, "Odd'Name", true));
         expect(sql).toContain("'Odd''Name'");
      });
   });

   describe('virtualEntityHasPrimaryKey', () => {
      const fields = [
         { ID: 'f-id', IsPrimaryKey: true },
         { ID: 'f-name', IsPrimaryKey: false },
      ];
      it('is true when a key field remains', () => {
         expect(new TestableVirtualEntities().testHasPK(fields, new Set())).toBe(true);
      });
      it('is false when the only key field was just removed from the view', () => {
         expect(new TestableVirtualEntities().testHasPK(fields, new Set(['f-id']))).toBe(false);
      });
      it('is false when no field is a key', () => {
         expect(new TestableVirtualEntities().testHasPK([{ ID: 'f-name', IsPrimaryKey: false }], new Set())).toBe(false);
      });
   });
});
