import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ExternalViewParams } from '@memberjunction/external-data-sources';
import type { EntityInfo } from '@memberjunction/core';
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
  public buildCount(target: string, params: ExternalViewParams) {
    return this.buildCountSql(target, params);
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

  describe('ResolveObjectName (schema qualification from EntityInfo)', () => {
    // The SQL-driver override the read router calls: turns an entity into the objectName that
    // qualifyObject then quotes. Reads only ExternalObjectName / BaseTable / Name / SchemaName.
    const entity = (o: { ExternalObjectName?: string; BaseTable?: string; Name?: string; SchemaName?: string }) =>
      ({ ExternalObjectName: o.ExternalObjectName, BaseTable: o.BaseTable, Name: o.Name ?? 'X', SchemaName: o.SchemaName }) as unknown as EntityInfo;

    it('prepends SchemaName to a bare object name in a non-default schema', () => {
      expect(d.ResolveObjectName(entity({ ExternalObjectName: 'sales', SchemaName: 'bronze' }))).toBe('bronze.sales');
    });
    it('leaves an already schema-qualified name untouched (no double-qualify)', () => {
      expect(d.ResolveObjectName(entity({ ExternalObjectName: 'gold.daily_metrics', SchemaName: 'gold' }))).toBe('gold.daily_metrics');
    });
    it('returns the bare name when the entity has no SchemaName', () => {
      expect(d.ResolveObjectName(entity({ ExternalObjectName: 'sales' }))).toBe('sales');
    });
    it('falls back to BaseTable then Name when ExternalObjectName is unset', () => {
      expect(d.ResolveObjectName(entity({ BaseTable: 'things', SchemaName: 'stg' }))).toBe('stg.things');
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

  // Exercises the shared BaseSqlExternalDataSourceDriver.effectiveWhere + buildCountSql (which Postgres /
  // MySQL inherit unchanged) through the concrete SQL Server dialect quoting.
  describe('incrementalSince (structured watermark → effectiveWhere / buildCountSql)', () => {
    const wm = { objectName: 't', incrementalSince: { Field: 'updated_at', Value: '2026-03-01T00:00:00.000Z' } } as ExternalViewParams;
    it('incremental-only → WHERE <quoted> >= <literal>', () => {
      expect(d.sel('[s].[t]', wm)).toBe("SELECT * FROM [s].[t] WHERE [updated_at] >= '2026-03-01T00:00:00.000Z'");
    });
    it('filter + incremental are ANDed', () => {
      expect(d.sel('[s].[t]', { ...wm, filter: "status = 'a'" }))
        .toBe("SELECT * FROM [s].[t] WHERE (status = 'a') AND [updated_at] >= '2026-03-01T00:00:00.000Z'");
    });
    it('a BLANK filter does not drop the incremental bound (empty-string bug)', () => {
      expect(d.sel('[s].[t]', { ...wm, filter: '' }))
        .toBe("SELECT * FROM [s].[t] WHERE [updated_at] >= '2026-03-01T00:00:00.000Z'");
      expect(d.sel('[s].[t]', { ...wm, filter: '   ' }))
        .toBe("SELECT * FROM [s].[t] WHERE [updated_at] >= '2026-03-01T00:00:00.000Z'");
    });
    it('filter-only (no incremental) is unchanged', () => {
      expect(d.sel('[s].[t]', { objectName: 't', filter: "status = 'a'" })).toBe("SELECT * FROM [s].[t] WHERE status = 'a'");
    });
    it('escapes single quotes in the watermark literal', () => {
      expect(d.sel('[s].[t]', { objectName: 't', incrementalSince: { Field: 'c', Value: "a'b" } }))
        .toBe("SELECT * FROM [s].[t] WHERE [c] >= 'a''b'");
    });
    it('COUNT(*) honors filter + incremental so paginated totals stay consistent', () => {
      expect(d.buildCount('[s].[t]', { ...wm, filter: "status = 'a'" }))
        .toBe("SELECT COUNT(*) AS cnt FROM [s].[t] WHERE (status = 'a') AND [updated_at] >= '2026-03-01T00:00:00.000Z'");
    });
    it('COUNT(*) omits WHERE when neither filter nor incremental is present', () => {
      expect(d.buildCount('[s].[t]', { objectName: 't' })).toBe('SELECT COUNT(*) AS cnt FROM [s].[t]');
    });
  });

  // Exercises the shared BaseSqlExternalDataSourceDriver.buildSeekPredicate through the T-SQL dialect,
  // whose ascending sort puts NULL first (the base default).
  describe('seekAfter (structured keyset resume → effectiveWhere)', () => {
    it('single key, no watermark → [k] > v (numbers bare, strings quoted)', () => {
      expect(d.sel('[s].[t]', { objectName: 't', seekAfter: { Keys: [{ Field: 'id', Value: 101 }] } }))
        .toBe('SELECT * FROM [s].[t] WHERE [id] > 101');
      expect(d.sel('[s].[t]', { objectName: 't', seekAfter: { Keys: [{ Field: 'code', Value: "O'Reilly" }] } }))
        .toBe("SELECT * FROM [s].[t] WHERE [code] > 'O''Reilly'");
    });
    it('composite key → (k1 > v1) OR (k1 = v1 AND k2 > v2)', () => {
      expect(d.sel('[s].[t]', { objectName: 't', seekAfter: { Keys: [{ Field: 'tenant_id', Value: 'T1' }, { Field: 'id', Value: 100 }] } }))
        .toBe("SELECT * FROM [s].[t] WHERE (([tenant_id] > 'T1') OR ([tenant_id] = 'T1' AND [id] > 100))");
    });
    it('exact watermark + key → W > w OR (W = w AND k > v)', () => {
      expect(d.sel('[s].[t]', { objectName: 't', seekAfter: { Watermark: { Field: 'modified_at', Value: '2026-10-26T01:00:00.000Z' }, Keys: [{ Field: 'id', Value: 100 }] } }))
        .toBe("SELECT * FROM [s].[t] WHERE [modified_at] > '2026-10-26T01:00:00.000Z' OR ([modified_at] = '2026-10-26T01:00:00.000Z' AND [id] > 100)");
    });
    // A datetime column (1/300 s) rounds the '.124' upper literal back to '.123' (verified on SQL Server:
    // a datetime of .003 satisfies `>= '.004Z'`), so "after the range" also requires W > lower, and "in the
    // range" also admits W = lower.
    it('truncated watermark range with keys → after the range, or in it with a later key (precision-safe)', () => {
      const seek = { Watermark: { Field: 'modified_at', Value: '2026-10-26T01:00:00.123Z', ExclusiveUpper: '2026-10-26T01:00:00.124Z' }, Keys: [{ Field: 'id', Value: 7 }] };
      expect(d.sel('[s].[t]', { objectName: 't', seekAfter: seek }))
        .toBe("SELECT * FROM [s].[t] WHERE ([modified_at] >= '2026-10-26T01:00:00.124Z' AND [modified_at] > '2026-10-26T01:00:00.123Z') OR ([modified_at] >= '2026-10-26T01:00:00.123Z' AND ([modified_at] < '2026-10-26T01:00:00.124Z' OR [modified_at] = '2026-10-26T01:00:00.123Z') AND [id] > 7)");
    });
    it('fully consumed watermark range (no keys) → W >= upper AND W > lower, so a datetime column cannot re-read it', () => {
      const seek = { Watermark: { Field: 'modified_at', Value: '2026-10-26T01:00:00.123Z', ExclusiveUpper: '2026-10-26T01:00:00.124Z' }, Keys: [] };
      expect(d.sel('[s].[t]', { objectName: 't', seekAfter: seek }))
        .toBe("SELECT * FROM [s].[t] WHERE ([modified_at] >= '2026-10-26T01:00:00.124Z' AND [modified_at] > '2026-10-26T01:00:00.123Z')");
    });
    it('within-range seek → only rows inside the range, after the key when one is given', () => {
      const wm = { Field: 'modified_at', Value: '2026-10-26T01:00:00.123Z', ExclusiveUpper: '2026-10-26T01:00:00.124Z', WithinRange: true };
      const inRange = "[modified_at] >= '2026-10-26T01:00:00.123Z' AND ([modified_at] < '2026-10-26T01:00:00.124Z' OR [modified_at] = '2026-10-26T01:00:00.123Z')";
      expect(d.sel('[s].[t]', { objectName: 't', seekAfter: { Watermark: wm, Keys: [] } })).toBe(`SELECT * FROM [s].[t] WHERE ${inRange}`);
      expect(d.sel('[s].[t]', { objectName: 't', seekAfter: { Watermark: wm, Keys: [{ Field: 'id', Value: 7 }] } }))
        .toBe(`SELECT * FROM [s].[t] WHERE ${inRange} AND [id] > 7`);
      expect(() => d.sel('[s].[t]', { objectName: 't', seekAfter: { Watermark: { Field: 'w', Value: 'x', WithinRange: true }, Keys: [] } }))
        .toThrow(/WithinRange requires ExclusiveUpper/);
    });
    it('NULL watermark (NULLS FIRST) → finish the NULL run by key, then every non-NULL row', () => {
      expect(d.sel('[s].[t]', { objectName: 't', seekAfter: { Watermark: { Field: 'modified_at', Value: null }, Keys: [{ Field: 'id', Value: 5 }] } }))
        .toBe('SELECT * FROM [s].[t] WHERE ([modified_at] IS NULL AND [id] > 5) OR [modified_at] IS NOT NULL');
    });
    it('is ANDed with filter and incremental bound, parenthesized', () => {
      const params = { objectName: 't', filter: "status = 'a'", incrementalSince: { Field: 'modified_at', Value: '2026-01-01T00:00:00.000Z' }, seekAfter: { Keys: [{ Field: 'id', Value: 1 }] } } as ExternalViewParams;
      expect(d.sel('[s].[t]', params)).toBe("SELECT * FROM [s].[t] WHERE (status = 'a') AND [modified_at] >= '2026-01-01T00:00:00.000Z' AND ([id] > 1)");
      expect(d.buildCount('[s].[t]', params)).toBe("SELECT COUNT(*) AS cnt FROM [s].[t] WHERE (status = 'a') AND [modified_at] >= '2026-01-01T00:00:00.000Z' AND ([id] > 1)");
    });
    it('refuses a seek that cannot resume instead of silently restarting the walk', () => {
      expect(() => d.sel('[s].[t]', { objectName: 't', seekAfter: { Keys: [] } })).toThrow(/at least one key/);
      expect(() => d.sel('[s].[t]', { objectName: 't', seekAfter: { Watermark: { Field: 'w', Value: null }, Keys: [] } })).toThrow(/at least one key/);
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

  describe('connection identity guard (H1 concurrency race)', () => {
    // Fake mssql pool with the `.close()` surface; records which pool ids were closed.
    const makePool = (id: number, closed: number[]) =>
      Promise.resolve({ id, close: async () => { closed.push(id); } }) as unknown as Promise<unknown>;

    it('does NOT evict a pool a concurrent request already reconnected (deterministic race replay)', async () => {
      const d = new TestableSQLServerDriver();
      const closed: number[] = [];
      const p1 = makePool(1, closed);
      const p2 = makePool(2, closed);
      d.setPool('s', p1);
      const idA = d.peek('s');
      const idB = d.peek('s');
      expect(idA).toBe(p1);
      expect(idB).toBe(p1);
      await d.invalidate('s', idA);       // request A evicts p1 and reconnects p2
      expect(d.poolFor('s')).toBeUndefined();
      d.setPool('s', p2);
      await d.invalidate('s', idB);       // request B's stale eviction must be a no-op
      expect(d.poolFor('s')).toBe(p2);    // fresh p2 survives
      await Promise.resolve();
      expect(closed).toEqual([1]);        // only the genuinely-stale p1 closed
    });

    it('evicts unconditionally when no identity is supplied (explicit ClearCache path)', async () => {
      const d = new TestableSQLServerDriver();
      const closed: number[] = [];
      d.setPool('s', makePool(1, closed));
      await d.invalidate('s');
      expect(d.poolFor('s')).toBeUndefined();
      await Promise.resolve();
      expect(closed).toEqual([1]);
    });

    it('evicts when the supplied identity still matches', async () => {
      const d = new TestableSQLServerDriver();
      const closed: number[] = [];
      const p1 = makePool(1, closed);
      d.setPool('s', p1);
      await d.invalidate('s', p1);
      expect(d.poolFor('s')).toBeUndefined();
    });
  });
});
