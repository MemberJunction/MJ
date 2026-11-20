import '@angular/compiler';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, Subject } from 'rxjs';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import { ResourceData, type MJListDetailEntity, type MJListEntity, type MJMLModelEntity, type MJMLModelScoringBindingEntity, type MJMLOutputBindingEntity, type MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, CreateFakeProvider, Query } from '@memberjunction/ng-test-utils';
import { AtRiskRules, GateRules, TRAINING_RUN_RESULTS_SCHEMA, TracedNumbers, type AtRiskRow, type GateDecision, type SemanticsCheckBinding, type StoredGateRecord, type TrainerRequestConfig } from '@memberjunction/predictive-studio-core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSPredictionsGridComponent, type PredictionGridRowsLoadedEvent } from '../components/ps-predictions-grid.component';
import type { LatestPredictionRow } from '../latest-prediction-rows';
import { PSPredictionsResourceComponent } from './ps-predictions-resource.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for the Predictions workspace (<mj-ps-predictions-resource>): the at-risk rows come from the embedded
 * grid's RowsLoaded event (the resource never reads the run itself), the capped notice, the model-switch reset, and the
 * "Send to a list" result line. The page chrome, the splitter and the grid are stubs; the engine is a double.
 */

@Component({ standalone: true, selector: 'mj-page-header-interior', template: '<ng-content></ng-content>' })
class PageHeaderInteriorStub {
  @Input() Title = '';
  @Input() Subtitle = '';
}

@Component({ standalone: true, selector: 'mj-page-body-interior', template: '<ng-content></ng-content>' })
class PageBodyInteriorStub {
  @Input() Flex = false;
  @Input() Padding = true;
}

@Component({ standalone: true, selector: 'as-split', template: '<ng-content></ng-content>' })
class SplitStub {
  @Input() direction = '';
  @Input() unit = '';
  @Input() gutterSize = 0;
  @Output() dragEnd = new EventEmitter<{ sizes: number[] }>();
}

@Component({ standalone: true, selector: 'as-split-area', template: '<ng-content></ng-content>' })
class SplitAreaStub {
  @Input() size = 0;
  @Input() minSize = 0;
  @Input() maxSize = 0;
}

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub {
  @Input() text = '';
  @Input() size = '';
}

/** Stands in for <ps-predictions-grid>: records its run input and lets the test emit its outputs. */
@Component({ standalone: true, selector: 'ps-predictions-grid', template: '<div data-testid="grid-stub"></div>' })
class GridStub {
  @Input() ModelId: string | null = null;
  @Input() RunId: string | null = null;
  @Input() Surface = '';
  @Input() Provider: IMetadataProvider | null = null;
  @Input() Title: string | null = null;
  @Input() EntityName: string | null = null;
  @Input() ProblemType: string | null = null;
  @Input() Height = '';
  @Output() RowsLoaded = new EventEmitter<PredictionGridRowsLoadedEvent>();
  @Output() RowsLoadFailed = new EventEmitter<string>();
}

const MODEL_ID = 'M0000000-0000-4000-8000-000000000001';
const ENTITY_ID = 'E0000000-0000-4000-8000-000000000001';

const model = {
  ID: MODEL_ID,
  Status: 'Published',
  ProblemType: 'classification',
  TargetVariable: 'Renewed',
  HoldoutMetrics: JSON.stringify({ AUC: 0.86 }),
  Metrics: JSON.stringify({ AUC: 0.9 }),
  Lineage: null,
  FeatureImportance: null,
  PipelineID: 'P1',
  __mj_UpdatedAt: new Date('2026-10-01T00:00:00Z'),
} as unknown as MJMLModelEntity;

const SHIPPED: GateDecision = { outcome: 'model', branch: 'a:Q15-only-model-beats-dummy', shipped: 'xgb', shippedRole: 'model', note: null };
const NO_SIGNAL: GateDecision = { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null };
const KEEP_GLM: GateDecision = { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null };

/** What a stored run may hold besides its decision: other intervals, and the trainer request naming the candidates' drivers. */
interface StoredResultsOptions {
  readonly Intervals?: Partial<StoredGateRecord['intervals']>;
  readonly TrainerRequest?: TrainerRequestConfig | null;
  /** The stored reason; absent, a fixed sentence that quotes no number. */
  readonly Reason?: StoredGateRecord['reason'];
}

