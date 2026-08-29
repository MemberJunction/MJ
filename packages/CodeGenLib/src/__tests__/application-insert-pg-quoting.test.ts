/**
 * Unit test for the PostgreSQL correctness of the schema-Application INSERT.
 *
 * `createNewApplication` is the only writer of an Application row for a newly registered schema,
 * and its statement is wrapped by `conditionalInsert`. On PostgreSQL that wrapper produces a
 * `DO $$ ... $$` block, and the identifier auto-quoter that every statement passes through on its
 * way to the database (`quoteSQLForExecution`, here exercised through the real
 * `AutoQuotePostgreSQLIdentifiers`) skips dollar-quoted blocks wholesale — it cannot know whether
 * their contents are SQL or literal text. So this is the one build path where the usual
 * "write identifiers bare, the quoter handles it" convention silently does not apply.
 *
 * With a bare column list, `ID` reached PostgreSQL folded to `id` and the INSERT failed on every
 * run with `column "id" of relation "Application" does not exist`. The failure was invisible:
 * `createNewApplication` catches, logs, and returns null, and the caller logs and carries on, so
 * CodeGen completed successfully while the schema silently got no Application — every one of its
 * entities landing in the UI's fallback bucket with no way to recover.
 *
 * SQL Server resolves the unquoted identifiers case-insensitively, which is why this survived.
 * The test therefore asserts the property on BOTH dialects: what reaches the database is quoted.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: { newSchemaDefaults: { ApplicationRoleDefaults: { AutoAddRolesForNewApplications: false, Roles: [] } } },
   currentWorkingDirectory: '/tmp',
   getSettingValue: vi.fn(),
   mj_core_schema: () => '__mj',
   dbPlatform: () => 'postgresql',
   outputDir: '/tmp',
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('../Misc/status_logging', () => ({
   logError: vi.fn(),
   logMessage: vi.fn(),
   logStatus: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase } from '../Database/manage-metadata';
import {
   AutoQuotePostgreSQLIdentifiers,
   PostgreSQLDialect,
   SQLServerDialect,
} from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import type { UserInfo } from '@memberjunction/core';

/** The columns the Application INSERT names. All are mixed-case in __mj.Application. */
const APPLICATION_COLUMNS = [
   'ID',
   'Name',
   'Description',
   'SchemaAutoAddNewEntities',
   'Path',
   'AutoUpdatePath',
   'DefaultForNewUser',
];

/**
 * Exercises the real `createNewApplication`, capturing the statement it hands to
 * `LogSQLAndExecute` — i.e. exactly what the database is asked to run.
 */
class TestableCreateApp extends ManageMetadataBase {
   public captured: string[] = [];

   constructor(private readonly _dialect: SQLDialect, private readonly _isPG: boolean) { super(); }

   protected get dialect(): SQLDialect { return this._dialect; }

   protected conditionalInsert(checkQuery: string, insertSQL: string): string {
      // The two real provider implementations, inlined so the test needs no provider wiring.
      return this._isPG
         ? `DO $$ BEGIN\n   IF NOT EXISTS (${checkQuery}) THEN\n      ${insertSQL};\n   END IF;\nEND $$`
         : `IF NOT EXISTS (\n      ${checkQuery}\n   )\n   BEGIN\n      ${insertSQL}\n   END`;
   }

   protected async LogSQLAndExecute(_pool: unknown, query: string): Promise<void> {
      this.captured.push(query);
   }

   protected async addDefaultRolesForApplication(): Promise<void> { /* out of scope */ }

   public run(): Promise<string | null> {
      return this.createNewApplication(
         null as never,
         '11111111-1111-1111-1111-111111111111',
         'pheedloop',
         'pheedloop',
         {} as UserInfo
      );
   }
}

describe('createNewApplication — the statement that reaches the database', () => {
   it('names every Application column quoted, so PostgreSQL does not fold it to lower case', async () => {
      const pg = new TestableCreateApp(new PostgreSQLDialect(), true);
      await pg.run();

      expect(pg.captured).toHaveLength(1);
      // What actually reaches PG: the emitted statement after the auto-quoter has run over it.
      const executed = AutoQuotePostgreSQLIdentifiers(pg.captured[0]);

      for (const column of APPLICATION_COLUMNS) {
         expect(executed).toContain(`"${column}"`);
      }
      // No bare occurrence survives anywhere in the column list.
      expect(executed).not.toMatch(/\(\s*ID\s*,/);
   });

   it('is not rescued by the auto-quoter, because the quoter skips the DO $$ block', async () => {
      const pg = new TestableCreateApp(new PostgreSQLDialect(), true);
      await pg.run();

      // This is the trap the fix exists for: the quoter is a no-op on this statement, so the
      // statement must already be correct when it is built. If this ever stops holding, the
      // pre-quoting contract on conditionalInsertSQL can be relaxed — until then it cannot.
      expect(AutoQuotePostgreSQLIdentifiers(pg.captured[0])).toEqual(pg.captured[0]);
   });

   it('emits the same quoted column list on SQL Server', async () => {
      const ss = new TestableCreateApp(new SQLServerDialect(), false);
      await ss.run();

      expect(ss.captured).toHaveLength(1);
      for (const column of APPLICATION_COLUMNS) {
         expect(ss.captured[0]).toContain(`[${column}]`);
      }
   });
});
