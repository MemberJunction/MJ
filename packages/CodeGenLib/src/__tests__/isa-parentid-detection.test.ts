/**
 * Unit tests for IS-A (Table-Per-Type / shared-PK-FK) handling in manage-metadata.ts.
 *
 * IS-A intent is DECLARED (additionalSchemaInfo config, or an @lookup on Entity.ParentID in a
 * metadata-sync file) — never inferred. CodeGen's two jobs here are covered below:
 *
 *   1. validateISARelationships / buildISAValidationSQL — FORWARD validation of every DECLARED
 *      relationship, channel-agnostic (it reads the end state of Entity.ParentID). Tiered severity:
 *      hard error when the runtime provably cannot work, warning when we simply cannot corroborate.
 *   2. adviseISACandidatesFromSchema / buildISADetectionSQL — ADVISORY only. Reports undeclared
 *      IS-A-shaped schema and MUST NOT mutate metadata (the shape is necessary but not sufficient;
 *      a false positive would silently enable delete-cascade-to-parent).
 *
 * Both queries are exercised against a real SQLServerDialect so the assertions verify actually
 * composed SQL. The loops are exercised with injected recordsets; SQLLogging.LogSQLAndExecute is
 * captured to PROVE no metadata is written on either path.
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
   logWarning: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('@memberjunction/global', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/global')>();
   return { ...actual };
});
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
// Capturing mock: proves neither path emits an UPDATE (both are read-only by design).
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLLogging } from '../Misc/sql_logging';
import { logError, logWarning } from '../Misc/status_logging';
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

   public testBuildDetectionSQL(exclude: string[]): string { return this.buildISADetectionSQL('__mj', exclude); }
   public testBuildValidationSQL(): string { return this.buildISAValidationSQL('__mj'); }
   public testAdvise(exclude: string[] = []): Promise<{ success: boolean; candidateCount: number }> {
      return this.adviseISACandidatesFromSchema({} as CodeGenConnection, exclude);
   }
   public testValidate(): Promise<{ success: boolean; errorCount: number; warningCount: number }> {
      return this.validateISARelationships({} as CodeGenConnection);
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

/** A fully-valid declared IS-A row; each test overrides only the field under test. */
const validationRow = (overrides: Partial<CodeGenQueryRow> = {}): CodeGenQueryRow => ({
   ChildEntityID: CHILD_ID,
   ChildEntityName: 'Event Products',
   ParentID: PARENT_ID,
   ParentEntityName: 'Products',
   ChildPKCount: 1,
   ParentPKCount: 1,
   ChildPKName: 'ID',
   ChildPKType: 'uniqueidentifier',
   ChildPKRelatedEntityID: PARENT_ID,
   ChildPKIsSoftForeignKey: false,
   ChildPKRelatedEntityName: 'Products',
   ParentPKName: 'ID',
   ParentPKType: 'uniqueidentifier',
   ...overrides,
});