/** The `ValidationResults` a unit training run stores, with this gate decision measured on 1,205 holdout rows. */
function storedResults(decision: GateDecision, o: StoredResultsOptions = {}): string {
  const gate: StoredGateRecord = {
    evaluationProtocolId: 'EP-1', margin: 0, primaryMetric: 'log-loss', holdoutRows: 1205,
    intervals: { modelName: 'xgb', modelVsDummy: { value: 0.0177, lower: 0.0098, upper: 0.0254 }, modelVsBestSimple: null, memberVsDummy: {}, memberScores: {}, deliveredMember: null, ...o.Intervals },
    guards: { taskKind: 'binary', holdoutClassCounts: { '0': 900, '1': 305 }, modelAucInterval: { level: 0.95, lower: 0.6, upper: 0.7 }, minMinorityClassRows: 20 },
    transcribed: decision, decision, guardRefusal: null,
    reason: o.Reason || { code: decision.outcome === 'no-signal' ? 'nothing-beats-dummy' : 'only-model-beats-dummy', text: decision.outcome === 'no-signal' ? 'Nothing beats the flat guess.' : 'The model beats the flat guess.' },
    incumbentDiff: null, sliceCoverage: { missingSubgroups: [], missingPeriods: [], slicesWithoutInterval: 0 },
  };
  return JSON.stringify({
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 1205, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 1205, dataCutoff: '2026-07-30' },
    trainer: null, trainerRequest: o.TrainerRequest || null, carve: null, gate,
  });
}

/**
 * A run that kept the GLM while its finalist `lr-tuned` was a logistic-regression candidate (the request names its
 * driver); the comparison between them is not 0 [0, 0].
 */
function keptGlmResults(): string {
  return storedResults(KEEP_GLM, {
    Intervals: { modelName: 'lr-tuned', modelVsBestSimple: { value: 0.004, lower: -0.001, upper: 0.009 }, memberVsDummy: { glm: { value: 0.0239, lower: 0.011, upper: 0.036 } }, memberScores: { glm: 0.3652 } },
    TrainerRequest: {
      evaluationProtocolId: 'EP-1', seed: 7, threads: 1, timeoutSeconds: 600, maxRetries: 0,
      candidates: [{ name: 'lr-tuned', algorithmId: 'A-1', driverKey: 'logistic_regression', hyperparameters: {} }],
    },
  });
}

/** The engine members the workspace reads. `LoadRunDetails` must never be called: the grid reads the run. */
/** The scoring binding fields the embedded grid reads from the engine's cache. */
type ScoringBindingDouble = Pick<MJMLModelScoringBindingEntity, 'ID' | 'MLTrainingPipelineID' | 'FeatureName' | 'TargetEntityID' | 'Status'>;

function fakeEngine(validationResults: string | null = storedResults(SHIPPED), lineage: string | null = null) {
  const published = { ...model, Lineage: lineage } as MJMLModelEntity;
  return {
    Config: vi.fn(async () => undefined),
    Models: [published],
    Sessions: [],
    PublishedModels: [published],
    // newest first, as the engine loads them: the older run of the same model must not be the one the card reads
    TrainingRuns: [
      { ID: 'run-new', ResultingModelID: MODEL_ID.toLowerCase(), ValidationResults: validationResults },
      { ID: 'run-old', ResultingModelID: MODEL_ID, ValidationResults: storedResults(NO_SIGNAL) },
    ],
    Pipelines: [{ ID: 'P1', TargetEntityID: ENTITY_ID } as unknown as MJMLTrainingPipelineEntity],
    ModelDisplayName: () => 'Who will renew?',
    LoadRecentRunsForModel: vi.fn(async () => [{ ID: 'run-1' }]),
    LoadRunDetails: vi.fn(async () => ({ Rows: [], Capped: false })),
    // the embedded grid reads its model pipeline's scoring bindings from the engine's cache
    ScoringBindingsForPipeline: vi.fn((): ScoringBindingDouble[] => []),
  };
}

function fakeNavigation() {
  return {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: () => of({}),
    UpdateTabQueryParams: vi.fn(),
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
  };
}

