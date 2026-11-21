import '@angular/compiler';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { BaseEntityResult, CompositeKey, RunView, TransactionGroupBase, type IMetadataProvider, type RunViewParams, type TransactionResult, type UserInfo } from '@memberjunction/core';
import { MJListDetailEntity, MJListEntity, MJMLModelScoringBindingEntity, type MJMLModelEntity, type MJMLOutputBindingEntity } from '@memberjunction/core-entities';
import type { SemanticsCheckBinding } from '@memberjunction/predictive-studio-core';
import { NavigationService } from '@memberjunction/ng-shared';
import { renderComponentFixture, query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { PredictiveStudioEngine, type PSRunDetailRow } from '../engine/predictive-studio.engine';
import { PSPredictionsGridComponent, type PredictionGridRowsLoadedEvent } from './ps-predictions-grid.component';
import type { LatestPredictionRow } from '../latest-prediction-rows';
import { TestEntityRows } from '../../__tests__/fixtures/test-entity-rows';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for <ps-predictions-grid>'s tiers. The grid reads the model through its `Provider` (a fake that serves
 * the model row) and the run through `PredictiveStudioEngine.LoadRunDetails` (spied). Classification models tier by
 * risk, so a renewal model's 0.95 score is low risk; regression models tier by their outcome bands on the raw value.
 */

/** The model fields the grid reads to resolve its problem type, outcome config and polarity. */
type ModelRow = Pick<MJMLModelEntity, 'ID' | 'ProblemType' | 'TargetVariable' | 'Lineage' | 'OutputSemantics'>;

/** The `MJ: ML Output Bindings` fields the grid reads. */
type BindingRow = Pick<MJMLOutputBindingEntity, 'ID' | 'ModelID' | 'Surface' | 'SortsBy' | 'DriverDirectionRelativeTo' | 'Label'>;

const detail = (recordId: string, score: number): PSRunDetailRow => ({
  ID: `d-${recordId}`,
  RecordID: recordId,
  ResultPayload: JSON.stringify({ score }),
  Status: 'Succeeded',
  CompletedAt: new Date('2026-10-01T00:00:00Z'),
  __mj_CreatedAt: new Date('2026-10-01T00:00:00Z'),
});

async function renderGrid(model: ModelRow, rows: PSRunDetailRow[], capped = false): Promise<{ fixture: ComponentFixture<PSPredictionsGridComponent>; loaded: PredictionGridRowsLoadedEvent[] }> {
  vi.spyOn(PredictiveStudioEngine.Instance, 'LoadRunDetails').mockResolvedValue({ Rows: rows, Capped: capped });
  const provider = createFakeProvider<ModelRow>({ runViewResults: (p: RunViewParams) => (p.EntityName === 'MJ: ML Models' ? [model] : []) });
  let loaded: PredictionGridRowsLoadedEvent[] = [];
  const fixture = renderComponentFixture(PSPredictionsGridComponent, {
    inputs: { ModelId: model.ID, RunId: 'run-1', Provider: provider },
    providers: [{ provide: NavigationService, useValue: {} }],
    setup: (instance) => {
      loaded = capture(instance.RowsLoaded);
    },
  });
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return { fixture, loaded };
}

/** What {@link RenderGrid} renders: the model, its binding row's fields under test (none: the model has no row), the run's scores. */
interface RenderGridOptions {
  model: ModelRow;
  binding?: Partial<SemanticsCheckBinding>;
  scores?: number[];
  /** When given, every read the grid makes is pushed here. */
  reads?: RunViewParams[];
}

/** A stored binding row of `modelId`: a classification model's predictions-grid defaults, overridden by `fields`. */
const bindingRow = (modelId: string, fields: Partial<SemanticsCheckBinding>): BindingRow => ({
  ID: fields.BindingID || 'B-grid',
  ModelID: modelId,
  Surface: fields.Surface || 'predictions-grid',
  SortsBy: fields.SortsBy || 'adverse-probability-desc',
  DriverDirectionRelativeTo: fields.DriverDirectionRelativeTo || 'adverse-class',
  Label: fields.Label || 'false risk',
});

