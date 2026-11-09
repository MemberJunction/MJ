import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
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

const makeEngine = (publishedModels: unknown[]) => {
  const subject = new BehaviorSubject<unknown[]>(publishedModels);
  return {
    ObserveProperty: () => subject.asObservable(),
    PublishedModels: publishedModels,
    ScoringBindings: [],
    RecordProcessesForModel: () => [],
    RecordProcessByID: () => undefined,
    ModelDisplayName: () => 'Renewal Model',
    AlgorithmName: () => 'XGBoost',
    LoadRecentRunsForModel: async () => [],
  } as unknown as PredictiveStudioEngine;
};

const makeModel = (over: Record<string, unknown> = {}) =>
  ({
    ID: 'm1',
    AlgorithmID: 'a1',
    ProblemType: 'classification',
    Version: 2,
    Metrics: '{"AUC":0.9}',
    HoldoutMetrics: '{"AUC":0.86}',
    PipelineID: 'p1',
    ArtifactFileID: 'f1',
    Status: 'Published',
    ...over,
  });

const render = (publishedModels: unknown[]) =>
  renderComponentFixture(PSProductionComponent, {
    inputs: { engine: makeEngine(publishedModels), Provider: createFakeProvider({ runViewResults: [] }) },
  });

describe('PSProductionComponent (DOM)', () => {
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

  it('marks a published model with no trained artifact as Needs training and disables Operate', () => {
    const fixture = render([makeModel({ ArtifactFileID: null })]);
    expect(query(fixture, '[data-testid="ps-production-row"]')?.textContent).toContain('Needs training');
    expect(query(fixture, '[data-testid="ps-production-needs-training"]')).not.toBeNull();
    const operate = query(fixture, '[data-testid="ps-production-operate"]') as HTMLButtonElement | null;
    expect(operate?.disabled).toBe(true);
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