const row = (id: string, riskPct: number): AtRiskRow => {
  const band = AtRiskRules.RiskBandFor(riskPct / 100);
  const display = AtRiskRules.RiskBandDisplayFor(band);
  return { RecordID: id, Label: null, Score: 1 - riskPct / 100, RiskPct: riskPct, Class: null, Band: band, Status: display.Label, BadgeColor: display.BadgeColor, Icon: display.Icon, Drivers: null };
};

const settle = async (fixture: ComponentFixture<PSPredictionsResourceComponent>): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
};

async function renderCatalog(provider: IMetadataProvider, validationResults?: string | null, lineage: string | null = null, grid: typeof GridStub | typeof PSPredictionsGridComponent = GridStub) {
  const engine = fakeEngine(validationResults, lineage);
  vi.spyOn(PredictiveStudioEngine, 'GetProviderInstance').mockReturnValue(engine as unknown as PredictiveStudioEngine);
  const fixture = RenderComponentFixture(PSPredictionsResourceComponent, {
    imports: [MJButtonDirective, PageHeaderInteriorStub, PageBodyInteriorStub, SplitStub, SplitAreaStub, LoadingStub, grid],
    declarations: [PSPredictionsResourceComponent],
    providers: [{ provide: NavigationService, useValue: fakeNavigation() }],
    setup: (instance) => {
      instance.Provider = provider;
      instance.Data = new ResourceData({ Configuration: { tabId: 'predictions-tab', resourceType: 'Custom', driverClass: 'PredictiveStudioPredictionsResource' } });
      instance.LoadCompleteEvent = vi.fn();
    },
  });
  await settle(fixture);
  return { fixture, resource: fixture.componentInstance, engine };
}

async function renderWorkspace(provider: IMetadataProvider = CreateFakeProvider({ entities: [{ ID: ENTITY_ID, Name: 'Members' }] })) {
  const { fixture, resource, engine } = await renderCatalog(provider);
  resource.Open(resource.Cards[0]);
  await settle(fixture);
  return { fixture, resource, engine };
}

const defaultProvider = (): IMetadataProvider => CreateFakeProvider({ entities: [{ ID: ENTITY_ID, Name: 'Members' }] });

/** The grid stub the workspace rendered, or null. */
const gridStub = (fixture: ComponentFixture<PSPredictionsResourceComponent>): GridStub | null => {
  const el = fixture.debugElement.query((d) => d.componentInstance instanceof GridStub);
  return el ? (el.componentInstance as GridStub) : null;
};

afterEach(() => vi.restoreAllMocks());

/** The `MJ: ML Output Bindings` fields the embedded grid reads. */
type BindingRow = Pick<MJMLOutputBindingEntity, 'ID' | 'ModelID' | 'Surface' | 'SortsBy' | 'DriverDirectionRelativeTo' | 'Label'>;

/** The model fields the embedded grid reads. */
type GridModelRow = Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'ProblemType' | 'TargetVariable' | 'Lineage' | 'OutputSemantics'>;

/** What {@link RenderResource} renders: the model, its at-risk-list binding row's fields under test, the latest run's scores. */
interface RenderResourceOptions {
  model: GridModelRow;
  binding: Partial<SemanticsCheckBinding>;
  scores: number[];
}

/** The latest Champion Model value of `recordId` for a model whose class order is ['true', 'false']: the score is P(false). */
const latestValue = (recordId: string, score: number): LatestPredictionRow => ({
  ID: `LV-${recordId}`, RecordID: recordId, ValueText: 'false', ValueNumeric: score, Confidence: score,
  ValueJSON: JSON.stringify({ Probabilities: { true: 1 - score, false: score }, Drivers: [] }),
  EffectiveAsOf: new Date('2026-10-01T00:00:00Z'), ComputedAt: new Date('2026-10-01T00:00:00Z'),
});

/**
 * Opens the prediction in the workspace with the real embedded grid (appended to `host`): the provider serves the model
 * and its at-risk-list binding row, the latest run holds `scores` in that stored order.
 */
