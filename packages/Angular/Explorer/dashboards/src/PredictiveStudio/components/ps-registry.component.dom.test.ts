import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import { NavigationService } from '@memberjunction/ng-shared';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSRegistryComponent } from './ps-registry.component';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for <ps-registry> — the ML Model registry (master list + detail with lifecycle stepper,
 * metrics, and promote/archive actions behind a confirm modal). The engine is an @Input; a minimal fake
 * exposes `Models` (the array `buildModels` reads) plus `ModelDisplayName` / `AlgorithmName`. Metrics /
 * feature-importance are parsed from the model's JSON fields, so we supply real JSON. Draft → Validated
 * transitions gate the action buttons. Clicking an action opens <ps-model-detail>'s own confirm modal (no Remote
 * Op runs). Standalone.
 */

const makeModel = (over: Record<string, unknown> = {}) =>
  ({
    ID: 'm1',
    Version: 3,
    AlgorithmID: 'a1',
    Status: 'Draft',
    Metrics: '{"AUC":0.91}',
    HoldoutMetrics: '{"AUC":0.85,"Precision":0.8}',
    FeatureImportance: '[{"name":"tenure","value":0.4},{"name":"spend","value":0.2}]',
    TargetVariable: 'Renewed',
    ProblemType: 'classification',
    ...over,
  });

const makeEngine = (models: unknown[]) =>
  ({
    Models: models,
    ModelDisplayName: () => 'Renewal Model',
    AlgorithmName: () => 'XGBoost',
  } as unknown as PredictiveStudioEngine);

const render = (models: unknown[]) =>
  renderComponentFixture(PSRegistryComponent, { inputs: { engine: makeEngine(models) }, providers: [{ provide: NavigationService, useValue: {} }] });

const PRE_CHANGE_REASON =
  'Trained before the Predictive Studio lifecycle gate; never evaluated under an Evaluation Protocol; the pipeline is retrained under its protocol automatically.';
const M = makeModel;

/** A run-level refusal record (no model row) of a training run of pipeline P-1. */
const runLevelRefusal = { ID: 'PR-9', ModelID: null, TrainingRunID: 'TR-1', Kind: 'refusal', RecordedAt: new Date('2026-11-12T00:00:00Z'), RefusalObject: { kind: 'gate-no-signal', reason: 'no candidate beat the flat guess' } };

/** Renders the registry over `models`; the provider serves `records` as publish records, and the engine knows `runs`. */
async function RenderRegistry(opts: { models: unknown[]; records?: unknown[] }) {
  const engine = { ...makeEngine(opts.models), Pipelines: [{ ID: 'P-1', Name: 'Renewal pipeline' }], TrainingRuns: [{ ID: 'TR-1', PipelineID: 'P-1' }] } as unknown as PredictiveStudioEngine;
  const provider = createFakeProvider({ runViewResults: (p) => (p.EntityName === 'MJ: ML Model Publish Records' ? opts.records || [] : []) });
  const f = renderComponentFixture(PSRegistryComponent, { inputs: { engine, provider }, providers: [{ provide: NavigationService, useValue: {} }] });
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  f.detectChanges();
  return f;
}
const Text = (f: Awaited<ReturnType<typeof RenderRegistry>>, testId: string): string => query(f, `[data-testid="${testId}"]`)?.textContent || '';

