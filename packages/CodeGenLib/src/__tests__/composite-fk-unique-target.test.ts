import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { BuildMetadataSupportObjectsSQL } from '../Database/providers/postgresql/metadataSupportObjects';

/**
 * A column of a multi-column foreign key gets a RelatedEntityID only when the column it references
 * is unique on its own (a single-column primary key, or the sole key of an unfiltered unique index).
 * Every other component references a non-unique column, so a label join on it alone multiplies the
 * base view's rows. Four places stamp RelatedEntityID and all four must drop those components:
 *
 *   1. spUpdateExistingEntityFieldsFromSchema (SQL Server migration)
 *   2. SQL Server new-field query
 *   3. PostgreSQL update routine (metadataSupportObjects)
 *   4. PostgreSQL new-field query
 *
 * Each reuses the single-column key snapshots that IsUnique is computed from, so the two rules agree.
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
  const matching = files.filter((f) => definesObject.test(fs.readFileSync(f, 'utf8')));
  matching.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
  const sql = fs.readFileSync(matching[0], 'utf8');
  const start = sql.search(definesObject);
  const end = sql.indexOf('\nGO', start);
  return { file: path.basename(matching[0]), body: sql.slice(start, end) };
}

describe('composite foreign key components need a target that is unique on its own', () => {
  it('1. spUpdateExistingEntityFieldsFromSchema prunes #uef_fk after the key snapshots, before the RelatedEntity join', () => {
    const { body } = newestDefinition(/CREATE\s+OR\s+ALTER\s+PROC(EDURE)?\s+\S*spUpdateExistingEntityFieldsFromSchema\b/i);
    const prune = body.indexOf('DELETE fk\n    FROM #uef_fk fk');
    expect(prune).toBeGreaterThan(body.indexOf('INTO #uef_uk'));
    expect(prune).toBeLessThan(body.indexOf('INSERT INTO @FilteredRows'));
    const statement = body.slice(prune, body.indexOf(';', prune));
    expect(statement).toMatch(/EXISTS \(\s+SELECT 1 FROM #uef_fk sibling\s+WHERE sibling\.FK_NAME = fk\.FK_NAME[\s\S]*?sibling\.\[column\] <> fk\.\[column\]/);
    expect(statement).toMatch(/NOT EXISTS \(\s+SELECT 1 FROM #uef_pk pk[\s\S]*?pk\.KeyColumnCount = 1/);
    expect(statement).toMatch(/NOT EXISTS \(\s+SELECT 1 FROM #uef_uk uk/);
  });

  it('2. the SQL Server new-field query keeps FK_NAME and prunes its foreign-key snapshot the same way', () => {
    const sql = new SQLServerCodeGenProvider().getPendingEntityFieldsSQL('__mj');
    expect(sql).toMatch(/SELECT FK_NAME, \[column\], [^\n]*\nINTO #__mj__CodeGen__vwForeignKeys/);
    const prune = sql.indexOf('DELETE fk\nFROM #__mj__CodeGen__vwForeignKeys fk');
    expect(prune).toBeGreaterThan(sql.indexOf('INTO #__mj__CodeGen__vwTableUniqueKeys'));
    expect(prune).toBeLessThan(sql.indexOf('WITH MaxSequences AS'));
    const statement = sql.slice(prune, sql.indexOf(';', prune));
    expect(statement).toMatch(/sibling\.FK_NAME = fk\.FK_NAME[\s\S]*?sibling\.\[column\] <> fk\.\[column\]/);
    expect(statement).toMatch(/#__mj__CodeGen__vwTablePrimaryKeys pk[\s\S]*?pk\.KeyColumnCount = 1/);
    expect(statement).toContain('#__mj__CodeGen__vwTableUniqueKeys uk');
  });

  it('3. the PostgreSQL update routine prunes _uef_fk after _uef_uk, and _uef_fk keeps the view shape', () => {
    const sql = BuildMetadataSupportObjectsSQL('__mj');
    expect(sql).toContain('INSERT INTO _uef_fk SELECT * FROM __mj."vwForeignKeys";');
    const prune = sql.indexOf('DELETE FROM _uef_fk fk');
    expect(prune).toBeGreaterThan(sql.indexOf('ANALYZE _uef_uk;'));
    const statement = sql.slice(prune, sql.indexOf(';', prune));
    expect(statement).toMatch(/sibling\."FK_NAME" = fk\."FK_NAME"[\s\S]*?sibling\."column" <> fk\."column"/);
    expect(statement).toMatch(/FROM _uef_pk pk[\s\S]*?pk\."KeyColumnCount" = 1/);
    expect(statement).toContain('FROM _uef_uk uk');
    expect(prune).toBeLessThan(sql.indexOf('LEFT JOIN _uef_fk fk'));
  });

  it('4. the PostgreSQL new-field query joins only the usable components', () => {
    const sql = new PostgreSQLCodeGenProvider().getPendingEntityFieldsSQL('__mj');
    expect(sql).toMatch(/COUNT\(\*\) OVER \(PARTITION BY "FK_NAME", "schema_name", "table"\) AS "ComponentCount"/);
    const cache = sql.slice(sql.indexOf('fk_cache AS ('), sql.indexOf('max_sequences AS ('));
    expect(cache).toMatch(/FROM fk_all fk\s+WHERE fk\."ComponentCount" = 1/);
    expect(cache).toMatch(/OR EXISTS \(\s+SELECT 1 FROM pk_cache pk[\s\S]*?pk\."KeyColumnCount" = 1/);
    expect(cache).toMatch(/OR EXISTS \(\s+SELECT 1 FROM uk_cache uk/);
    expect(sql).toMatch(/fk_cache fk ON sf\."FieldName" = fk\."column"/);
  });
});
