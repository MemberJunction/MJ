/**
 * Attacks 1, 3, 4, and 5 against the server entity layer:
 * - MJMLSearchStrategyComparisonEntityServer computes Passed = LowerBoundMin > 0 on every save and refuses client overrides of Passed
 *   as well as LowerBoundMin values that do not match the minimum across W1-signal and C1 paired intervals.
 * - MJMLEvaluationProtocolEntityServer refuses guided protocols when comparison is missing or LowerBoundMin <= 0, and refuses
 *   agent edits to SearchStrategy when GuardFieldsEditableBy stays at PR 3's default.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityInfo, RunView, UserInfo, UserRoleInfo, type BaseEntity, type IEntityDataProvider, type RecordChange, type RunViewParams } from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: object) => target };
});

import { EvaluationProtocol, EvaluationProtocolRules, type Actor, type EvaluationProtocolColumns, type HoldoutSplit, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { MJMLSearchStrategyComparisonEntityServer } from '../custom/MJMLSearchStrategyComparisonEntityServer.server';
import { MJMLEvaluationProtocolEntityServer } from '../custom/MJMLEvaluationProtocolEntityServer.server';

const ENTITY_ID = 'E0000000-0000-4000-8000-0000000000B4';
const ROLE_ID = 'E1000000-0000-4000-8000-0000000000B4';
const USER_ID = 'A0000000-0000-4000-8000-0000000000B4';
const COMPARISON_ID = 'C0000000-0000-4000-8000-0000000000B4';

function comparisonEntityInfo(): EntityInfo {
  const fields = [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'Method', Type: 'nvarchar', AllowsNull: false },
    { Name: 'ComputeBudgetSecondsPerArm', Type: 'decimal', AllowsNull: false },
    { Name: 'Datasets', Type: 'nvarchar', AllowsNull: false },
    { Name: 'PairedDifference', Type: 'nvarchar', AllowsNull: false },
    { Name: 'LowerBoundMin', Type: 'decimal', AllowsNull: false },
    { Name: 'Passed', Type: 'bit', AllowsNull: false },
    { Name: 'ComparedAt', Type: 'datetimeoffset', AllowsNull: false },
    { Name: 'ComparedByUserID', Type: 'uniqueidentifier', AllowsNull: false },
  ];
  return new EntityInfo({
    ID: ENTITY_ID,
    Name: 'MJ: ML Search Strategy Comparisons',
    SchemaName: '__mj',
    BaseTable: 'MLSearchStrategyComparison',
    BaseView: 'vwMLSearchStrategyComparisons',
    Status: 'Active',
    IncludeInAPI: true,
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    TrackRecordChanges: true,
    EnableFieldLevelSecurity: false,
    EntityPermissions: [{ ID: 'P0000000-0000-4000-8000-0000000000B4', EntityID: ENTITY_ID, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }],
    EntityFields: fields.map((f, i) => ({
      ID: `F0000000-0000-4000-8000-0000000000${(10 + i).toString()}`,
      EntityID: ENTITY_ID,
      Sequence: i + 1,
      Length: 0,
      Precision: 0,
      Scale: 0,
      AllowUpdateAPI: true,
      ...f,
    })),
  });
}

const USER = new UserInfo(null, {
  ID: USER_ID,
  Email: 'analyst@example.com',
  Type: 'User',
  UserRoles: [new UserRoleInfo({ UserID: USER_ID, RoleID: ROLE_ID })],
});

class RecordingProvider implements IEntityDataProvider {
  public SavedCount = 0;
  public async Config(): Promise<boolean> { return true; }
  public async Load(): Promise<{}> { throw new Error('Load unused'); }
  public async Save(entity: BaseEntity): Promise<{}> {
    this.SavedCount++;
    return { ...entity.GetAll(), ID: entity.Get('ID') || COMPARISON_ID };
  }
  public async Delete(): Promise<boolean> { throw new Error('Delete unused'); }
  public async GetRecordChanges(): Promise<RecordChange[]> { return []; }
}

const DEFAULT_DATASETS = JSON.stringify([
  { Dataset: 'W1-signal', Seeds: [42, 43, 44] },
  { Dataset: 'C1', Seeds: [1, 2, 3] },
]);

function makePaired(w1Lower: number, c1Lower: number): string {
  return JSON.stringify({
    'W1-signal': { value: w1Lower + 0.03, ci: [w1Lower, w1Lower + 0.06], beats: w1Lower > 0 },
    'C1': { value: c1Lower + 0.03, ci: [c1Lower, c1Lower + 0.06], beats: c1Lower > 0 },
  });
}

function makeComparisonEntity(
  provider: IEntityDataProvider,
  opts: { w1Lower: number; c1Lower: number; lowerBoundMin: number; setPassed?: boolean },
): MJMLSearchStrategyComparisonEntityServer {
  const row = new MJMLSearchStrategyComparisonEntityServer(comparisonEntityInfo(), provider);
  row.ContextCurrentUser = USER;
  row.NewRecord();
  row.Method = 'bayesian';
  row.ComputeBudgetSecondsPerArm = 120;
  row.Datasets = DEFAULT_DATASETS;
  row.PairedDifference = makePaired(opts.w1Lower, opts.c1Lower);
  row.LowerBoundMin = opts.lowerBoundMin;
  row.ComparedAt = new Date('2026-11-26T00:00:00Z');
  row.ComparedByUserID = USER_ID;
  if (opts.setPassed !== undefined) {
    row.Passed = opts.setPassed;
  }
  return row;
}

describe('B4 MJMLSearchStrategyComparisonEntityServer — Attack 3 & Attack 5', () => {
  it('Attack 3: refuses create when client sets Passed = true and LowerBoundMin = -0.1, saving nothing', async () => {
    const provider = new RecordingProvider();
    const row = makeComparisonEntity(provider, { w1Lower: -0.1, c1Lower: 0.05, lowerBoundMin: -0.1, setPassed: true });

    const validation = row.Validate();
    expect(validation.Success).toBe(false);
    expect(validation.Errors.some((e) => e.Source === 'Passed')).toBe(true);
    expect(await row.Save()).toBe(false);
    expect(provider.SavedCount).toBe(0);
  });

  it('Attack 3: refuses ReplayOnly save when Passed = true and LowerBoundMin = -0.1', async () => {
    const provider = new RecordingProvider();
    const row = makeComparisonEntity(provider, { w1Lower: -0.1, c1Lower: 0.05, lowerBoundMin: -0.1, setPassed: true });
    expect(await row.Save({ ReplayOnly: true })).toBe(false);
    expect(provider.SavedCount).toBe(0);
  });

  it('Attack 3: computes Passed = false when LowerBoundMin = -0.1, and refuses an update flipping Passed = true', async () => {
    const provider = new RecordingProvider();
    const row = makeComparisonEntity(provider, { w1Lower: -0.1, c1Lower: 0.05, lowerBoundMin: -0.1 });
    expect(await row.Save()).toBe(true);
    expect(row.Passed).toBe(false);
    expect(provider.SavedCount).toBe(1);

    // Simulate GraphQL update / Update Record flipping Passed to true
    row.Passed = true;
    const validation = row.Validate();
    expect(validation.Success).toBe(false);
    expect(await row.Save()).toBe(false);
    expect(provider.SavedCount).toBe(1);
  });

  it('Attack 3 & Attack 1 boundary: computes Passed = true only when LowerBoundMin > 0 (not = 0), and refuses Passed = true at LowerBoundMin = 0', async () => {
    const provider = new RecordingProvider();

    const zeroAttempt = makeComparisonEntity(provider, { w1Lower: 0, c1Lower: 0.05, lowerBoundMin: 0, setPassed: true });
    expect(await zeroAttempt.Save()).toBe(false);
    expect(provider.SavedCount).toBe(0);

    // Create with LowerBoundMin = 0.05 without explicitly passing Passed -> server computes Passed = true
    const passing = makeComparisonEntity(provider, { w1Lower: 0.05, c1Lower: 0.07, lowerBoundMin: 0.05 });
    expect(await passing.Save()).toBe(true);
    expect(passing.Passed).toBe(true);
    expect(provider.SavedCount).toBe(1);
  });

  it('Attack 5: refuses forged averaged LowerBoundMin = +0.02 when W1-signal is +0.05 and C1 is -0.01', async () => {
    const provider = new RecordingProvider();
    const forgedAvg = makeComparisonEntity(provider, { w1Lower: 0.05, c1Lower: -0.01, lowerBoundMin: 0.02 });
    const validation = forgedAvg.Validate();
    expect(validation.Success).toBe(false);
    expect(await forgedAvg.Save()).toBe(false);
    expect(provider.SavedCount).toBe(0);

    const accurate = makeComparisonEntity(provider, { w1Lower: 0.05, c1Lower: -0.01, lowerBoundMin: -0.01 });
    expect(await accurate.Save()).toBe(true);
    expect(accurate.Passed).toBe(false);
  });
});

describe('B4 MJMLEvaluationProtocolEntityServer.ValidateAsync — Attacks 1 & 4', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const human: Actor = { kind: 'human', userId: 'U-1' };
  const agent: Actor = { kind: 'agent', agentRunId: 'AR-1' };
  const seeded: HoldoutSplit = { kind: 'seeded-random', fraction: 0.25 };
  const unit: PredictionUnitSpec = {
    id: 'U-1',
    lineageRootId: 'U-1',
    version: 1,
    name: 'visits',
    rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] },
    label: { rule: { kind: 'column', column: 'Target' }, windowDays: 31, gapDays: 0, outcome: { kind: 'count' }, labelVersion: 1 },
    censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2020-12-31' } },
    history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
    groupKey: null,
    temporal: null,
    decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'year' },
    incumbent: { kind: 'none' },
    authoredBy: human,
  };
  const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: unit, Holdout: seeded, Candidates: 1, Seed: 0, Name: 'p' });
  const v1Cols = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(draft, { ID: 'P-1', LineageRootID: 'P-1', Version: 1, AuthoredBy: human });

  function makeProtocolRow(cols: EvaluationProtocolColumns, previous: EvaluationProtocolColumns | null, comparisonRow: object | null): MJMLEvaluationProtocolEntityServer {
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: async (p: RunViewParams) => {
        if (p.EntityName === 'MJ: ML Evaluation Protocols') {
          return { Success: true, Results: previous ? [previous] : [] };
        }
        if (p.EntityName === 'MJ: ML Search Strategy Comparisons') {
          return { Success: true, Results: comparisonRow ? [comparisonRow] : [] };
        }
        return { Success: true, Results: [] };
      },
    } as unknown as RunView);

    const row = Object.create(MJMLEvaluationProtocolEntityServer.prototype) as MJMLEvaluationProtocolEntityServer;
    const provider = { EntityByName: () => undefined, EntityByID: () => undefined, Entities: [], CurrentUser: { ID: 'U-1' } };
    for (const [key, val] of Object.entries({ ...cols, IsSaved: false, ProviderToUse: provider, ContextCurrentUser: { ID: 'U-1' } })) {
      Object.defineProperty(row, key, { value: val, writable: true, configurable: true });
    }
    return row;
  }

  it('Attack 1: ValidateAsync refuses guided protocol when comparison row is missing or LowerBoundMin = 0, and accepts a passing row', async () => {
    const guidedDraft = {
      ...draft,
      search: { kind: 'guided' as const, method: 'bayesian' as const, equalCostComparisonId: COMPARISON_ID },
    };
    const guidedCols = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(guidedDraft, {
      ID: 'P-G',
      LineageRootID: 'P-G',
      Version: 1,
      AuthoredBy: human,
    });

    const missingResult = await makeProtocolRow(guidedCols, null, null).ValidateAsync();
    expect(missingResult.Success).toBe(false);
    expect(missingResult.Errors.some((e) => e.Source === 'SearchStrategy')).toBe(true);

    const zeroResult = await makeProtocolRow(guidedCols, null, {
      ID: COMPARISON_ID,
      Method: 'bayesian',
      ComputeBudgetSecondsPerArm: 120,
      Datasets: DEFAULT_DATASETS,
      PairedDifference: makePaired(0, 0.05),
      LowerBoundMin: 0,
      Passed: false,
    }).ValidateAsync();
    expect(zeroResult.Success).toBe(false);
    expect(zeroResult.Errors.some((e) => e.Source === 'SearchStrategy')).toBe(true);

    const okResult = await makeProtocolRow(guidedCols, null, {
      ID: COMPARISON_ID,
      Method: 'bayesian',
      ComputeBudgetSecondsPerArm: 120,
      Datasets: DEFAULT_DATASETS,
      PairedDifference: makePaired(0.05, 0.02),
      LowerBoundMin: 0.02,
      Passed: true,
    }).ValidateAsync();
    expect(okResult.Success).toBe(true);
  });

  it('Attack 4: ValidateAsync refuses an agent changing SearchStrategy when GuardFieldsEditableBy was unchanged from PR 3', async () => {
    const v2Cols = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(
      { ...draft, search: { kind: 'guided', method: 'bayesian', equalCostComparisonId: COMPARISON_ID } },
      { ID: 'P-2', LineageRootID: 'P-1', Version: 2, AuthoredBy: agent },
    );
    const result = await makeProtocolRow(v2Cols, v1Cols, {
      ID: COMPARISON_ID,
      Method: 'bayesian',
      ComputeBudgetSecondsPerArm: 120,
      Datasets: DEFAULT_DATASETS,
      PairedDifference: makePaired(0.05, 0.02),
      LowerBoundMin: 0.02,
      Passed: true,
    }).ValidateAsync();
    expect(result.Success).toBe(false);
    expect(result.Errors.some((e) => e.Source === 'AuthoredBy' && e.Message.includes('search'))).toBe(true);
  });
});