/** The rows a read returns: the model by ID, the binding rows of the surface its filter names. */
const servedRows = (p: RunViewParams, model: ModelRow, bindings: BindingRow[]): Array<ModelRow | BindingRow> => {
  if (p.EntityName === 'MJ: ML Models') return [model];
  if (p.EntityName === 'MJ: ML Output Bindings') return bindings.filter((b) => (typeof p.ExtraFilter === 'string' ? p.ExtraFilter : '').includes(`Surface='${b.Surface}'`));
  return [];
};

/**
 * Renders the grid into `host` over a provider serving the model and its binding row (one batched read), and a run of
 * `scores`; resolves to the grid once it has loaded.
 */
async function RenderGrid(host: HTMLElement, options: RenderGridOptions): Promise<PSPredictionsGridComponent> {
  const scores = options.scores || [0.9, 0.2, 0.6];
  vi.spyOn(PredictiveStudioEngine.Instance, 'LoadRunDetails').mockResolvedValue({ Rows: scores.map((s, i) => detail(`r${i}`, s)), Capped: false });
  const bindings = options.binding ? [bindingRow(options.model.ID, options.binding)] : [];
  const provider = createFakeProvider<ModelRow | BindingRow>({ runViewResults: (p: RunViewParams) => {
    options.reads?.push(p);
    return servedRows(p, options.model, bindings);
  } });
  const fixture = renderComponentFixture(PSPredictionsGridComponent, {
    inputs: { ModelId: options.model.ID, RunId: 'run-1', Provider: provider },
    providers: [{ provide: NavigationService, useValue: {} }],
  });
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  host.appendChild(fixture.nativeElement);
  return fixture.componentInstance;
}

/** The tier chip buttons' text, e.g. "High risk (2)". */
const tierChips = (fixture: ComponentFixture<PSPredictionsGridComponent>): string[] =>
  queryAll(fixture, '.pg-tier-btn').map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim());

// The grid reads through the engine of its provider; a test spies the members of the one instance it gets.
beforeEach(() => {
  vi.spyOn(PredictiveStudioEngine, 'GetProviderInstance').mockReturnValue(PredictiveStudioEngine.Instance);
});
afterEach(() => vi.restoreAllMocks());

