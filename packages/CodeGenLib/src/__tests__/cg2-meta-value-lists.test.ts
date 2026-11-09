/**
 * Value lists in manage-metadata.ts.
 *   - #2577: a value longer than EntityFieldValue.Code (nvarchar(50)) is inserted with Code NULL
 *     ("same as Value") instead of overflowing the column; quotes in values are escaped.
 *   - #3986: warnOnEmptyValueLists reports every in-scope field with ValueListType='List' and no
 *     EntityFieldValue rows, as a warning, and never fails the run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executed = vi.hoisted(() => ({ statements: [] as string[] }));
const logs = vi.hoisted(() => ({ warnings: [] as string[], errors: [] as string[] }));

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
   logError: vi.fn((m: string) => { logs.errors.push(m); }),
   LogMessage: vi.fn(),
   logStatus: vi.fn(),
   LogWarning: vi.fn((m: string) => { logs.warnings.push(m); }),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async (_pool: unknown, sql: string) => { executed.statements.push(sql); return {}; }) },
}));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'new-efv-id'), v5: vi.fn(() => 'v5-id') }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase } from '../Database/manage-metadata';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';

class TestableValueLists extends ManageMetadataBase {
   public Queries: string[] = [];
   public Rows: Record<string, unknown>[] = [];
   public Fail = false;
   protected get dialect(): SQLDialect { return new SQLServerDialect(); }
   protected qsql(sql: string): string { return sql; }
   protected async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
      this.Queries.push(sql);
      if (this.Fail) throw new Error('boom');
      return { recordset: this.Rows };
   }
   public async Sync(values: string[]): Promise<boolean> {
      const pool = { beginTransaction: async () => ({ commit: async () => undefined, rollback: async () => undefined }) } as unknown as CodeGenConnection;
      return this.syncEntityFieldValues(pool, 7, values, [], 'Check');
   }
   public async Warn(excludeSchemas: string[]): Promise<string[]> {
      return this.warnOnEmptyValueLists({} as CodeGenConnection, excludeSchemas);
   }
}

beforeEach(() => {
   executed.statements = [];
   logs.warnings = [];
   logs.errors = [];
});

describe('EntityFieldValue.Code is not overflowed (#2577)', () => {
   const long = 'CASE Europe Non Profit Organization Educational Associate Dues'; // 62 chars

   it('EntityFieldValueCode keeps a value that fits and gives NULL for one that does not', () => {
      expect(ManageMetadataBase.EntityFieldValueCode('Active')).toBe('Active');
      expect(ManageMetadataBase.EntityFieldValueCode('x'.repeat(50))).toBe('x'.repeat(50));
      expect(ManageMetadataBase.EntityFieldValueCode('x'.repeat(51))).toBeNull();
      expect(ManageMetadataBase.EntityFieldValueCode(long)).toBeNull();
   });

   it('inserts a long value with Code NULL and a short one with Code = Value', async () => {
      expect(await new TestableValueLists().Sync(['Active', long])).toBe(true);
      expect(executed.statements).toHaveLength(2);
      expect(executed.statements[0]).toMatch(/'Active', 'Active',/);
      expect(executed.statements[1]).toContain(`'${long}', NULL,`);
   });

   it('escapes a quote in a value (soft value lists can carry one)', async () => {
      await new TestableValueLists().Sync(["O'Brien"]);
      expect(executed.statements[0]).toContain(`'O''Brien', 'O''Brien',`);
   });
});

describe('warnOnEmptyValueLists (#3986)', () => {
   it('warns once per field with ValueListType=List and no values, naming entity and field', async () => {
      const mm = new TestableValueLists();
      mm.Rows = [{ EntityName: 'Orders', FieldName: 'Status' }, { EntityName: 'Orders', FieldName: 'Kind' }];
      expect(await mm.Warn(['__mj'])).toEqual(['Orders.Status', 'Orders.Kind']);
      expect(logs.warnings).toHaveLength(2);
      expect(logs.warnings[0]).toContain("Orders.Status has ValueListType='List' but no values");
      expect(executed.statements).toHaveLength(0); // report only, nothing is corrected
   });

   it('queries List fields without EntityFieldValue rows, scoped to the exclude list', async () => {
      const mm = new TestableValueLists();
      await mm.Warn(['__mj', 'sys']);
      const sql = mm.Queries[0].replace(/\s+/g, ' ');
      expect(sql).toContain(`ef.[ValueListType] = 'List'`);
      expect(sql).toContain(`NOT EXISTS (SELECT 1 FROM [__mj].[EntityFieldValue] v WHERE v.[EntityFieldID] = ef.[ID])`);
      expect(sql).toContain(`e.[SchemaName] NOT IN ('__mj','sys')`);
   });

   it('omits the scope clause for an empty exclude list', async () => {
      const mm = new TestableValueLists();
      await mm.Warn([]);
      expect(mm.Queries[0]).not.toContain('NOT IN');
   });

   it('logs and returns nothing when the query fails', async () => {
      const mm = new TestableValueLists();
      mm.Fail = true;
      expect(await mm.Warn(['__mj'])).toEqual([]);
      expect(logs.errors).toHaveLength(1);
   });
});
