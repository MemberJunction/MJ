/**
 * #4737 — entityFieldsSequenceCheck must check each entity on its own, honour the run's schema
 * scope, and compare against the catalog's column list so a view with no rows is still checked.
 *
 * Before: one global success flag stopped column checks on every entity after the first failure,
 * only excludeSchemas was honoured, and the column order came from `SELECT TOP 1 *`, which returns
 * no columns for an empty view.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../Config/config', async (importOriginal) => {
   const actual = await importOriginal<typeof import('../Config/config')>();
   return { ...actual, DbPlatform: () => 'sqlserver', MjCoreSchema: () => '__mj' };
});

import { SystemIntegrityBase } from '../Misc/system_integrity';
import { configInfo } from '../Config/config';
import { CodeGenConnection, CodeGenQueryResult, SetBaseViewExclusionsPermitted, ResetBaseViewExclusionsPermitted } from '../Database/codeGenDatabaseProvider';

type FieldRow = { ID: string; Entity: string; SchemaName: string; BaseView: string; EntityID: string; Name: string; Sequence: number };
type ColumnRow = { TableSchema: string; TableName: string; ColumnName: string; Ordinal: number };

function fields(entity: string, entityID: string, schema: string, view: string, names: string[], sequences?: number[]): FieldRow[] {
   return names.map((n, i) => ({ ID: `${entityID}-${i}`, Entity: entity, SchemaName: schema, BaseView: view, EntityID: entityID, Name: n, Sequence: sequences ? sequences[i] : i + 1 }));
}

function columns(schema: string, view: string, names: string[]): ColumnRow[] {
   return names.map((n, i) => ({ TableSchema: schema, TableName: view, ColumnName: n, Ordinal: i + 1 }));
}

function pool(fieldRows: FieldRow[], columnRows: ColumnRow[], executed: string[] = []): CodeGenConnection {
   const run = async (sql: string): Promise<CodeGenQueryResult> => {
      executed.push(sql);
      if (sql.includes('vwEntityFields')) return { recordset: fieldRows } as unknown as CodeGenQueryResult;
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return { recordset: columnRows } as unknown as CodeGenQueryResult;
      return { recordset: [] } as unknown as CodeGenQueryResult;
   };
   return { query: run } as unknown as CodeGenConnection;
}

describe('CheckEntityFieldSequences (#4737)', () => {
   const saved = {
      excludeSchemas: configInfo.excludeSchemas,
      includeSchemas: configInfo.includeSchemas,
      baseViewExcludedFields: configInfo.baseViewExcludedFields,
   };

   beforeEach(() => {
      configInfo.excludeSchemas = ['sys'];
      configInfo.includeSchemas = undefined;
      configInfo.baseViewExcludedFields = [];
   });

   afterEach(() => {
      configInfo.excludeSchemas = saved.excludeSchemas;
      configInfo.includeSchemas = saved.includeSchemas;
      configInfo.baseViewExcludedFields = saved.baseViewExcludedFields;
      ResetBaseViewExclusionsPermitted();
   });

   it('passes when every entity lines up with its catalog columns', async () => {
      const f = fields('Courses', 'E1', 'App', 'vwCourses', ['ID', 'Name']);
      const result = await SystemIntegrityBase.CheckEntityFieldSequences(pool(f, columns('App', 'vwCourses', ['ID', 'Name'])));

      expect(result).toEqual({ Success: true, Message: '', Name: 'entityFieldsSequenceCheck' });
   });

   it('checks a view with no rows, using the catalog column list', async () => {
      // The catalog still lists the columns; a sample-row read would have returned nothing.
      const f = fields('Courses', 'E1', 'App', 'vwCourses', ['ID', 'Name', 'RootPrerequisiteCourseID']);
      const result = await SystemIntegrityBase.CheckEntityFieldSequences(pool(f, columns('App', 'vwCourses', ['ID', 'Name'])));

      expect(result.Success).toBe(false);
      expect(result.Message).toContain('Entity Courses has a mismatch');
      expect(result.Message).toContain('Expected RootPrerequisiteCourseID but found undefined');
   });

   it('reports every failing entity, not only the first', async () => {
      const f = [
         ...fields('Alpha', 'E1', 'App', 'vwAlpha', ['ID', 'Name'], [1, 1]),
         ...fields('Beta', 'E2', 'App', 'vwBeta', ['ID', 'Code']),
         ...fields('Gamma', 'E3', 'App', 'vwGamma', ['ID', 'Title']),
      ];
      const cols = [...columns('App', 'vwBeta', ['ID', 'Other']), ...columns('App', 'vwGamma', ['ID', 'Title'])];

      const result = await SystemIntegrityBase.CheckEntityFieldSequences(pool(f, cols));

      expect(result.Success).toBe(false);
      expect(result.Message).toContain('Entity Alpha has duplicate');
      expect(result.Message).toContain('Entity Beta has a mismatch');
      expect(result.Message).not.toContain('Gamma');
   });

   it('reports a gap in the sequence', async () => {
      const f = fields('Alpha', 'E1', 'App', 'vwAlpha', ['ID', 'Name'], [1, 3]);
      const result = await SystemIntegrityBase.CheckEntityFieldSequences(pool(f, columns('App', 'vwAlpha', ['ID', 'Name'])));

      expect(result.Message).toContain('Entity Alpha has a missing sequence number. Expected 2, but found 3');
   });

   it('reports a base view the catalog does not have', async () => {
      const f = fields('Alpha', 'E1', 'App', 'vwAlpha', ['ID']);
      const result = await SystemIntegrityBase.CheckEntityFieldSequences(pool(f, []));

      expect(result.Success).toBe(false);
      expect(result.Message).toContain('Entity Alpha has no base view');
   });

   it('skips excluded schemas and, when includeSchemas is set, every schema outside it', async () => {
      configInfo.excludeSchemas = ['Skipped'];
      configInfo.includeSchemas = ['App'];
      const f = [
         ...fields('Alpha', 'E1', 'App', 'vwAlpha', ['ID']),
         ...fields('Beta', 'E2', 'Skipped', 'vwBeta', ['ID'], [5]),
         ...fields('Gamma', 'E3', 'Elsewhere', 'vwGamma', ['ID'], [7]),
      ];
      const executed: string[] = [];

      const result = await SystemIntegrityBase.CheckEntityFieldSequences(pool(f, columns('App', 'vwAlpha', ['ID']), executed));

      expect(result.Success).toBe(true);
      const catalogSQL = executed.find(s => s.includes('INFORMATION_SCHEMA.COLUMNS'))!;
      expect(catalogSQL).toContain("('App')");
   });

   it('matches schema and view names case-insensitively against the catalog', async () => {
      const f = fields('Alpha', 'E1', 'App', 'vwAlpha', ['ID']);
      const result = await SystemIntegrityBase.CheckEntityFieldSequences(pool(f, columns('app', 'VWALPHA', ['ID'])));

      expect(result.Success).toBe(true);
   });

   it('skips configured base-view exclusions in the column comparison when they are permitted', async () => {
      configInfo.baseViewExcludedFields = ['Alpha.Secret'];
      SetBaseViewExclusionsPermitted(true);
      const f = fields('Alpha', 'E1', 'App', 'vwAlpha', ['ID', 'Secret', 'Name']);

      const result = await SystemIntegrityBase.CheckEntityFieldSequences(pool(f, columns('App', 'vwAlpha', ['ID', 'Name'])));

      expect(result.Success).toBe(true);
   });

   it('fails the check when the field query returns nothing', async () => {
      const result = await SystemIntegrityBase.CheckEntityFieldSequences(pool([], []));

      expect(result.Success).toBe(false);
      expect(result.Message).toContain('No entity fields found');
   });
});
