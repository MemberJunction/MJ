import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll, capture, fakeMetadataProvider } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { PSPipelinesComponent } from './ps-pipelines.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for <ps-pipelines> — the visual DAG builder and stage-flow over ML training pipelines.
 * The engine is an @Input; a minimal fake exposes `Pipelines` (parsed into the editable spec), `Algorithms`,
 * and `AlgorithmName`. Empty state (no pipelines) surfaces an "ask the agent" CTA that emits askAgent. A
 * pipeline with one source + one step renders picker cards, stage cards, and DAG canvas on toggle. Standalone.
 */

const makePipeline = (over: Record<string, unknown> = {}) =>
  ({
    ID: 'p1',
    Name: 'Renewal pipeline',
    Status: 'Draft',
    SourceBindings: JSON.stringify([{ Kind: 'Entity', Ref: 'Members', Alias: 'm' }]),
    FeatureSteps: JSON.stringify({ Steps: [{ Id: 'step_1', Kind: 'select', Columns: ['tenure'] }] }),
    TargetVariable: 'Renewed',
    ProblemType: 'classification',
    AlgorithmID: 'a1',
    Hyperparameters: '{}',
    LeakageGuard: JSON.stringify({ DenyFields: [], SingleFeatureDominanceThreshold: 0.6 }),
    AsOfStrategy: JSON.stringify({ Mode: 'none' }),
    ValidationStrategy: JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.15 }),
    ...over,
  }) as unknown as MJMLTrainingPipelineEntity;

const makeEngine = (pipelines: MJMLTrainingPipelineEntity[]) =>
  ({
    Pipelines: pipelines,
    Algorithms: [{ ID: 'a1', Name: 'XGBoost' }],
    AlgorithmName: () => 'XGBoost',
    Models: [],
  } as unknown as PredictiveStudioEngine);

const render = (pipelines: MJMLTrainingPipelineEntity[], viewMode: 'stages' | 'dag' = 'stages') =>
  renderComponentFixture(PSPipelinesComponent, { inputs: { engine: makeEngine(pipelines), viewMode } });

describe('PSPipelinesComponent (DOM)', () => {
  it('shows the empty state with an ask-agent CTA when there are no pipelines', () => {
    const fixture = render([]);
    expect(query(fixture, '[data-testid="ps-pipelines-empty"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-pipelines-picker"]')).toBeNull();
    expect(query(fixture, '[data-testid="ps-pipelines-ask-agent"]')).not.toBeNull();
  });

  it('emits askAgent with the starter prompt from the empty-state CTA', () => {
    const fixture = render([]);
    const asked = capture(fixture.componentInstance.askAgent);
    (query(fixture, '[data-testid="ps-pipelines-ask-agent"]') as HTMLElement).click();
    expect(asked.length).toBe(1);
    expect(asked[0]).toContain('training pipeline');
  });

  it('renders a picker card per pipeline when pipelines exist', () => {
    const fixture = render([makePipeline(), makePipeline({ ID: 'p2', Name: 'Lapse pipeline' })]);
    expect(query(fixture, '[data-testid="ps-pipelines-empty"]')).toBeNull();
    expect(queryAll(fixture, '[data-testid="ps-pipelines-pill"]').length).toBe(2);
    expect(query(fixture, '[data-testid="ps-pipelines-picker"]')?.textContent).toContain('Renewal pipeline');
  });

  it('renders the canvas with nodes derived from the pipeline spec in DAG mode', () => {
    const fixture = render([makePipeline()], 'dag');
    expect(query(fixture, '[data-testid="ps-pipelines-canvas"]')).not.toBeNull();
    // source + step + target + algo + output = 5 nodes at minimum
    expect(queryAll(fixture, '[data-testid="ps-pipelines-node"]').length).toBeGreaterThanOrEqual(5);
  });

  it('renders the inspector with the first node selected in DAG mode', () => {
    const fixture = render([makePipeline()], 'dag');
    expect(query(fixture, '[data-testid="ps-pipelines-inspector"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-pipelines-inspector-title"]')?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('disables Save until an edit marks the pipeline dirty', () => {
    const fixture = render([makePipeline()]);
    expect((query(fixture, '[data-testid="ps-pipelines-save"]') as HTMLButtonElement).disabled).toBe(true);
    (query(fixture, '[data-testid="ps-pipelines-add-source"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="ps-pipelines-dirty"]')).not.toBeNull();
    expect((query(fixture, '[data-testid="ps-pipelines-save"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('resolves entity DisplayName for source nodes without requiring an alias', () => {
    const pipe = makePipeline({
      SourceBindings: JSON.stringify([
        { Kind: 'Entity', Ref: 'MoreCheese: Member Profiles' },
      ]),
    });
    const fakeProvider = fakeMetadataProvider([
      { Name: 'MoreCheese: Member Profiles', DisplayName: 'Member Profiles' },
    ]);
    const fixture = renderComponentFixture(PSPipelinesComponent, {
      inputs: {
        engine: makeEngine([pipe]),
        provider: fakeProvider,
        viewMode: 'dag',
      },
    });
    const nodes = queryAll(fixture, '[data-testid="ps-pipelines-node"]');
    const sourceNode = nodes.find((n) => n.textContent?.includes('Member Profiles'));
    expect(sourceNode).toBeDefined();
  });

  it('renders feature transform cards with column chips in Stage 2 of Stages View', () => {
    const pipe = makePipeline({
      FeatureSteps: JSON.stringify({
        Steps: [
          {
            Id: 'select_1',
            Kind: 'select',
            Label: 'Base Features',
            Columns: ['TicketTier', 'UnitPrice', 'LineTotalNet'],
            Inputs: ['MJ_BizApps_Orders: Event Order Lines']
          }
        ]
      })
    });
    const fixture = render([pipe], 'stages');
    const stepCards = queryAll(fixture, '[data-testid="ps-pipelines-step-card"]');
    expect(stepCards.length).toBe(1);
    expect(stepCards[0].textContent).toContain('Base Features');
    expect(stepCards[0].textContent).toContain('TicketTier');
    expect(stepCards[0].textContent).toContain('UnitPrice');
    expect(stepCards[0].textContent).toContain('LineTotalNet');
    expect(stepCards[0].textContent).toContain('MJ_BizApps_Orders: Event Order Lines');
  });
});
