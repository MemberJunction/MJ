/**
 * Soft FK validation in manage-metadata.ts (#4532).
 *   - findConflictingSoftForeignKeys: a field declared with two targets is reported, not resolved
 *     by whichever declaration comes last in the file
 *   - checkSoftFKTarget: the target column must exist (case-sensitively on PostgreSQL) and should be
 *     unique on its own; a column of a composite primary key is not
 *   - applySoftKeysToTables, against an in-memory EntityField catalog: conflicting fields and
 *     missing targets get no UPDATE, non-unique targets are applied with a warning, and soft PKs
 *     are applied before any FK is checked
 *
 * Mock block mirrors virtual-entity-config-keys.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const platform = vi.hoisted(() => ({ value: 'sqlserver' as 'sqlserver' | 'postgresql' }));
const executed = vi.hoisted(() => ({ statements: [] as string[] }));
const logs = vi.hoisted(() => ({ errors: [] as string[], warnings: [] as string[] }));

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: {},
   currentWorkingDirectory: '/tmp',
   GetSettingValue: vi.fn(),
    get getSettingValue() { return this.GetSettingValue; },
   MjCoreSchema: () => '__mj',
    get mj_core_schema() { return this.MjCoreSchema; },
   DbPlatform: () => platform.value,
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
   logError: vi.fn((m: string) => { logs.errors.push(m); }),
   LogMessage: vi.fn(),
    get logMessage() { return this.LogMessage; },
   logStatus: vi.fn(),
   LogWarning: vi.fn((m: string) => { logs.warnings.push(m); }),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('@memberjunction/global', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/global')>();
   return { ...actual };
});
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async (_pool: unknown, sql: string) => { executed.statements.push(sql); return {}; }) },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase, SoftPKFKTableConfig, SoftFKTargetField, SoftFKConflict, SoftFKTargetCheck } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';

interface FakeField { Name: string; IsPrimaryKey: boolean; IsUnique: boolean; IsSoftPrimaryKey: boolean }
interface FakeEntity { ID: string; SchemaName: string; BaseTable: string; Fields: FakeField[] }

/**
 * Real SQL Server dialect, identity qsql, and runQuery answered from an in-memory catalog. Soft PK
 * UPDATEs captured by the SQLLogging mock are applied back to the catalog, so a later FK check sees them.
 */
class TestableSoftKeys extends ManageMetadataBase {
   constructor(private entities: FakeEntity[]) { super(); }
   protected get dialect(): SQLDialect { return new SQLServerDialect(); }
   protected qsql(sql: string): string { return sql; }

   public testConflicts(tables: SoftPKFKTableConfig[]): SoftFKConflict[] { return this.findConflictingSoftForeignKeys(tables); }
   public testTarget(fields: SoftFKTargetField[], name: string, caseSensitive: boolean): SoftFKTargetCheck { return this.checkSoftFKTarget(fields, name, caseSensitive); }
   public async testApply(tables: SoftPKFKTableConfig[]): Promise<number> { return this.applySoftKeysToTables({} as CodeGenConnection, tables, false); }

   protected async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
      this.applyCapturedUpdates();
      const flat = sql.replace(/\s+/g, ' ');
      const entityLookup = flat.match(/FROM \[__mj\]\.\[Entity\] WHERE SchemaName = '([^']*)' AND BaseTable = '([^']*)'/);
      if (entityLookup) {
         const e = this.entities.find(x => x.SchemaName === entityLookup[1] && x.BaseTable === entityLookup[2]);
         return { recordset: e ? [{ ID: e.ID }] : [] };
      }
      const byEntity = flat.match(/WHERE \[EntityID\] = '([^']*)'$/);
      if (byEntity) {
         return { recordset: this.entity(byEntity[1]).Fields.map(f => ({ Name: f.Name, IsPrimaryKey: f.IsPrimaryKey, IsUnique: f.IsUnique })) };
      }
      const byField = flat.match(/WHERE \[EntityID\] = '([^']*)' AND \[Name\] = '([^']*)'/);
      if (byField) {
         const f = this.entity(byField[1]).Fields.find(x => x.Name === byField[2]);
         return { recordset: f ? [{ ...f, RelatedEntityID: null, RelatedEntityFieldName: null, IsSoftForeignKey: false, AutoUpdateRelatedEntityInfo: true }] : [] };
      }
      throw new Error(`unexpected query: ${flat}`);
   }

   private entity(id: string): FakeEntity {
      return this.entities.find(e => e.ID === id)!;
   }

   private applied = 0;
   private applyCapturedUpdates(): void {
      for (; this.applied < executed.statements.length; this.applied++) {
         const flat = executed.statements[this.applied].replace(/\s+/g, ' ');
         const pk = flat.match(/\[IsSoftPrimaryKey\] = 1.* WHERE \[EntityID\] = '([^']*)' AND \[Name\] = '([^']*)'/);
         if (pk) {
            const f = this.entity(pk[1]).Fields.find(x => x.Name === pk[2])!;
            f.IsPrimaryKey = true;
            f.IsSoftPrimaryKey = true;
         }
      }
   }
}

