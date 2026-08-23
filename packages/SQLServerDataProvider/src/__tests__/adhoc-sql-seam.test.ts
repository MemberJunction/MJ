/**
 * ExecuteAdhocQuery seam tests — driving the REAL SQLServerDataProvider.
 *
 * adhocQuery.test.ts only re-tests SQLExpressionValidator in isolation; these tests
 * close the gap it papered over by proving the REAL provider method (the inherited
 * `InternalRunQuery` → `ExecuteAdhocQuery` pipeline running on a SQLServerDataProvider
 * instance) actually:
 *   1. invokes SQLExpressionValidator.validateFullQuery with the ad-hoc SQL,
 *   2. refuses to touch the connection when validation fails (returning the
 *      validator's own error), and
 *   3. executes the EXACT validated SQL through the mssql request boundary.
 *
 * Only the mssql module is mocked — the provider, validator, routing, pagination,
 * and result shaping are all real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import { SQLExpressionValidator } from '@memberjunction/global';
import type { RunQueryParams, RunQueryResult, UserInfo } from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
import { TEST_USER } from './helpers/entity-fixtures';

/** Structural view of the provider's private surface the harness needs to seed. */
interface ProviderPrivateSurface {
  _pool: MockConnectionPool;
  _datetimeOffsetTestComplete: boolean;
  _needsDatetimeOffsetAdjustment: boolean;
}

class AdhocTestProvider extends SQLServerDataProvider {
  public AttachPool(pool: MockConnectionPool): void {
    const surface = this as unknown as ProviderPrivateSurface;
    surface._pool = pool;
    // Pre-seed the lazily-cached datetimeoffset probe so PostProcessRows never
    // issues its one-time detection query against the mock pool.
    surface._datetimeOffsetTestComplete = true;
    surface._needsDatetimeOffsetAdjustment = false;
  }

  /** Public entry to the REAL protected InternalRunQuery pipeline. */
  public RunQueryDirect(params: RunQueryParams, user?: UserInfo): Promise<RunQueryResult> {
    return this.InternalRunQuery(params, user);
  }
}

function makeProvider(): AdhocTestProvider {
  const provider = new AdhocTestProvider();
  provider.AttachPool(new MockConnectionPool());
  return provider;
}

