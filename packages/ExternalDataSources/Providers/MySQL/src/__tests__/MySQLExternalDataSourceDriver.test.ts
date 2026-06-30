import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ExternalViewParams } from '@memberjunction/external-data-sources';
import { MySQLExternalDataSourceDriver } from '../MySQLExternalDataSourceDriver';

// Unit-test the pure SQL-building helpers + FK grouping — no database connection required.
class TestableMySQLDriver extends MySQLExternalDataSourceDriver {
  public sel(target: string, params: ExternalViewParams) {
    return this.buildSelectSql(target, params);
  }
  public qual(ds: MJExternalDataSourceEntity, name: string) {
    return this.qualifyObject(ds, name);
  }
  public mapType(t: string) {
    return this.mapObjectType(t);
  }
  public groupFks(rows: Parameters<TestableMySQLDriver['groupForeignKeys']>[0]) {
    return this.groupForeignKeys(rows);
  }
}

// Stub credential resolution so getConnection runs fully offline (mysql2 createPool is lazy —
// it never connects until a query is issued, so no real database is touched).
class CachingTestDriver extends MySQLExternalDataSourceDriver {
  protected async resolveCredential(): Promise<{ values: { username: string; password: string } }> {
    return { values: { username: 'u', password: 'p' } };
  }
  public getConn(d: MJExternalDataSourceEntity) {
    return this.getConnection(d);
  }
  public poolCount() {
    return (this as unknown as { pools: Map<string, unknown> }).pools.size;
  }
  public async endAll() {
    for (const p of (this as unknown as { pools: Map<string, Promise<{ end: () => Promise<void> }>> }).pools.values()) {
      await (await p).end().catch(() => {});
    }
  }
}

const ds = (over: Partial<MJExternalDataSourceEntity>): MJExternalDataSourceEntity =>
  ({ DefaultSchema: 'shop', ...over } as unknown as MJExternalDataSourceEntity);

const localSource = (id: string): MJExternalDataSourceEntity =>
  ({ ID: id, Name: `src-${id}`, ConnectionConfig: '{"host":"localhost","port":59999}', DefaultDatabase: 'db' } as unknown as MJExternalDataSourceEntity);

describe('MySQLExternalDataSourceDriver — SQL building', () => {
  const d = new TestableMySQLDriver();

  describe('qualifyObject', () => {
    it('backtick-quotes + schema-qualifies a bare object name with DefaultSchema', () => {
      expect(d.qual(ds({}), 'orders')).toBe('`shop`.`orders`');
    });
    it('respects an already schema-qualified name', () => {
      expect(d.qual(ds({}), 'sales.events')).toBe('`sales`.`events`');
    });
    it('quotes the object only when DefaultSchema is null', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'orders')).toBe('`orders`');
    });
    it('escapes embedded backticks in identifiers', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'we`rd')).toBe('`we``rd`');
    });
  });

  describe('buildSelectSql', () => {
    it('builds SELECT * with no clauses', () => {
      expect(d.sel('`s`.`t`', { objectName: 't' })).toBe('SELECT * FROM `s`.`t`');
    });
    it('builds projection + filter + order + LIMIT/OFFSET', () => {
      const sql = d.sel('`s`.`t`', { objectName: 't', fields: ['id', 'name'], filter: "status = 'a'", orderBy: 'id DESC', maxRows: 10, offset: 20 });
      expect(sql).toBe("SELECT `id`, `name` FROM `s`.`t` WHERE status = 'a' ORDER BY id DESC LIMIT 10 OFFSET 20");
    });
    it('supplies a max-rows ceiling when only an offset is given (MySQL requires LIMIT before OFFSET)', () => {
      expect(d.sel('`s`.`t`', { objectName: 't', offset: 5 })).toBe('SELECT * FROM `s`.`t` LIMIT 18446744073709551615 OFFSET 5');
    });
    it('coerces paging values to numbers (no injection via maxRows/offset)', () => {
      const sql = d.sel('`s`.`t`', { objectName: 't', maxRows: Number('5; DROP'), offset: Number('1; DROP') });
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
        { constraint_name: 'fk_orders_customer', table_name: 'orders', column_name: 'customer_id', referenced_table: 'customers', referenced_schema: 'shop', referenced_column: 'id' },
      ]);
      expect(byTable.get('orders')).toEqual([
        { Name: 'fk_orders_customer', ReferencedObject: 'customers', ReferencedSchema: 'shop', Columns: [{ Column: 'customer_id', ReferencedColumn: 'id' }] },
      ]);
    });
    it('coalesces a composite FK into one relationship with both column pairings', () => {
      const rels = d.groupFks([
        { constraint_name: 'fk_li_order', table_name: 'line_items', column_name: 'order_id', referenced_table: 'orders', referenced_schema: 'shop', referenced_column: 'id' },
        { constraint_name: 'fk_li_order', table_name: 'line_items', column_name: 'order_region', referenced_table: 'orders', referenced_schema: 'shop', referenced_column: 'region' },
      ]).get('line_items')!;
      expect(rels).toHaveLength(1);
      expect(rels[0].Columns).toEqual([
        { Column: 'order_id', ReferencedColumn: 'id' },
        { Column: 'order_region', ReferencedColumn: 'region' },
      ]);
    });
  });
});

describe('MySQLExternalDataSourceDriver — connection caching', () => {
  it('keeps one pool per data source, so a single driver holds many connections', async () => {
    const driver = new CachingTestDriver();
    const a1 = await driver.getConn(localSource('A'));
    const b1 = await driver.getConn(localSource('B'));
    const a2 = await driver.getConn(localSource('A'));
    expect(a1).not.toBe(b1); // distinct sources -> distinct pools
    expect(a1).toBe(a2);     // same source -> cached pool reused
    expect(driver.poolCount()).toBe(2);
    await driver.endAll();
  });
});
