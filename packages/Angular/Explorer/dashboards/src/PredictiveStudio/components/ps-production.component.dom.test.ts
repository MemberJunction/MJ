import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import type { CompositeKey, RunViewParams, RunViewResult } from '@memberjunction/core';
import { NavigationService } from '@memberjunction/ng-shared';
import type { MJMLModelEntity, MJMLModelScoringBindingEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';
import { PSProductionComponent } from './ps-production.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for <ps-production> — the model-centric production control tower. It extends
 * BaseAngularComponent (reads `ProviderToUse`, supplied via the `Provider` input) and is reactive over
 * the engine's `_Models` array via `ObserveProperty`. The minimal engine fake returns a BehaviorSubject
 * from `ObserveProperty` and exposes the cache getters/helpers `rebuildModels` reads. We drive the empty
 * state (no published models → no KPI strip, no operate dialog) and the populated control tower (KPI
 * strip + a master-list row + detail). Standalone.
 */

/** The model fields the production view reads. */
type ModelDouble = Pick<MJMLModelEntity, 'ID' | 'AlgorithmID' | 'ProblemType' | 'Version' | 'Metrics' | 'HoldoutMetrics' | 'PipelineID' | 'ArtifactFileID' | 'ArtifactStatus' | 'Status'>;

/** The scoring binding fields the production view reads. */
type BindingDouble = Pick<MJMLModelScoringBindingEntity, 'ID' | 'MLTrainingPipelineID' | 'FeatureName' | 'TargetEntityID' | 'TargetEntity' | 'TargetColumn' | 'Mode' | 'Status' | 'RecordProcessID'>;

/** The record process fields the production view reads. */
type ProcessDouble = Pick<MJRecordProcessEntity, 'ID' | 'ScheduleEnabled'>;

/** The engine members the production view reads; the `Engine` input takes it as is (inputs are untyped). */
const makeEngine = (publishedModels: ModelDouble[], processes: ProcessDouble[] = [], bindings: BindingDouble[] = []) => {
  const subject = new BehaviorSubject<ModelDouble[]>(publishedModels);
  return {
    ObserveProperty: () => subject.asObservable(),
    PublishedModels: publishedModels,
    ScoringBindings: bindings,
    ScoringBindingsForPipeline: () => bindings,
    RecordProcessesForModel: () => processes,
    Models: publishedModels,
    RecordProcessByID: () => undefined,
    ModelDisplayName: () => 'Renewal Model',
    AlgorithmName: () => 'XGBoost',
    LoadRecentRunsForModel: async () => [],
  };
};

const makeModel = (over: Partial<ModelDouble> = {}): ModelDouble =>
  ({
    ID: 'm1',
    AlgorithmID: 'a1',
    ProblemType: 'classification',
    Version: 2,
    Metrics: '{"AUC":0.9}',
    HoldoutMetrics: '{"AUC":0.86}',
    PipelineID: 'p1',
    ArtifactFileID: 'f1',
    ArtifactStatus: 'verified',
    Status: 'Published',
    ...over,
  });

/** The record opens the component asked the navigation service for. */
const opened: Array<{ EntityName: string; Key: string }> = [];
const navigation = { OpenEntityRecord: (entityName: string, key: CompositeKey) => { opened.push({ EntityName: entityName, Key: key.ToURLSegment() }); return 'tab-1'; } };

const render = (publishedModels: ModelDouble[], bindings: BindingDouble[] = []) =>
  renderComponentFixture(PSProductionComponent, {
    inputs: { Engine: makeEngine(publishedModels, [], bindings), Provider: createFakeProvider({ runViewResults: [] }) },
    providers: [{ provide: NavigationService, useValue: navigation }],
  });

/** One `MJ: ML Model Publish Records` row the production view reads for the last auto-train outcome. */
interface PublishRecordDouble {
  ID: string;
  ModelID: string;
  Kind: 'publish' | 'refusal';
  RecordedAt: Date;
  InitiatorObject: { kind: 'system'; component: string; processRunId?: string };
  RefusalObject: { kind: 'keep-baseline-not-auto-published' } | null;
}
const M = makeModel;
const published = makeModel({ ID: 'M-PUB', PipelineID: 'P-1' });
const Refusal = (over: Partial<PublishRecordDouble>): PublishRecordDouble => ({
  ID: 'PR-1', ModelID: 'M-PUB', Kind: 'refusal', RecordedAt: new Date('2026-11-10T00:00:00Z'),
  InitiatorObject: { kind: 'system', component: 'auto-train', processRunId: 'RUN-1' }, RefusalObject: null, ...over,
});
const KeepBaselineNotAutoPublished = (): PublishRecordDouble['RefusalObject'] => ({ kind: 'keep-baseline-not-auto-published' });

/** Renders the view over `models` with an auto-train process and, when given, its last auto-train outcome record. */
async function RenderProduction(opts: { models: ModelDouble[]; autoTrainOutcome?: PublishRecordDouble; failReads?: string }) {
  const records = opts.autoTrainOutcome ? [opts.autoTrainOutcome] : [];
  const provider = createFakeProvider({ runViewResults: (p) => (p.EntityName === 'MJ: ML Model Publish Records' ? records : []) });
  const failure = opts.failReads;
  if (failure !== undefined) {
    Object.assign(provider, { RunViews: async (all: RunViewParams[]): Promise<RunViewResult[]> => all.map(() => ({ Success: false, ErrorMessage: failure, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0 })) });
  }
  const fixture = renderComponentFixture(PSProductionComponent, {
    inputs: {
      Engine: makeEngine(opts.models, [{ ID: 'RP-1', ScheduleEnabled: true }]),
      Provider: provider,
    },
    providers: [{ provide: NavigationService, useValue: navigation }],
  });
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return fixture;
}
const Text = (f: Awaited<ReturnType<typeof RenderProduction>>, testId: string): string => query(f, `[data-testid="${testId}"]`)?.textContent || '';
const Button = (f: Awaited<ReturnType<typeof RenderProduction>>, testId: string): HTMLButtonElement => query(f, `[data-testid="${testId}"]`) as HTMLButtonElement;

describe('PSProductionComponent (DOM)', () => {
  it("a scoring binding row names its feature and opens the model's record, whose detail hosts the Bindings section", () => {
    opened.length = 0;
    const binding: BindingDouble = { ID: 'b1', MLTrainingPipelineID: 'p1', FeatureName: 'Renewal risk', TargetEntityID: null, TargetEntity: 'Members', TargetColumn: null, Mode: 'OnDemand', Status: 'Active', RecordProcessID: null };
    const fixture = render([makeModel()], [binding]);
    expect(query(fixture, '[data-testid="ps-production-binding"]')?.textContent).toContain('Renewal risk');
    (query(fixture, '[data-testid="ps-production-binding-open"]') as HTMLButtonElement).click();
    expect(opened).toEqual([{ EntityName: 'MJ: ML Models', Key: 'ID|m1' }]);
  });

  it('shows the empty state when there are no published models', () => {
    const fixture = render([]);
    expect(query(fixture, '[data-testid="ps-production-empty"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-production-kpis"]')).toBeNull();
    expect(query(fixture, '[data-testid="ps-production-list"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No models in production yet');
  });

  it('renders the KPI strip + master list + detail once a model is published', () => {
    const fixture = render([makeModel()]);
    expect(query(fixture, '[data-testid="ps-production-empty"]')).toBeNull();
    expect(query(fixture, '[data-testid="ps-production-kpis"]')).not.toBeNull();
    expect(queryAll(fixture, '[data-testid="ps-production-row"]').length).toBe(1);
    expect(query(fixture, '[data-testid="ps-production-detail-name"]')?.textContent).toContain('Renewal Model');
  });

  it('reports the published-model count in the KPI strip', () => {
    const fixture = render([makeModel(), makeModel({ ID: 'm2' })]);
    expect(query(fixture, '[data-testid="ps-production-kpis"]')?.textContent).toContain('2');
  });

  it('marks a model with no bindings/schedule as Idle in its row', () => {
    const fixture = render([makeModel()]);
    expect(query(fixture, '[data-testid="ps-production-row"]')?.textContent).toContain('Idle');
  });

  it('exposes the Operate button in the detail pane', () => {
    const fixture = render([makeModel()]);
    expect(query(fixture, '[data-testid="ps-production-operate"]')).not.toBeNull();
  });

  it('a model whose artifact is missing is unscorable with the reason and Operate disabled', async () => {
    const f = await RenderProduction({ models: [M({ ArtifactStatus: 'missing', ArtifactFileID: 'f1' })] });
    expect(Text(f, 'ps-deploy-state').toLowerCase()).toContain('unscorable');
    expect(Text(f, 'ps-production-unscorable')).toContain(PSProductionComponent.UnscorableReason('missing') || 'no reason');
    expect(Button(f, 'ps-production-operate').disabled).toBe(true);
  });

  it('a hash-mismatched or legacy-local artifact is unscorable; a verified one is not', () => {
    expect([PSProductionComponent.UnscorableReason('hash-mismatch') !== null, PSProductionComponent.UnscorableReason('legacy-local') !== null, PSProductionComponent.UnscorableReason('verified')]).toEqual([true, true, null]);
  });

  it('an auto-train process shows its last outcome: withheld with the reason', async () => {
    const f = await RenderProduction({ models: [published], autoTrainOutcome: Refusal({ RefusalObject: KeepBaselineNotAutoPublished() }) });
    expect(Text(f, 'ps-auto-train-outcome')).toContain('withheld');
    expect(Text(f, 'ps-auto-train-outcome')).toContain('simple baseline');
  });

  it('an auto-train publish shows as published', async () => {
    const f = await RenderProduction({ models: [published], autoTrainOutcome: Refusal({ Kind: 'publish' }) });
    expect(Text(f, 'ps-auto-train-outcome')).toContain('published');
  });

  it('a failed read of the auto-train outcomes is logged with its reason and shown as an error, never as no outcome', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await RenderProduction({ models: [published], failReads: 'the publish records read was refused' });
    expect(Text(f, 'ps-auto-train-outcome-error')).toContain('the publish records read was refused');
    expect(logged.mock.calls.flat().map(String).some((m) => m.includes('the publish records read was refused'))).toBe(true);
    logged.mockRestore();
  });

  it('names the metric of each holdout score in the list and the header, so a loss never reads as an AUC', () => {
    const fixture = render([makeModel({ Metrics: '{}', HoldoutMetrics: '{"log-loss":0.367}' })]);
    const text = (sel: string) => (query(fixture, sel)?.textContent || '').replace(/\s+/g, ' ').trim();
    expect([text('[data-testid="ps-production-row"] .meta .ps-mono'), text('.prod-header-card .sub')]).toEqual(['Log Loss 0.367', 'XGBoost · classification · holdout Log Loss 0.367']);
  });

  it('shows no holdout score for a model with no holdout metrics, never its training score', () => {
    const fixture = render([makeModel({ Metrics: '{"AUC":0.91}', HoldoutMetrics: null })]);
    expect(query(fixture, '.prod-header-card .sub')?.textContent).not.toContain('0.910');
  });

  it('highlights the selected model when the selection spells its ID in another case', () => {
    const fixture = render([makeModel({ ID: 'AAAAAAAA-0000-4000-8000-000000000001', Version: 1 }), makeModel({ ID: 'BBBBBBBB-0000-4000-8000-000000000002', Version: 2 })]);
    fixture.componentInstance.Select('bbbbbbbb-0000-4000-8000-000000000002');
    // a row click marks the view dirty; a direct call does not
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(queryAll(fixture, '[data-testid="ps-production-row"].sel').map((r) => r.textContent?.includes('v2'))).toEqual([true]);
  });
});