async function RenderResource(host: HTMLElement, options: RenderResourceOptions): Promise<{ Reads: RunViewParams[]; Engine: ReturnType<typeof fakeEngine> }> {
  const reads: RunViewParams[] = [];
  const binding: BindingRow = {
    ID: 'B-list', ModelID: options.model.ID, Surface: options.binding.Surface || 'at-risk-list', SortsBy: options.binding.SortsBy || 'adverse-probability-desc',
    DriverDirectionRelativeTo: options.binding.DriverDirectionRelativeTo || 'adverse-class', Label: options.binding.Label || 'false risk',
  };
  const served = (p: RunViewParams): Array<GridModelRow | BindingRow | LatestPredictionRow> => {
    reads.push(p);
    if (p.EntityName === 'MJ: ML Models') return [options.model];
    if (p.EntityName === 'MJ: Latest Feature Values') return options.scores.map((score, i) => latestValue(`r${i}`, score));
    if (p.EntityName === 'MJ: ML Output Bindings') return (typeof p.ExtraFilter === 'string' ? p.ExtraFilter : '').includes(`Surface='${binding.Surface}'`) ? [binding] : [];
    return [];
  };
  const provider = CreateFakeProvider<GridModelRow | BindingRow | LatestPredictionRow>({ entities: [{ ID: ENTITY_ID, Name: 'Members' }], runViewResults: served });
  const { fixture, resource, engine } = await renderCatalog(provider, undefined, null, PSPredictionsGridComponent);
  // the engine's cached scoring binding of the model's pipeline: the double carries only the members the grid reads
  engine.ScoringBindingsForPipeline.mockReturnValue([{ ID: 'SB1', MLTrainingPipelineID: options.model.PipelineID || '', FeatureName: 'Renewal risk', TargetEntityID: ENTITY_ID, Status: 'Active' }]);
  resource.Open(resource.Cards[0]);
  await settle(fixture);
  await settle(fixture);
  host.appendChild(fixture.nativeElement);
  return { Reads: reads, Engine: engine };
}

/** The scores of the at-risk list's rows as the embedded grid shows them, top row first. */
const AtRiskRowScores = (host: HTMLElement): number[] =>
  Array.from(host.querySelectorAll('[data-testid="ps-atrisk-list"] .ag-center-cols-container .ag-row'))
    .sort((a, b) => Number(a.getAttribute('row-index')) - Number(b.getAttribute('row-index')))
    .map((r) => Number(r.querySelector('[data-testid="ps-score-cell"]')?.getAttribute('data-score')));

/** The open prediction's at-risk-list binding row with `sortsBy`. */
const atRiskListBinding = (sortsBy: SemanticsCheckBinding['SortsBy']): SemanticsCheckBinding => ({
  BindingID: 'B-list', Surface: 'at-risk-list', SortsBy: sortsBy, DriverDirectionRelativeTo: sortsBy === 'none' ? 'raw-contribution' : 'adverse-class', Label: sortsBy === 'none' ? 'Predicted class' : 'false risk',
});

/** A List Detail double: the group it joined, its latest result, and a save that queues it (or refuses it). */
interface ListDetailDouble { ListID: string; RecordID: string; TransactionGroup: object | null; LatestResult: { CompleteMessage: string }; Save: () => Promise<boolean> }

/**
 * A provider whose List saves and whose List Details join one transaction group the test controls: `submit` decides the
 * group's outcome and `queues(i)` whether the i-th detail's save queues it.
 */
function listProvider(submit: () => Promise<boolean>, queues: (i: number) => boolean = () => true) {
  const Details: ListDetailDouble[] = [];
  const Submit = vi.fn(submit);
  const Group = { Submit };
  const base = CreateFakeProvider({ entities: [{ ID: ENTITY_ID, Name: 'Members' }] });
  const Provider = {
    ...base,
    CreateTransactionGroup: vi.fn(async () => Group),
    GetEntityObject: vi.fn(async (entityName: string) => {
      if (entityName === 'MJ: Lists') return { ID: 'L1', Name: '', Save: async () => true } as unknown as MJListEntity;
      const i = Details.length;
      const d: ListDetailDouble = { ListID: '', RecordID: '', TransactionGroup: null, LatestResult: { CompleteMessage: `detail ${i} refused` }, Save: async () => queues(i) };
      Details.push(d);
      return d as unknown as MJListDetailEntity;
    }),
  } as unknown as IMetadataProvider;
  return { Provider, Group, Submit, Details };
}

