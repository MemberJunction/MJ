import { describe, it, expect } from 'vitest';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { BuildMetadataSupportObjectsSQL } from '../Database/providers/postgresql/metadataSupportObjects';

/**
 * #4534: a composite foreign key's components become single-column related entities only when
 * their referenced column is unique on its own. Pairing the columns positionally gave every
 * component a RelatedEntityID, and a trailing component whose target is not unique produced a
 * label join that multiplied rows in the base view. #4536: IsUnique means unique on its own, so
 * member columns of a composite unique index are not unique.
 *
 * These tests pin the SQL both providers emit for new fields and the PostgreSQL procedure for
 * existing fields. The SQL Server procedure lives in a migration and is covered by the same text
 * pattern there (see the migration's header).
 */

const sqlServer = new SQLServerCodeGenProvider().getPendingEntityFieldsSQL('__mj');
const postgres = new PostgreSQLCodeGenProvider().getPendingEntityFieldsSQL('__mj');
const pgSupport = BuildMetadataSupportObjectsSQL('__mj');

describe('composite foreign keys need a unique target (#4534)', () => {
  it('SQL Server materialises the component count and whether the target column is unique on its own', () => {
    expect(sqlServer).toMatch(/COUNT\(\*\) OVER \(PARTITION BY fk\.FK_NAME, fk\.\[schema_name\], fk\.\[table\]\) AS ColumnCount/);
    expect(sqlServer).toContain('AS TargetIsUnique');
    expect(sqlServer).toMatch(/WHERE ri\.is_unique = 1 AND ri\.has_filter = 0/);
    expect(sqlServer).toMatch(/k\.is_included_column = 0\) = 1/);
    expect(sqlServer).toContain('INTO #__mj__CodeGen__vwForeignKeys');
  });

  it('SQL Server joins a field to its foreign key only for single-column constraints or unique targets', () => {
    expect(sqlServer).toMatch(
      /ON sf\.FieldName = fk\.\[column\] AND e\.BaseTable = fk\.\[table\] AND e\.SchemaName = fk\.\[schema_name\]\s+AND \(fk\.ColumnCount = 1 OR fk\.TargetIsUnique = 1\)/,
    );
  });

  it('PostgreSQL materialises the same two facts in the foreign-key cache', () => {
    expect(postgres).toMatch(/COUNT\(\*\) OVER \(PARTITION BY fk\."FK_NAME", fk\."schema_name", fk\."table"\) AS column_count/);
    expect(postgres).toMatch(/ri\.indisunique AND ri\.indnkeyatts = 1 AND ri\.indpred IS NULL/);
    expect(postgres).toContain('AS target_is_unique');
  });

  it('PostgreSQL joins a field to its foreign key only for single-column constraints or unique targets', () => {
    expect(postgres).toMatch(
      /fk_cache fk ON sf\."FieldName" = fk\."column" AND e\."BaseTable" = fk\."table" AND e\."SchemaName" = fk\."schema_name"\s+AND \(fk\.column_count = 1 OR fk\.target_is_unique\)/,
    );
  });

  it('the PostgreSQL existing-field procedure applies the same rule', () => {
    expect(pgSupport).toMatch(
      /CREATE TEMP TABLE IF NOT EXISTS _uef_fk AS\s+SELECT fk\.\*,\s+COUNT\(\*\) OVER \(PARTITION BY fk\."FK_NAME", fk\.schema_name, fk\."table"\) AS column_count/,
    );
    expect(pgSupport).toContain('AS target_is_unique');
    expect(pgSupport).toMatch(/LEFT JOIN _uef_fk fk\s+ON ef\."Name"::text = fk\."column"::text[^\n]*\n\s+AND \(fk\.column_count = 1 OR fk\.target_is_unique\)/);
    expect(pgSupport).not.toContain('INSERT INTO _uef_fk SELECT * FROM');
  });
});

describe('IsUnique means unique on its own (#4536)', () => {
  it('PostgreSQL reads single-key-column unfiltered unique indexes for the pending-fields query', () => {
    expect(postgres).toMatch(
      /uk_cache AS \([\s\S]*?FROM pg_index i[\s\S]*?WHERE i\.indisunique AND NOT i\.indisprimary AND i\.indnkeyatts = 1 AND i\.indpred IS NULL/,
    );
    expect(postgres).not.toMatch(/uk_cache AS \(\s+SELECT "TableName", "ColumnName", "SchemaName"\s+FROM [^\n]*vwTableUniqueKeys/);
  });

  it('the PostgreSQL existing-field procedure reads the same single-column unique indexes', () => {
    expect(pgSupport).toMatch(
      /CREATE TEMP TABLE IF NOT EXISTS _uef_uk AS[\s\S]*?WHERE i\.indisunique AND NOT i\.indisprimary AND i\.indnkeyatts = 1 AND i\.indpred IS NULL/,
    );
    expect(pgSupport).not.toContain('INSERT INTO _uef_uk SELECT * FROM');
  });

  it('a composite primary key does not make its members unique, on either engine', () => {
    expect(sqlServer).toMatch(/COUNT\(\*\) OVER \(PARTITION BY SchemaName, TableName\) AS ColumnCount\s+INTO #__mj__CodeGen__vwTablePrimaryKeys/);
    expect(sqlServer).toMatch(/IsUnique = CASE\s+WHEN pk\.ColumnName IS NOT NULL AND pk\.ColumnCount = 1 THEN 1/);
    expect(postgres).toMatch(/COUNT\(\*\) OVER \(PARTITION BY "SchemaName", "TableName"\) AS column_count/);
    expect(postgres).toMatch(/WHEN pk\."ColumnName" IS NOT NULL AND pk\.column_count = 1 THEN TRUE/);
    expect(pgSupport).toContain('((pk."ColumnName" IS NOT NULL AND pk.column_count = 1) OR uk."ColumnName" IS NOT NULL) AS new_is_unique');
    expect(pgSupport).not.toContain('(pk."ColumnName" IS NOT NULL OR uk."ColumnName" IS NOT NULL)');
  });

  it('SQL Server still reads vwTableUniqueKeys, which the migration narrows to single-column indexes', () => {
    expect(sqlServer).toMatch(/INTO #__mj__CodeGen__vwTableUniqueKeys\s+FROM \[__mj\]\.\[vwTableUniqueKeys\]/);
  });
});
