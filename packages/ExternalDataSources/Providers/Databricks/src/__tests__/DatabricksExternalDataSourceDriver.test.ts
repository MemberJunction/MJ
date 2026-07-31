import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ExternalViewParams, ExternalQueryParameter } from '@memberjunction/external-data-sources';
import { DatabricksExternalDataSourceDriver } from '../DatabricksExternalDataSourceDriver';

// Databricks can't be run locally (it needs a live SQL warehouse), so we unit-test the pure dialect
// helpers (backtick quoting, qualification, SELECT/paging assembly, read-only screening, auth-error
// recognition, connect-option auth branching) plus the execute path against a fake DBSQLClient injected
// into the connection cache — no SDK, no network.

// Fake @databricks/sql surface — records what was executed and how many handles were closed.
interface ExecCall {
  statement: string;
  namedParameters?: Record<string, unknown>;
  runAsync?: boolean;
}
interface FakeRec {
  calls: ExecCall[];
  sessionsClosed: number;
  opsClosed: number;
  clientClosed: number;
}
type RowsFn = (statement: string) => Array<Record<string, unknown>>;

function makeRec(): FakeRec {
  return { calls: [], sessionsClosed: 0, opsClosed: 0, clientClosed: 0 };
}

function makeFakeClient(rows: RowsFn, rec: FakeRec, opts?: { fetchThrows?: boolean }): unknown {
  return {
    async openSession() {
      return {
        async executeStatement(statement: string, options?: { runAsync?: boolean; namedParameters?: Record<string, unknown> }) {
          rec.calls.push({ statement, namedParameters: options?.namedParameters, runAsync: options?.runAsync });
          const data = rows(statement);
          return {
            async fetchAll() {
              if (opts?.fetchThrows) {
                throw new Error('boom during fetch');
              }
              return data;
            },
            async close() { rec.opsClosed++; },
          };
        },
        async close() { rec.sessionsClosed++; },
      };
    },
    async close() { rec.clientClosed++; },
  };
}

// Expose the protected/private surface (all real shipped code) for direct assertion.
class TestableDatabricksDriver extends DatabricksExternalDataSourceDriver {
  public sel(target: string, params: ExternalViewParams) {
    return this.buildSelectSql(target, params);
  }
  public qual(ds: MJExternalDataSourceEntity, name: string) {
    return this.qualifyObject(ds, name);
  }
  public mapType(t: string) {
    return this.mapObjectType(t);
  }
  public quote(name: string) {
    return this.quoteIdent(name);
  }
  public screen(sql: string) {
    return this.screenReadOnlyNativeQuery(sql);
  }
  public authErr(e: unknown) {
    return this.isAuthError(e);
  }
  public connOpts(
    ds: MJExternalDataSourceEntity,
    config: Parameters<TestableDatabricksDriver['buildConnectOptions']>[1],
    values: Parameters<TestableDatabricksDriver['buildConnectOptions']>[2],
  ) {
    return this.buildConnectOptions(ds, config, values);
  }
  public pkNamed(pks: readonly ExternalQueryParameter[]) {
    return this.buildPrimaryKeyNamed(pks);
  }
  // Connection-cache surface (the H1 identity guard + fake-client injection).
  public peek(id: string) {
    return this.peekConnection(id);
  }
  public invalidate(id: string, expected?: unknown) {
    return this.invalidateConnection(id, expected);
  }
  public seedClient(id: string, client: Promise<unknown>) {
    (this as unknown as { clients: Map<string, unknown> }).clients.set(id, client);
  }
  public clientFor(id: string) {
    return (this as unknown as { clients: Map<string, unknown> }).clients.get(id);
  }
}

const ds = (over: Partial<MJExternalDataSourceEntity>): MJExternalDataSourceEntity =>
  ({ ID: 'ds1', Name: 'DBX', DefaultSchema: 'analytics', ...over } as unknown as MJExternalDataSourceEntity);

describe('DatabricksExternalDataSourceDriver — dialect: quoting & qualification', () => {
  const d = new TestableDatabricksDriver();

  it('quotes identifiers with backticks, doubling embedded backticks', () => {
    expect(d.quote('sales')).toBe('`sales`');
    expect(d.quote('we`ird')).toBe('`we``ird`');
  });

  it('backtick-qualifies a bare object name with DefaultSchema', () => {
    expect(d.qual(ds({}), 'sales')).toBe('`analytics`.`sales`');
  });

  it('respects an already schema-qualified name', () => {
    expect(d.qual(ds({}), 'raw.events')).toBe('`raw`.`events`');
  });

  it('quotes the object only when DefaultSchema is null', () => {
    expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'sales')).toBe('`sales`');
  });
});

