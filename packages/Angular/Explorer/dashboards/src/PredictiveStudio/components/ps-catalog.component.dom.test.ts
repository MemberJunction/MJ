import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine, RecommendationLevel } from '../engine/predictive-studio.engine';
import { PSCatalogComponent } from './ps-catalog.component';

/**
 * DOM coverage for <ps-catalog> — the algorithm card gallery + "Guide me" scenario picker. The engine
 * is an @Input; a minimal fake supplies the two cached arrays the component reads (`Algorithms`,
 * `UseCases`) plus `BestLevelsForScenarios` (returns per-algorithm recommendation levels). Standalone
 * (self-imports CommonModule + mjButton). data-testid hooks target cards / chips / gallery.
 */

const ALGOS = [
  { ID: 'a1', Name: 'XGBoost', DriverClass: 'xgboost', ProblemTypes: 'classification,regression', SupportsFeatureImportance: true, Description: 'Gradient boosting', DefaultHyperparameters: '{"max_depth":6}' },
  { ID: 'a2', Name: 'Logistic Regression', DriverClass: 'logistic_regression', ProblemTypes: 'classification', SupportsFeatureImportance: false, Description: null, DefaultHyperparameters: null },
];
const USE_CASES = [
  { ID: 'u1', Name: 'Binary classification' },
  { ID: 'u2', Name: 'Interpretability' },
];

const makeEngine = (levels: Map<string, RecommendationLevel> = new Map()) =>
  ({
    Algorithms: ALGOS,
    UseCases: USE_CASES,
    BestLevelsForScenarios: () => levels,
  } as unknown as PredictiveStudioEngine);

const render = (engine = makeEngine()) => renderComponentFixture(PSCatalogComponent, { inputs: { engine } });

describe('PSCatalogComponent (DOM)', () => {
  it('renders one scenario chip per use case', () => {
    const fixture = render();
    expect(queryAll(fixture, '[data-testid="ps-catalog-scenario-chip"]').length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Binary classification');
  });

  it('renders one algorithm card per algorithm with its name + driver class', () => {
    const fixture = render();
    expect(queryAll(fixture, '[data-testid="ps-catalog-card"]').length).toBe(2);
    const gallery = query(fixture, '[data-testid="ps-catalog-gallery"]');
    expect(gallery?.textContent).toContain('XGBoost');
    expect(gallery?.textContent).toContain('logistic_regression');
  });

  it('shows the empty gallery note when the catalog is empty', () => {
    const engine = { Algorithms: [], UseCases: [], BestLevelsForScenarios: () => new Map() } as unknown as PredictiveStudioEngine;
    const fixture = render(engine);
    expect(query(fixture, '[data-testid="ps-catalog-gallery"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No algorithms in the catalog yet');
  });

  it('hides the recommendation banner until a scenario is selected, then shows it', () => {
    const fixture = render(makeEngine(new Map([['a1', 'Primary' as RecommendationLevel]])));
    expect(query(fixture, '[data-testid="ps-catalog-reco-banner"]')).toBeNull();
    (queryAll(fixture, '[data-testid="ps-catalog-scenario-chip"]')[0] as HTMLElement).click();
    fixture.detectChanges();
    const banner = query(fixture, '[data-testid="ps-catalog-reco-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('XGBoost');
  });

  it('emits askAgent with a starter prompt naming the chosen algorithm when "Use" is clicked', () => {
    const fixture = render();
    const asked = capture(fixture.componentInstance.askAgent);
    (queryAll(fixture, '[data-testid="ps-catalog-use"]')[0] as HTMLElement).click();
    expect(asked.length).toBe(1);
    expect(asked[0]).toContain('XGBoost');
  });
});