/** Loads 250 records at or above the list's risk floor (plus 10 below it) and sends them to a list. */
async function sendAtRisk(fixture: ComponentFixture<PSPredictionsResourceComponent>, resource: PSPredictionsResourceComponent, binding: SemanticsCheckBinding | null = null): Promise<void> {
  const rows = [...Array.from({ length: 250 }, (_, i) => row(`hi-${i}`, 80)), ...Array.from({ length: 10 }, (_, i) => row(`lo-${i}`, 10))];
  gridStub(fixture)?.RowsLoaded.emit({ Rows: rows, Capped: false, Binding: binding });
  await settle(fixture);
  await resource.SendToList();
  fixture.detectChanges();
}

describe('PSPredictionsResourceComponent (DOM) — trust renders the stored gate decision', () => {
  it("a shipped model's card shows the outcome title and the comparison with the flat guess, and opens", async () => {
    const { fixture } = await renderCatalog(defaultProvider());
    const card = Query(fixture, '[data-testid="ps-prediction-card"]');
    expect(card?.querySelector('[data-testid="ps-trust-badge"]')?.textContent?.trim()).toBe('Ships — the model beats the flat guess');
    expect(card?.querySelector('[data-testid="ps-trust-badge"]')?.className).toContain('trust-ships');
    expect(card?.querySelector('.ps-biz-card-line')?.textContent?.trim()).toBe('Beats the flat guess by 0.0177 [0.0098, 0.0254] (log-loss).');
    expect(card?.querySelector('[data-testid="ps-open-prediction"]')).not.toBeNull();
  });

  it('the workspace banner shows the title, the headline, the stored reason and the holdout the decision was measured on', async () => {
    const { fixture } = await renderWorkspace();
    const banner = Query(fixture, '[data-testid="ps-trust-banner"]');
    expect(banner?.className).toContain('trust-ships');
    expect(banner?.querySelector('.ps-trust-grade')?.textContent?.trim()).toBe('Ships — the model beats the flat guess');
    expect(banner?.querySelector('.ps-trust-line')?.textContent?.trim()).toBe('Beats the flat guess by 0.0177 [0.0098, 0.0254] (log-loss).');
    expect(banner?.querySelector('.ps-trust-explain')?.textContent?.trim()).toBe('The model beats the flat guess.');
    expect(banner?.querySelector('.ps-trust-evidence')?.textContent?.trim()).toBe('Checked against 1,205 past records it had never seen.');
    expect(banner?.querySelector('.fa-star')).toBeNull();
  });

  it("reads the model's lineage: a kept GLM fitted with the finalist's driver makes no lost-comparison claim", async () => {
    const { fixture } = await renderCatalog(defaultProvider(), keptGlmResults(), JSON.stringify({ shippedMember: 'glm', shippedDriver: 'logistic_regression' }));
    expect(Query(fixture, '[data-testid="ps-prediction-card"] .ps-biz-card-line')?.textContent?.trim())
      .toBe('A simple baseline (glm) beats the flat guess by 0.0239 [0.0110, 0.0360] (log-loss).');
  });

  it('without the shipped driver in the lineage, the same kept GLM keeps the lost-comparison claim', async () => {
    const { fixture } = await renderCatalog(defaultProvider(), keptGlmResults(), null);
    expect(Query(fixture, '[data-testid="ps-prediction-card"] .ps-biz-card-line')?.textContent?.trim())
      .toBe('A simple baseline (glm) beats the flat guess by 0.0239 [0.0110, 0.0360] (log-loss); the trained model did not beat it.');
  });

  it('a published model whose run stores no-signal does not open, and says why', async () => {
    const { fixture } = await renderCatalog(defaultProvider(), storedResults(NO_SIGNAL));
    const card = Query(fixture, '[data-testid="ps-prediction-card"]');
    expect(card?.querySelector('[data-testid="ps-trust-badge"]')?.textContent?.trim()).toBe('No signal — not usable');
    expect(card?.querySelector('[data-testid="ps-trust-badge"]')?.className).toContain('trust-none');
    expect(card?.querySelector('.ps-biz-card-line')?.textContent?.trim()).toBe('Nothing beats the flat guess.');
    expect(card?.querySelector('[data-testid="ps-open-prediction"]')).toBeNull();
  });

  it("every number the trust banner renders is a traced number of the card's run, and recomputes from the run's stored JSON", async () => {
    const decision: GateDecision = { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null };
    const intervals = { modelName: 'xgb', modelVsDummy: { value: 0.02, lower: 0.01, upper: 0.03 }, modelVsBestSimple: { value: 0.006, lower: -0.001, upper: 0.011 }, memberVsDummy: {}, memberScores: {}, deliveredMember: null };
    const reason = GateRules.DescribeGate(intervals, { Transcribed: decision, Decision: decision, GuardRefusal: null }, 'log-loss');
    expect(reason.code).toBe('model-beats-best-simple');
    const json = storedResults(decision, { Intervals: intervals, Reason: reason });
    const { fixture, resource } = await renderCatalog(defaultProvider(), json);
    resource.Open(resource.Cards[0]);
    await settle(fixture);
    const card = resource.Selected;
    expect(card?.runId).toBe('run-new');
    if (card === null) return;
    const numbers = resource.TrustNumbers(card);
    const vsDummy = ['value', 'lower', 'upper'].map((k) => `$.gate.intervals.modelVsDummy.${k}`);
    const vsBest = ['value', 'lower', 'upper'].map((k) => `$.gate.intervals.modelVsBestSimple.${k}`);
    expect(numbers.map((n) => [n.Text, n.Source.Path])).toEqual([
      ['1,205', '$.gate.holdoutRows'],
      ['0.0200', vsDummy[0]], ['0.0100', vsDummy[1]], ['0.0300', vsDummy[2]],
      ['0.0200', vsDummy[0]], ['0.0100', vsDummy[1]], ['0.0300', vsDummy[2]],
      ['0.0060', vsBest[0]], ['-0.0010', vsBest[1]], ['0.0110', vsBest[2]],
    ]);
    const banner = Query(fixture, '[data-testid="ps-trust-banner"]');
    const rendered = ['.ps-trust-evidence', '.ps-trust-line', '.ps-trust-explain'].map((sel) => banner?.querySelector(sel)?.textContent || '').join(' ');
    const tokens = rendered.match(/-?\d[\d,]*(?:\.\d+)?%?/g) || [];
    expect(tokens).toEqual(['1,205', '0.0200', '0.0100', '0.0300', '0.0200', '0.0100', '0.0300', '0.0060', '-0.0010', '0.0110']);
    const texts = new Set(numbers.map((n) => n.Text));
    for (const token of tokens) expect(texts.has(token)).toBe(true);
    for (const n of numbers) {
      expect(n.Source).toEqual({ EntityName: 'MJ: ML Training Runs', RecordID: 'run-new', Path: n.Source.Path });
      expect(TracedNumbers.Recompute(n, json)).toBeCloseTo(n.Value, 12);
    }
  });

  it('a card without a training run renders the trust line without a count and traces no number', async () => {
    const { resource } = await renderCatalog(defaultProvider());
    const cardWithoutRun = { ...resource.Cards[0], runId: null };
    expect(resource.Evidence(cardWithoutRun)).toBe('Checked against past records it had never seen.');
    expect(resource.TrustNumbers(cardWithoutRun)).toEqual([]);
  });

  it('a published model whose run stores no gate decision is not evaluated and does not open', async () => {
    const { fixture, resource } = await renderCatalog(defaultProvider(), null);
    const card = Query(fixture, '[data-testid="ps-prediction-card"]');
    expect(card?.querySelector('[data-testid="ps-trust-badge"]')?.textContent?.trim()).toBe('Not evaluated yet');
    expect(card?.querySelector('[data-testid="ps-trust-badge"]')?.className).toContain('trust-unmeasured');
    expect(card?.querySelector('[data-testid="ps-open-prediction"]')).toBeNull();
    resource.Open(resource.Cards[0]);
    expect(resource.View).toBe('catalog');
  });
});

