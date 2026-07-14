/**
 * Unit tests for schema-driven IS-A (shared-PK-FK) ParentID detection in manage-metadata.ts.
 *
 * Covers the two new methods:
 *   - buildISADetectionSQL          — the provider-neutral detection query (the real logic)
 *   - detectAndSetISARelationshipsFromSchema — the loop that stamps Entity.ParentID
 *
 * The detection query is exercised against a real SQLServerDialect so the assertions verify the
 * actual composed SQL (joins, the single-column-PK guards, the "FK references parent PK" match,
 * the exclude-schema clause) rather than a mock's shape. The loop is exercised with an injected
 * recordset + a captured LogSQLAndExecute to prove: emit-on-new, idempotent skip when already set,
 * empty-set no-op, and failure propagation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy dependencies that are not needed for these tests (mirrors metadataConfig.test.ts).
vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: {},
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
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
   return { ...actual };
});
vi.mock('../Misc/status_logging', () => ({
   logError: vi.fn(),
   logMessage: vi.fn(),
   logStatus: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('@memberjunction/global', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/global')>();
   return { ...actual };
});
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
// Capturing mock: the loop's UPDATE flows through SQLLogging.LogSQLAndExecute (a static method).
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLLogging } from '../Misc/sql_logging';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import type { CodeGenConnection, CodeGenQueryResult, CodeGenQueryRow } from '../Database/codeGenDatabaseProvider';

// ---------------------------------------------------------------------------
// Test harness — expose the protected methods and inject a fake recordset.
// dialect() is overridden to a real SQLServerDialect so quoting is genuine;
// qsql() is identity to bypass the (unavailable) dbProvider; runQuery() returns
// the injected rows.
// ---------------------------------------------------------------------------
class TestableISA extends ManageMetadataBase {
   private _rows: CodeGenQueryRow[] = [];
   private _throw = false;

   public setRecordset(rows: CodeGenQueryRow[]): void { this._rows = rows; }
   public setThrow(v: boolean): void { this._throw = v; }

   protected get dialect(): SQLDialect { return new SQLServerDialect(); }
   protected qsql(sql: string): string { return sql; }
   protected async runQuery(_pool: CodeGenConnection, _sql: string): Promise<CodeGenQueryResult> {
      if (this._throw) throw new Error('simulated query failure');
      return { recordset: this._rows };
   }

   public testBuildSQL(exclude: string[]): string { return this.buildISADetectionSQL('__mj', exclude); }
   public testDetect(exclude: string[] = []): Promise<{ success: boolean; updatedCount: number }> {
      return this.detectAndSetISARelationshipsFromSchema({} as CodeGenConnection, exclude);
   }
}

const PARENT_ID = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
const CHILD_ID = 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB';
const OTHER_ID = 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC';

const candidateRow = (existingParentID: string | null): CodeGenQueryRow => ({
   ChildEntityID: CHILD_ID,
   ChildEntityName: 'Event Products',
   ParentEntityID: PARENT_ID,
   ParentEntityName: 'Products',
   ExistingParentID: existingParentID,
});

describe('IS-A ParentID detection (manage-metadata)', () => {
   beforeEach(() => {
      vi.mocked(SQLLogging.LogSQLAndExecute).mockClear();
   });

   describe('buildISADetectionSQL', () => {
      it('requires the PK to also be an FK referencing the parent PK, and both PKs single-column', () => {
         const sql = new TestableISA().testBuildSQL([]);
         // child PK is also an FK
         expect(sql).toContain('[IsPrimaryKey] = 1');
         expect(sql).toContain('[RelatedEntityID] IS NOT NULL');
         // FK references the PARENT'S PK column (not just any unique column)
         expect(sql).toContain('[RelatedEntityFieldName] = parentpk.[Name]');
         // single-column PK guard on BOTH sides (two COUNT(*) subqueries = 1)
         expect(sql.match(/COUNT\(\*\)/g)?.length).toBe(2);
         expect(sql.match(/\)\s*=\s*1/g)?.length).toBe(2);
         // ordinary virtual rows excluded
         expect(sql).toContain('[IsVirtual] = 0');
      });

      it('omits the schema-exclusion clause when no schemas are excluded', () => {
         const sql = new TestableISA().testBuildSQL([]);
         expect(sql).not.toContain('NOT IN (');
      });

      it('adds a NOT IN exclusion clause for excluded schemas', () => {
         const sql = new TestableISA().testBuildSQL(['__mj', 'staging']);
         expect(sql).toContain("child.[SchemaName] NOT IN ('__mj','staging')");
      });
   });

   describe('detectAndSetISARelationshipsFromSchema', () => {
      it('stamps ParentID on a detected child that has none', async () => {
         const t = new TestableISA();
         t.setRecordset([candidateRow(null)]);

         const result = await t.testDetect();

         expect(result).toEqual({ success: true, updatedCount: 1 });
         expect(SQLLogging.LogSQLAndExecute).toHaveBeenCalledTimes(1);
         const emittedSQL = vi.mocked(SQLLogging.LogSQLAndExecute).mock.calls[0][1];
         expect(emittedSQL).toContain('UPDATE');
         expect(emittedSQL).toContain(`[ParentID] = '${PARENT_ID}'`);
         expect(emittedSQL).toContain(`[ID] = '${CHILD_ID}'`);
      });

      it('is idempotent — skips a child whose ParentID already points at the detected parent', async () => {
         const t = new TestableISA();
         t.setRecordset([candidateRow(PARENT_ID)]);

         const result = await t.testDetect();

         expect(result).toEqual({ success: true, updatedCount: 0 });
         expect(SQLLogging.LogSQLAndExecute).not.toHaveBeenCalled();
      });

      it('re-points a child whose ParentID currently points elsewhere', async () => {
         const t = new TestableISA();
         t.setRecordset([candidateRow(OTHER_ID)]);

         const result = await t.testDetect();

         expect(result).toEqual({ success: true, updatedCount: 1 });
         expect(SQLLogging.LogSQLAndExecute).toHaveBeenCalledTimes(1);
      });

      it('no-ops on an empty candidate set', async () => {
         const t = new TestableISA();
         t.setRecordset([]);

         const result = await t.testDetect();

         expect(result).toEqual({ success: true, updatedCount: 0 });
         expect(SQLLogging.LogSQLAndExecute).not.toHaveBeenCalled();
      });

      it('reports failure (does not throw) when the detection query errors', async () => {
         const t = new TestableISA();
         t.setThrow(true);

         const result = await t.testDetect();

         expect(result.success).toBe(false);
         expect(SQLLogging.LogSQLAndExecute).not.toHaveBeenCalled();
      });
   });
});
