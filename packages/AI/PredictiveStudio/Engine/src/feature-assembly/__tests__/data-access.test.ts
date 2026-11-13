import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

import { RunViewDataAccess } from '../data-access';

/** Provider fake that records the RunView params it receives. */
class RecordingProvider {
  public Params: RunViewParams[] = [];
  async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    this.Params.push(params);
    return { Success: true, Results: [] as T[], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
  }
}

const USER = undefined as unknown as UserInfo;

describe('RunViewDataAccess.fetchRows — row cap', () => {
  it('reads every matching row when no MaxRows is given (ignores the entity UserViewMaxRows cap)', async () => {
    const provider = new RecordingProvider();
    await new RunViewDataAccess(USER, provider as unknown as IMetadataProvider).fetchRows({ EntityName: 'Members' });
    expect(provider.Params[0].IgnoreMaxRows).toBe(true);
    expect(provider.Params[0].MaxRows).toBeUndefined();
  });

  it('honors an explicit MaxRows', async () => {
    const provider = new RecordingProvider();
    await new RunViewDataAccess(USER, provider as unknown as IMetadataProvider).fetchRows({ EntityName: 'Members', MaxRows: 25 });
    expect(provider.Params[0].IgnoreMaxRows).toBe(false);
    expect(provider.Params[0].MaxRows).toBe(25);
  });
});

describe('RunViewDataAccess.fetchRows — match count', () => {
  it('returns the database match count alongside the rows', async () => {
    class CountingProvider {
      async RunView<T>(_params: RunViewParams): Promise<RunViewResult<T>> {
        return { Success: true, Results: [] as T[], RowCount: 0, TotalRowCount: 1734, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
      }
    }
    // Test double: RunViewDataAccess calls only RunView on its provider.
    const res = await new RunViewDataAccess(USER, new CountingProvider() as unknown as IMetadataProvider).fetchRows({
      EntityName: 'Members',
      MaxRows: 1000,
    });
    expect(res.TotalRowCount).toBe(1734);
  });
});

describe('RunViewDataAccess — a read without a total row count', () => {
  /** A provider whose RunView succeeds without reporting TotalRowCount (as under SkipTotalRowCount). */
  class UncountedProvider {
    async RunView<T>(_params: RunViewParams): Promise<RunViewResult<T>> {
      return { Success: true, Results: [{ ID: 'r1' }] as unknown as T[], RowCount: 1, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    }
  }
  const access = () => new RunViewDataAccess(USER, new UncountedProvider() as unknown as IMetadataProvider);

  it('fails the row read, naming the entity, instead of reporting a count it does not have', async () => {
    expect(await access().fetchRows({ EntityName: 'Members' })).toEqual({
      Success: false, Rows: [], TotalRowCount: 0, ErrorMessage: 'Members: the read returned no total row count, so it cannot be checked for truncation',
    });
  });

  it('fails the count read, naming the entity', async () => {
    expect(await access().CountRows({ EntityName: 'Members' })).toEqual({ Success: false, Count: 0, ErrorMessage: 'Members: the count read returned no total row count' });
  });
});
