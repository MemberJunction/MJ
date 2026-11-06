import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

import { ProductionRescoreRunner, RunViewMaintenanceLoader } from '../seams';
import { ProductionScoreRecordSetRunner } from '../../actions/score-record-set.runner';
import type { ScoreRecordSetRequest } from '../../actions/score-record-set.action';

afterEach(() => vi.restoreAllMocks());

describe('ProductionRescoreRunner — re-scores the whole population (F-MNT-6 read half)', () => {
  it('asks the scoring runner for a filter scope with no maxRows', async () => {
    const requests: ScoreRecordSetRequest[] = [];
    vi.spyOn(ProductionScoreRecordSetRunner.prototype, 'run').mockImplementation(async (request: ScoreRecordSetRequest) => {
      requests.push(request);
      return { scoredCount: 0, failedCount: 0, skippedCount: 0, wroteBack: false };
    });
    // Test double: the mocked run never reads the provider.
    await new ProductionRescoreRunner().rescore({ modelId: 'm1', targetEntityName: 'Members', provider: {} as unknown as IMetadataProvider });
    expect(requests).toHaveLength(1);
    expect(requests[0].scope.filter).toEqual({ entityName: 'Members', extraFilter: undefined, maxRows: undefined });
  });
});

/** Provider fake that records the RunView params it receives. */
class RecordingProvider {
  public Params: RunViewParams[] = [];
  async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    this.Params.push(params);
    return { Success: true, Results: [] as T[], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
  }
}

describe('RunViewMaintenanceLoader.loadBindings — reads every binding (F-L3-2 class)', () => {
  it('passes IgnoreMaxRows so the read is not cut at the 1,000-row default', async () => {
    const provider = new RecordingProvider();
    // Test doubles: the loader reads only RunView off its provider and never dereferences the user.
    await new RunViewMaintenanceLoader().loadBindings('Scheduled', { ID: 'u1' } as unknown as UserInfo, provider as unknown as IMetadataProvider);
    expect(provider.Params).toHaveLength(1);
    expect(provider.Params[0].IgnoreMaxRows).toBe(true);
    expect(provider.Params[0].ExtraFilter).toBe("Mode='Scheduled'");
  });
});
