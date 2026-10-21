import { describe, it, expect, vi, afterEach } from 'vitest';

import { ProductionRescoreRunner } from '../seams';
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
    await new ProductionRescoreRunner().rescore({ modelId: 'm1', targetEntityName: 'Members' });
    expect(requests).toHaveLength(1);
    expect(requests[0].scope.filter).toEqual({ entityName: 'Members', extraFilter: undefined, maxRows: undefined });
  });
});
