/**
 * Soft primary keys follow additionalSchemaInfo when a column is removed from an entry (#2568).
 * applySoftKeysToTables applies the declared key, then clears IsPrimaryKey / IsSoftPrimaryKey from
 * columns CodeGen marked soft PK that the entry no longer lists — but only while the entity keeps
 * at least one declared key column, and never for an entry with no PrimaryKey.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executed = vi.hoisted(() => ({ statements: [] as string[] }));

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: {},
   currentWorkingDirectory: '/tmp',
   GetSettingValue: vi.fn(),
   MjCoreSchema: () => '__mj',
   DbPlatform: () => 'sqlserver',
   OutputDir: '/tmp',
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('../Misc/status_logging', () => ({
   logError: vi.fn(),
   LogMessage: vi.fn(),
   logStatus: vi.fn(),
   LogWarning: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async (_pool: unknown, sql: string) => { executed.statements.push(sql); return {}; }) },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase, SoftPKFKTableConfig } from '../Database/manage-metadata';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';

interface FakeField { Name: string; IsPrimaryKey: boolean; IsSoftPrimaryKey: boolean; IsUnique: boolean }

/** runQuery answered from one in-memory entity; captured UPDATEs are applied back to it. */
class TestableSoftPK extends ManageMetadataBase {
   constructor(public Fields: FakeField[]) { super(); }
   protected get dialect(): SQLDialect { return new SQLServerDialect(); }
   protected qsql(sql: string): string { return sql; }
   protected async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
      this.applyCaptured();
      const flat = sql.replace(/\s+/g, ' ');
      if (/FROM \[__mj\]\.\[Entity\] WHERE SchemaName/.test(flat)) return { recordset: [{ ID: 'E-1' }] };
      const byField = flat.match(/WHERE \[EntityID\] = 'E-1' AND \[Name\] = '([^']*)'/);
      if (byField) return { recordset: this.Fields.filter(f => f.Name === byField[1]) };
      if (/WHERE \[EntityID\] = 'E-1'$/.test(flat.trim())) return { recordset: this.Fields };
      throw new Error(`unexpected query: ${flat}`);
   }
   private applied = 0;
   private applyCaptured(): void {
      for (; this.applied < executed.statements.length; this.applied++) {
         const flat = executed.statements[this.applied].replace(/\s+/g, ' ');
         const name = flat.match(/\[Name\] = '([^']*)'/)?.[1];
         const f = this.Fields.find(x => x.Name === name);
         if (!f) continue;
         const on = !/\[IsSoftPrimaryKey\] = 0/.test(flat); // a retraction sets 0; an apply sets 1
         f.IsPrimaryKey = on;
         f.IsSoftPrimaryKey = on;
      }
   }
   public async Apply(table: SoftPKFKTableConfig): Promise<number> {
      const n = await this.applySoftKeysToTables({} as CodeGenConnection, [table], false);
      this.applyCaptured();
      return n;
   }
}

const fld = (Name: string, soft = false): FakeField => ({ Name, IsPrimaryKey: soft, IsSoftPrimaryKey: soft, IsUnique: false });
const entry = (PrimaryKey: string[]): SoftPKFKTableConfig => ({ SchemaName: 'hubspot', TableName: 'Emails', PrimaryKey: PrimaryKey.map(FieldName => ({ FieldName })), ForeignKeys: [] });
const retractions = () => executed.statements.filter(s => /\[IsSoftPrimaryKey\] = 0/.test(s));

beforeEach(() => {
   executed.statements = [];
});

describe('SoftPrimaryKeysToRetract', () => {
   it('returns soft-PK columns the entry no longer declares', () => {
      expect(ManageMetadataBase.SoftPrimaryKeysToRetract(['ID'], ['ID', 'RecordID'])).toEqual(['RecordID']);
   });
   it('returns nothing unless a declared column is already a soft PK (the entity keeps a key)', () => {
      expect(ManageMetadataBase.SoftPrimaryKeysToRetract(['NewKey'], ['ID', 'RecordID'])).toEqual([]);
   });
   it('compares names case-insensitively', () => {
      expect(ManageMetadataBase.SoftPrimaryKeysToRetract(['id'], ['ID', 'RECORDID'])).toEqual(['RECORDID']);
      expect(ManageMetadataBase.SoftPrimaryKeysToRetract(['id', 'recordid'], ['ID', 'RecordID'])).toEqual([]);
   });
});

describe('applySoftKeysToTables retracts undeclared soft PKs (#2568)', () => {
   it('clears the column removed from a composite soft PK, guarded on IsSoftPrimaryKey', async () => {
      const mm = new TestableSoftPK([fld('ID', true), fld('RecordID', true), fld('Subject')]);
      await mm.Apply(entry(['ID']));
      expect(retractions()).toHaveLength(1);
      const sql = retractions()[0].replace(/\s+/g, ' ');
      expect(sql).toContain('[IsPrimaryKey] = 0');
      expect(sql).toContain(`[Name] = 'RecordID' AND [IsSoftPrimaryKey] = 1`);
      expect(mm.Fields.find(f => f.Name === 'RecordID')).toMatchObject({ IsPrimaryKey: false, IsSoftPrimaryKey: false });
      expect(mm.Fields.find(f => f.Name === 'ID')).toMatchObject({ IsPrimaryKey: true, IsSoftPrimaryKey: true });
   });

   it('moves a soft PK to a different column: applies the new one, then clears the old one', async () => {
      const mm = new TestableSoftPK([fld('ID'), fld('RecordID', true)]);
      await mm.Apply(entry(['ID']));
      expect(mm.Fields.find(f => f.Name === 'ID')).toMatchObject({ IsPrimaryKey: true, IsSoftPrimaryKey: true });
      expect(mm.Fields.find(f => f.Name === 'RecordID')).toMatchObject({ IsPrimaryKey: false, IsSoftPrimaryKey: false });
   });

   it('leaves the key alone when the declared column does not exist', async () => {
      const mm = new TestableSoftPK([fld('ID', true), fld('RecordID', true)]);
      await mm.Apply(entry(['Missing']));
      expect(retractions()).toHaveLength(0);
   });

   it('leaves the key alone for an entry with no PrimaryKey (a partial file must not strip keys)', async () => {
      const mm = new TestableSoftPK([fld('ID', true), fld('RecordID', true)]);
      await mm.Apply(entry([]));
      expect(executed.statements).toHaveLength(0);
   });

   it('writes nothing when the stored soft PK already matches the entry', async () => {
      const mm = new TestableSoftPK([fld('ID', true), fld('RecordID', true)]);
      await mm.Apply(entry(['ID', 'RecordID']));
      expect(executed.statements).toHaveLength(0);
   });
});
