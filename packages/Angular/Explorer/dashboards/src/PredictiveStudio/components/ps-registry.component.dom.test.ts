import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSRegistryComponent } from './ps-registry.component';

/**
 * DOM coverage for <ps-registry> — the ML Model registry (master list + detail with lifecycle stepper,
 * metrics, and promote/archive actions behind a confirm modal). The engine is an @Input; a minimal fake
 * exposes `Models` (the array `buildModels` reads) plus `ModelDisplayName` / `AlgorithmName`. Metrics /
 * feature-importance are parsed from the model's JSON fields, so we supply real JSON. Draft → Validated
 * transitions gate the action buttons. Clicking an action opens the shared <ps-confirm-modal> (no Remote
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

const render = (models: unknown[]) => renderComponentFixture(PSRegistryComponent, { inputs: { engine: makeEngine(models) } });

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
});
