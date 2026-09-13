/**
 * VIRTUAL-FIELD DRIFT HEALS ON A NORMAL RUN, not only under forceRegeneration.
 *
 * Pass 2 of `manageEntityFields` is scoped to `newEntityList ∪ modifiedEntityList`, and the only
 * writer of `modifiedEntityList` is the reconciler pass — entities something CHANGED on during THIS
 * run. So an entity whose related-entity name field never got its `EntityField` row drops out of
 * scope permanently: nothing changes on it again, it is never in the list, pass 2 never revisits it,
 * the row is never created. `BaseEntity.InnerLoad` then throws on that column for every record form
 * of that entity — measured at 145 entities on one imported schema — and the only recovery was
 * `forceRegeneration` over the whole database.
 *
 * The probe asks the catalog instead. Its query shape is verified against live PostgreSQL 16: a
 * view-only orphan column is found, and a NEW PHYSICAL orphan column is NOT (that is pass 1's job,
 * and pulling it in here would widen the scoped pass back out to a full scan).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: { excludeSchemas: ['sys', 'staging'], baseViewExcludedFields: [] },
   currentWorkingDirectory: '/tmp',
   getSettingValue: vi.fn(),
   mj_core_schema: () => '__mj',
   dbPlatform: () => 'sqlserver',
   outputDir: '/tmp',
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('../Misc/status_logging', () => ({
   logError: vi.fn(), logMessage: vi.fn(), logStatus: vi.fn(), logWarning: vi.fn(),
   startSpinner: vi.fn(), updateSpinner: vi.fn(), succeedSpinner: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('../Misc/sql_logging', () => ({ SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) } }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';

const FAKE_POOL = {} as unknown as CodeGenConnection;

class TestableProbe extends ManageMetadataBase {
   public lastSQL = '';
   public rows: Record<string, unknown>[] = [];
   public throwOnQuery = false;

   constructor(private readonly _dialect: SQLDialect) { super(); }
   protected get dialect(): SQLDialect { return this._dialect; }
   protected async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
      this.lastSQL = sql;
      if (this.throwOnQuery) throw new Error('vwSQLColumnsAndEntityFields does not exist');
      return { recordset: this.rows } as CodeGenQueryResult;
   }
}

describe('findVirtualFieldDriftEntities — what the probe asks for', () => {
   it('asks for orphan VIEW-ONLY columns only, so new physical columns are not pulled in', async () => {
      const mm = new TestableProbe(new SQLServerDialect());
      await mm.findVirtualFieldDriftEntities(FAKE_POOL, []);
      expect(mm.lastSQL).toContain('[EntityFieldID] IS NULL');
      expect(mm.lastSQL).toContain('[IsVirtual] <> 0');
      expect(mm.lastSQL).toContain('[vwSQLColumnsAndEntityFields]');
   });

   it('compares IsVirtual with <> 0, which is correct for the INTEGER PG view and the bit SS one', async () => {
      const pg = new TestableProbe(new PostgreSQLDialect());
      await pg.findVirtualFieldDriftEntities(FAKE_POOL, []);
      expect(pg.lastSQL).toContain('"IsVirtual" <> 0');
      expect(pg.lastSQL).not.toContain('"IsVirtual" = true');
      expect(pg.lastSQL).not.toContain('"IsVirtual" = 1');
   });

   it('applies the schema exclusion list, and omits the clause when there is none', async () => {
      const mm = new TestableProbe(new SQLServerDialect());
      await mm.findVirtualFieldDriftEntities(FAKE_POOL, ['sys', 'staging']);
      expect(mm.lastSQL).toContain("[SchemaName] NOT IN ('sys','staging')");
      await mm.findVirtualFieldDriftEntities(FAKE_POOL, []);
      expect(mm.lastSQL).not.toContain('NOT IN');
   });

   it('returns trimmed, de-duplicated entity names and drops blanks', async () => {
      const mm = new TestableProbe(new SQLServerDialect());
      mm.rows = [{ Entity: ' Invoices ' }, { Entity: 'Invoices' }, { Entity: 'Orders' }, { Entity: '' }, { Entity: null }];
      expect(await mm.findVirtualFieldDriftEntities(FAKE_POOL, [])).toEqual(['Invoices', 'Orders']);
   });

   it('returns [] instead of throwing when the probe cannot run — a probe must not fail the run', async () => {
      const mm = new TestableProbe(new SQLServerDialect());
      mm.throwOnQuery = true;
      await expect(mm.findVirtualFieldDriftEntities(FAKE_POOL, [])).resolves.toEqual([]);
   });
});
