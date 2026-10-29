import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';

/**
 * #4536: EntityField.IsUnique is computed in five places, and all five must agree that a column is
 * unique only when it ALONE is the key of an unfiltered unique index/constraint, or alone is the
 * primary key. Composite unique keys, composite primary keys, INCLUDE columns and filtered/partial
 * indexes do not make a column unique. Composite keys are recorded in EntityUniqueKey instead.
 *
 *   1. vwTableUniqueKeys (SQL Server migration; PostgreSQL text lives in SQLConverter's CatalogViewRule)
 *   2. spUpdateExistingEntityFieldsFromSchema (SQL Server migration)
 *   3. SQL Server new-field query
 *   4. PostgreSQL update routine (metadataSupportObjects)
 *   5. PostgreSQL new-field query
 */

const repoRoot = path.resolve(__dirname, '../../../../');

/** The definition matched by `definesObject` in the newest versioned migration holding one, up to the next GO. */
function newestDefinition(definesObject: RegExp): { file: string; body: string } {
   const files: string[] = [];
   const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
         const full = path.join(dir, entry.name);
         if (entry.isDirectory()) walk(full);
         else if (/^V\d{12}__.*\.sql$/.test(entry.name)) files.push(full);
      }
   };
   walk(path.join(repoRoot, 'migrations'));
   const matching = files.filter(f => definesObject.test(fs.readFileSync(f, 'utf8')));
   matching.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
   const sql = fs.readFileSync(matching[0], 'utf8');
   const start = sql.search(definesObject);
   const end = sql.indexOf('\nGO', start);
   return { file: path.basename(matching[0]), body: sql.slice(start, end) };
}

describe('IsUnique means "unique on its own" (#4536)', () => {
   it('1. vwTableUniqueKeys lists key columns only, with what the IsUnique consumers filter on', () => {
      const { body } = newestDefinition(/CREATE\s+OR\s+ALTER\s+VIEW\s+\S*vwTableUniqueKeys\b/i);
      expect(body).toMatch(/ic\.is_included_column\s*=\s*0/);
      expect(body).toMatch(/i\.is_disabled\s*=\s*0/);
      for (const column of ['IndexName', 'KeyOrdinal', 'KeyColumnCount', 'IsFiltered', 'FilterDefinition']) {
         expect(body).toContain(`AS ${column}`);
      }
   });

   it('2. spUpdateExistingEntityFieldsFromSchema: single-key-column unfiltered unique indexes and single-column primary keys only', () => {
      const { body } = newestDefinition(/CREATE\s+OR\s+ALTER\s+PROC(EDURE)?\s+\S*spUpdateExistingEntityFieldsFromSchema\b/i);
      expect(body).toMatch(/INTO #uef_uk[\s\S]*?WHERE uk\.KeyColumnCount = 1\s+AND uk\.IsFiltered = 0;/);
      expect(body).toMatch(/COUNT\(\*\) OVER \(PARTITION BY pk\.SchemaName, pk\.TableName\) AS KeyColumnCount\s+INTO #uef_pk/);
      // both IsUnique expressions (the computed value and the change test) require a one-column PK
      const pkUnique = body.match(/WHEN pk\.ColumnName IS NOT NULL AND pk\.KeyColumnCount = 1 THEN 1/g) ?? [];
      expect(pkUnique).toHaveLength(2);
      expect(body).not.toMatch(/WHEN pk\.ColumnName IS NOT NULL THEN 1\s*$/m);
   });

   it('3. SQL Server new-field query', () => {
      const sql = new SQLServerCodeGenProvider().getPendingEntityFieldsSQL('__mj');
      expect(sql).toMatch(/INTO #__mj__CodeGen__vwTableUniqueKeys\s+FROM \[__mj\]\.\[vwTableUniqueKeys\]\s+WHERE KeyColumnCount = 1\s+AND IsFiltered = 0;/);
      expect(sql).toContain('COUNT(*) OVER (PARTITION BY SchemaName, TableName) AS KeyColumnCount');
      expect(sql).toContain('WHEN pk.ColumnName IS NOT NULL AND pk.KeyColumnCount = 1 THEN 1');
      // IsPrimaryKey still marks every column of a composite primary key
      expect(sql).toContain('IsPrimaryKey = CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END');
   });

   it('4. PostgreSQL update routine', () => {
      const sql = new PostgreSQLCodeGenProvider().getMetadataSupportObjectsSQL('__mj') ?? '';
      expect(sql).toMatch(/CREATE TEMP TABLE _uef_uk AS[\s\S]*?WHERE u\."KeyColumnCount" = 1\s+AND NOT u\."IsFiltered";/);
      expect(sql).toContain('COUNT(*) OVER (PARTITION BY p."SchemaName", p."TableName") AS "KeyColumnCount"');
      expect(sql).not.toContain('(pk."ColumnName" IS NOT NULL OR uk."ColumnName" IS NOT NULL)');
      // computed value, material-change test and change reason
      const unique = sql.match(/\(\(pk\."ColumnName" IS NOT NULL AND pk\."KeyColumnCount" = 1\) OR uk\."ColumnName" IS NOT NULL\)/g) ?? [];
      expect(unique).toHaveLength(3);
   });

   it('5. PostgreSQL new-field query', () => {
      const sql = new PostgreSQLCodeGenProvider().getPendingEntityFieldsSQL('__mj');
      expect(sql).toMatch(/uk_cache AS \([\s\S]*?WHERE "KeyColumnCount" = 1\s+AND NOT "IsFiltered"/);
      expect(sql).toContain('COUNT(*) OVER (PARTITION BY "SchemaName", "TableName") AS "KeyColumnCount"');
      expect(sql).toContain('WHEN pk."ColumnName" IS NOT NULL AND pk."KeyColumnCount" = 1 THEN TRUE');
   });
});