describe('PSPredictionsResourceComponent (DOM) — at-risk workspace', () => {
  it('leaves the grid to read the latest values and takes its rows from RowsLoaded, never reading a run itself', async () => {
    const { fixture, resource, engine } = await renderWorkspace();
    const grid = gridStub(fixture);
    expect(grid?.RunId).toBeNull();
    expect(engine.LoadRecentRunsForModel).not.toHaveBeenCalled();
    expect(grid?.Surface).toBe('at-risk-list');
    grid?.RowsLoaded.emit({ Rows: [row('a', 90), row('b', 20)], Capped: false, Binding: null });
    await settle(fixture);
    expect(resource.AtRiskRows.map((r) => r.RecordID)).toEqual(['a', 'b']);
    expect(resource.AtRiskLoading).toBe(false);
    expect(engine.LoadRunDetails).not.toHaveBeenCalled();
    expect(Query(fixture, '[data-testid="ps-atrisk-capped"]')).toBeNull();
  });

  it('shows the capped notice without promising list coverage', async () => {
    const { fixture } = await renderWorkspace();
    gridStub(fixture)?.RowsLoaded.emit({ Rows: [row('a', 90)], Capped: true, Binding: null });
    await settle(fixture);
    expect(Query(fixture, '[data-testid="ps-atrisk-capped"]')?.textContent?.trim()).toBe(
      'The latest run has more than 50,000 predictions; this list shows the first 50,000.',
    );
  });

  it('resets the rows and the capped notice when the prediction is reopened', async () => {
    const { fixture, resource } = await renderWorkspace();
    gridStub(fixture)?.RowsLoaded.emit({ Rows: [row('a', 90)], Capped: true, Binding: null });
    await settle(fixture);
    resource.BackToCatalog();
    resource.Open(resource.Cards[0]);
    fixture.detectChanges();
    expect(resource.AtRiskRows).toEqual([]);
    expect(resource.AtRiskCapped).toBe(false);
    expect(Query(fixture, '[data-testid="ps-atrisk-capped"]')).toBeNull();
  });

  it('reports how many of the qualifying records "Send to a list" added', async () => {
    const lists = listProvider(async () => true);
    const { fixture, resource } = await renderWorkspace(lists.Provider);
    await sendAtRisk(fixture, resource);
    expect(lists.Details.length).toBe(200);
    expect(Query(fixture, '[data-testid="ps-list-result"]')?.textContent).toContain('Added 200 of 250 at-risk records (highest risk first)');
  });

  it("a list whose at-risk-list binding sorts by 'none' cannot be sent: the control is off, says why, and nothing is written", async () => {
    const lists = listProvider(async () => true);
    const { fixture, resource } = await renderWorkspace(lists.Provider);
    await sendAtRisk(fixture, resource, atRiskListBinding('none'));
    const button = Query(fixture, '[data-testid="ps-act-list"]');
    expect(button instanceof HTMLButtonElement && button.disabled).toBe(true);
    expect(Query(fixture, '[data-testid="ps-act-list-reason"]')?.textContent?.trim()).toBe('This list is not ranked by risk: its At-Risk list binding sorts by none.');
    expect(button?.getAttribute('title')).toBe(AtRiskRules.NoRankingReason);
    expect([lists.Details.length, lists.Submit.mock.calls.length, Query(fixture, '[data-testid="ps-list-result"]')]).toEqual([0, 0, null]);
    expect(vi.mocked(lists.Provider.GetEntityObject)).not.toHaveBeenCalled();
  });

  it("a list whose at-risk-list binding sorts by adverse probability is sent as before", async () => {
    const lists = listProvider(async () => true);
    const { fixture, resource } = await renderWorkspace(lists.Provider);
    gridStub(fixture)?.RowsLoaded.emit({ Rows: [row('a', 90)], Capped: false, Binding: atRiskListBinding('adverse-probability-desc') });
    await settle(fixture);
    const button = Query(fixture, '[data-testid="ps-act-list"]');
    expect(button instanceof HTMLButtonElement && button.disabled).toBe(false);
    expect(Query(fixture, '[data-testid="ps-act-list-reason"]')).toBeNull();
    await sendAtRisk(fixture, resource, atRiskListBinding('adverse-probability-desc'));
    expect(lists.Details.length).toBe(200);
  });

  it('queues every member on one transaction group and submits it once, so the adds take one round trip', async () => {
    const lists = listProvider(async () => true);
    const { fixture, resource } = await renderWorkspace(lists.Provider);
    await sendAtRisk(fixture, resource);
    expect([lists.Submit.mock.calls.length, lists.Details.every((d) => d.TransactionGroup === lists.Group)]).toEqual([1, true]);
  });

  it('counts nothing added when the batch fails, naming the first error', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lists = listProvider(async () => false);
    const { fixture, resource } = await renderWorkspace(lists.Provider);
    await sendAtRisk(fixture, resource);
    expect(Query(fixture, '[data-testid="ps-list-result"]')?.textContent).toContain('Added 0 of 200 records to “At-Risk: ');
    expect(Query(fixture, '[data-testid="ps-list-result"]')?.textContent).toContain('200 failed to add (first error: detail 0 refused)');
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringContaining('sendToList: 200/200 adds failed. First: detail 0 refused')]);
  });

  it('counts a member refused before it joined the batch as failed, and the rest as added', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lists = listProvider(async () => true, (i) => i !== 3);
    const { fixture, resource } = await renderWorkspace(lists.Provider);
    await sendAtRisk(fixture, resource);
    expect(Query(fixture, '[data-testid="ps-list-result"]')?.textContent).toContain('Added 199 of 200 records');
    expect(Query(fixture, '[data-testid="ps-list-result"]')?.textContent).toContain('1 failed to add (first error: detail 3 refused)');
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringContaining('sendToList: 1/200 adds failed. First: detail 3 refused')]);
  });
});