describe('IS-A relationships (manage-metadata)', () => {
   beforeEach(() => {
      vi.mocked(SQLLogging.LogSQLAndExecute).mockClear();
      vi.mocked(logError).mockClear();
      vi.mocked(logWarning).mockClear();
   });

   describe('buildISADetectionSQL', () => {
      it('requires the PK to also be an FK referencing the parent PK, and both PKs single-column', () => {
         const sql = new TestableISA().testBuildDetectionSQL([]);
         expect(sql).toContain('[IsPrimaryKey] = 1');
         expect(sql).toContain('[RelatedEntityID] IS NOT NULL');
         // FK references the PARENT'S PK column (not just any unique column)
         expect(sql).toContain('[RelatedEntityFieldName] = parentpk.[Name]');
         // single-column PK guard on BOTH sides (two COUNT(*) subqueries = 1)
         expect(sql.match(/COUNT\(\*\)/g)?.length).toBe(2);
         expect(sql.match(/\)\s*=\s*1/g)?.length).toBe(2);
         expect(sql).toContain('[IsVirtual] = 0');
      });

      // The three guards that suppress the definitively-not-IS-A candidate classes.
      it('excludes soft foreign keys — an LLM/config-inferred FK is not physical evidence', () => {
         expect(new TestableISA().testBuildDetectionSQL([])).toContain('childpk.[IsSoftForeignKey] = 0');
      });

      it('excludes self-referencing PK/FK — an entity is not a subtype of itself', () => {
         expect(new TestableISA().testBuildDetectionSQL([])).toContain('childpk.[EntityID] <> childpk.[RelatedEntityID]');
      });

      it('excludes virtual entities on both sides — a view has no real table to subtype', () => {
         const sql = new TestableISA().testBuildDetectionSQL([]);
         expect(sql).toContain('child.[VirtualEntity] = 0');
         expect(sql).toContain('parent.[VirtualEntity] = 0');
      });

      it('omits the schema-exclusion clause when no schemas are excluded', () => {
         expect(new TestableISA().testBuildDetectionSQL([])).not.toContain('NOT IN (');
      });

      it('adds a NOT IN exclusion clause for excluded schemas', () => {
         const sql = new TestableISA().testBuildDetectionSQL(['__mj', 'staging']);
         expect(sql).toContain("child.[SchemaName] NOT IN ('__mj','staging')");
      });
   });

   describe('adviseISACandidatesFromSchema (advisory — never mutates)', () => {
      it('warns about an undeclared IS-A-shaped pair WITHOUT writing any metadata', async () => {
         const t = new TestableISA();
         t.setRecordset([candidateRow(null)]);

         const result = await t.testAdvise();

         expect(result).toEqual({ success: true, candidateCount: 1 });
         // The whole point: advisory must never stamp ParentID.
         expect(SQLLogging.LogSQLAndExecute).not.toHaveBeenCalled();
         const warnings = vi.mocked(logWarning).mock.calls.map(c => String(c[0])).join('\n');
         expect(warnings).toContain('IS-A CANDIDATE');
         expect(warnings).toContain('Event Products');
         expect(warnings).toContain('Products');
         // must say it may be wrong, and how to declare it
         expect(warnings).toContain('FALSE POSITIVE');
         expect(warnings).toContain('ISARelationships');
         expect(warnings).toContain('@lookup');
      });

      it('stays silent for a pair already declared as that parent', async () => {
         const t = new TestableISA();
         t.setRecordset([candidateRow(PARENT_ID)]);

         const result = await t.testAdvise();

         expect(result).toEqual({ success: true, candidateCount: 0 });
         expect(logWarning).not.toHaveBeenCalled();
      });

      it('still advises when the child is declared against a DIFFERENT parent', async () => {
         const t = new TestableISA();
         t.setRecordset([candidateRow(OTHER_ID)]);

         const result = await t.testAdvise();

         expect(result).toEqual({ success: true, candidateCount: 1 });
         expect(SQLLogging.LogSQLAndExecute).not.toHaveBeenCalled();
      });

      it('no-ops on an empty candidate set', async () => {
         const t = new TestableISA();
         t.setRecordset([]);

         const result = await t.testAdvise();

         expect(result).toEqual({ success: true, candidateCount: 0 });
         expect(logWarning).not.toHaveBeenCalled();
      });

      it('reports failure (does not throw) when the query errors', async () => {
         const t = new TestableISA();
         t.setThrow(true);

         const result = await t.testAdvise();

         expect(result.success).toBe(false);
         expect(SQLLogging.LogSQLAndExecute).not.toHaveBeenCalled();
      });
   });

   describe('buildISAValidationSQL', () => {
      it('selects every DECLARED IS-A child regardless of how it was declared', () => {
         const sql = new TestableISA().testBuildValidationSQL();
         // channel-agnostic: keys off the END STATE of ParentID, not any config source
         expect(sql).toContain('child.[ParentID] IS NOT NULL');
      });

      it('LEFT JOINs the parent so an unresolvable ParentID still returns a row', () => {
         // an INNER JOIN here would silently DROP the unresolvable-parent hard-error case
         const sql = new TestableISA().testBuildValidationSQL().replace(/\s+/g, ' ');
         expect(sql).toContain('LEFT JOIN [__mj].[vwEntities] parent ON parent.[ID] = child.[ParentID]');
         expect(sql).not.toContain('INNER JOIN [__mj].[vwEntities] parent');
      });

      it('carries the PK counts and PK types needed by the severity rules', () => {
         const sql = new TestableISA().testBuildValidationSQL();
         expect(sql).toContain('[ChildPKCount]');
         expect(sql).toContain('[ParentPKCount]');
         expect(sql).toContain('[ChildPKType]');
         expect(sql).toContain('[ParentPKType]');
      });
   });

   describe('validateISARelationships — HARD ERRORS (runtime provably cannot work)', () => {
      it('errors when ParentID does not resolve to any entity', async () => {
         const t = new TestableISA();
         t.setRecordset([validationRow({ ParentEntityName: null })]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: false, errorCount: 1, warningCount: 0 });
         expect(String(vi.mocked(logError).mock.calls[0][0])).toContain('does not resolve');
      });

      it('errors on a composite child primary key', async () => {
         const t = new TestableISA();
         t.setRecordset([validationRow({ ChildPKCount: 2 })]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: false, errorCount: 1, warningCount: 0 });
         expect(String(vi.mocked(logError).mock.calls[0][0])).toContain('composite primary key');
      });

      it('errors on a composite parent primary key', async () => {
         const t = new TestableISA();
         t.setRecordset([validationRow({ ParentPKCount: 2 })]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: false, errorCount: 1, warningCount: 0 });
         expect(String(vi.mocked(logError).mock.calls[0][0])).toContain('composite primary key');
      });

      it('errors when the child PK type differs from the parent PK type', async () => {
         // The parent and child SHARE one PK value, so the value must be legal as BOTH PKs.
         const t = new TestableISA();
         t.setRecordset([validationRow({ ChildPKType: 'int' })]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: false, errorCount: 1, warningCount: 0 });
         const msg = String(vi.mocked(logError).mock.calls[0][0]);
         expect(msg).toContain('type mismatch');
         expect(msg).toContain('int');
         expect(msg).toContain('uniqueidentifier');
      });

      it('does NOT error on a PK type differing only by case/whitespace', async () => {
         const t = new TestableISA();
         t.setRecordset([validationRow({ ChildPKType: ' UniqueIdentifier ' })]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: true, errorCount: 0, warningCount: 0 });
      });

      it('reports ONE verdict per child even when a composite PK fans the join out', async () => {
         // A 2-column PK yields 2 rows from the same LEFT JOIN — the entity must not be double-reported.
         const t = new TestableISA();
         t.setRecordset([
            validationRow({ ChildPKCount: 2, ChildPKName: 'TenantID' }),
            validationRow({ ChildPKCount: 2, ChildPKName: 'ProductID' }),
         ]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: false, errorCount: 1, warningCount: 0 });
         expect(logError).toHaveBeenCalledTimes(1);
      });
   });

   describe('validateISARelationships — WARNINGS (valid, just not corroborated)', () => {
      it('warns (does not fail) when the child PK has no FK to the parent', async () => {
         // The runtime keys off ParentID and never reads this FK metadata, so this WORKS —
         // it just usually means a missing DB constraint. Failing here would block a valid IS-A.
         const t = new TestableISA();
         t.setRecordset([validationRow({ ChildPKRelatedEntityID: null, ChildPKRelatedEntityName: null })]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: true, errorCount: 0, warningCount: 1 });
         expect(logError).not.toHaveBeenCalled();
         expect(String(vi.mocked(logWarning).mock.calls[0][0])).toContain('no foreign key to the parent');
      });

      it('warns when the child PK is an FK to a different entity than the declared parent', async () => {
         const t = new TestableISA();
         t.setRecordset([validationRow({ ChildPKRelatedEntityID: OTHER_ID, ChildPKRelatedEntityName: 'Categories' })]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: true, errorCount: 0, warningCount: 1 });
         expect(String(vi.mocked(logWarning).mock.calls[0][0])).toContain('DIFFERENT entity');
      });

      it('accepts a soft-FK-backed declaration with a note', async () => {
         const t = new TestableISA();
         t.setRecordset([validationRow({ ChildPKIsSoftForeignKey: true })]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: true, errorCount: 0, warningCount: 1 });
         expect(String(vi.mocked(logWarning).mock.calls[0][0])).toContain('SOFT foreign key');
      });
   });

   describe('validateISARelationships — clean + failure paths', () => {
      it('passes silently for a fully-valid declared IS-A', async () => {
         const t = new TestableISA();
         t.setRecordset([validationRow()]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: true, errorCount: 0, warningCount: 0 });
         expect(logError).not.toHaveBeenCalled();
         expect(logWarning).not.toHaveBeenCalled();
      });

      it('passes when nothing declares an IS-A relationship at all', async () => {
         const t = new TestableISA();
         t.setRecordset([]);

         const result = await t.testValidate();

         expect(result).toEqual({ success: true, errorCount: 0, warningCount: 0 });
      });

      it('never mutates metadata — validation is strictly read-only', async () => {
         const t = new TestableISA();
         t.setRecordset([validationRow({ ChildPKCount: 2 }), validationRow({ ChildPKType: 'int' })]);

         await t.testValidate();

         expect(SQLLogging.LogSQLAndExecute).not.toHaveBeenCalled();
      });

      it('reports failure (does not throw) when the validation query errors', async () => {
         const t = new TestableISA();
         t.setThrow(true);

         const result = await t.testValidate();

         expect(result.success).toBe(false);
      });
   });
});