describe('DatabricksExternalDataSourceDriver — dialect: SELECT & LIMIT/OFFSET paging', () => {
  const d = new TestableDatabricksDriver();

  it('builds SELECT * with no clauses', () => {
    expect(d.sel('`s`.`t`', { objectName: 't' })).toBe('SELECT * FROM `s`.`t`');
  });

  it('builds projection + filter + order + LIMIT/OFFSET (backtick-quoted fields)', () => {
    const sql = d.sel('`s`.`t`', { objectName: 't', fields: ['id', 'name'], filter: "status = 'a'", orderBy: 'id DESC', maxRows: 10, offset: 20 });
    expect(sql).toBe('SELECT `id`, `name` FROM `s`.`t` WHERE status = \'a\' ORDER BY id DESC LIMIT 10 OFFSET 20');
  });

  it('emits `LIMIT ALL` before OFFSET when only an offset is given (Databricks requires a LIMIT before OFFSET)', () => {
    expect(d.sel('`s`.`t`', { objectName: 't', offset: 20 })).toContain('LIMIT ALL OFFSET 20');
  });

  it('emits a normal LIMIT/OFFSET when both are given', () => {
    expect(d.sel('`s`.`t`', { objectName: 't', maxRows: 10, offset: 20 })).toContain('LIMIT 10 OFFSET 20');
  });

  it('coerces paging values to numbers (no injection via maxRows/offset)', () => {
    const sql = d.sel('`s`.`t`', { objectName: 't', maxRows: Number('5; DROP'), offset: Number('1; DROP') });
    expect(sql).not.toContain('DROP');
  });

  it('honors incrementalSince watermark predicates', () => {
    const sql = d.sel('`s`.`t`', { objectName: 't', incrementalSince: { Field: 'updated_at', Value: '2026-03-01T00:00:00.000Z' } } as ExternalViewParams);
    expect(sql).toContain(`WHERE \`updated_at\` >= '2026-03-01T00:00:00.000Z'`);
  });
});

describe('DatabricksExternalDataSourceDriver — mapObjectType', () => {
  const d = new TestableDatabricksDriver();
  it('maps VIEW -> view and everything else -> table', () => {
    expect(d.mapType('VIEW')).toBe('view');
    expect(d.mapType('view')).toBe('view');
    expect(d.mapType('MANAGED')).toBe('table');
    expect(d.mapType('BASE TABLE')).toBe('table');
  });
});

describe('DatabricksExternalDataSourceDriver — read-only screen (:name normalization)', () => {
  const d = new TestableDatabricksDriver();

  // Databricks is screened with the ANSI grammar, which can't parse `:name` named-parameter markers.
  // Without normalizeForReadOnlyParse a legitimate parameterized read would be refused as unparseable.
  it('allows a parameterized (:name) read-only query', () => {
    expect(() => d.screen('SELECT trip_distance FROM samples.nyctaxi.trips WHERE pickup_zip = :zip')).not.toThrow();
  });
  it('still rejects a write even with a :name marker (normalization must not mask writes)', () => {
    expect(() => d.screen('DELETE FROM trips WHERE pickup_zip = :zip')).toThrow(/read-only|write/i);
  });
  // Regression: the `:name` neutralizer must NOT clobber the second colon of a `::` type cast — a naive
  // /:name/ replace turns `col::int` into `col:1`, which the fail-closed screen then rejects as unparseable.
  it('allows a Databricks `::` type cast in a native read (must not be corrupted by :name normalization)', () => {
    expect(() => d.screen('SELECT trip_distance::int AS d FROM samples.nyctaxi.trips WHERE pickup_zip = :zip')).not.toThrow();
  });
});

describe('DatabricksExternalDataSourceDriver — isAuthError (credential-rotation self-heal)', () => {
  const d = new TestableDatabricksDriver();

  it('recognizes HTTP 401 (authentication) — string and numeric', () => {
    expect(d.authErr({ statusCode: 401 })).toBe(true);
    expect(d.authErr({ status: '401' })).toBe(true);
  });

  it('recognizes Databricks authentication message phrases', () => {
    expect(d.authErr(new Error('Invalid access token'))).toBe(true);
    expect(d.authErr(new Error('token expired'))).toBe(true);
    expect(d.authErr(new Error('invalid_client'))).toBe(true); // OAuth M2M bad clientId/secret
  });

  it('still honors the base auth signals (inherited)', () => {
    expect(d.authErr(new Error('authentication failed'))).toBe(true);
  });

  // Authorization != authentication: a reconnect can't fix insufficient privilege, so classifying
  // these as auth errors would waste a retry AND evict the shared client for other users. Must be false.
  it('does NOT treat 403 / PERMISSION_DENIED (authorization) as an auth error', () => {
    expect(d.authErr({ statusCode: 403 })).toBe(false);
    expect(d.authErr(new Error('PERMISSION_DENIED: user lacks CAN_USE on warehouse'))).toBe(false);
  });

  it('returns false for non-auth errors (must NOT evict+retry a normal query error)', () => {
    expect(d.authErr(new Error("[TABLE_OR_VIEW_NOT_FOUND] The table or view `foo` cannot be found"))).toBe(false);
    expect(d.authErr({ statusCode: 500 })).toBe(false);
  });
});

