import '@angular/compiler';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import type { CompositeKey, EntityInfo, RunViewParams } from '@memberjunction/core';
import type { ActionParam } from '@memberjunction/actions-base';
import type { MJMLModelEntity, MJMLModelScoringBindingEntity, MJMLOutputBindingEntity, MJUserViewEntity } from '@memberjunction/core-entities';
import type { SemanticsCheckBinding } from '@memberjunction/predictive-studio-core';
import { NavigationService } from '@memberjunction/ng-shared';
import { renderComponentFixture, query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { PredictiveStudioEngine, type PSRunDetailRow } from '../engine/predictive-studio.engine';
import { PSPredictionsGridComponent, type PredictionGridRowsLoadedEvent } from './ps-predictions-grid.component';
import type { LatestPredictionRow } from '../latest-prediction-rows';

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

  async function RenderLatest(latest: LatestPredictionRow[], reads: RunViewParams[]): Promise<PSPredictionsGridComponent> {
    // the engine's cached binding: the double carries only the members the grid reads
    vi.spyOn(PredictiveStudioEngine.Instance, 'ScoringBindingsForPipeline').mockReturnValue([scoringBinding as unknown as MJMLModelScoringBindingEntity]);
    const runDetails = vi.spyOn(PredictiveStudioEngine.Instance, 'LoadRunDetails');
    const provider = createFakeProvider<ModelRow | LatestPredictionRow>({ runViewResults: (p: RunViewParams) => {
      reads.push(p);
      if (p.EntityName === 'MJ: ML Models') return [churn];
      if (p.EntityName === 'MJ: Latest Feature Values') return latest;
      return [];
    } });
    const fixture = renderComponentFixture(PSPredictionsGridComponent, {
      inputs: { ModelId: churn.ID, Provider: provider },
      providers: [{ provide: NavigationService, useValue: {} }],
    });
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(runDetails).not.toHaveBeenCalled();
    return fixture.componentInstance;
  }

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

  it('takes the drivers and the scored date from the stored value', async () => {
    const grid = await RenderLatest([Latest('r1', 0.9)], []);
    expect(grid.AllRows[0].drivers.map((d) => [d.Label, d.Up])).toEqual([['Days Since Login', true]]);
    expect(grid.AllRows[0].scoredAtDate?.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });
});

