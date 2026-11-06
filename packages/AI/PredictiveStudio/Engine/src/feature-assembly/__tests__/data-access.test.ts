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
