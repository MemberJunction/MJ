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

/**
 * Story card — the prose half of a model's identity.
 *
 * The Model Story Tagger writes a story at promotion onto the root `MJ: ML Components` row and each
 * component's own row; until this card existed it wrote all of that and nothing displayed any of it.
 * The card needs a provider to read those rows, so these render with one.
 */
describe('PSRegistryComponent (DOM) — story card', () => {
  const STORY_ROWS = [
    { ID: 'root', Name: 'Renewal root', ComponentType: 'XGBoost', ParentComponentID: null, Story: 'Scores members on renewal likelihood.' },
    {
      ID: 'c1',
      Name: 'Recent activity',
      ComponentType: 'Count',
      ParentComponentID: 'root',
      Story: 'Engagement in the last 90 days.',
      StoryContribution: JSON.stringify({
        Role: 'primary-driver',
        Weight: 0.42,
        Evidence: '0.42 of total importance',
        ReusePotential: 'high',
        ReuseWhen: 'Any model scoring member engagement.',
      }),
    },
  ];

  const renderWithStory = (rows: unknown[], rootComponentID: string | null = 'root') => {
    const model = makeModel({ ID: 'm1', RootComponentID: rootComponentID });
    const engine = {
      Models: [model],
      ModelDisplayName: () => 'Renewal Model',
      AlgorithmName: () => 'XGBoost',
      LoadComponentInstances: async () => rows,
    } as unknown as PredictiveStudioEngine;
    return renderComponentFixture(PSRegistryComponent, { inputs: { engine, provider: {}, currentUser: null } });
  };

  const flush = async (fixture: ReturnType<typeof renderWithStory>) => {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  };

  it('says so plainly when no story has been written yet', async () => {
    const fixture = renderWithStory([]);
    (fixture.componentInstance as { select: (id: string) => void }).select('m1');
    await flush(fixture);
    expect(query(fixture, '[data-testid="ps-registry-story-empty"]')?.textContent).toContain('written when the model is published');
  });

  it('renders the model prose and each component’s contribution', async () => {
    const fixture = renderWithStory(STORY_ROWS);
    (fixture.componentInstance as { select: (id: string) => void }).select('m1');
    await flush(fixture);

    expect(query(fixture, '[data-testid="ps-registry-story-prose"]')?.textContent).toContain('renewal likelihood');
    const part = query(fixture, '[data-testid="ps-registry-story-part-c1"]');
    expect(part?.textContent).toContain('Recent activity');
    expect(part?.textContent).toContain('42%');
    expect(part?.textContent).toContain('Primary driver');
    // The reuse sentence is what makes a component findable for a DIFFERENT model.
    expect(part?.textContent).toContain('Any model scoring member engagement');
  });

  it('badges how many components are worth reusing', async () => {
    const fixture = renderWithStory(STORY_ROWS);
    (fixture.componentInstance as { select: (id: string) => void }).select('m1');
    await flush(fixture);
    expect(query(fixture, '[data-testid="ps-registry-story-reuse"]')?.textContent).toContain('1 reusable');
  });

  it('leaves the card empty rather than breaking the panel when the read fails', async () => {
    // The story is prose, not part of the model's record — losing it must not cost the metrics.
    const engine = {
      Models: [makeModel({ ID: 'm1', RootComponentID: 'root' })],
      ModelDisplayName: () => 'Renewal Model',
      AlgorithmName: () => 'XGBoost',
      LoadComponentInstances: async () => {
        throw new Error('provider down');
      },
    } as unknown as PredictiveStudioEngine;
    const fixture = renderComponentFixture(PSRegistryComponent, { inputs: { engine, provider: {}, currentUser: null } });
    (fixture.componentInstance as { select: (id: string) => void }).select('m1');
    await flush(fixture);

    expect(query(fixture, '[data-testid="ps-registry-story-empty"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="ps-registry-detail"]')).toBeTruthy();
  });
});