describe('PSRegistryComponent (DOM)', () => {
  it('shows the empty state when there are no models', () => {
    const fixture = render([]);
    expect(query(fixture, '[data-testid="ps-registry-empty"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-registry-list"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No trained models yet');
  });

  it('renders a master-list row per model and the detail pane', () => {
    const fixture = render([makeModel()]);
    expect(queryAll(fixture, '[data-testid="ps-registry-row"]').length).toBe(1);
    expect(query(fixture, '[data-testid="ps-registry-detail"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-registry-detail-name"]')?.textContent).toContain('Renewal Model');
  });

  it('renders the holdout AUC parsed from HoldoutMetrics in the detail', () => {
    const fixture = render([makeModel()]);
    expect(query(fixture, '[data-testid="ps-registry-detail"]')?.textContent).toContain('0.850');
  });

  it("labels each master-list row's score with its metric, so a loss never reads as an unnamed number", () => {
    const fixture = render([makeModel({ Metrics: '{}', HoldoutMetrics: '{"log-loss":0.41}' })]);
    const cell = (query(fixture, '[data-testid="ps-registry-row"] .auc .v')?.textContent || '').replace(/\s+/g, ' ').trim();
    expect(cell).toBe('Log Loss 0.410');
  });

  it('offers Validate (not Archive) for a Draft model', () => {
    const fixture = render([makeModel({ Status: 'Draft' })]);
    expect(query(fixture, '[data-testid="ps-registry-validate"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-registry-archive"]')).toBeNull();
  });

  it('offers Archive (not Validate) for a Published model', () => {
    const fixture = render([makeModel({ Status: 'Published' })]);
    expect(query(fixture, '[data-testid="ps-registry-archive"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-registry-validate"]')).toBeNull();
  });

  it('opens the confirm modal when a lifecycle action is clicked', () => {
    const fixture = render([makeModel({ Status: 'Draft' })]);
    expect(query(fixture, '[data-testid="ps-confirm-modal"]')).toBeNull();
    (query(fixture, '[data-testid="ps-registry-validate"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="ps-confirm-modal"]')).not.toBeNull();
  });

  it('the registry lists an Unevaluated model with its chip', async () => {
    const f = await RenderRegistry({ models: [M({ Status: 'Unevaluated', StatusReason: PRE_CHANGE_REASON })] });
    expect(Text(f, 'ps-lifecycle-chip')).toContain('Unevaluated');
  });

  it('a KeepBaseline row says it ships the simple baseline and carries its reason', async () => {
    const f = await RenderRegistry({ models: [M({ Status: 'KeepBaseline', StatusReason: 'the model did not beat the best simple baseline' })] });
    expect([Text(f, 'ps-lifecycle-chip'), query(f, '[data-testid="ps-registry-row"]')?.getAttribute('title')]).toEqual(['Ships the simple baseline', 'the model did not beat the best simple baseline']);
  });

  it("shows each pipeline's latest run that shipped no model, from its run-level refusal record", async () => {
    const f = await RenderRegistry({ models: [M({ Status: 'Published' })], records: [runLevelRefusal] });
    expect(Text(f, 'ps-registry-run-outcome')).toContain('Renewal pipeline');
    expect(Text(f, 'ps-registry-run-outcome')).toContain('No signal');
  });

  it('selects and highlights the deep-linked model when the link spells its ID in another case', () => {
    const fixture = render([
      makeModel({ ID: 'AAAAAAAA-0000-4000-8000-000000000001', Version: 1 }),
      makeModel({ ID: 'BBBBBBBB-0000-4000-8000-000000000002', Version: 2 }),
    ]);
    fixture.componentInstance.InitialModelId = 'bbbbbbbb-0000-4000-8000-000000000002';
    fixture.detectChanges();
    expect(fixture.componentInstance.Selected.version).toBe(2);
    const highlighted = queryAll(fixture, '[data-testid="ps-registry-row"].sel');
    expect(highlighted.map((r) => r.textContent?.includes('v2'))).toEqual([true]);
  });

  it('shows and highlights the selected model when the selection spells its ID in another case', () => {
    const fixture = render([
      makeModel({ ID: 'AAAAAAAA-0000-4000-8000-000000000001', Version: 1 }),
      makeModel({ ID: 'BBBBBBBB-0000-4000-8000-000000000002', Version: 2 }),
    ]);
    fixture.componentInstance.Select('bbbbbbbb-0000-4000-8000-000000000002');
    // a row click marks the view dirty; a direct call does not
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.componentInstance.Selected.version).toBe(2);
    expect(queryAll(fixture, '[data-testid="ps-registry-row"].sel').map((r) => r.textContent?.includes('v2'))).toEqual([true]);
  });
});
