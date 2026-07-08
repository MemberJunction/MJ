import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ExternalViewParams } from '@memberjunction/external-data-sources';
import { SnowflakeExternalDataSourceDriver } from '../SnowflakeExternalDataSourceDriver';

// Snowflake can't be run locally, so we unit-test the pure SQL-building helpers
// (identifier quoting, qualification, SELECT assembly, object-type mapping).
class TestableSnowflakeDriver extends SnowflakeExternalDataSourceDriver {
  public sel(target: string, params: ExternalViewParams) {
    return this.buildSelectSql(target, params);
  }
  public qual(ds: MJExternalDataSourceEntity, name: string) {
    return this.qualifyObject(ds, name);
  }
  public mapType(t: string) {
    return this.mapObjectType(t);
  }
  public screen(sql: string) {
    return this.screenReadOnlyNativeQuery(sql);
  }
  public authErr(e: unknown) {
    return this.isAuthError(e);
  }
  public castProj(fields: readonly string[] | undefined, columns: Parameters<TestableSnowflakeDriver['buildCastAwareProjection']>[1]) {
    return this.buildCastAwareProjection(fields, columns);
  }
  public selCast(target: string, params: ExternalViewParams, columns: Parameters<TestableSnowflakeDriver['buildSelectSqlCastAware']>[2]) {
    return this.buildSelectSqlCastAware(target, params, columns);
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
  ({ DefaultSchema: 'ANALYTICS', ...over } as unknown as MJExternalDataSourceEntity);

describe('SnowflakeExternalDataSourceDriver — SQL building', () => {
  const d = new TestableSnowflakeDriver();

  describe('incrementalSince (ANSI double-quoted; the cast-aware path must honor it)', () => {
    const wm = { objectName: 't', incrementalSince: { Field: 'UPDATED_AT', Value: '2026-03-01T00:00:00.000Z' } } as ExternalViewParams;
    it('buildSelectSql renders the double-quoted watermark predicate', () => {
      expect(d.sel('"S"."T"', wm)).toBe(`SELECT * FROM "S"."T" WHERE "UPDATED_AT" >= '2026-03-01T00:00:00.000Z'`);
    });
    it('buildSelectSqlCastAware ALSO honors incrementalSince (regression: it previously emitted only params.filter → returned the full table on a watermark request)', () => {
      expect(d.selCast('"S"."T"', wm, [])).toContain(`WHERE "UPDATED_AT" >= '2026-03-01T00:00:00.000Z'`);
    });
    it('filter + incremental are ANDed', () => {
      expect(d.sel('"S"."T"', { ...wm, filter: "status = 'a'" }))
        .toBe(`SELECT * FROM "S"."T" WHERE (status = 'a') AND "UPDATED_AT" >= '2026-03-01T00:00:00.000Z'`);
    });
  });

  describe('qualifyObject', () => {
    it('quotes + schema-qualifies a bare object name with DefaultSchema', () => {
      expect(d.qual(ds({}), 'SALES')).toBe('"ANALYTICS"."SALES"');
    });
    it('respects an already schema-qualified name', () => {
      expect(d.qual(ds({}), 'RAW.EVENTS')).toBe('"RAW"."EVENTS"');
    });
    it('quotes the object only when DefaultSchema is null', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'SALES')).toBe('"SALES"');
    });
    it('escapes embedded double-quotes in identifiers', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'we"ird')).toBe('"we""ird"');
    });
  });

  describe('buildSelectSql', () => {
    it('builds SELECT * with no clauses', () => {
      expect(d.sel('"S"."T"', { objectName: 'T' })).toBe('SELECT * FROM "S"."T"');
    });
    it('builds projection + filter + order + LIMIT/OFFSET', () => {
      const sql = d.sel('"S"."T"', { objectName: 'T', fields: ['ID', 'NAME'], filter: "STATUS = 'A'", orderBy: 'ID DESC', maxRows: 10, offset: 20 });
      expect(sql).toBe('SELECT "ID", "NAME" FROM "S"."T" WHERE STATUS = \'A\' ORDER BY ID DESC LIMIT 10 OFFSET 20');
    });
    it('coerces paging values to numbers (no injection via maxRows/offset)', () => {
      const sql = d.sel('"S"."T"', { objectName: 'T', maxRows: Number('5; DROP'), offset: Number('1; DROP') });
      // Number('5; DROP') is NaN -> appears as NaN, never raw text; assert no semicolon leaked
      expect(sql).not.toContain('DROP');
    });
  });

  describe('mapObjectType', () => {
    it('maps VIEW -> view and everything else -> table', () => {
      expect(d.mapType('VIEW')).toBe('view');
      expect(d.mapType('view')).toBe('view');
      expect(d.mapType('BASE TABLE')).toBe('table');
    });
  });
});

describe('SnowflakeExternalDataSourceDriver — read-only screen (dialect normalization)', () => {
  const d = new TestableSnowflakeDriver();

  // Snowflake is screened with the ANSI/PostgreSQL grammar, which can't parse Snowflake's `?` bind
  // placeholders. Without normalization a legitimate parameterized read is refused as unparseable.
  // Snowflake has no integration test in CI, so this unit test is the guard against that regression.
  it('allows a parameterized (?) read-only query', () => {
    expect(() => d.screen('SELECT n_name, COUNT(*) FROM nation n JOIN region r ON n.n_regionkey = r.r_regionkey WHERE r.r_name = ? GROUP BY n_name')).not.toThrow();
  });
  it('still rejects a write even with a placeholder (normalization must not mask writes)', () => {
    expect(() => d.screen('DELETE FROM nation WHERE n_nationkey = ?')).toThrow(/read-only|write/i);
  });
});

