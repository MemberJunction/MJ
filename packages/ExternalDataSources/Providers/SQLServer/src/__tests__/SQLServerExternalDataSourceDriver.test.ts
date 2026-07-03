import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ExternalViewParams } from '@memberjunction/external-data-sources';
import { SQLServerExternalDataSourceDriver } from '../SQLServerExternalDataSourceDriver';

// Unit-test the pure SQL-building helpers + FK grouping — no database connection required.
// (Connection caching is exercised by the live integration test, since mssql connects eagerly.)
class TestableSQLServerDriver extends SQLServerExternalDataSourceDriver {
  public sel(target: string, params: ExternalViewParams) {
    return this.buildSelectSql(target, params);
  }
  public qual(ds: MJExternalDataSourceEntity, name: string) {
    return this.qualifyObject(ds, name);
  }
  public mapType(t: string) {
    return this.mapObjectType(t);
  }
  public groupFks(rows: Parameters<TestableSQLServerDriver['groupForeignKeys']>[0]) {
    return this.groupForeignKeys(rows);
  }
  public castProj(fields: readonly string[] | undefined, columns: Parameters<TestableSQLServerDriver['buildCastAwareProjection']>[1]) {
    return this.buildCastAwareProjection(fields, columns);
  }
  public selCast(target: string, params: ExternalViewParams, columns: Parameters<TestableSQLServerDriver['buildSelectSqlCastAware']>[2]) {
    return this.buildSelectSqlCastAware(target, params, columns);
  }
}

const ds = (over: Partial<MJExternalDataSourceEntity>): MJExternalDataSourceEntity =>
  ({ DefaultSchema: 'dbo', ...over } as unknown as MJExternalDataSourceEntity);