describe('PSPredictionsGridComponent (DOM) — the selection becomes a List through "Materialize List From View"', () => {
  const model: ModelRow & Pick<MJMLModelEntity, 'PipelineID'> = { ID: 'm-churn', PipelineID: 'P1', ProblemType: 'classification', TargetVariable: 'Churned', Lineage: null, OutputSemantics: null };
  const members = { ID: 'E-MEMBERS', Name: 'Members', PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' } };

  /** A User View double: the fields the grid writes, the save it calls and the delete its failure path calls. */
  class ViewDouble {
    public ID = '';
    public Name = '';
    public EntityID = '';
    public UserID = '';
    public WhereClause: string | null = null;
    public FilterState: string | null = null;
    public CustomWhereClause = false;
    public IsShared = true;
    public IsSaved = false;
    public LatestResult: { CompleteMessage: string } | null = null;
    public Deletes = 0;
    constructor(private readonly saves = true, private readonly deletes = true) {}
    public NewRecord(): boolean { return true; }
    public async Save(): Promise<boolean> {
      if (!this.saves) return false;
      this.ID = 'VIEW-1';
      this.IsSaved = true;
      return true;
    }
    public async Delete(): Promise<boolean> {
      this.Deletes++;
      if (!this.deletes) throw new Error('delete refused');
      this.IsSaved = false;
      return true;
    }
  }

  /** What the action double returns: a created list, a refusal, or success without a list ID. */
  type ActionOutcome = { Success: boolean; Message: string; Params: ActionParam[] };
  const created: ActionOutcome = { Success: true, Message: 'ok', Params: [{ Name: 'CreatedListID', Value: 'LIST-1', Type: 'Output' }] };

  /** Renders the grid over three run rows, picks the high tier and clicks "Save as list"; resolves once the save settles. */
  async function SaveHighTier(view: ViewDouble, outcome: ActionOutcome, runs: Array<{ ActionID: string; Params: ActionParam[] }> = [], opened: string[] = []): Promise<PSPredictionsGridComponent> {
    vi.spyOn(PredictiveStudioEngine.Instance, 'LoadRunDetails').mockResolvedValue({ Rows: [detail('r1', 0.9), detail('r2', 0.8), detail('r3', 0.1)], Capped: false });
    vi.spyOn(PSPredictionsGridComponent.prototype, 'RunListAction').mockImplementation(async (actionId: string, params: ActionParam[]) => {
      runs.push({ ActionID: actionId, Params: params });
      return outcome;
    });
    const fake = createFakeProvider<ModelRow | { ID: string }>({
      runViewResults: (p: RunViewParams) => (p.EntityName === 'MJ: ML Models' ? [model] : p.EntityName === 'MJ: Actions' ? [{ ID: 'ACT-MATERIALIZE' }] : []),
      // the entity double carries only the key members the record filter reads
      entityByName: (name: string) => (name === 'Members' ? (members as unknown as EntityInfo) : undefined),
    });
    // the grid creates its User View through the provider; the double carries only the members the grid calls
    const provider = Object.assign(fake, { GetEntityObject: async () => view as unknown as MJUserViewEntity });
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
    return fixture.componentInstance;
  }

  it('saves the filtered rows as a User View of the target entity and runs the action with its ID', async () => {
    const view = new ViewDouble();
    const opened: string[] = [];
    const runs: Array<{ ActionID: string; Params: ActionParam[] }> = [];
    await SaveHighTier(view, created, runs, opened);
    // not a custom clause: MJ refuses CustomWhereClause from a non-Owner user; a plain view keeps a WhereClause set before its first save
    expect([view.EntityID, view.UserID, view.WhereClause, view.CustomWhereClause, view.IsShared]).toEqual(['E-MEMBERS', 'test-user-id', "ID IN ('r1','r2')", false, false]);
    // every value is a string: the GraphQL action input types Value as String, so a boolean is refused on the wire
    expect(runs.map((r) => [r.ActionID, r.Params.map((p) => [p.Name, p.Value])])).toEqual([
      ['ACT-MATERIALIZE', [['ViewID', 'VIEW-1'], ['ListName', view.Name], ['RememberLineage', 'true']]],
    ]);
    expect(opened).toEqual(['MJ: Lists:ID|LIST-1']);
    expect(view.Deletes).toBe(0);
  });

  it('stores the selection as the view\'s FilterState too, so a later recompile of the saved view keeps the same records', async () => {
    const view = new ViewDouble();
    await SaveHighTier(view, created);
    expect(JSON.parse(view.FilterState || 'null')).toEqual({ logic: 'or', filters: [{ field: 'ID', operator: 'in', value: ['r1', 'r2'] }] });
  });

  it.each([
    ['the action is refused', { Success: false, Message: 'refused', Params: [] }, 'refused'],
    ['the action creates no list', { Success: true, Message: '', Params: [] }, 'the action created no list'],
  ])('deletes the private User View it created when %s', async (_case: string, outcome: ActionOutcome, reason: string) => {
    const view = new ViewDouble();
    const grid = await SaveHighTier(view, outcome);
    expect([view.Deletes, view.IsSaved]).toEqual([1, false]);
    expect(grid.ListMessage).toBe(`Could not save the list: ${reason}`);
  });

  it('keeps the action\'s failure as the message when the cleanup delete fails too', async () => {
    const view = new ViewDouble(true, false);
    const grid = await SaveHighTier(view, { Success: false, Message: 'refused', Params: [] });
    expect(view.Deletes).toBe(1);
    expect(grid.ListMessage).toBe('Could not save the list: refused');
  });

  it('deletes nothing when the view itself was not saved', async () => {
    const view = new ViewDouble(false);
    const grid = await SaveHighTier(view, created);
    expect(view.Deletes).toBe(0);
    expect(grid.ListMessage).toContain('the selection\'s view was not saved');
  });
});

describe('PSPredictionsGridComponent.SelectionFilterState', () => {
  const single = { PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' } } as unknown as EntityInfo;

  it('puts at most 500 IDs in one `in` rule (the filter compiler\'s limit) and ORs the chunks', () => {
    const ids = Array.from({ length: 1201 }, (_v, i) => `id-${i}`);
    const state = PSPredictionsGridComponent.SelectionFilterState(single, ids);
    expect(state.logic).toBe('or');
    expect(state.filters.map((f) => ('value' in f && Array.isArray(f.value) ? f.value.length : -1))).toEqual([500, 500, 201]);
  });

  it('expands a composite key to an AND of `eq` rules per record', () => {
    const composite = {
      PrimaryKeys: [{ Name: 'A' }, { Name: 'B' }],
      FirstPrimaryKey: { Name: 'A' },
      Fields: [{ Name: 'A' }, { Name: 'B' }],
    } as unknown as EntityInfo;
    const state = PSPredictionsGridComponent.SelectionFilterState(composite, ['A|1||B|x']);
    expect(state).toEqual({ logic: 'or', filters: [{ logic: 'and', filters: [{ field: 'A', operator: 'eq', value: '1' }, { field: 'B', operator: 'eq', value: 'x' }] }] });
  });
});