describe('SnowflakeExternalDataSourceDriver — offset-only paging', () => {
  const d = new TestableSnowflakeDriver();

  it('emits LIMIT before OFFSET (Snowflake requires it) when only an offset is given', () => {
    const sql = d.sel('"s"."t"', { objectName: 't', offset: 20 });
    expect(sql).toContain('LIMIT NULL OFFSET 20');
  });

  it('emits a normal LIMIT/OFFSET when both are given', () => {
    const sql = d.sel('"s"."t"', { objectName: 't', maxRows: 10, offset: 20 });
    expect(sql).toContain('LIMIT 10 OFFSET 20');
  });
});

describe('SnowflakeExternalDataSourceDriver — isAuthError (credential-rotation self-heal)', () => {
  const d = new TestableSnowflakeDriver();

  it('recognizes Snowflake auth error codes (string and numeric)', () => {
    expect(d.authErr({ code: '390100' })).toBe(true);
    expect(d.authErr({ code: 390144 })).toBe(true);
  });

  it('recognizes Snowflake auth message phrases', () => {
    expect(d.authErr(new Error('Incorrect username or password was specified.'))).toBe(true);
    expect(d.authErr(new Error('JWT token is invalid'))).toBe(true);
    expect(d.authErr(new Error('programmatic access token has expired'))).toBe(true);
  });

  it('still honors the base auth signals (inherited)', () => {
    expect(d.authErr(new Error('authentication failed'))).toBe(true);
  });

  it('returns false for non-auth errors (must NOT evict+retry a normal query error)', () => {
    expect(d.authErr(new Error("SQL compilation error: Object 'FOO' does not exist"))).toBe(false);
    expect(d.authErr({ code: '000904' })).toBe(false);
  });
});

describe('SnowflakeExternalDataSourceDriver — cast-aware projection', () => {
  const d = new TestableSnowflakeDriver();

  describe('buildCastAwareProjection (precision-safe NUMBER, native FLOAT)', () => {
    const cols = [
      { name: 'ID', needsStringCast: true },     // NUMBER(38,0) — big int
      { name: 'DBL', needsStringCast: false },   // FLOAT — stays a native number
      { name: 'TXT', needsStringCast: false },
    ];
    it('returns * when nothing needs casting', () => {
      expect(d.castProj(undefined, [{ name: 'DBL', needsStringCast: false }])).toBe('*');
    });
    it('returns * when metadata is unavailable', () => {
      expect(d.castProj(undefined, [])).toBe('*');
    });
    it('expands * casting only the high-precision NUMBER columns (FLOAT left native)', () => {
      expect(d.castProj(undefined, cols)).toBe('CAST("ID" AS VARCHAR) AS "ID", "DBL", "TXT"');
    });
    it('casts a requested high-precision field, quotes the rest (case-insensitive)', () => {
      expect(d.castProj(['id', 'dbl'], cols)).toBe('CAST("id" AS VARCHAR) AS "id", "dbl"');
    });
  });

  describe('buildSelectSqlCastAware', () => {
    const cols = [{ name: 'ID', needsStringCast: true }, { name: 'TXT', needsStringCast: false }];
    it('embeds the cast-aware projection with LIMIT/OFFSET paging', () => {
      const sqlText = d.selCast('"S"."T"', { objectName: 'T', maxRows: 5, offset: 10, orderBy: '"ID"' }, cols);
      expect(sqlText).toBe('SELECT CAST("ID" AS VARCHAR) AS "ID", "TXT" FROM "S"."T" ORDER BY "ID" LIMIT 5 OFFSET 10');
    });
  });
});

describe('SnowflakeExternalDataSourceDriver — connection identity guard (H1 concurrency race)', () => {
  // Fake generic-pool with the drain()+clear() surface; clear() records the closed id.
  const makePool = (id: number, closed: number[]) =>
    Promise.resolve({ id, drain: async () => {}, clear: async () => { closed.push(id); } }) as unknown as Promise<unknown>;

  it('does NOT evict a pool a concurrent request already reconnected (deterministic race replay)', async () => {
    const d = new TestableSnowflakeDriver();
    const closed: number[] = [];
    const p1 = makePool(1, closed);
    const p2 = makePool(2, closed);
    d.setPool('s', p1);
    const idA = d.peek('s');
    const idB = d.peek('s');
    expect(idA).toBe(p1);
    expect(idB).toBe(p1);
    await d.invalidate('s', idA);
    expect(d.poolFor('s')).toBeUndefined();
    d.setPool('s', p2);
    await d.invalidate('s', idB);      // stale eviction must be a no-op
    expect(d.poolFor('s')).toBe(p2);
    await Promise.resolve();
    expect(closed).toEqual([1]);
  });

  it('evicts unconditionally when no identity is supplied', async () => {
    const d = new TestableSnowflakeDriver();
    const closed: number[] = [];
    d.setPool('s', makePool(1, closed));
    await d.invalidate('s');
    expect(d.poolFor('s')).toBeUndefined();
    await Promise.resolve();
    expect(closed).toEqual([1]);
  });
});
