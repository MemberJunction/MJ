/**
 * Value-list writes (#6134, #6207).
 *   - #6134: a field's EntityFieldValue DELETE/INSERT/UPDATE statements go to the database as ONE
 *     batch that applies all or nothing (a transaction in TRY/CATCH on SQL Server; a multi-statement
 *     query, which is one implicit transaction, on PostgreSQL). The migration log gets the plain
 *     statements.
 *   - #6207: when a value list changes (rows added, removed or re-sequenced), the entity is put on
 *     the modified list, so a schema whose only change is a CHECK value list is re-emitted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const platform = vi.hoisted(() => ({ value: 'sqlserver' }));

vi.mock('../Misc/status_logging', async (importOriginal) => ({
   ...(await importOriginal<typeof import('../Misc/status_logging')>()),
   logError: vi.fn(),
   logStatus: vi.fn(),
   LogWarning: vi.fn(),
}));
vi.mock('../Config/config', async (importOriginal) => {
   const actual = await importOriginal<typeof import('../Config/config')>();
   return { ...actual, DbPlatform: () => platform.value, MjCoreSchema: () => '__mj' };
});
vi.mock('../Misc/advanced_generation', () => ({
   AdvancedGeneration: class {
      featureEnabled(): boolean {
         return false;
      }
   },
}));

import { ExistingEntityFieldValueRow, ManageMetadataBase } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenDatabaseProvider, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { SQLLogging } from '../Misc/sql_logging';
import { ResolveDirtySchemasForEmit } from '../Misc/schema-emit';
import type { UserInfo } from '@memberjunction/core';

type LoggedCall = Parameters<typeof SQLLogging.LogSQLAndExecute>;

class TestableValueListSync extends ManageMetadataBase {
   public Rows: Record<string, CodeGenQueryResult['recordset']> = {};
   constructor(private readonly testProvider: CodeGenDatabaseProvider) {
      super();
   }
   protected get dbProvider(): CodeGenDatabaseProvider {
      return this.testProvider;
   }
   protected async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
      const key = Object.keys(this.Rows).find(k => sql.includes(k));
      return { recordset: key ? this.Rows[key] : [] };
   }
   protected async manageJSONCheckValidators(): Promise<void> {
      // not under test
   }
   public Sync(fieldID: string, values: string[], rows: ExistingEntityFieldValueRow[]): Promise<boolean> {
      return this.syncEntityFieldValues(connection(), fieldID, values, rows, 'Check');
   }
   public CheckPass(): Promise<boolean> {
      return this.manageEntityFieldValuesAndValidatorFunctions(connection(), [], {} as UserInfo, false);
   }
}

function connection(): CodeGenConnection {
   const run = async (): Promise<CodeGenQueryResult> => ({ recordset: [] });
   return {
      Dialect: new SQLServerCodeGenProvider().Dialect,
      query: run,
      queryWithParams: run,
      executeStoredProcedure: async () => ({ recordset: [] }),
      beginTransaction: async () => {
         throw new Error('value-list writes must not open a client-side transaction');
      },
   };
}

const row = (ID: string, Value: string, Sequence: number): ExistingEntityFieldValueRow => ({ ID, EntityFieldID: 'F1', Value, Sequence, Source: 'Check' });

describe('ManageMetadataBase.AtomicBatchSQL', () => {
   it('wraps a SQL Server batch in a transaction that rolls back and re-throws on error', () => {
      const sql = ManageMetadataBase.AtomicBatchSQL('DELETE FROM t WHERE ID=1;\nINSERT INTO t VALUES (2);', 'sqlserver');
      expect(sql).toBe(
         'BEGIN TRY\nBEGIN TRANSACTION;\nDELETE FROM t WHERE ID=1;\nINSERT INTO t VALUES (2);\nCOMMIT TRANSACTION;\nEND TRY\n' +
            'BEGIN CATCH\nIF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;\nTHROW;\nEND CATCH',
      );
   });

   it('leaves a PostgreSQL batch as one multi-statement query (one implicit transaction)', () => {
      const batch = 'DELETE FROM t WHERE "ID"=1;\nINSERT INTO t VALUES (2);';
      expect(ManageMetadataBase.AtomicBatchSQL(batch, 'postgresql')).toBe(batch);
   });
});

describe('syncEntityFieldValues: one atomic batch (#6134)', () => {
   let logged: LoggedCall[];

   beforeEach(() => {
      logged = [];
      platform.value = 'sqlserver';
      vi.spyOn(SQLLogging, 'LogSQLAndExecute').mockImplementation(async (...args: LoggedCall) => {
         logged.push(args);
         return [];
      });
   });

   afterEach(() => {
      vi.restoreAllMocks();
   });

   it('sends the delete, insert and re-sequence for a field as one call, logged plain and executed in a transaction', async () => {
      const mm = new TestableValueListSync(new SQLServerCodeGenProvider());
      const changed = await mm.Sync('F1', ['B', 'C'], [row('V1', 'A', 1), row('V2', 'B', 3)]);

      expect(changed).toBe(true);
      expect(logged).toHaveLength(1);
      const [, loggedSQL, , , , , , executedSQL] = logged[0];
      expect(loggedSQL).toMatch(/^DELETE FROM \[__mj\]\.\[EntityFieldValue\] WHERE ID='V1';\nINSERT INTO/);
      expect(loggedSQL).toContain(`'C', 'C', 'Check'`);
      expect(loggedSQL).toContain(`SET Sequence=1 WHERE ID='V2';`);
      expect(loggedSQL).not.toContain('TRANSACTION');
      expect(executedSQL).toBe(ManageMetadataBase.AtomicBatchSQL(loggedSQL, 'sqlserver'));
   });

   it('executes the plain batch on PostgreSQL', async () => {
      platform.value = 'postgresql';
      const mm = new TestableValueListSync(new SQLServerCodeGenProvider());
      await mm.Sync('F1', ['A'], []);
      expect(logged[0][7]).toBe(logged[0][1]);
   });

   it('reports a failed batch as no change, after one call (nothing partial was sent separately)', async () => {
      vi.mocked(SQLLogging.LogSQLAndExecute).mockRejectedValueOnce(new Error('FK violation'));
      const mm = new TestableValueListSync(new SQLServerCodeGenProvider());
      expect(await mm.Sync('F1', ['B', 'C'], [row('V1', 'A', 1)])).toBe(false);
      expect(SQLLogging.LogSQLAndExecute).toHaveBeenCalledTimes(1);
   });

   it('writes nothing and reports no change when the rows already match', async () => {
      const mm = new TestableValueListSync(new SQLServerCodeGenProvider());
      expect(await mm.Sync('F1', ['A', 'B'], [row('V1', 'A', 1), row('V2', 'B', 2)])).toBe(false);
      expect(logged).toEqual([]);
   });

   it('reports a re-ordered list as a change, since it reorders the generated union', async () => {
      const mm = new TestableValueListSync(new SQLServerCodeGenProvider());
      expect(await mm.Sync('F1', ['B', 'A'], [row('V1', 'A', 1), row('V2', 'B', 2)])).toBe(true);
      expect(logged[0][1]).toBe(`UPDATE [__mj].[EntityFieldValue] SET Sequence=1 WHERE ID='V2';\nUPDATE [__mj].[EntityFieldValue] SET Sequence=2 WHERE ID='V1';`);
   });
});

describe('a changed CHECK value list marks the entity modified (#6207)', () => {
   let savedModified: string[];

   beforeEach(() => {
      platform.value = 'sqlserver';
      savedModified = ManageMetadataBase.ModifiedEntityList;
      ManageMetadataBase.ModifiedEntityList = [];
      vi.spyOn(SQLLogging, 'LogSQLAndExecute').mockImplementation(async () => []);
   });

   afterEach(() => {
      ManageMetadataBase.ModifiedEntityList = savedModified;
      vi.restoreAllMocks();
   });

   function withCheck(values: string[], existing: ExistingEntityFieldValueRow[]): TestableValueListSync {
      const mm = new TestableValueListSync(new SQLServerCodeGenProvider());
      mm.Rows = {
         vwEntityFieldsWithCheckConstraints: [
            {
               EntityFieldID: 'F1',
               EntityName: 'Orders',
               ColumnName: 'Status',
               ConstraintDefinition: `(${values.map(v => `[Status]='${v}'`).join(' OR ')})`,
            },
         ],
         'FROM [__mj].[EntityFieldValue]': existing,
         vwEntityFields: [{ ID: 'F1', EntityID: 'E1', Entity: 'Orders', Name: 'Status', Type: 'nvarchar', IsPrimaryKey: false }],
         'SELECT ValueListType': [{ ValueListType: 'List' }],
      };
      return mm;
   }

   it('a widened list puts the entity on the modified list', async () => {
      expect(await withCheck(['Open', 'Closed', 'Held'], [row('V1', 'Closed', 1), row('V2', 'Open', 2)]).CheckPass()).toBe(true);
      expect(ManageMetadataBase.ModifiedEntityList).toEqual(['Orders']);
   });

   it('an unchanged list does not', async () => {
      expect(await withCheck(['Open', 'Closed'], [row('V1', 'Closed', 1), row('V2', 'Open', 2)]).CheckPass()).toBe(true);
      expect(ManageMetadataBase.ModifiedEntityList).toEqual([]);
   });

   it('a re-sequenced list does', async () => {
      // stored out of the sorted order CodeGen writes, so the pass re-sequences the rows
      await withCheck(['Open', 'Closed'], [row('V1', 'Open', 1), row('V2', 'Closed', 2)]).CheckPass();
      expect(ManageMetadataBase.ModifiedEntityList).toEqual(['Orders']);
   });

   it('makes that schema dirty for a dirty-schema-only emit', async () => {
      await withCheck(['Open', 'Closed', 'Held'], [row('V1', 'Closed', 1), row('V2', 'Open', 2)]).CheckPass();
      const entities = [
         { Name: 'Orders', SchemaName: 'sales' },
         { Name: 'Invoices', SchemaName: 'billing' },
      ];
      expect(ResolveDirtySchemasForEmit(entities, ManageMetadataBase.ModifiedEntityList, false, true)).toEqual(new Set(['sales']));
   });
});