describe('SQLServerExternalDataSourceDriver — SQL building', () => {
  const d = new TestableSQLServerDriver();

  describe('qualifyObject', () => {
    it('bracket-quotes + schema-qualifies a bare object name with DefaultSchema', () => {
      expect(d.qual(ds({}), 'orders')).toBe('[dbo].[orders]');
    });
    it('respects an already schema-qualified name', () => {
      expect(d.qual(ds({}), 'sales.events')).toBe('[sales].[events]');
    });
    it('quotes the object only when DefaultSchema is null', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'orders')).toBe('[orders]');
    });
    it('escapes embedded closing brackets in identifiers', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'we]rd')).toBe('[we]]rd]');
    });
  });

  describe('buildSelectSql', () => {
    it('builds SELECT * with no clauses', () => {
      expect(d.sel('[s].[t]', { objectName: 't' })).toBe('SELECT * FROM [s].[t]');
    });
    it('treats an explicitly empty fields array as SELECT *', () => {
      expect(d.sel('[s].[t]', { objectName: 't', fields: [] })).toBe('SELECT * FROM [s].[t]');
    });
    it('uses TOP for a row cap without an offset', () => {
      expect(d.sel('[s].[t]', { objectName: 't', maxRows: 10 })).toBe('SELECT TOP (10) * FROM [s].[t]');
    });
    it('uses OFFSET/FETCH (with the given ORDER BY) when an offset is present', () => {
      const sql = d.sel('[s].[t]', { objectName: 't', maxRows: 10, offset: 20, orderBy: 'id DESC' });
      expect(sql).toBe('SELECT * FROM [s].[t] ORDER BY id DESC OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY');
    });
    it('falls back to a stable ORDER BY when offsetting without an explicit order', () => {
      expect(d.sel('[s].[t]', { objectName: 't', offset: 5 })).toBe('SELECT * FROM [s].[t] ORDER BY (SELECT NULL) OFFSET 5 ROWS');
    });
    it('builds projection + filter + TOP + ORDER BY (no offset)', () => {
      const sql = d.sel('[s].[t]', { objectName: 't', fields: ['id', 'name'], filter: "status = 'a'", orderBy: 'id', maxRows: 10 });
      expect(sql).toBe("SELECT TOP (10) [id], [name] FROM [s].[t] WHERE status = 'a' ORDER BY id");
    });
    it('coerces paging values to numbers (no injection via maxRows/offset)', () => {
      const sql = d.sel('[s].[t]', { objectName: 't', maxRows: Number('5; DROP'), offset: Number('1; DROP') });
      expect(sql).not.toContain('DROP');
    });
  });

  describe('mapObjectType', () => {
    it('maps VIEW -> view and BASE TABLE -> table', () => {
      expect(d.mapType('VIEW')).toBe('view');
      expect(d.mapType('BASE TABLE')).toBe('table');
    });
  });

  describe('groupForeignKeys (composite-key aware)', () => {
    it('groups a single-column FK into one relationship', () => {
      const byTable = d.groupFks([
        { constraint_name: 'FK_orders_customer', table_name: 'orders', column_name: 'customer_id', referenced_table: 'customers', referenced_schema: 'dbo', referenced_column: 'id' },
      ]);
      expect(byTable.get('orders')).toEqual([
        { Name: 'FK_orders_customer', ReferencedObject: 'customers', ReferencedSchema: 'dbo', Columns: [{ Column: 'customer_id', ReferencedColumn: 'id' }] },
      ]);
    });
    it('coalesces a composite FK into one relationship with both column pairings', () => {
      const rels = d.groupFks([
        { constraint_name: 'FK_li_order', table_name: 'line_items', column_name: 'order_id', referenced_table: 'orders', referenced_schema: 'dbo', referenced_column: 'id' },
        { constraint_name: 'FK_li_order', table_name: 'line_items', column_name: 'order_region', referenced_table: 'orders', referenced_schema: 'dbo', referenced_column: 'region' },
      ]).get('line_items')!;
      expect(rels).toHaveLength(1);
      expect(rels[0].Columns).toEqual([
        { Column: 'order_id', ReferencedColumn: 'id' },
        { Column: 'order_region', ReferencedColumn: 'region' },
      ]);
    });
  });

  describe('buildCastAwareProjection (decimal-safe)', () => {
    const cols = [
      { name: 'id', isLossyNumeric: false },
      { name: 'price', isLossyNumeric: true },
      { name: 'name', isLossyNumeric: false },
    ];
    it('returns * when no column is lossy-numeric', () => {
      expect(d.castProj(undefined, [{ name: 'id', isLossyNumeric: false }])).toBe('*');
    });
    it('returns * when column metadata is unavailable (probe failed)', () => {
      expect(d.castProj(undefined, [])).toBe('*');
    });
    it('expands * to an explicit list CASTing only the lossy-numeric columns', () => {
      expect(d.castProj(undefined, cols)).toBe('[id], CAST([price] AS VARCHAR(64)) AS [price], [name]');
    });
    it('casts a requested lossy field and quotes the rest (case-insensitive match)', () => {
      expect(d.castProj(['ID', 'PRICE'], cols)).toBe('[ID], CAST([PRICE] AS VARCHAR(64)) AS [PRICE]');
    });
    it('leaves an unknown requested field simply quoted (no cast)', () => {
      expect(d.castProj(['mystery'], cols)).toBe('[mystery]');
    });
  });

  describe('buildSelectSqlCastAware', () => {
    const cols = [{ name: 'id', isLossyNumeric: false }, { name: 'amt', isLossyNumeric: true }];
    it('embeds the cast-aware projection into the full SELECT with paging', () => {
      const sqlText = d.selCast('[s].[t]', { objectName: 't', maxRows: 5, offset: 10, orderBy: 'id' }, cols);
      expect(sqlText).toBe('SELECT [id], CAST([amt] AS VARCHAR(64)) AS [amt] FROM [s].[t] ORDER BY id OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY');
    });
    it('still screens a malicious filter clause', () => {
      expect(() => d.selCast('[s].[t]', { objectName: 't', filter: 'x); DROP TABLE t; --' }, cols)).toThrow();
    });
  });
});
