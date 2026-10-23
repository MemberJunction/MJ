import { describe, it, expect } from 'vitest';
import { PredictiveStudioScoreHistoryService } from '../PredictiveStudio/predictive-studio-score-history.service';
import type { RunView, RunViewParams, RunViewResult, BaseEntity, UserInfo } from '@memberjunction/core';

/** Returns the fixture rows for every read; stands in for the RunView the service reads through. */
class FakeRunView implements Pick<RunView, 'RunView' | 'RunViews'> {
  constructor(private readonly rows: object[]) {}

  public async RunView<T = BaseEntity>(_params: RunViewParams, _contextUser?: UserInfo): Promise<RunViewResult<T>> {
    return { Success: true, Results: this.rows as T[], RowCount: this.rows.length, TotalRowCount: this.rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
  }

  public async RunViews<T = BaseEntity>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
    return Promise.all(params.map((p) => this.RunView<T>(p, contextUser)));
  }
}

describe('PredictiveStudioScoreHistoryService', () => {
  it('returns empty array when recordId is missing', async () => {
    const service = new PredictiveStudioScoreHistoryService();
    const res = await service.LoadRecordScoreHistory({
      provider: null,
      recordId: '',
      InvertedRisk: false,
    });
    expect(res).toEqual([]);
  });

  it('parses ProcessRunDetail rows and computes delta over time', async () => {
    const mockDetails = [
      {
        ProcessRunID: 'run-1',
        RecordID: 'rec-123',
        Status: 'Succeeded',
        ResultPayload: JSON.stringify({
          modelId: 'm1',
          score: 0.65,
          class: 'Renewed',
          drivers: [{ feature: 'AutoRenew=true', importance: -0.3 }],
        }),
        __mj_CreatedAt: new Date('2026-09-01T12:00:00Z'),
      },
      {
        ProcessRunID: 'run-2',
        RecordID: 'rec-123',
        Status: 'Succeeded',
        ResultPayload: JSON.stringify({
          modelId: 'm1',
          score: 0.85,
          class: 'Renewed',
          drivers: [{ feature: 'Tenure', importance: 0.2 }],
        }),
        __mj_CreatedAt: new Date('2026-09-10T12:00:00Z'),
      },
    ];

    const service = new PredictiveStudioScoreHistoryService();
    const runViewer = new FakeRunView(mockDetails);
    const points = await service.LoadRecordScoreHistory({
      provider: null,
      RunViewer: runViewer,
      recordId: 'rec-123',
      modelId: 'm1',
      InvertedRisk: false,
    });

    expect(points.length).toBe(2);
    expect(points[0].score).toBe(0.65);
    expect(points[0].Delta).toBeNull();
    expect(points[0].band).toBe('medium');

    expect(points[1].score).toBe(0.85);
    expect(points[1].Delta).toBeCloseTo(0.20, 5);
    expect(points[1].band).toBe('high');
    expect(points[1].drivers[0].Label).toContain('Tenure');
  });

  it('filters by modelId when specified', async () => {
    const mockDetails = [
      {
        ProcessRunID: 'run-1',
        RecordID: 'rec-123',
        Status: 'Succeeded',
        ResultPayload: JSON.stringify({
          modelId: 'm1',
          score: 0.65,
        }),
        __mj_CreatedAt: new Date('2026-09-01T12:00:00Z'),
      },
      {
        ProcessRunID: 'run-2',
        RecordID: 'rec-123',
        Status: 'Succeeded',
        ResultPayload: JSON.stringify({
          modelId: 'different-model',
          score: 0.95,
        }),
        __mj_CreatedAt: new Date('2026-09-10T12:00:00Z'),
      },
    ];

    const service = new PredictiveStudioScoreHistoryService();
    const runViewer = new FakeRunView(mockDetails);
    const points = await service.LoadRecordScoreHistory({
      provider: null,
      RunViewer: runViewer,
      recordId: 'rec-123',
      modelId: 'm1',
      InvertedRisk: false,
    });

    expect(points.length).toBe(1);
    expect(points[0].score).toBe(0.65);
  });

  it('inverts driver up polarity when InvertedRisk is true (F8)', async () => {
    const mockDetails = [
      {
        ProcessRunID: 'run-1',
        RecordID: 'rec-123',
        Status: 'Succeeded',
        ResultPayload: JSON.stringify({
          modelId: 'm1',
          score: 0.85,
          class: 'Renewed',
          drivers: [{ feature: 'AutoRenew=true', importance: 0.4 }],
        }),
        __mj_CreatedAt: new Date('2026-09-10T12:00:00Z'),
      },
    ];

    const service = new PredictiveStudioScoreHistoryService();
    const runViewer = new FakeRunView(mockDetails);
    const points = await service.LoadRecordScoreHistory({
      provider: null,
      RunViewer: runViewer,
      recordId: 'rec-123',
      modelId: 'm1',
      InvertedRisk: true,
    });

    expect(points).toHaveLength(1);
    expect(points[0].drivers[0].Up).toBe(false);
  });
});
