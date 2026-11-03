import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll, capture, fakeMetadataProvider } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PredictiveStudioTrainModelOperation, type MJMLTrainingPipelineEntity, type PredictiveStudioTrainModelOutput } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { PSPipelinesComponent } from './ps-pipelines.component';
import { WidgetFixtures } from './evaluation-results/widget-fixtures';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import type { GateDecision, GateOutcome } from '@memberjunction/predictive-studio-core';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for <ps-pipelines> — the visual DAG builder and stage-flow over ML training pipelines.
 * The engine is an @Input; a minimal fake exposes `Pipelines` (parsed into the editable spec), `Algorithms`,
 * and `AlgorithmName`. Empty state (no pipelines) surfaces an "ask the agent" CTA that emits AskAgent. A
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
    Config: async () => undefined,
  } as unknown as PredictiveStudioEngine);

const render = (pipelines: MJMLTrainingPipelineEntity[], viewMode: 'stages' | 'dag' = 'stages') =>
  renderComponentFixture(PSPipelinesComponent, { inputs: { engine: makeEngine(pipelines), ViewMode: viewMode } });

describe('PSPipelinesComponent (DOM)', () => {
  it('shows the empty state with an ask-agent CTA when there are no pipelines', () => {
    const fixture = render([]);
    expect(query(fixture, '[data-testid="ps-pipelines-empty"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-pipelines-picker"]')).toBeNull();
    expect(query(fixture, '[data-testid="ps-pipelines-ask-agent"]')).not.toBeNull();
  });

  it('emits AskAgent with the starter prompt from the empty-state CTA', () => {
    const fixture = render([]);
    const asked = capture(fixture.componentInstance.AskAgent);
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
        ViewMode: 'dag',
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

  it('shows a stored as-of cutoff (inspector) with a reset action, and no reset for mode none', () => {
    const none = render([makePipeline()], 'dag');
    expect(query(none, '[data-testid="ps-pipelines-asof-mode"]')?.textContent?.trim()).toBe('none');
    expect(query(none, '[data-testid="ps-pipelines-asof-reset"]')).toBeNull();

    const cutoff = render([makePipeline({ AsOfStrategy: JSON.stringify({ Mode: 'column', Column: 'DecisionDate' }) })], 'dag');
    expect(query(cutoff, '[data-testid="ps-pipelines-asof-mode"]')?.textContent?.trim()).toBe('column');
    expect(query(cutoff, '[data-testid="ps-pipelines-asof-reset"]')?.textContent).toContain('Reset to none');
  });

  it('a trained run that shipped no model shows the stored reason and no version', async () => {
    const out: PredictiveStudioTrainModelOutput = {
      trainingRunId: 'run-1', status: 'NoSignal', leakageFlagged: false, gateOutcome: 'no-signal', gateBranch: 'c:no-signal',
      gateReason: 'Neither the model nor any simple baseline beats the flat guess on log-loss: no signal.',
    };
    const execute = vi.spyOn(PredictiveStudioTrainModelOperation.prototype, 'Execute').mockResolvedValue({ Success: true, Output: out });
    const fixture = render([makePipeline()]);
    const notify = vi.spyOn(fixture.debugElement.injector.get(MJNotificationService), 'CreateSimpleNotification');
    (query(fixture, '[data-testid="ps-pipelines-train"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(execute).toHaveBeenCalledWith({ pipelineId: 'p1' }, expect.anything());
    expect(notify).toHaveBeenLastCalledWith('Trained Renewal pipeline: no model shipped. Neither the model nor any simple baseline beats the flat guess on log-loss: no signal.', 'info', 5000);
    execute.mockRestore();
  });

  it('a trained run that produced a model shows its version', () => {
    const out: PredictiveStudioTrainModelOutput = { modelId: 'm1', version: 3, trainingRunId: 'run-1', status: 'Draft', leakageFlagged: true };
    expect(PSPipelinesComponent.TrainResultMessage('Renewal pipeline', out)).toBe('Trained Renewal pipeline v3 (leakage flag raised — needs sign-off). See Registry.');
    expect(PSPipelinesComponent.TrainResultMessage('Renewal pipeline', { trainingRunId: 'run-9', status: 'NoSignal', leakageFlagged: false }))
      .toBe('Trained Renewal pipeline: no model shipped. See training run run-9.');
  });

  it('states that holdout and folds come from the bound Evaluation Protocol and offers no legacy validation settings', () => {
    const stages = render([makePipeline({ EvaluationProtocolID: 'ep1', EvaluationProtocol: 'Renewal protocol' })]);
    const stagesText = query(stages, '[data-testid="ps-pipelines-evaluation-source"]')?.textContent || '';
    expect(stagesText).toContain('Evaluation Protocol');
    expect(stagesText).toContain('Renewal protocol');
    expect(stages.nativeElement.textContent).not.toContain('Locked Holdout');
    expect(stages.nativeElement.textContent).not.toContain('Honest benchmark score');

    const dag = render([makePipeline({ EvaluationProtocolID: 'ep1', EvaluationProtocol: 'Renewal protocol' })], 'dag');
    expect(query(dag, '[data-testid="ps-pipelines-inspector-evaluation-source"]')?.textContent).toContain('Renewal protocol');
    expect(queryAll(dag, 'option[value="kfold"]').length).toBe(0);
    expect(dag.nativeElement.textContent).not.toContain('Locked holdout fraction');
  });

  it('says training refuses a pipeline with no Evaluation Protocol bound', () => {
    const fixture = render([makePipeline({ EvaluationProtocolID: null, EvaluationProtocol: null })]);
    expect(query(fixture, '[data-testid="ps-pipelines-evaluation-source"]')?.textContent).toContain('No Evaluation Protocol is bound');
  });

  it('saving leaves the stored ValidationStrategy untouched', async () => {
    const stored = makePipeline({ ValidationStrategy: null, Save: vi.fn().mockResolvedValue(true) });
    const fixture = render([stored]);
    (query(fixture, '[data-testid="ps-pipelines-add-source"]') as HTMLElement).click();
    fixture.detectChanges();
    await fixture.componentInstance.save();
    expect(stored.ValidationStrategy).toBeNull();
  });

  it('Reset to none marks the pipeline dirty without saving', () => {
    const fixture = render([makePipeline({ AsOfStrategy: JSON.stringify({ Mode: 'offset', OffsetDays: 30 }) })], 'dag');
    const save = vi.spyOn(fixture.componentInstance, 'save');
    (query(fixture, '[data-testid="ps-pipelines-asof-reset"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(save).not.toHaveBeenCalled();
    expect(query(fixture, '[data-testid="ps-pipelines-asof-mode"]')?.textContent?.trim()).toBe('none');
    expect(query(fixture, '[data-testid="ps-pipelines-asof-reset"]')).toBeNull();
    expect(query(fixture, '[data-testid="ps-pipelines-dirty"]')).not.toBeNull();
    expect((query(fixture, '[data-testid="ps-pipelines-save"]') as HTMLButtonElement).disabled).toBe(false);
  });

  describe('the kept model after a run', () => {
    const publishedModel = (over: Record<string, unknown> = {}) =>
      ({ ID: 'm1', PipelineID: 'p1', Version: 2, Status: 'Published', Algorithm: 'Logistic Regression', HoldoutMetrics: JSON.stringify({ 'log-loss': 0.41234, brier: 0.1 }), ...over }) as unknown as MJMLModelEntity;
    /** A stored decision of each outcome, with the branch and shipped role the stored record requires of it. */
    const DECISIONS: Record<GateOutcome, GateDecision> = {
      model: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null },
      'keep-simple-baseline': { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null },
      'no-signal': { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null },
    };
    const runWithOutcome = (outcome: GateOutcome | null) => {
      const stored = WidgetFixtures.StoredRunEnvelope();
      const gate = stored.gate === null || outcome === null ? null : { ...stored.gate, transcribed: DECISIONS[outcome], decision: DECISIONS[outcome] };
      return { ID: 'r1', PipelineID: 'p1', ResultingModelID: 'm1', ValidationResults: JSON.stringify({ ...stored, gate }) } as unknown as MJMLTrainingRunEntity;
    };
    const renderWith = (model: MJMLModelEntity, run: MJMLTrainingRunEntity, viewMode: 'stages' | 'dag' = 'stages') => {
      const engine = { ...makeEngine([makePipeline()]), Models: [model], TrainingRuns: [run] } as unknown as PredictiveStudioEngine;
      return renderComponentFixture(PSPipelinesComponent, { inputs: { engine, ViewMode: viewMode } });
    };

    it('does not crown a published model whose stored gate outcome kept a simple baseline', () => {
      const fixture = renderWith(publishedModel(), runWithOutcome('keep-simple-baseline'));
      const row = fixture.nativeElement.querySelector('.pl-model-row') as HTMLElement;
      expect(row.textContent).toContain('Kept a simple baseline');
      expect(row.textContent).not.toContain('Winner');
      expect(row.querySelector('.fa-trophy')).toBeNull();
    });

    it('titles the algorithm card by the outcome rather than "Current Serving Winner" when a simple baseline was kept', () => {
      const fixture = renderWith(publishedModel(), runWithOutcome('keep-simple-baseline'), 'dag');
      const node = queryAll(fixture, '[data-testid="ps-pipelines-node"]').find((n) => n.textContent?.includes('Algorithm'));
      (node as HTMLElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Kept a simple baseline');
      expect(fixture.nativeElement.textContent).not.toContain('Current Serving Winner');
      expect(fixture.nativeElement.textContent).not.toContain('Winner');
    });

    it('calls a published model the winner when the stored gate outcome is a model', () => {
      const fixture = renderWith(publishedModel(), runWithOutcome('model'));
      const row = fixture.nativeElement.querySelector('.pl-model-row') as HTMLElement;
      expect(row.textContent).toContain('Winner');
      expect(row.textContent).not.toContain('Kept a simple baseline');
    });

    it('reads a published model whose run stores no gate record as not evaluated, with no winner or trophy anywhere', () => {
      const fixture = renderWith(publishedModel(), runWithOutcome(null));
      const row = fixture.nativeElement.querySelector('.pl-model-row') as HTMLElement;
      expect([row.textContent?.includes('Not evaluated'), row.textContent?.includes('Winner'), row.querySelector('.fa-trophy') !== null]).toEqual([true, false, false]);
      expect(queryAll(fixture, '.pl-metric-badge .fa-trophy').length).toBe(0);
      const card = algorithmCard(publishedModel(), runWithOutcome(null));
      expect([card?.textContent?.includes('Current Serving Winner'), card?.textContent?.includes('Published model — not evaluated'), card?.querySelector('.fa-trophy') !== null]).toEqual([false, true, false]);
    });

    it('shows the stored primary holdout score, not the word Scored, for a metric the legacy list did not know', () => {
      const fixture = renderWith(publishedModel(), runWithOutcome('model'));
      const row = fixture.nativeElement.querySelector('.pl-model-row') as HTMLElement;
      expect(row.textContent).toContain('log-loss 0.4123');
      expect(row.textContent).not.toContain('Scored');
    });

    const algorithmCard = (model: MJMLModelEntity, run: MJMLTrainingRunEntity): Element | null => {
      const fixture = renderWith(model, run, 'dag');
      const node = queryAll(fixture, '[data-testid="ps-pipelines-node"]').find((n) => n.textContent?.includes('Algorithm'));
      (node as HTMLElement).click();
      fixture.detectChanges();
      return query(fixture, '[data-testid="ps-pipelines-model-card"]');
    };

    it('titles the algorithm card "Latest model (not published)" with no Active tag or trophy when no model is published', () => {
      for (const outcome of ['model', 'keep-simple-baseline'] as const) {
        const card = algorithmCard(publishedModel({ Status: 'Draft' }), runWithOutcome(outcome));
        expect(card?.textContent).toContain('Latest model (not published)');
        expect([card?.textContent?.includes('Current Serving Winner'), card?.textContent?.includes('Active'), card?.querySelector('.fa-trophy') !== null]).toEqual([false, false, false]);
      }
    });

    it('titles the algorithm card "Current Serving Winner" with an Active trophy for a published model whose run shipped it', () => {
      const card = algorithmCard(publishedModel(), runWithOutcome('model'));
      expect(card?.textContent).toContain('Current Serving Winner');
      expect(card?.querySelector('.fa-trophy')).not.toBeNull();
    });

    it('never calls a published model whose run found no signal the serving winner', () => {
      const card = algorithmCard(publishedModel(), runWithOutcome('no-signal'));
      expect([card?.textContent?.includes('Current Serving Winner'), card?.textContent?.includes('Published model')]).toEqual([false, true]);
    });

    const flat = (el: Element | null): string => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const readiness = (fixture: ReturnType<typeof renderWith>): string => flat(query(fixture, '[data-testid="ps-pipelines-readiness"]'));

    it('reads Inference Readiness "Ready" for a published model whose stored gate outcome shipped it', () => {
      const shown = readiness(renderWith(publishedModel(), runWithOutcome('model')));
      expect([shown.startsWith('Inference Readiness Ready'), shown.includes('v2 is published')]).toEqual([true, true]);
    });

    it('says inference is not ready, and why, whenever no published model was shipped by its gate', () => {
      const cases: [MJMLModelEntity, MJMLTrainingRunEntity, string][] = [
        [publishedModel({ Status: 'Draft' }), runWithOutcome('model'), 'No model of this pipeline is published'],
        [publishedModel(), runWithOutcome('keep-simple-baseline'), 'kept a simple baseline'],
        [publishedModel(), runWithOutcome('no-signal'), 'found no signal'],
        [publishedModel(), runWithOutcome(null), 'stores no gate decision'],
      ];
      for (const [model, run, why] of cases) {
        const shown = readiness(renderWith(model, run));
        expect([shown.startsWith('Inference Readiness Not ready'), shown.includes(why), shown.includes('scoring enabled')]).toEqual([true, true, false]);
      }
      expect(readiness(render([makePipeline()]))).toContain('No model has been trained for this pipeline yet');
    });

    it('names no active serving model while the only model is a draft', () => {
      const fixture = renderWith(publishedModel({ Status: 'Draft' }), runWithOutcome('model'));
      expect(flat(query(fixture, '[data-testid="ps-pipelines-serving-model"]'))).toContain('No published model serving live predictions yet');
    });

    it('puts a trophy on the pipeline card and header score only when the stored gate outcome shipped a model', () => {
      const kept = renderWith(publishedModel(), runWithOutcome('keep-simple-baseline'));
      const keptBadges = queryAll(kept, '.pl-metric-badge');
      expect(keptBadges.length).toBe(2);
      for (const b of keptBadges) {
        expect(b.textContent).toContain('log-loss 0.4123');
        expect(b.querySelector('.fa-trophy')).toBeNull();
      }
      const shipped = renderWith(publishedModel(), runWithOutcome('model'));
      const shippedBadges = queryAll(shipped, '.pl-metric-badge');
      expect(shippedBadges.length).toBe(2);
      for (const b of shippedBadges) expect(b.querySelector('.fa-trophy')).not.toBeNull();
    });
  });
});