describe('DatabricksExternalDataSourceDriver — buildConnectOptions (PAT vs OAuth M2M)', () => {
  const d = new TestableDatabricksDriver();
  const config = { serverHostname: 'dbc-abc.cloud.databricks.com', httpPath: '/sql/1.0/warehouses/w1' };

  it('PAT credential -> access-token auth, token, precision preserved', () => {
    const o = d.connOpts(ds({}), config, { token: 'pat-xyz', clientId: '', clientSecret: '' }) as Record<string, unknown>;
    expect(o.authType).toBe('access-token');
    expect(o.token).toBe('pat-xyz');
    expect(o.host).toBe('dbc-abc.cloud.databricks.com');
    expect(o.path).toBe('/sql/1.0/warehouses/w1');
    expect(o.preserveBigNumericPrecision).toBe(true);
  });

  it('OAuth M2M credential -> databricks-oauth auth with clientId/secret (wins over any token)', () => {
    const o = d.connOpts(ds({}), config, { token: '', clientId: 'sp-id', clientSecret: 'sp-secret' }) as Record<string, unknown>;
    expect(o.authType).toBe('databricks-oauth');
    expect(o.oauthClientId).toBe('sp-id');
    expect(o.oauthClientSecret).toBe('sp-secret');
    expect(o.preserveBigNumericPrecision).toBe(true);
    expect(o.token).toBeUndefined();
  });

  it('throws a clear error when no usable credential is present', () => {
    expect(() => d.connOpts(ds({ Name: 'DBX' }), config, { token: '', clientId: '', clientSecret: '' }))
      .toThrow(/requires a Databricks credential/i);
  });
});

describe('DatabricksExternalDataSourceDriver — buildPrimaryKeyNamed', () => {
  const d = new TestableDatabricksDriver();

  it('single key -> `col` = :pk0 with a matching bind map', () => {
    const { clause, named } = d.pkNamed([{ name: 'id', value: 42 }]);
    expect(clause).toBe('`id` = :pk0');
    expect(named).toEqual({ pk0: 42 });
  });

  it('composite key -> ANDed markers with a positional bind map', () => {
    const { clause, named } = d.pkNamed([{ name: 'tenant', value: 't1' }, { name: 'id', value: 7 }]);
    expect(clause).toBe('`tenant` = :pk0 AND `id` = :pk1');
    expect(named).toEqual({ pk0: 't1', pk1: 7 });
  });
});