describe('PSPredictionsGridComponent (DOM) — tiers', () => {
  const renewal: ModelRow = { ID: 'm-renew', ProblemType: 'classification', TargetVariable: 'Renewed', Lineage: null, OutputSemantics: null };

  it('a renewal model tiers by risk: a 0.95 score is low risk and High holds the riskiest rows', async () => {
    const { fixture } = await renderGrid(renewal, [detail('r-safe', 0.95), detail('r-lapse1', 0.1), detail('r-lapse2', 0.2), detail('r-mid', 0.5)]);
    const grid = fixture.componentInstance;
    expect(grid.IsRenewalModel).toBe(true);
    expect(grid.AllRows.find((r) => r.recordId === 'r-safe')?.band).toBe('low');
    expect(grid.AllRows.find((r) => r.recordId === 'r-safe')?.status).toBe('Low risk');
    expect(grid.AllRows.filter((r) => r.band === 'high').map((r) => r.recordId).sort()).toEqual(['r-lapse1', 'r-lapse2']);
    expect(tierChips(fixture)).toEqual(['All (4)', 'High risk (2)', 'Medium risk (1)', 'Low risk (1)']);
    expect(grid.ColumnDefs.find((c) => c.field === 'riskPct')?.hide).toBe(false);
  });

  it('emits the parsed rows once, with the capped flag', async () => {
    const { loaded } = await renderGrid(renewal, [detail('a', 0.9), detail('b', 0.3)], true);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].Capped).toBe(true);
    expect(loaded[0].Rows.map((r) => r.RecordID)).toEqual(['b', 'a']);
  });

  it('shows the capped notice when the run was capped', async () => {
    const { fixture } = await renderGrid(renewal, [detail('a', 0.9)], true);
    expect(query(fixture, '[data-testid="ps-predictions-capped"]')?.textContent).toContain(PredictiveStudioEngine.MaxRunDetailRowsLabel);
  });

  it('shows no capped notice for a complete run', async () => {
    const { fixture } = await renderGrid(renewal, [detail('a', 0.9)], false);
    expect(query(fixture, '[data-testid="ps-predictions-capped"]')).toBeNull();
  });

  it('a regression model tiers by its outcome bands on the raw value and hides the risk column', async () => {
    const revenue: ModelRow = { ID: 'm-rev', ProblemType: 'regression', TargetVariable: 'Revenue', Lineage: null, OutputSemantics: null };
    const { fixture } = await renderGrid(revenue, [detail('big', 3000), detail('mid', 1000), detail('small1', 100), detail('small2', 50)]);
    const grid = fixture.componentInstance;
    expect(grid.IsRenewalModel).toBe(false);
    expect(grid.AllRows.find((r) => r.recordId === 'big')?.band).toBe('high');
    expect(grid.AllRows.find((r) => r.recordId === 'big')?.status).toBe('High Value');
    expect(grid.AllRows.find((r) => r.recordId === 'small1')?.band).toBe('standard');
    expect(tierChips(fixture)).toEqual(['All (4)', 'High Value (1)', 'Medium Value (1)', 'Standard Value (2)']);
    expect(grid.ColumnDefs.find((c) => c.field === 'riskPct')?.hide).toBe(true);
  });

  it('labels the driver chips and the CSV drivers column with the direction of risk', async () => {
    const payload = (score: number, drivers: object[]) => ({ ...detail('r1', score), ResultPayload: JSON.stringify({ score, drivers }) });
    const { fixture } = await renderGrid(renewal, [payload(0.9, [{ feature: 'AutoRenew', value: 1.2 }])]);
    const grid = fixture.componentInstance;
    const row = grid.AllRows[0];
    expect(row.drivers[0].Up).toBe(false);
    const driversCol = grid.ColumnDefs.find((c) => c.field === 'drivers');
    const html = (driversCol?.cellRenderer as (p: { data: typeof row }) => string)({ data: row });
    expect(html).toContain('title="Auto Renew: lowers risk"');
    expect(html).toContain('fa-arrow-down');

    const blobs: Blob[] = [];
    const urlApi = URL as typeof URL & { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    urlApi.createObjectURL = (b: Blob) => {
      blobs.push(b);
      return 'blob:test';
    };
    urlApi.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    grid.ExportCSV();
    // jsdom's Blob has no text(); FileReader reads it.
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]);
    });
    expect(csv.split('\n')[0]).toContain('"Top Drivers (+ raises risk, − lowers risk)"');
    expect(csv.split('\n')[1]).toContain('−Auto Renew');
  });
});

describe('PSPredictionsGridComponent (DOM) — from the predictions-grid binding row', () => {
  /** A model named for renewal whose adverse class is `Renewed = false`: the score is P(not renewed), so it is not inverted. */
  const renewalNamed: ModelRow = {
    ID: 'm-renewal-named', ProblemType: 'classification', TargetVariable: 'Renewed', Lineage: null,
    OutputSemantics: JSON.stringify({ task: { kind: 'binary', classOrder: ['true', 'false'], adverseIndex: 1 } }),
  };
  let fixture: HTMLElement;
  beforeEach(() => {
    fixture = document.createElement('div');
    document.body.appendChild(fixture);
  });
  afterEach(() => fixture.remove());

  it('the predictions grid reads its polarity from the binding row, not the model name', async () => {
    const grid = await RenderGrid(fixture, { model: renewalNamed, binding: { Surface: 'predictions-grid', SortsBy: 'adverse-probability-desc' } });
    expect(grid.IsRenewalModel).toBe(false);
  });

  it('labels the risk column with the binding row and orders the rows by adverse probability', async () => {
    const grid = await RenderGrid(fixture, { model: renewalNamed, binding: { Surface: 'predictions-grid', SortsBy: 'adverse-probability-desc', Label: 'false risk' } });
    expect(grid.ColumnDefs.find((c) => c.field === 'riskPct')?.headerName).toBe('false risk');
    expect(grid.AllRows.map((r) => r.score)).toEqual([0.9, 0.6, 0.2]);
  });

  it('a model with no binding row keeps the outcome-config rule (a "Renewed" target inverts)', async () => {
    const grid = await RenderGrid(fixture, { model: renewalNamed });
    expect(grid.IsRenewalModel).toBe(true);
    expect(grid.AllRows.map((r) => r.score)).toEqual([0.2, 0.6, 0.9]);
  });

  it('reads its own and the why-badge binding rows past the server cache', async () => {
    const reads: RunViewParams[] = [];
    await RenderGrid(fixture, { model: renewalNamed, binding: { Surface: 'predictions-grid' }, reads });
    const bindingReads = reads.filter((p) => p.EntityName === 'MJ: ML Output Bindings');
    expect(bindingReads.map((p) => [p.ExtraFilter, p.BypassCache])).toEqual([
      [`ModelID='m-renewal-named' AND Surface='predictions-grid'`, true],
      [`ModelID='m-renewal-named' AND Surface='why-badge'`, true],
    ]);
  });

  it('unparseable semantics with a binding row: no polarity is guessed and the grid says why', async () => {
    const broken: ModelRow = { ...renewalNamed, ID: 'm-broken', OutputSemantics: '{not json' };
    const grid = await RenderGrid(fixture, { model: broken, binding: { Surface: 'predictions-grid' } });
    expect(grid.IsRenewalModel).toBe(false);
    expect(fixture.querySelector('[data-testid="ps-semantics-problem"]')?.textContent).toContain('OutputSemantics');
  });
});

