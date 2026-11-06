import { describe, it, expect, vi, afterEach } from 'vitest';
import { PostgreSQLDriver } from '../drivers/PostgreSQLDriver.js';
import { AutoDocQueryResult } from '../types/driver.js';

/**
 * PostgreSQLDriver read foreign keys by joining information_schema.key_column_usage to
 * constraint_column_usage on the constraint name. Neither view says which source column pairs with
 * which referenced column, so a 3-column composite FK came back as 9 pairs (#4531). Joining
 * constraint_column_usage on the source schema also dropped every cross-schema FK. The driver now
 * reads pg_constraint and pairs conkey[i] with confkey[i], skipping the internal per-partition clones
 * of a foreign key into a partitioned table.
 */

type Row = Record<string, string | number | boolean | null>;

function driverWithForeignKeys(fkRows: Row[]): { driver: PostgreSQLDriver; queries: string[] } {
  const driver = new PostgreSQLDriver({ provider: 'postgresql', host: 'localhost', database: 'unused', user: 'u', password: 'p' });
  const queries: string[] = [];
  vi.spyOn(driver, 'executeQuery').mockImplementation(async (query: string): Promise<AutoDocQueryResult<Row>> => {
    queries.push(query);
    if (query.includes('pg_constraint')) return { success: true, data: fkRows };
    if (query.includes('row_count')) return { success: true, data: [{ schema_name: 'app', table_name: 'line', row_count: 300 }] };
    return { success: true, data: [] };
  });
  return { driver, queries };
}

afterEach(() => vi.restoreAllMocks());

describe('PostgreSQLDriver foreign keys', () => {
  it('pairs composite FK columns by position instead of cross-joining them', async () => {
    const { driver, queries } = driverWithForeignKeys([
      { column_name: 'a_key', referenced_schema: 'app', referenced_table: 'price', referenced_column: 'prc_key', constraint_name: 'fk_line_price' },
      { column_name: 'a_prd_key', referenced_schema: 'app', referenced_table: 'price', referenced_column: 'prc_prd_key', constraint_name: 'fk_line_price' },
      { column_name: 'a_ptp_key', referenced_schema: 'app', referenced_table: 'price', referenced_column: 'prc_prd_ptp_key', constraint_name: 'fk_line_price' },
    ]);

    const schemas = await driver.getSchemas({}, {});
    const fks = schemas[0].tables[0].foreignKeys;

    expect(fks.map(fk => `${fk.columnName}->${fk.referencedColumn}`)).toEqual([
      'a_key->prc_key',
      'a_prd_key->prc_prd_key',
      'a_ptp_key->prc_prd_ptp_key',
    ]);
    expect(fks.every(fk => fk.constraintName === 'fk_line_price')).toBe(true);

    const fkQuery = queries.find(q => q.includes('pg_constraint'))!;
    expect(fkQuery).toContain('UNNEST(con.conkey, con.confkey) WITH ORDINALITY');
    expect(fkQuery).not.toContain('constraint_column_usage');
  });

  it('skips the per-partition clones of a foreign key into a partitioned table', async () => {
    const { driver, queries } = driverWithForeignKeys([]);
    await driver.getSchemas({}, {});

    expect(queries.find(q => q.includes('pg_constraint'))).toContain('(con.conparentid = 0 OR NOT rc.relispartition)');
  });

  it('keeps the referenced schema of a cross-schema FK', async () => {
    const { driver } = driverWithForeignKeys([
      { column_name: 'parent_id', referenced_schema: 'crm', referenced_table: 'parent', referenced_column: 'id', constraint_name: 'fk_parent' },
    ]);

    const schemas = await driver.getSchemas({}, {});
    expect(schemas[0].tables[0].foreignKeys[0]).toMatchObject({ referencedSchema: 'crm', referencedTable: 'parent', referencedColumn: 'id' });
  });
});