describe('PSPredictionsResourceComponent (DOM) — the co-pilot agent lookup', () => {
  it("loads the AI engine through the workspace's provider", async () => {
    const provider = defaultProvider();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const config = vi.spyOn(AIEngineBase.Instance, 'Config').mockResolvedValue(undefined);
    const { resource } = await renderCatalog(provider);
    // the lookup every co-pilot entry point runs; called directly so the chat area (not stubbed here) stays closed
    await resource['ensureModelDevAgentResolved']();
    expect(config.mock.calls.map((c) => c[2] === provider)).toEqual([true]);
    // the stubbed engine holds no agents, so the lookup logs that chat falls back to default routing
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringContaining("'Model Development Agent' not found")]);
  });
});

describe('PSPredictionsResourceComponent (DOM) — the At-Risk list from its binding row', () => {
  /** A model named for renewal whose adverse class is `Renewed = false`: the score is P(not renewed), so it is not inverted. */
  const renewalNamed: GridModelRow = {
    ID: MODEL_ID, PipelineID: 'P1', ProblemType: 'classification', TargetVariable: 'Renewed', Lineage: null,
    OutputSemantics: JSON.stringify({ task: { kind: 'binary', classOrder: ['true', 'false'], adverseIndex: 1 } }),
  };
  let fixture: HTMLElement;
  beforeEach(() => {
    fixture = document.createElement('div');
    document.body.appendChild(fixture);
  });
  afterEach(() => fixture.remove());

  it('sorts the At-Risk list by the binding row', async () => {
    await RenderResource(fixture, { model: renewalNamed, binding: { Surface: 'at-risk-list', SortsBy: 'adverse-probability-desc' }, scores: [0.9, 0.2, 0.6] });
    expect(AtRiskRowScores(fixture)).toEqual([0.9, 0.6, 0.2]);   // adverse probability, highest first
  });

  it("reads the At-Risk list from MJ: Latest Feature Values for the binding's feature, never a run's details", async () => {
    const { Reads, Engine } = await RenderResource(fixture, { model: renewalNamed, binding: { Surface: 'at-risk-list', SortsBy: 'adverse-probability-desc' }, scores: [0.9] });
    expect(Reads.find((p) => p.EntityName === 'MJ: Latest Feature Values')?.ExtraFilter).toBe(`EntityID='${ENTITY_ID}' AND FeatureName='Renewal risk' AND Source='Model'`);
    expect(Engine.LoadRunDetails).not.toHaveBeenCalled();
  });

  it("keeps the stored scoring order when the binding row sorts by 'none'", async () => {
    await RenderResource(fixture, { model: renewalNamed, binding: { Surface: 'at-risk-list', SortsBy: 'none' }, scores: [0.9, 0.2, 0.6] });
    expect(AtRiskRowScores(fixture)).toEqual([0.9, 0.2, 0.6]);
  });
});