const field = (Name: string, IsPrimaryKey = false, IsUnique = false): FakeField => ({ Name, IsPrimaryKey, IsUnique, IsSoftPrimaryKey: false });
const table = (TableName: string, ForeignKeys: SoftPKFKTableConfig['ForeignKeys'], PrimaryKey: SoftPKFKTableConfig['PrimaryKey'] = []): SoftPKFKTableConfig =>
   ({ SchemaName: 'app', TableName, PrimaryKey, ForeignKeys });

function catalog(): FakeEntity[] {
   return [
      { ID: 'E-LINE', SchemaName: 'app', BaseTable: 'line', Fields: [field('id', true, true), field('a_key'), field('a_prd_key'), field('a_ptp_key'), field('owner_id')] },
      // composite primary key: prc_key alone is not unique
      { ID: 'E-PRICE', SchemaName: 'app', BaseTable: 'price', Fields: [field('prc_key', true), field('prc_prd_key', true), field('prc_prd_ptp_key', true)] },
      { ID: 'E-PRODUCT', SchemaName: 'app', BaseTable: 'product', Fields: [field('ID', true, true)] },
      // no declared key: the soft PK in the config is the only thing that makes `code` unique
      { ID: 'E-OWNER', SchemaName: 'app', BaseTable: 'owner', Fields: [field('code')] },
   ];
}

const updatesFor = (fieldName: string) =>
   executed.statements.filter(s => s.includes('[RelatedEntityID]') && s.includes(`[Name] = '${fieldName}'`));

beforeEach(() => {
   executed.statements = [];
   logs.errors = [];
   logs.warnings = [];
   platform.value = 'sqlserver';
});

describe('findConflictingSoftForeignKeys', () => {
   const gen = new TestableSoftKeys([]);

   it('reports a field declared with more than one target, in file order', () => {
      const conflicts = gen.testConflicts([table('line', [
         { FieldName: 'a_key', RelatedTable: 'price', RelatedField: 'prc_key' },
         { FieldName: 'a_key', RelatedTable: 'price', RelatedField: 'prc_prd_key' },
         { FieldName: 'a_key', RelatedTable: 'price', RelatedField: 'prc_prd_ptp_key' },
      ])]);
      expect(conflicts).toEqual([{ SchemaName: 'app', TableName: 'line', FieldName: 'a_key', Targets: ['app.price.prc_key', 'app.price.prc_prd_key', 'app.price.prc_prd_ptp_key'] }]);
   });

   it('does not report a repeated identical declaration, or one differing only in case', () => {
      expect(gen.testConflicts([table('line', [
         { FieldName: 'a_key', RelatedTable: 'price', RelatedField: 'prc_key' },
         { FieldName: 'a_key', RelatedTable: 'Price', RelatedField: 'PRC_KEY' },
      ])])).toEqual([]);
   });

   it('finds conflicting declarations split across two entries for the same table', () => {
      expect(gen.testConflicts([
         table('line', [{ FieldName: 'a_key', RelatedTable: 'price', RelatedField: 'prc_key' }]),
         table('line', [{ FieldName: 'a_key', RelatedTable: 'product', RelatedField: 'ID' }]),
      ])).toHaveLength(1);
   });
});