describe('DatabricksExternalDataSourceDriver — execute path (fake DBSQLClient)', () => {
  it('RunView: builds a backtick SELECT, applies count when maxRows given, closes session+op', async () => {
    const d = new TestableDatabricksDriver();
    const rec = makeRec();
    const rows: RowsFn = (stmt) => (/count\(/i.test(stmt) ? [{ cnt: 42 }] : [{ id: 1 }, { id: 2 }]);
    d.seedClient('ds1', Promise.resolve(makeFakeClient(rows, rec)));

    const res = await d.RunView(ds({}), { objectName: 'sales', maxRows: 2 });
    expect(res.success).toBe(true);
    expect(res.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(res.totalRowCount).toBe(42);
    // A data SELECT + a COUNT(*) statement, each against `analytics`.`sales`.
    expect(rec.calls.some((c) => c.statement.startsWith('SELECT') && c.statement.includes('`analytics`.`sales`'))).toBe(true);
    expect(rec.calls.some((c) => /count\(/i.test(c.statement))).toBe(true);
    expect(rec.sessionsClosed).toBe(2);
    expect(rec.opsClosed).toBe(2);
  });

  it('RunView: omits the COUNT round-trip when maxRows is not given', async () => {
    const d = new TestableDatabricksDriver();
    const rec = makeRec();
    d.seedClient('ds1', Promise.resolve(makeFakeClient(() => [{ id: 1 }], rec)));
    const res = await d.RunView(ds({}), { objectName: 'sales' });
    expect(res.success).toBe(true);
    expect(res.totalRowCount).toBeUndefined();
    expect(rec.calls.length).toBe(1);
  });

  it('LoadSingle: binds the PK via :pk0 named parameters and returns the first row', async () => {
    const d = new TestableDatabricksDriver();
    const rec = makeRec();
    d.seedClient('ds1', Promise.resolve(makeFakeClient(() => [{ id: 99, name: 'x' }], rec)));
    const row = await d.LoadSingle(ds({}), 'sales', [{ name: 'id', value: 99 }]);
    expect(row).toEqual({ id: 99, name: 'x' });
    const call = rec.calls[0];
    expect(call.statement).toContain('WHERE `id` = :pk0');
    expect(call.statement).toContain('LIMIT 1');
    expect(call.namedParameters).toEqual({ pk0: 99 });
  });

  it('RunNativeQuery: passes :name binds through and normalizes bigint to a lossless string', async () => {
    const d = new TestableDatabricksDriver();
    const rec = makeRec();
    // preserveBigNumericPrecision surfaces BIGINT as a JS bigint; the base normalizer stringifies it.
    d.seedClient('ds1', Promise.resolve(makeFakeClient(() => [{ big: 9007199254740993n, n: 5 }], rec)));
    const res = await d.RunNativeQuery(ds({}), 'SELECT big, n FROM t WHERE n = :n', [{ name: 'n', value: 5 }]);
    expect(res.success).toBe(true);
    expect(res.rows).toEqual([{ big: '9007199254740993', n: 5 }]);
    expect(rec.calls[0].namedParameters).toEqual({ n: 5 });
    expect(rec.calls[0].runAsync).toBe(true);
  });

  it('RunNativeQuery: refuses a write before it ever touches the connection', async () => {
    const d = new TestableDatabricksDriver();
    const rec = makeRec();
    d.seedClient('ds1', Promise.resolve(makeFakeClient(() => [], rec)));
    const res = await d.RunNativeQuery(ds({}), 'DELETE FROM t WHERE id = :id', [{ name: 'id', value: 1 }]);
    expect(res.success).toBe(false);
    expect(res.errorMessage).toMatch(/read-only|write/i);
    expect(rec.calls.length).toBe(0); // screened out before execution
  });

  it('execute: closes the operation and session even when fetch throws', async () => {
    const d = new TestableDatabricksDriver();
    const rec = makeRec();
    d.seedClient('ds1', Promise.resolve(makeFakeClient(() => [], rec, { fetchThrows: true })));
    const res = await d.RunView(ds({}), { objectName: 'sales' });
    expect(res.success).toBe(false);
    expect(res.errorMessage).toMatch(/boom during fetch/);
    expect(rec.opsClosed).toBe(1);
    expect(rec.sessionsClosed).toBe(1);
  });

  it('TestConnection: runs SELECT 1 and reports success + latency', async () => {
    const d = new TestableDatabricksDriver();
    const rec = makeRec();
    d.seedClient('ds1', Promise.resolve(makeFakeClient(() => [{ ok: 1 }], rec)));
    const res = await d.TestConnection(ds({}));
    expect(res.success).toBe(true);
    expect(rec.calls[0].statement).toMatch(/SELECT 1/i);
    expect(typeof res.latencyMs).toBe('number');
  });
});

describe('DatabricksExternalDataSourceDriver — connection identity guard (H1 concurrency race)', () => {
  const makeClient = (id: number, closed: number[]) =>
    Promise.resolve({ id, close: async () => { closed.push(id); } }) as unknown as Promise<unknown>;

  it('does NOT evict a client a concurrent request already reconnected (deterministic race replay)', async () => {
    const d = new TestableDatabricksDriver();
    const closed: number[] = [];
    const c1 = makeClient(1, closed);
    const c2 = makeClient(2, closed);
    d.seedClient('s', c1);
    const idA = d.peek('s');
    const idB = d.peek('s');
    expect(idA).toBe(c1);
    expect(idB).toBe(c1);
    await d.invalidate('s', idA);
    expect(d.clientFor('s')).toBeUndefined();
    d.seedClient('s', c2);
    await d.invalidate('s', idB);      // stale eviction must be a no-op
    expect(d.clientFor('s')).toBe(c2);
    await Promise.resolve();
    expect(closed).toEqual([1]);
  });

  it('evicts + closes unconditionally when no identity is supplied', async () => {
    const d = new TestableDatabricksDriver();
    const closed: number[] = [];
    d.seedClient('s', makeClient(1, closed));
    await d.invalidate('s');
    expect(d.clientFor('s')).toBeUndefined();
    await Promise.resolve();
    expect(closed).toEqual([1]);
  });
});
