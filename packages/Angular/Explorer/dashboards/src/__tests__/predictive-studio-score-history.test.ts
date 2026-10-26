import { describe, it, expect } from 'vitest';
import { PredictiveStudioScoreHistoryService } from '../PredictiveStudio/predictive-studio-score-history.service';
import type { EntityInfo, IMetadataProvider, RunView, RunViewParams, RunViewResult, BaseEntity, UserInfo } from '@memberjunction/core';

/** Serves the fixture rows (or a failure) for every read and records each request. */
class FakeRunView implements Pick<RunView, 'RunView' | 'RunViews'> {
  public readonly Requests: RunViewParams[] = [];
  constructor(private readonly rows: object[], private readonly failWith: string | null = null) {}

  public async RunView<T = BaseEntity>(params: RunViewParams, _contextUser?: UserInfo): Promise<RunViewResult<T>> {
    this.Requests.push(params);
    if (this.failWith) {
      return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: this.failWith, UserViewRunID: '' };
    }
    return { Success: true, Results: this.rows as T[], RowCount: this.rows.length, TotalRowCount: this.rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
  }

  public async RunViews<T = BaseEntity>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
    return Promise.all(params.map((p) => this.RunView<T>(p, contextUser)));
  }
}

/** The history service reading through a {@link FakeRunView} instead of a provider-built RunView. */
class TestableHistoryService extends PredictiveStudioScoreHistoryService {
  constructor(public readonly Fake: FakeRunView) {
    super();
  }
  protected override CreateRunView(_provider: IMetadataProvider): Pick<RunView, 'RunView' | 'RunViews'> {
    return this.Fake;
  }
}

/** The provider members the service reads: the schema and base view of the runs and record-process entities. */
const entityDouble = (schemaName: string, baseView: string): Pick<EntityInfo, 'SchemaName' | 'BaseView'> => ({ SchemaName: schemaName, BaseView: baseView });
// Test double: the service reads only EntityByName (SchemaName/BaseView) from the provider.
const provider = {
  EntityByName: (name: string) =>
    name === 'MJ: Process Runs'
      ? entityDouble('__mj', 'vwProcessRuns')
      : name === 'MJ: Record Processes'
        ? entityDouble('__mj', 'vwRecordProcesses')
        : undefined,
} as unknown as IMetadataProvider;

/** A detail row as the `simple` read returns it. */
const detail = (runId: string, score: number, createdAt: string, drivers: object[] = []) => ({
  ProcessRunID: runId,
  Status: 'Succeeded',
  ResultPayload: JSON.stringify({ modelId: 'm1', score, class: 'Renewed', drivers }),
  CompletedAt: null,
  __mj_CreatedAt: createdAt,
  DurationMs: 12,
});

const load = (rows: object[], over: { modelId?: string | null; InvertedRisk?: boolean; failWith?: string } = {}) => {
  const service = new TestableHistoryService(new FakeRunView(rows, over.failWith ?? null));
  const result = service.LoadRecordScoreHistory({
    provider,
    recordId: 'rec-123',
    modelId: over.modelId === undefined ? 'm1' : over.modelId,
    InvertedRisk: over.InvertedRisk ?? false,
  });
  return { service, result };
};

describe('PredictiveStudioScoreHistoryService', () => {
  it('returns an empty array when recordId is missing, without reading', async () => {
    const service = new TestableHistoryService(new FakeRunView([]));
    expect(await service.LoadRecordScoreHistory({ provider, recordId: '', InvertedRisk: false })).toEqual([]);
    expect(service.Fake.Requests).toHaveLength(0);
  });

  it('reads the newest 50 as a simple, field-limited read and returns them oldest first with deltas', async () => {
    // Served newest first, as the DESC read returns them.
    const { service, result } = load([
      detail('run-2', 0.85, '2026-09-10T12:00:00Z', [{ feature: 'Tenure', importance: 0.2 }]),
      detail('run-1', 0.65, '2026-09-01T12:00:00Z'),
    ]);
    const points = await result;
    const req = service.Fake.Requests[0];
    expect(req.OrderBy).toBe('__mj_CreatedAt DESC');
    expect(req.MaxRows).toBe(50);
    expect(req.ResultType).toBe('simple');
    expect(req.Fields).toEqual(['ProcessRunID', 'ResultPayload', 'Status', 'CompletedAt', '__mj_CreatedAt', 'DurationMs']);
    expect(points.map((p) => p.runId)).toEqual(['run-1', 'run-2']);
    expect(points[0].Delta).toBeNull();
    expect(points[0].band).toBe('medium');
    expect(points[0].RunDate).toEqual(new Date('2026-09-01T12:00:00Z'));
    expect(points[1].Delta).toBeCloseTo(0.2, 5);
    expect(points[1].band).toBe('high');
    expect(points[1].drivers[0].Label).toContain('Tenure');
  });

  it("filters by model in the query, through the Record Process configuration, with the id escaped", async () => {
    const { service, result } = load([], { modelId: "m1'x" });
    await result;
    const filter = service.Fake.Requests[0].ExtraFilter ?? '';
    expect(filter).toContain("RecordID = 'rec-123'");
    expect(filter).toContain('ProcessRunID IN (SELECT pr.ID FROM __mj.vwProcessRuns pr INNER JOIN __mj.vwRecordProcesses rp ON rp.ID = pr.RecordProcessID');
    expect(filter).toContain("JSON_VALUE(rp.Configuration, '$.modelId') = 'm1''x'");
  });

  it('reads every model when no model is given', async () => {
    const { service, result } = load([], { modelId: null });
    await result;
    expect(service.Fake.Requests[0].ExtraFilter).not.toContain('ProcessRunID IN');
  });

  it('returns an empty history when the read fails', async () => {
    const { result } = load([], { failWith: 'Timeout expired' });
    expect(await result).toEqual([]);
  });

  it('inverts driver up polarity when InvertedRisk is true (F8)', async () => {
    const { result } = load([detail('run-1', 0.85, '2026-09-10T12:00:00Z', [{ feature: 'AutoRenew=true', importance: 0.4 }])], { InvertedRisk: true });
    const points = await result;
    expect(points).toHaveLength(1);
    expect(points[0].drivers[0].Up).toBe(false);
  });

  it("measures risk and its band on the inverted score for a positive-polarity model (the at-risk list's rule)", async () => {
    const { result } = load([detail('run-1', 0.9, '2026-09-01T12:00:00Z')], { InvertedRisk: true });
    const points = await result;
    expect(points[0].score).toBe(0.9);
    expect(points[0].riskPct).toBe(10);
    expect(points[0].band).toBe('low');
  });
});