describe('checkSoftFKTarget', () => {
   const gen = new TestableSoftKeys([]);
   const priceFields: SoftFKTargetField[] = [
      { Name: 'prc_key', IsPrimaryKey: true, IsUnique: false },
      { Name: 'prc_prd_key', IsPrimaryKey: true, IsUnique: false },
   ];

   it('treats a single-column primary key as unique', () => {
      expect(gen.testTarget([{ Name: 'id', IsPrimaryKey: true, IsUnique: false }], 'id', true)).toEqual({ ResolvedName: 'id', IsUnique: true });
   });

   it('does not treat one column of a composite primary key as unique', () => {
      expect(gen.testTarget(priceFields, 'prc_key', true)).toMatchObject({ ResolvedName: 'prc_key', IsUnique: false, NotUniqueReason: 'it is one column of a 2-column primary key' });
   });

   it('matches case-sensitively on PostgreSQL and resolves the real name on SQL Server', () => {
      const fields: SoftFKTargetField[] = [{ Name: 'id', IsPrimaryKey: true, IsUnique: true }];
      expect(gen.testTarget(fields, 'ID', true).ResolvedName).toBeNull();
      expect(gen.testTarget(fields, 'ID', false).ResolvedName).toBe('id');
   });
});

describe('applySoftKeysToTables', () => {
   it('writes no target for a conflicting field and names every declaration', async () => {
      const gen = new TestableSoftKeys(catalog());
      await gen.testApply([table('line', [
         { FieldName: 'a_key', RelatedTable: 'price', RelatedField: 'prc_key' },
         { FieldName: 'a_key', RelatedTable: 'price', RelatedField: 'prc_prd_ptp_key' },
      ])]);

      expect(updatesFor('a_key')).toEqual([]);
      expect(logs.errors).toHaveLength(1);
      expect(logs.errors[0]).toContain('app.price.prc_key, app.price.prc_prd_ptp_key');
   });

   it('still applies the non-conflicting fields of the same table', async () => {
      const gen = new TestableSoftKeys(catalog());
      await gen.testApply([table('line', [
         { FieldName: 'a_key', RelatedTable: 'price', RelatedField: 'prc_key' },
         { FieldName: 'a_key', RelatedTable: 'price', RelatedField: 'prc_prd_key' },
         { FieldName: 'a_prd_key', RelatedTable: 'product', RelatedField: 'ID' },
      ])]);
      expect(updatesFor('a_key')).toEqual([]);
      expect(updatesFor('a_prd_key')).toHaveLength(1);
   });

   it('skips a target column that does not exist on PostgreSQL (ID vs id)', async () => {
      platform.value = 'postgresql';
      const gen = new TestableSoftKeys(catalog());
      // PostgreSQL quoting is not exercised here (the dialect stays SQL Server); only the name match is.
      await gen.testApply([table('line', [{ FieldName: 'a_prd_key', RelatedTable: 'product', RelatedField: 'id' }])]);
      expect(updatesFor('a_prd_key')).toEqual([]);
      expect(logs.warnings.some(w => w.includes('has no such column'))).toBe(true);
   });

   it('writes the column\'s real name on SQL Server when the file differs only in case', async () => {
      const gen = new TestableSoftKeys(catalog());
      await gen.testApply([table('line', [{ FieldName: 'a_prd_key', RelatedTable: 'product', RelatedField: 'id' }])]);
      expect(updatesFor('a_prd_key')).toHaveLength(1);
      expect(updatesFor('a_prd_key')[0]).toContain("[RelatedEntityFieldName] = 'ID'");
   });

   it('applies a non-unique target with a warning', async () => {
      const gen = new TestableSoftKeys(catalog());
      await gen.testApply([table('line', [{ FieldName: 'a_ptp_key', RelatedTable: 'price', RelatedField: 'prc_prd_ptp_key' }])]);
      expect(updatesFor('a_ptp_key')).toHaveLength(1);
      expect(logs.warnings.some(w => w.includes('one column of a 3-column primary key'))).toBe(true);
   });

   it('applies soft PKs before checking FKs, whatever the order of tables in the file', async () => {
      const gen = new TestableSoftKeys(catalog());
      // line (with the FK) comes before owner (which gets its soft PK) in the file.
      await gen.testApply([
         table('line', [{ FieldName: 'owner_id', RelatedTable: 'owner', RelatedField: 'code' }]),
         table('owner', [], [{ FieldName: 'code' }]),
      ]);
      expect(updatesFor('owner_id')).toHaveLength(1);
      expect(logs.warnings).toEqual([]);
   });
});
