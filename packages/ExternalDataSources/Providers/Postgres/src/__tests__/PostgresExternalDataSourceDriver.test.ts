import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ExternalQueryParameter, ExternalViewParams } from '@memberjunction/external-data-sources';
import { PostgresExternalDataSourceDriver } from '../PostgresExternalDataSourceDriver';

// Unit-test the pure SQL-building helpers (identifier quoting, qualification,
// SELECT assembly, object-type mapping) — no database connection required.
class TestablePostgresDriver extends PostgresExternalDataSourceDriver {
  public sel(target: string, params: ExternalViewParams) {
    return this.buildSelectSql(target, params);
  }
  public qual(ds: MJExternalDataSourceEntity, name: string) {
    return this.qualifyObject(ds, name);
  }
  public mapType(t: string) {
    return this.mapObjectType(t);
  }
  public groupFks(rows: Parameters<TestablePostgresDriver['groupForeignKeys']>[0]) {
    return this.groupForeignKeys(rows);
  }
  public pkWhere(keys: readonly ExternalQueryParameter[], placeholder: (i: number) => string) {
    return this.buildPrimaryKeyWhere(keys, placeholder);
  }
}

// Stub credential resolution so getConnection runs fully offline (it never connects —
// pg.Pool is lazy and no query is issued — so no real database is touched).
class CachingTestDriver extends PostgresExternalDataSourceDriver {
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

const localSource = (id: string): MJExternalDataSourceEntity =>
  ({ ID: id, Name: `src-${id}`, ConnectionConfig: '{"host":"localhost","port":59999}', DefaultDatabase: 'db' } as unknown as MJExternalDataSourceEntity);

const ds = (over: Partial<MJExternalDataSourceEntity>): MJExternalDataSourceEntity =>
  ({ DefaultSchema: 'sales', ...over } as unknown as MJExternalDataSourceEntity);

describe('PostgresExternalDataSourceDriver — SQL building', () => {
  const d = new TestablePostgresDriver();

  describe('qualifyObject', () => {
    it('quotes + schema-qualifies a bare object name with DefaultSchema', () => {
      expect(d.qual(ds({}), 'orders')).toBe('"sales"."orders"');
    });
    it('respects an already schema-qualified name', () => {
      expect(d.qual(ds({}), 'raw.events')).toBe('"raw"."events"');
    });
    it('quotes the object only when DefaultSchema is null', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'orders')).toBe('"orders"');
    });
    it('escapes embedded double-quotes in identifiers', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'we"ird')).toBe('"we""ird"');
    });
  });

  describe('buildSelectSql', () => {
    it('builds SELECT * with no clauses', () => {
      expect(d.sel('"s"."t"', { objectName: 't' })).toBe('SELECT * FROM "s"."t"');
    });
    it('builds projection + filter + order + LIMIT/OFFSET', () => {
      const sql = d.sel('"s"."t"', { objectName: 't', fields: ['id', 'name'], filter: "status = 'a'", orderBy: 'id DESC', maxRows: 10, offset: 20 });
      expect(sql).toBe('SELECT "id", "name" FROM "s"."t" WHERE status = \'a\' ORDER BY id DESC LIMIT 10 OFFSET 20');
    });
    it('coerces paging values to numbers (no injection via maxRows/offset)', () => {
      const sql = d.sel('"s"."t"', { objectName: 't', maxRows: Number('5; DROP'), offset: Number('1; DROP') });
      expect(sql).not.toContain('DROP');
    });
  });

  describe('buildPrimaryKeyWhere (composite-key aware, quoted, parameter-bound)', () => {
    it('quotes a single PK identifier and binds its value to a placeholder', () => {
      const { clause, values } = d.pkWhere([{ name: 'id', value: 42 }], (i) => `$${i + 1}`);
      expect(clause).toBe('"id" = $1');
      expect(values).toEqual([42]);
    });

    it('quotes a mixed-case PK identifier — the case-sensitivity fix for ORM-created schemas', () => {
      // An unquoted mixed-case identifier would fold to lowercase on PostgreSQL and miss the column.
      const { clause } = d.pkWhere([{ name: 'CustomerId', value: 7 }], (i) => `$${i + 1}`);
      expect(clause).toBe('"CustomerId" = $1');
    });

    it('joins a composite key with AND and binds values in order', () => {
      const { clause, values } = d.pkWhere(
        [{ name: 'OrderId', value: 10 }, { name: 'Region', value: 'EU' }],
        (i) => `$${i + 1}`,
      );
      expect(clause).toBe('"OrderId" = $1 AND "Region" = $2');
      expect(values).toEqual([10, 'EU']);
    });

    it('never interpolates the value into the clause (injection safety)', () => {
      const { clause, values } = d.pkWhere([{ name: 'id', value: "1 OR 1=1" }], (i) => `$${i + 1}`);
      expect(clause).toBe('"id" = $1');
      expect(values).toEqual(["1 OR 1=1"]);
    });
  });

  describe('mapObjectType', () => {
    it('maps VIEW -> view and everything else -> table', () => {
      expect(d.mapType('VIEW')).toBe('view');
      expect(d.mapType('BASE TABLE')).toBe('table');
    });
  });

  describe('groupForeignKeys (composite-key aware)', () => {
    it('groups a single-column FK into one relationship', () => {
      const byTable = d.groupFks([
        { constraint_name: 'fk_orders_customer', table_name: 'orders', column_name: 'customer_id', referenced_table: 'customers', referenced_schema: 'demo', referenced_column: 'id' },
      ]);
      expect(byTable.get('orders')).toEqual([
        { Name: 'fk_orders_customer', ReferencedObject: 'customers', ReferencedSchema: 'demo', Columns: [{ Column: 'customer_id', ReferencedColumn: 'id' }] },
      ]);
    });

    it('coalesces a composite FK into a single relationship with both column pairings', () => {
      const byTable = d.groupFks([
        { constraint_name: 'fk_li_order', table_name: 'line_items', column_name: 'order_id', referenced_table: 'orders', referenced_schema: 'demo', referenced_column: 'id' },
        { constraint_name: 'fk_li_order', table_name: 'line_items', column_name: 'order_region', referenced_table: 'orders', referenced_schema: 'demo', referenced_column: 'region' },
      ]);
      const rels = byTable.get('line_items')!;
      expect(rels).toHaveLength(1);
      expect(rels[0].Columns).toEqual([
        { Column: 'order_id', ReferencedColumn: 'id' },
        { Column: 'order_region', ReferencedColumn: 'region' },
      ]);
    });
  });
});

