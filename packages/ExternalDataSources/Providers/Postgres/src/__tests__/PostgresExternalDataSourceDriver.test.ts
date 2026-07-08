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
  // Expose the connection-identity guard surface (real shipped code) for the H1 race test.
  public peek(id: string) {
    return this.peekConnection(id);
  }
  public invalidate(id: string, expected?: unknown) {
    return this.invalidateConnection(id, expected);
  }
  public setPool(id: string, pool: Promise<unknown>) {
    (this as unknown as { pools: Map<string, unknown> }).pools.set(id, pool);
  }
  public poolFor(id: string) {
    return (this as unknown as { pools: Map<string, unknown> }).pools.get(id);
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

    it('quotes defaultOrderByColumns into the ORDER BY when no caller orderBy (mixed-case PK paging fix)', () => {
      const sql = d.sel('"s"."t"', { objectName: 't', defaultOrderByColumns: ['CustomerId'], maxRows: 10, offset: 20 });
      expect(sql).toBe('SELECT * FROM "s"."t" ORDER BY "CustomerId" LIMIT 10 OFFSET 20');
    });

    it('quotes each column of a composite defaultOrderByColumns', () => {
      const sql = d.sel('"s"."t"', { objectName: 't', defaultOrderByColumns: ['OrgID', 'Seq'], offset: 5 });
      expect(sql).toBe('SELECT * FROM "s"."t" ORDER BY "OrgID", "Seq" OFFSET 5');
    });

    it('lets a caller-supplied orderBy win over defaultOrderByColumns', () => {
      const sql = d.sel('"s"."t"', { objectName: 't', orderBy: 'name DESC', defaultOrderByColumns: ['id'], offset: 5 });
      expect(sql).toBe('SELECT * FROM "s"."t" ORDER BY name DESC OFFSET 5');
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

    it('throws on an empty key set rather than building a match-everything WHERE', () => {
      expect(() => d.pkWhere([], (i) => `$${i + 1}`)).toThrow(/at least one primary-key/i);
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

describe('PostgresExternalDataSourceDriver — connection identity guard (H1 concurrency race)', () => {
  // Fake pool with the pg `.end()` surface; records which pool ids were closed.
  const makePool = (id: number, closed: number[]) =>
    Promise.resolve({ id, end: async () => { closed.push(id); } }) as unknown as Promise<unknown>;

  it('does NOT evict a pool a concurrent request already reconnected (deterministic race replay)', async () => {
    const d = new CachingTestDriver();
    const closed: number[] = [];
    const p1 = makePool(1, closed);
    const p2 = makePool(2, closed);
    d.setPool('s', p1);

    // Two concurrent reads both captured p1 as the connection they're operating on (peekConnection).
    const identityA = d.peek('s');
    const identityB = d.peek('s');
    expect(identityA).toBe(p1);
    expect(identityB).toBe(p1);

    // Request A hits an auth error, evicts p1 (its identity still matches) and reconnects p2.
    await d.invalidate('s', identityA);
    expect(d.poolFor('s')).toBeUndefined();
    d.setPool('s', p2);

    // Request B's eviction fires LATE with the now-stale p1 identity — the guard must skip it,
    // leaving the fresh p2 intact (without the guard, p2 would be wrongly closed -> reconnect churn).
    await d.invalidate('s', identityB);
    expect(d.poolFor('s')).toBe(p2);

    await Promise.resolve();
    expect(closed).toEqual([1]); // only the genuinely-stale p1 was closed; p2 survived
  });

  it('evicts unconditionally when no identity is supplied (explicit ClearCache / CloseConnection path)', async () => {
    const d = new CachingTestDriver();
    const closed: number[] = [];
    d.setPool('s', makePool(1, closed));
    await d.invalidate('s'); // no expectedIdentity
    expect(d.poolFor('s')).toBeUndefined();
    await Promise.resolve();
    expect(closed).toEqual([1]);
  });

  it('evicts when the supplied identity still matches the cached pool', async () => {
    const d = new CachingTestDriver();
    const closed: number[] = [];
    const p1 = makePool(1, closed);
    d.setPool('s', p1);
    await d.invalidate('s', p1);
    expect(d.poolFor('s')).toBeUndefined();
    await Promise.resolve();
    expect(closed).toEqual([1]);
  });
});