describe('PSPredictionsGridComponent (DOM) — the latest values of the model\'s scoring binding', () => {
  /** A churn model (no inversion) of pipeline P1 whose class order is ['false', 'true']: the score is P(true). */
  const churn: ModelRow & Pick<MJMLModelEntity, 'PipelineID'> = {
    ID: 'm-churn', PipelineID: 'P1', ProblemType: 'classification', TargetVariable: 'Churned', Lineage: null,
    OutputSemantics: JSON.stringify({ task: { kind: 'binary', classOrder: ['false', 'true'], adverseIndex: 1 } }),
  };
  /** The model pipeline's Active scoring binding. */
  const scoringBinding = { ID: 'SB1', MLTrainingPipelineID: 'P1', FeatureName: 'Churn risk', TargetEntityID: 'E-MEMBERS', Status: 'Active' } as const;
  /** The latest Champion Model value of `recordId`: adverse probability `score`, its probabilities in class order. */
  const Latest = (recordId: string, score: number): LatestPredictionRow => ({
    ID: `LV-${recordId}`, RecordID: recordId, ValueText: score >= 0.5 ? 'true' : 'false', ValueNumeric: score, Confidence: Math.max(score, 1 - score),
    ValueJSON: JSON.stringify({ Probabilities: { false: 1 - score, true: score }, Drivers: [{ sourceColumn: 'DaysSinceLogin', contribution: 0.4, effect: 'raises-adverse' }] }),
    EffectiveAsOf: new Date('2026-11-03T00:00:00Z'), ComputedAt: new Date('2026-11-03T01:00:00Z'),
  });

  /** The provider of the last {@link RenderLatest}. */
  let RenderedProvider: IMetadataProvider | null = null;

  async function RenderLatest(latest: LatestPredictionRow[], reads: RunViewParams[], failRead?: (p: RunViewParams) => boolean): Promise<PSPredictionsGridComponent> {
    // the engine's cached binding, a typed entity row
    vi.spyOn(PredictiveStudioEngine.Instance, 'ScoringBindingsForPipeline').mockReturnValue([await TestEntityRows.Of(MJMLModelScoringBindingEntity, 'MJ: ML Model Scoring Bindings', scoringBinding)]);
    const runDetails = vi.spyOn(PredictiveStudioEngine.Instance, 'LoadRunDetails');
    const provider = createFakeProvider<ModelRow | LatestPredictionRow>({ runViewResults: (p: RunViewParams) => {
      reads.push(p);
      if (p.EntityName === 'MJ: ML Models') return [churn];
      if (p.EntityName === 'MJ: Latest Feature Values') return latest;
      return [];
    } });
    if (failRead) {
      // the provider's own RunView, typed through the RunView seam the grid reads with
      const runViews = RunView.FromMetadataProvider(provider).ProviderToUse;
      const served = runViews.RunView.bind(runViews);
      Object.assign(provider, {
        RunView: async (p: RunViewParams) => (failRead(p) ? { Success: false, ErrorMessage: 'probe failed', Results: [], RowCount: 0, TotalRowCount: 0 } : served(p)),
      });
    }
    RenderedProvider = provider;
    const fixture = renderComponentFixture(PSPredictionsGridComponent, {
      inputs: { ModelId: churn.ID, Provider: provider },
      providers: [{ provide: NavigationService, useValue: {} }],
    });
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(runDetails).not.toHaveBeenCalled();
    return fixture.componentInstance;
  }

  it('reads the scoring binding and the latest values through the engine of the grid\'s own provider', async () => {
    const reads: RunViewParams[] = [];
    const scoped = vi.spyOn(PredictiveStudioEngine, 'GetProviderInstance').mockReturnValue(PredictiveStudioEngine.Instance);
    await RenderLatest([Latest('r1', 0.9)], reads);
    expect(scoped.mock.calls.length).toBeGreaterThan(0);
    expect(scoped.mock.calls.every(([provider, engineClass]) => provider === RenderedProvider && engineClass === PredictiveStudioEngine)).toBe(true);
  });

  it('a failed probe past the row cap fails the load instead of reporting the rows complete', async () => {
    const cap = Object.getOwnPropertyDescriptor(PredictiveStudioEngine, 'MaxRunDetailRows');
    Object.defineProperty(PredictiveStudioEngine, 'MaxRunDetailRows', { value: 2, configurable: true, writable: true });
    try {
      const reads: RunViewParams[] = [];
      const page = Array.from({ length: 1000 }, (_, i) => Latest(`r${i}`, 0.5));
      const grid = await RenderLatest(page, reads, (p) => p.EntityName === 'MJ: Latest Feature Values' && p.MaxRows === 1);
      expect(grid.LoadError).toContain('probe failed');
    } finally {
      if (cap) Object.defineProperty(PredictiveStudioEngine, 'MaxRunDetailRows', cap);
    }
  });

  it('the predictions grid reads the binding feature from the latest-value entity', async () => {
    const reads: RunViewParams[] = [];
    const grid = await RenderLatest([Latest('r1', 0.9), Latest('r2', 0.2)], reads);
    expect(reads.map((r) => r.EntityName)).toContain('MJ: Latest Feature Values');
    expect(grid.AllRows.map((r) => r.score)).toEqual([0.9, 0.2]);
  });

  it('reads the binding\'s feature on its target entity, Model rows only, past the server cache', async () => {
    const reads: RunViewParams[] = [];
    await RenderLatest([Latest('r1', 0.9)], reads);
    const latestRead = reads.find((r) => r.EntityName === 'MJ: Latest Feature Values');
    expect([latestRead?.ExtraFilter, latestRead?.BypassCache]).toEqual(["EntityID='E-MEMBERS' AND FeatureName='Churn risk' AND Source='Model'", true]);
  });

  /** Two entities a pipeline's bindings can target. */
  const entities = [TestEntityRows.Entity('Members', ['ID'], ['ID'], 'E-MEMBERS'), TestEntityRows.Entity('Others', ['ID'], ['ID'], 'E-OTHERS')];
  type BindingFields = Pick<MJMLModelScoringBindingEntity, 'ID' | 'MLTrainingPipelineID' | 'FeatureName' | 'TargetEntityID' | 'Status'>;
  const zeta: BindingFields = { ID: 'SB-Z', MLTrainingPipelineID: 'P1', FeatureName: 'Zeta risk', TargetEntityID: 'E-OTHERS', Status: 'Active' };
  const alpha: BindingFields = { ID: 'SB-A', MLTrainingPipelineID: 'P1', FeatureName: 'Alpha risk', TargetEntityID: 'E-MEMBERS', Status: 'Active' };

  /** Renders the churn model's grid over `bindings` (in that cache order), opened for `entityName`; returns the grid and its reads. */
  async function RenderBindings(bindings: BindingFields[], entityName: string | null): Promise<{ grid: PSPredictionsGridComponent; reads: RunViewParams[] }> {
    // the engine's cached bindings, typed entity rows
    vi.spyOn(PredictiveStudioEngine.Instance, 'ScoringBindingsForPipeline').mockReturnValue(await TestEntityRows.Many(MJMLModelScoringBindingEntity, 'MJ: ML Model Scoring Bindings', bindings));
    vi.spyOn(PredictiveStudioEngine.Instance, 'LoadRunDetails').mockResolvedValue({ Rows: [], Capped: false });
    const reads: RunViewParams[] = [];
    const provider = createFakeProvider<ModelRow | LatestPredictionRow>({
      runViewResults: (p: RunViewParams) => {
        reads.push(p);
        if (p.EntityName === 'MJ: ML Models') return [churn];
        if (p.EntityName === 'MJ: Latest Feature Values') return [Latest('r1', 0.9)];
        return [];
      },
      entities,
      entityByName: (name: string) => entities.find((e) => e.Name === name),
    });
    const fixture = renderComponentFixture(PSPredictionsGridComponent, {
      inputs: { ModelId: churn.ID, Provider: provider, EntityName: entityName },
      providers: [{ provide: NavigationService, useValue: {} }],
    });
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    return { grid: fixture.componentInstance, reads };
  }

  const latestFilter = (reads: RunViewParams[]): string | undefined => {
    const filter = reads.find((r) => r.EntityName === 'MJ: Latest Feature Values')?.ExtraFilter;
    return typeof filter === 'string' ? filter : undefined;
  };

  it('with no entity named, shows the first Active binding by feature name whatever the cache order, on that binding\'s entity', async () => {
    const { grid, reads } = await RenderBindings([zeta, alpha], null);
    expect(latestFilter(reads)).toBe("EntityID='E-MEMBERS' AND FeatureName='Alpha risk' AND Source='Model'");
    expect(grid.ResolvedEntityName).toBe('Members');
  });

  it('opened for an entity, shows the Active binding on that entity', async () => {
    const { grid, reads } = await RenderBindings([alpha, zeta], 'Others');
    expect(latestFilter(reads)).toBe("EntityID='E-OTHERS' AND FeatureName='Zeta risk' AND Source='Model'");
    expect(grid.ResolvedEntityName).toBe('Others');
  });

  it('opened for an entity no Active binding targets, reads the latest run instead of another entity\'s binding', async () => {
    const { reads } = await RenderBindings([zeta], 'Members');
    expect(latestFilter(reads)).toBeUndefined();
  });

  it('takes the drivers and the scored date from the stored value', async () => {
    const grid = await RenderLatest([Latest('r1', 0.9)], []);
    expect(grid.AllRows[0].drivers.map((d) => [d.Label, d.Up])).toEqual([['Days Since Login', true]]);
    expect(grid.AllRows[0].scoredAtDate?.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });
});

describe('PSPredictionsGridComponent (DOM) — the selection becomes a List the user creates', () => {
  const model: ModelRow & Pick<MJMLModelEntity, 'PipelineID'> = { ID: 'm-churn', PipelineID: 'P1', ProblemType: 'classification', TargetVariable: 'Churned', Lineage: null, OutputSemantics: null };
  const members = TestEntityRows.Entity('Members', ['ID'], ['ID'], 'E-MEMBERS');

  /** A transaction group whose submit the test decides (no provider is reached). */
  class GroupDouble extends TransactionGroupBase {
    public Submits = 0;
    constructor(private readonly submits: boolean) {
      super();
    }
    public override async Submit(): Promise<boolean> {
      this.Submits++;
      return this.submits;
    }
    protected async HandleSubmit(): Promise<TransactionResult[]> {
      return [];
    }
  }

  /** A List whose save only queues it in its group (as a real save in a group does); its ID is the one a new record gets. */
  class ListDouble extends MJListEntity {
    public Saves = 0;
    constructor() {
      super(TestEntityRows.Entity('MJ: Lists', ['ID', 'Name', 'EntityID', 'UserID']));
    }
    public override NewRecord(): boolean {
      this.ID = 'LIST-1';
      return true;
    }
    public override async Save(): Promise<boolean> {
      this.Saves++;
      return true;
    }
  }

  /** A List Detail whose save queues it, or is refused when `queues` is false. */
  class DetailDouble extends MJListDetailEntity {
    constructor(private readonly queues: boolean) {
      super(TestEntityRows.Entity('MJ: List Details', ['ID', 'ListID', 'RecordID', 'Sequence', 'Status']));
    }
    public override async Save(): Promise<boolean> {
      if (this.queues) return true;
      this.RegisterResultHistoryEntry(new BaseEntityResult(false, 'detail refused', 'create'));
      return false;
    }
  }

  type Saved = { List: ListDouble; Details: DetailDouble[]; Group: GroupDouble; Users: Array<UserInfo | undefined>; Opened: string[]; Grid: PSPredictionsGridComponent };

  /** Renders the grid over three run rows, picks the high tier and clicks "Save as list"; resolves once the save settles. */
  async function SaveHighTier(submits = true, detailsQueue = true): Promise<Saved> {
    vi.spyOn(PredictiveStudioEngine.Instance, 'LoadRunDetails').mockResolvedValue({ Rows: [detail('r1', 0.9), detail('r2', 0.8), detail('r3', 0.1)], Capped: false });
    const list = new ListDouble();
    const details: DetailDouble[] = [];
    const users: Array<UserInfo | undefined> = [];
    const opened: string[] = [];
    const group = new GroupDouble(submits);
    const fake = createFakeProvider<ModelRow | { ID: string }>({
      runViewResults: (p: RunViewParams) => (p.EntityName === 'MJ: ML Models' ? [model] : []),
      entityByName: (name: string) => (name === 'Members' ? members : undefined),
    });
    // GetEntityObject<T> is generic and overloaded (a load key or the user second): a typed mock resolves to the List,
    // then one new List Detail per call, and records the user it was given
    const getEntityObject = vi.fn<IMetadataProvider['GetEntityObject']>().mockImplementation(async (entityName: string, second?: CompositeKey | UserInfo) => {
      users.push(second instanceof CompositeKey ? undefined : second);
      if (entityName === 'MJ: Lists') return list;
      const d = new DetailDouble(detailsQueue);
      details.push(d);
      return d;
    });
    const provider = Object.assign(fake, {
      GetEntityObject: getEntityObject,
      CreateTransactionGroup: vi.fn<IMetadataProvider['CreateTransactionGroup']>().mockResolvedValue(group),
    });
    const fixture = renderComponentFixture(PSPredictionsGridComponent, {
      inputs: { ModelId: model.ID, RunId: 'run-1', EntityName: 'Members', Provider: provider },
      providers: [{ provide: NavigationService, useValue: { OpenEntityRecord: (entity: string, key: CompositeKey) => { opened.push(`${entity}:${key.ToURLSegment()}`); return 'tab'; } } }],
    });
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    fixture.componentInstance.SetTier('high');
    fixture.detectChanges();
    (query(fixture, '[data-testid="ps-predictions-save-list"]') as HTMLButtonElement).click();
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    return { List: list, Details: details, Group: group, Users: users, Opened: opened, Grid: fixture.componentInstance };
  }

  it('creates the List of the target entity and one List Detail per shown row, in one transaction group, and opens it', async () => {
    const s = await SaveHighTier();
    expect([s.List.EntityID, s.List.UserID, s.List.TransactionGroup === s.Group, s.List.Saves]).toEqual(['E-MEMBERS', 'test-user-id', true, 1]);
    expect(s.List.Name).toMatch(/^.+: .+ \(\d{4}-\d{2}-\d{2}\)$/);
    expect(s.Details.map((d) => [d.ListID, d.RecordID, d.Sequence, d.Status, d.TransactionGroup === s.Group])).toEqual([
      ['LIST-1', 'r1', 0, 'Active', true],
      ['LIST-1', 'r2', 1, 'Active', true],
    ]);
    expect(s.Group.Submits).toBe(1);
    expect(s.Opened).toEqual(['MJ: Lists:ID|LIST-1']);
    expect(s.Grid.ListMessage).toContain('Saved 2 record(s) as the list');
  });

  it('creates every record as the current user (the user\'s own List permissions decide)', async () => {
    const s = await SaveHighTier();
    expect(s.Users.length).toBe(3);
    expect(s.Users.every((u) => u?.ID === 'test-user-id')).toBe(true);
  });

  it('opens nothing and says why when the group\'s submit fails (nothing was written)', async () => {
    const s = await SaveHighTier(false);
    expect(s.Opened).toEqual([]);
    expect(s.Grid.ListMessage).toMatch(/^Could not save the list: /);
  });

  it('submits nothing when a List Detail is refused before it joins the group', async () => {
    const s = await SaveHighTier(true, false);
    expect([s.Group.Submits, s.Opened]).toEqual([0, []]);
    expect(s.Grid.ListMessage).toBe('Could not save the list: detail refused');
  });
});
