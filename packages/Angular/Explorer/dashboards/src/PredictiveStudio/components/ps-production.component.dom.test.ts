import { describe, it, expect } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { renderComponentFixture, query, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSProductionComponent } from './ps-production.component';

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
});
