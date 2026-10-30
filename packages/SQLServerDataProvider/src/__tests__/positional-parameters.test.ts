/**
 * How `ExecuteSQL` binds parameters on SQL Server, and why MJ's own parameterized SQL passes them by name.
 *
 * The legacy array form (`ExecuteSQL(sql, [a, b])`) binds `@p0..@pN` and rewrites every `?` in the
 * statement text into the next `@pN`: inside string literals, quoted identifiers and comments too.
 * That form stays for callers outside MJ. MJ's materialized reads pass their values as named
 * parameter objects instead, so the statement text reaches the server unchanged.
 *
 * Only the mssql module is mocked; the provider's binding is real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import { GenericDatabaseProvider, NamedQueryParameter, TypedQueryParameter } from '@memberjunction/generic-database-provider';
import { GetDialect } from '@memberjunction/sql-dialect';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';

/** Structural view of the provider's private surface the harness needs to seed. */
interface ProviderPrivateSurface {
  _pool: MockConnectionPool;
  _datetimeOffsetTestComplete: boolean;
  _needsDatetimeOffsetAdjustment: boolean;
}

function makeProvider(): SQLServerDataProvider {
  const provider = new SQLServerDataProvider();
  const surface = provider as unknown as ProviderPrivateSurface;
  surface._pool = new MockConnectionPool();
  surface._datetimeOffsetTestComplete = true;
  surface._needsDatetimeOffsetAdjustment = false;
  return provider;
}

/** A materialized read over a snapshot whose column name carries a `?`, built without column types. */
function untypedReadOverQuestionMarkColumn(): { sql: string; parameters: unknown[] } {
  const plan = GenericDatabaseProvider.buildMaterializedReadQuery({
    outputColumns: ['ID', 'Ready?'],
    schemaName: '__mj',
    viewName: 'materialized_vwT',
    spec: [{ column: 'Status', operator: '=', paramName: 's', kind: 'scalar' }],
    paramValues: { s: 'Open' },
    paramTypes: { s: 'string' },
    dialect: GetDialect('sqlserver'),
  });
  expect(plan).not.toBeNull();
  return plan!;
}

describe('SQLServerDataProvider.ExecuteSQL parameter binding', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  it('legacy array form: binds @p0.. and rewrites every `?`, a `?` inside a string literal included', async () => {
    await makeProvider().ExecuteSQL("SELECT 'Why?' AS Q WHERE Name = ?", ['Ann']);

    expect(mssqlState.Queries[0].sql).toBe("SELECT 'Why@p0' AS Q WHERE Name = @p1");
    expect(mssqlState.Queries[0].inputs).toEqual([{ name: 'p0', value: 'Ann' }]);
  });

  it('object form: binds each key by name and leaves the statement text alone', async () => {
    await makeProvider().ExecuteSQL("SELECT 'Why?' AS Q WHERE Name = @name", { name: 'Ann' });

    expect(mssqlState.Queries[0].sql).toBe("SELECT 'Why?' AS Q WHERE Name = @name");
    expect(mssqlState.Queries[0].inputs).toEqual([{ name: 'name', value: 'Ann' }]);
  });

  it('named parameter objects: bound by name, the statement text unchanged', async () => {
    await makeProvider().ExecuteSQL("SELECT 'Why?' AS Q WHERE Name = @p0", [new NamedQueryParameter('p0', 'Ann')]);

    expect(mssqlState.Queries[0].sql).toBe("SELECT 'Why?' AS Q WHERE Name = @p0");
    expect(mssqlState.Queries[0].inputs).toEqual([{ name: 'p0', value: 'Ann' }]);
  });

  it('a materialized read without column types reaches the server with its `?`-bearing column name intact', async () => {
    const plan = untypedReadOverQuestionMarkColumn();
    await makeProvider().ExecuteSQL(plan.sql, plan.parameters);

    expect(mssqlState.Queries[0].sql).toBe(plan.sql);
    expect(mssqlState.Queries[0].sql).toContain('[Ready?]');
    expect(mssqlState.Queries[0].inputs).toEqual([{ name: 'p0', value: 'Open' }]);
  });

  it('a typed materialized read binds declared named parameters and leaves the text alone', async () => {
    const plan = GenericDatabaseProvider.buildMaterializedReadQuery({
      outputColumns: ['ID', 'Ready?'],
      schemaName: '__mj',
      viewName: 'materialized_vwT',
      spec: [{ column: 'Status', operator: '=', paramName: 's', kind: 'scalar' }],
      paramValues: { s: 'Open' },
      paramTypes: { s: 'string' },
      dialect: GetDialect('sqlserver'),
      columnTypes: { Status: 'varchar(20)' },
    });
    expect(plan!.parameters).toEqual([new TypedQueryParameter('mj_p0', 'varchar(20)', 'Open')]);
    await makeProvider().ExecuteSQL(plan!.sql, plan!.parameters);

    expect(mssqlState.Queries[0].sql).toBe(plan!.sql);
    expect(mssqlState.Queries[0].inputs.map((i) => [i.name, i.value])).toEqual([['mj_p0', 'Open']]);
  });
});