describe('SQLServerDataProvider ad-hoc SQL seam (real InternalRunQuery → ExecuteAdhocQuery)', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  it('invokes SQLExpressionValidator.validateFullQuery with exactly the ad-hoc SQL before executing', async () => {
    const provider = makeProvider();
    const sqlText = 'SELECT TOP 10 ID, Name FROM __mj.vwUsers ORDER BY Name';
    const validatorSpy = vi.spyOn(SQLExpressionValidator.Instance, 'validateFullQuery');
    mssqlState.QueueResult({ rows: [{ ID: '1', Name: 'Alice' }] });

    const result = await provider.RunQueryDirect({ SQL: sqlText }, TEST_USER);

    expect(validatorSpy).toHaveBeenCalledTimes(1);
    expect(validatorSpy).toHaveBeenCalledWith(sqlText);
    expect(result.Success).toBe(true);
    // The EXACT SQL the caller supplied is what hit the mssql request — no rewriting.
    expect(mssqlState.Queries).toHaveLength(1);
    expect(mssqlState.Queries[0].sql).toBe(sqlText);
    expect(mssqlState.Queries[0].viaTransaction).toBe(false);
  });

  it('shapes a successful ad-hoc result correctly (QueryID empty, QueryName "Ad-Hoc Query")', async () => {
    const provider = makeProvider();
    const rows = [
      { ID: '1', Name: 'Alice' },
      { ID: '2', Name: 'Bob' },
    ];
    mssqlState.QueueResult({ rows });

    const result = await provider.RunQueryDirect({ SQL: 'SELECT ID, Name FROM __mj.vwUsers' }, TEST_USER);

    expect(result.Success).toBe(true);
    expect(result.QueryID).toBe('');
    expect(result.QueryName).toBe('Ad-Hoc Query');
    expect(result.Results).toEqual(rows);
    expect(result.RowCount).toBe(2);
    expect(result.TotalRowCount).toBe(2);
    expect(result.ErrorMessage).toBe('');
    expect(typeof result.ExecutionTime).toBe('number');
  });

  it('rejects mutating SQL with the validator error and never touches the connection', async () => {
    const provider = makeProvider();
    const badSQL = "INSERT INTO Users (Name) VALUES ('hacked')";
    // The expected error is whatever the REAL validator produces — computed here,
    // asserted below, so the provider must surface the validator's message verbatim.
    const expected = SQLExpressionValidator.Instance.validateFullQuery(badSQL);
    expect(expected.valid).toBe(false);

    const result = await provider.RunQueryDirect({ SQL: badSQL }, TEST_USER);

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toBe(expected.error);
    expect(result.QueryName).toBe('Ad-Hoc Query');
    expect(result.Results).toEqual([]);
    expect(result.RowCount).toBe(0);
    expect(mssqlState.Queries).toHaveLength(0); // validation gate ran BEFORE execution
  });

  it('rejects multi-statement SQL injection attempts before execution', async () => {
    const provider = makeProvider();

    const result = await provider.RunQueryDirect({ SQL: 'SELECT 1; DELETE FROM Users' }, TEST_USER);

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toBeTruthy();
    expect(mssqlState.Queries).toHaveLength(0);
  });

  it('returns an "Ad-hoc query execution failed" error result when the request throws', async () => {
    const provider = makeProvider();
    // NOTE: deliberately NOT a stale-connection-shaped message — those trigger the
    // provider's one-shot retry (covered by the next test).
    mssqlState.QueueResult({ error: new Error("Invalid column name 'Bogus'") });

    const result = await provider.RunQueryDirect({ SQL: 'SELECT Bogus FROM __mj.vwUsers' }, TEST_USER);

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('Ad-hoc query execution failed');
    expect(result.ErrorMessage).toContain("Invalid column name 'Bogus'");
    expect(result.Results).toEqual([]);
    // The query WAS attempted — the failure came from the request, not the gate.
    expect(mssqlState.Queries).toHaveLength(1);
  });

  it('retries exactly once on a stale-connection error and succeeds on the fresh connection', async () => {
    const provider = makeProvider();
    const sqlText = 'SELECT ID FROM __mj.vwUsers';
    mssqlState.QueueResult({ error: new Error('Connection lost - socket dropped by load balancer') });
    mssqlState.QueueResult({ rows: [{ ID: '1' }] });

    const result = await provider.RunQueryDirect({ SQL: sqlText }, TEST_USER);

    expect(result.Success).toBe(true);
    expect(result.Results).toEqual([{ ID: '1' }]);
    // Same SQL executed twice — the dead first attempt, then the retry.
    expect(mssqlState.Queries).toHaveLength(2);
    expect(mssqlState.Queries[0].sql).toBe(sqlText);
    expect(mssqlState.Queries[1].sql).toBe(sqlText);
  });

  it('applies in-memory StartRow/MaxRows pagination while reporting the full TotalRowCount', async () => {
    const provider = makeProvider();
    const rows = [1, 2, 3, 4, 5].map((n) => ({ ID: `${n}` }));
    mssqlState.QueueResult({ rows });

    const result = await provider.RunQueryDirect(
      { SQL: 'SELECT ID FROM __mj.vwUsers', StartRow: 1, MaxRows: 2 },
      TEST_USER,
    );

    expect(result.Success).toBe(true);
    expect(result.Results).toEqual([{ ID: '2' }, { ID: '3' }]);
    expect(result.RowCount).toBe(2);
    expect(result.TotalRowCount).toBe(5);
  });

  it('routes to the ad-hoc path when BOTH SQL and QueryID are supplied (SQL wins)', async () => {
    const provider = makeProvider();
    const sqlText = 'SELECT 1 AS One';
    const validatorSpy = vi.spyOn(SQLExpressionValidator.Instance, 'validateFullQuery');
    mssqlState.QueueResult({ rows: [{ One: 1 }] });

    const result = await provider.RunQueryDirect(
      { SQL: sqlText, QueryID: 'AAAAAAAA-0000-0000-0000-000000000001' },
      TEST_USER,
    );

    expect(validatorSpy).toHaveBeenCalledWith(sqlText);
    expect(result.Success).toBe(true);
    expect(result.QueryID).toBe(''); // ad-hoc result shape — the saved-query ID was ignored
    expect(result.QueryName).toBe('Ad-Hoc Query');
    expect(mssqlState.Queries).toHaveLength(1);
    expect(mssqlState.Queries[0].sql).toBe(sqlText);
  });

  it('falls through to the saved-query path (and fails cleanly) when SQL is not provided', async () => {
    const provider = makeProvider();
    const validatorSpy = vi.spyOn(SQLExpressionValidator.Instance, 'validateFullQuery');

    const result = await provider.RunQueryDirect(
      { QueryID: 'AAAAAAAA-0000-0000-0000-000000000001' },
      TEST_USER,
    );

    // No metadata is loaded in this harness, so the saved-query path errors —
    // the point is it did NOT take the ad-hoc route and did NOT execute SQL.
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toBeTruthy();
    expect(validatorSpy).not.toHaveBeenCalled();
    expect(mssqlState.Queries).toHaveLength(0);
  });
});