describe('PostgresExternalDataSourceDriver — connection caching', () => {
  it('keeps one pool per data source, so a single driver holds many connections', async () => {
    const driver = new CachingTestDriver();
    const a1 = await driver.getConn(localSource('A'));
    const b1 = await driver.getConn(localSource('B'));
    const a2 = await driver.getConn(localSource('A'));
    expect(a1).not.toBe(b1); // distinct sources -> distinct pools (independent credentials/host)
    expect(a1).toBe(a2);     // same source -> cached pool reused
    expect(driver.poolCount()).toBe(2);
    await driver.endAll();
  });

  it('memoizes the in-flight creation — concurrent first-requests for one source share ONE pool', async () => {
    // The cold-start race: two requests arriving before the first pool is cached. With the in-flight
    // promise memoized, both share one creation; without it, each builds its own pool and all but the
    // last leak. The fix is observable here as both concurrent calls resolving to the SAME pool.
    const driver = new CachingTestDriver();
    const [a1, a2] = await Promise.all([
      driver.getConn(localSource('A')),
      driver.getConn(localSource('A')),
    ]);
    expect(a1).toBe(a2);               // same pool — not two pools racing
    expect(driver.poolCount()).toBe(1); // exactly one cached, none leaked
    await driver.endAll();
  });

  it('RunNativeQuery screens for read-only BEFORE connecting — a write is rejected offline', async () => {
    // Proves the M1 wiring: the driver invokes the read-only screen at the top of RunNativeQuery,
    // before getConnection. A write is rejected and no pool is ever created (screen throws first).
    const driver = new CachingTestDriver();
    const res = await driver.RunNativeQuery(localSource('A'), 'DELETE FROM orders', undefined);
    expect(res.success).toBe(false);
    expect(res.errorMessage).toMatch(/read-only/i);
    expect(driver.poolCount()).toBe(0); // screen threw before getConnection — nothing connected
  });
});
