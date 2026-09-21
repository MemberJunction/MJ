import { describe, it, expect, vi } from 'vitest';
import { PredictiveStudioScoreHistoryService } from '../PredictiveStudio/predictive-studio-score-history.service';
import type { IMetadataProvider } from '@memberjunction/core';
import { RunView } from '@memberjunction/core';

describe('PredictiveStudioScoreHistoryService', () => {
  it('returns empty array when recordId is missing', async () => {
    const service = new PredictiveStudioScoreHistoryService();
    const fakeProvider = {} as unknown as IMetadataProvider;
    const res = await service.LoadRecordScoreHistory({
      provider: fakeProvider,
      recordId: '',
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

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: mockDetails,
      }),
    } as unknown as RunView);

    const service = new PredictiveStudioScoreHistoryService();
    const fakeProvider = {} as unknown as IMetadataProvider;
    const points = await service.LoadRecordScoreHistory({
      provider: fakeProvider,
      recordId: 'rec-123',
      modelId: 'm1',
    });

    expect(points.length).toBe(2);
    expect(points[0].score).toBe(0.65);
    expect(points[0].delta).toBeNull();
    expect(points[0].band).toBe('medium');

    expect(points[1].score).toBe(0.85);
    expect(points[1].delta).toBeCloseTo(0.20, 5);
    expect(points[1].band).toBe('high');
    expect(points[1].drivers[0].label).toContain('Tenure');
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

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: mockDetails,
      }),
    } as unknown as RunView);

    const service = new PredictiveStudioScoreHistoryService();
    const fakeProvider = {} as unknown as IMetadataProvider;
    const points = await service.LoadRecordScoreHistory({
      provider: fakeProvider,
      recordId: 'rec-123',
      modelId: 'm1',
    });

    expect(points.length).toBe(1);
    expect(points[0].score).toBe(0.65);
  });
});
