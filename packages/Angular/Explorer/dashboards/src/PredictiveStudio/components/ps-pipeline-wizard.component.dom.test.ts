import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { RenderComponentFixture, Query, QueryAll } from '@memberjunction/ng-test-utils';
import type { EntityFieldInfo, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLAlgorithmEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { FeatureStepGraph } from '@memberjunction/predictive-studio-core';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PipelineWizardBindings } from './ps-pipeline-wizard.bindings';
import { PSPipelineWizardComponent } from './ps-pipeline-wizard.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for the pipeline wizard's target, adverse-class and hyperparameter handling. The provider, engine and
 * catalog rows are plain doubles (Object.create(null) + assign, no casts); the label read and the bound save are spied,
 * so no unit or protocol is written.
 */

const field = (Name: string, Type: string): EntityFieldInfo => Object.assign(Object.create(null), { Name, Type, AllowsNull: true });

const ENTITY: EntityInfo = Object.assign(Object.create(null), {
  ID: 'E1', Name: 'Members', BaseView: 'vwMembers', VirtualEntity: false, AllowUserSearchAPI: true,
  Fields: [field('ID', 'uniqueidentifier'), field('Tenure', 'int'), field('Segment', 'nvarchar'), field('Region', 'nvarchar')],
});

const WIDE: EntityInfo = Object.assign(Object.create(null), {
  ID: 'W1', Name: 'Wide Members', BaseView: 'vwWideMembers', VirtualEntity: false, AllowUserSearchAPI: true,
  Fields: [field('ID', 'uniqueidentifier'), field('Tenure', 'int'), field('Spend', 'decimal'), field('Age', 'int'), field('Segment', 'nvarchar'), field('Region', 'nvarchar'), field('Tier', 'nvarchar')],
});

const algorithm = (ID: string, Name: string, properties: string[]): MJMLAlgorithmEntity =>
  Object.assign(Object.create(null), {
    ID, Name, DriverClass: Name.toLowerCase(), DefaultHyperparameters: null,
    HyperparameterSchema: JSON.stringify({ type: 'object', properties: Object.fromEntries(properties.map((p) => [p, { type: 'number' }])) }),
  });

const XGB = algorithm('A1', 'XGBoost', ['n_estimators', 'max_depth', 'learning_rate', 'subsample']);
const LOGISTIC = algorithm('A2', 'Logistic', ['C', 'penalty']);

function renderWizard(algorithms: MJMLAlgorithmEntity[] = [XGB], clone?: MJMLTrainingPipelineEntity): ComponentFixture<PSPipelineWizardComponent> {
  const provider: IMetadataProvider = Object.assign(Object.create(null), { Entities: [ENTITY, WIDE], CurrentUser: { ID: 'U1' } });
  const engine: PredictiveStudioEngine = Object.assign(Object.create(null), { Algorithms: algorithms });
  return RenderComponentFixture(PSPipelineWizardComponent, { inputs: clone ? { provider, engine, CloneFromPipeline: clone } : { provider, engine } });
}

const settle = async (fixture: ComponentFixture<PSPipelineWizardComponent>): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
};

/** Chooses an option of a wizard `<select>` the way a user does: set its value and fire `change`. */
function choose(fixture: ComponentFixture<PSPipelineWizardComponent>, selector: string, label: string): void {
  const select = Query(fixture, selector);
  if (!(select instanceof HTMLSelectElement)) throw new Error(`${selector} is not a select`);
  const option = Array.from(select.options).find((o) => o.textContent?.trim().startsWith(label));
  if (!option) throw new Error(`${selector} has no option ${label}`);
  select.value = option.value;
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

async function goalStep(fixture: ComponentFixture<PSPipelineWizardComponent>, target: string, entityId = 'E1'): Promise<void> {
  const c = fixture.componentInstance;
  c.PipelineName = 'Segment model';
  c.OnEntitySelected(entityId);
  choose(fixture, '#target-variable', target);
  await settle(fixture);
}

/** Captures the pipeline the wizard hands to the bound save. */
function captureSave(): { Saved: MJMLTrainingPipelineEntity[] } {
  const captured: { Saved: MJMLTrainingPipelineEntity[] } = { Saved: [] };
  vi.spyOn(PipelineWizardBindings, 'SaveWithBindings').mockImplementation(async (p) => {
    captured.Saved.push(p);
    return { Ok: true };
  });
  return captured;
}

/** A pipeline double the wizard fills in place of a saved entity object. */
function pipelineDouble(): MJMLTrainingPipelineEntity {
  return Object.assign(Object.create(null), { NewRecord: (): boolean => true, Hyperparameters: null, FeatureSteps: null });
}

afterEach(() => vi.restoreAllMocks());

describe('PSPipelineWizardComponent (DOM) — the target column', () => {
  it('marks the chosen target as the label: unchecked and locked in step 2, and left out of the feature count', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B']);
    const fixture = renderWizard();
    await goalStep(fixture, 'Region');
    const c = fixture.componentInstance;
    const region = c.FieldItems.find((i) => i.field.Name === 'Region');
    expect([region?.isTarget, region?.selected, c.SelectedFeaturesCount]).toEqual([true, false, 2]);
    c.GoToStep('features');
    await settle(fixture); // ngModel applies [disabled] after a tick
    const row = QueryAll(fixture, '[data-testid="ps-wizard-step-features"] tr').find((r) => r.textContent?.includes('Region'));
    const box = row?.querySelector('input[type="checkbox"]');
    expect([row?.classList.contains('target-row'), box instanceof HTMLInputElement && box.disabled]).toEqual([true, true]);
  });

  it('frees the previous target when the user picks another one', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B']);
    const fixture = renderWizard();
    await goalStep(fixture, 'Region');
    choose(fixture, '#target-variable', 'Segment');
    await settle(fixture);
    const items = fixture.componentInstance.FieldItems;
    const flags = (name: string) => items.filter((i) => i.field.Name === name).map((i) => [i.isTarget, i.selected]);
    expect([flags('Region'), flags('Segment')]).toEqual([[[false, true]], [[true, false]]]);
  });
});

describe('PSPipelineWizardComponent (DOM) — the primary score', () => {
  it('offers no evaluation-metric choice it would not save: the Evaluation Protocol names the score a run ranks by', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B']);
    const fixture = renderWizard();
    await goalStep(fixture, 'Region');
    expect(Query(fixture, '#eval-metric')).toBeNull();
    expect(Query(fixture, '[data-testid="ps-wizard-metric-note"]')?.textContent).toContain('Evaluation Protocol');
  });
});

describe('PSPipelineWizardComponent (DOM) — the adverse class of a two-class target', () => {
  it('asks which class is adverse when the target name says nothing, and saves only once it is chosen', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['B', 'A', 'A']);
    const fixture = renderWizard();
    await goalStep(fixture, 'Segment');
    const c = fixture.componentInstance;
    expect(Query(fixture, '[data-testid="ps-wizard-adverse-class"]')).not.toBeNull();
    expect([c.AdverseClassChoices, c.CanProceed()]).toEqual([['A', 'B'], false]);
    choose(fixture, '#adverse-class', 'B');
    expect([c.AdverseClass, c.CanProceed(), c.CanSave()]).toEqual(['B', true, true]);
  });

  it('saves the chosen adverse class on the pipeline, and leaves the target out of every feature step', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B']);
    const captured = captureSave();
    const fixture = renderWizard();
    const provider = fixture.componentInstance.provider;
    if (provider) Object.assign(provider, { GetEntityObject: async (): Promise<MJMLTrainingPipelineEntity> => pipelineDouble() });
    await goalStep(fixture, 'Segment');
    choose(fixture, '#adverse-class', 'B');
    await fixture.componentInstance.SaveDraft();
    const graph: FeatureStepGraph & { OutcomeConfig?: { OutcomeStyles?: Record<string, { BadgeColor: string }> } } = JSON.parse(captured.Saved[0]?.FeatureSteps || '{}');
    const select = graph.Steps.find((st) => st.Kind === 'select');
    expect(select !== undefined && select.Kind === 'select' ? select.Columns : null).toEqual(['Tenure', 'Region']);
    expect(graph.Steps.some((st) => st.Kind === 'onehot' && st.Column === 'Segment')).toBe(false);
    expect(graph.OutcomeConfig?.OutcomeStyles).toEqual({ A: { BadgeColor: 'green' }, B: { BadgeColor: 'red' } });
  });

  it('drops the adverse-class choice, and a read still in flight for the old target, when the user picks another entity', async () => {
    let finishLateRead: (labels: string[]) => void = () => undefined;
    const reads = vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValueOnce(['A', 'B']);
    const fixture = renderWizard();
    const c = fixture.componentInstance;
    await goalStep(fixture, 'Segment');
    choose(fixture, '#adverse-class', 'B');
    reads.mockImplementationOnce(() => new Promise<string[]>((resolve) => { finishLateRead = resolve; }));
    choose(fixture, '#target-variable', 'Region');
    c.OnEntitySelected('E1');
    finishLateRead(['X', 'Y']);
    await settle(fixture);
    expect([c.AdverseClassChoices, c.AdverseClass, Query(fixture, '[data-testid="ps-wizard-adverse-class"]')]).toEqual([[], '', null]);
  });

  it('does not ask when the target name already says which class is adverse', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['0', '1']);
    const renamed: EntityInfo = Object.assign(Object.create(null), { ...ENTITY, Fields: [...ENTITY.Fields, field('Churned', 'bit')] });
    const fixture = renderWizard();
    const provider = fixture.componentInstance.provider;
    if (provider) Object.assign(provider, { Entities: [renamed] });
    await goalStep(fixture, 'Churned');
    expect([fixture.componentInstance.AdverseClassChoices, Query(fixture, '[data-testid="ps-wizard-adverse-class"]')]).toEqual([[], null]);
  });
});

describe('PSPipelineWizardComponent (DOM) — algorithm hyperparameters', () => {
  async function savedHyperparameters(algorithms: MJMLAlgorithmEntity[]): Promise<{ Saved: string | null; Inputs: number }> {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const captured = captureSave();
    const fixture = renderWizard(algorithms);
    const provider = fixture.componentInstance.provider;
    if (provider) Object.assign(provider, { GetEntityObject: async (): Promise<MJMLTrainingPipelineEntity> => pipelineDouble() });
    await goalStep(fixture, 'Segment');
    const c = fixture.componentInstance;
    c.GoToStep('algorithm');
    const inputs = QueryAll(fixture, '#hp-estimators, #hp-max-depth, #hp-learning-rate').length;
    c.HyperparamEstimators = 250;
    c.HyperparamMaxDepth = 4;
    c.HyperparamLearningRate = 0.05;
    await c.SaveDraft();
    return { Saved: captured.Saved[0]?.Hyperparameters ?? null, Inputs: inputs };
  }

  it('saves the values the user set, under the keywords the algorithm takes', async () => {
    const r = await savedHyperparameters([XGB]);
    expect([r.Inputs, JSON.parse(r.Saved || 'null')]).toEqual([3, { n_estimators: 250, max_depth: 4, learning_rate: 0.05 }]);
  });

  it('shows and saves none of them for an algorithm that takes none', async () => {
    expect(await savedHyperparameters([LOGISTIC])).toEqual({ Saved: null, Inputs: 0 });
  });
});

describe('PSPipelineWizardComponent (DOM) — every control round-trips', () => {
  /** Renders a wizard whose provider hands out a pipeline double, ready to save. */
  function saveable(clone?: MJMLTrainingPipelineEntity): ComponentFixture<PSPipelineWizardComponent> {
    const fixture = renderWizard([XGB], clone);
    const provider = fixture.componentInstance.provider;
    if (provider) Object.assign(provider, { GetEntityObject: async (): Promise<MJMLTrainingPipelineEntity> => pipelineDouble() });
    return fixture;
  }

  const steps = (p: MJMLTrainingPipelineEntity | undefined): FeatureStepGraph['Steps'] => (JSON.parse(p?.FeatureSteps || '{"Steps":[]}') as FeatureStepGraph).Steps;

  it('saves the chosen imputation strategy as one impute step per selected numeric column, and constant as zero', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const captured = captureSave();
    const fixture = saveable();
    await goalStep(fixture, 'Segment');
    fixture.componentInstance.ImputeStrategy = 'mean';
    await fixture.componentInstance.SaveDraft();
    fixture.componentInstance.ImputeStrategy = 'constant';
    await fixture.componentInstance.SaveDraft();
    const impute = (i: number) => steps(captured.Saved[i]).filter((st) => st.Kind === 'impute');
    expect(impute(0)).toEqual([{ Id: 'step_impute_Tenure', Kind: 'impute', Label: 'Impute Tenure', Inputs: ['step_select'], Column: 'Tenure', Strategy: 'mean' }]);
    expect(impute(1)).toEqual([{ Id: 'step_impute_Tenure', Kind: 'impute', Label: 'Impute Tenure', Inputs: ['step_select'], Column: 'Tenure', Strategy: 'constant', FillValue: 0 }]);
  });

  it('saves the default median explicitly, and no impute step for a deselected column', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const captured = captureSave();
    const fixture = saveable();
    await goalStep(fixture, 'Segment', 'W1');
    const c = fixture.componentInstance;
    const age = c.FieldItems.find((i) => i.field.Name === 'Age');
    if (age) age.selected = false;
    await c.SaveDraft();
    expect(steps(captured.Saved[0]).filter((st) => st.Kind === 'impute').map((st) => st.Kind === 'impute' ? [st.Column, st.Strategy] : null)).toEqual([['Tenure', 'median'], ['Spend', 'median']]);
  });

  it('offers no encoding or scaling choice, and says the trainer standardizes numerics and one-hot encodes text every time', async () => {
    const fixture = renderWizard();
    fixture.componentInstance.GoToStep('preprocessing');
    await settle(fixture);
    const step = Query(fixture, '[data-testid="ps-wizard-step-preprocessing"]');
    const note = Query(fixture, '[data-testid="ps-wizard-encoding-note"]')?.textContent?.replace(/\s+/g, ' ').trim();
    expect([step?.querySelectorAll('select').length, note]).toEqual([
      1,
      'Every time it trains, the trainer standardizes each numeric column (mean 0, variance 1) and one-hot encodes each text column, with its own "missing" level. Neither is a choice.',
    ]);
  });

  it('saves the standardize and one-hot steps that describe what the trainer does', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const captured = captureSave();
    const fixture = saveable();
    await goalStep(fixture, 'Segment', 'W1');
    await fixture.componentInstance.SaveDraft();
    const saved = steps(captured.Saved[0]);
    expect([
      saved.filter((st) => st.Kind === 'standardize').map((st) => st.Kind === 'standardize' ? st.Columns : null),
      saved.filter((st) => st.Kind === 'onehot').map((st) => st.Kind === 'onehot' ? st.Column : null),
    ]).toEqual([[['Tenure', 'Spend', 'Age']], ['Region', 'Tier']]);
  });

  it('clones every saved setting: save A with non-default choices, clone it, and B saves the same steps and validation', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const captured = captureSave();
    const first = saveable();
    await goalStep(first, 'Segment', 'W1');
    const a = first.componentInstance;
    for (const name of ['Age', 'Tier']) {
      const item = a.FieldItems.find((i) => i.field.Name === name);
      if (item) item.selected = false;
    }
    a.ImputeStrategy = 'mode';
    a.ValidationStrategyType = 'kfold';
    a.KFolds = 7;
    await a.SaveDraft();
    const pipelineA = captured.Saved[0];

    const second = saveable(pipelineA);
    await settle(second);
    const b = second.componentInstance;
    expect([b.ImputeStrategy, b.ValidationStrategyType, b.KFolds]).toEqual(['mode', 'kfold', 7]);
    await b.SaveDraft();
    const pipelineB = captured.Saved[1];
    expect(pipelineB?.FeatureSteps).toEqual(pipelineA?.FeatureSteps);
    expect(pipelineB?.ValidationStrategy).toEqual(pipelineA?.ValidationStrategy);
    expect(steps(pipelineA).some((st) => st.Kind === 'standardize')).toBe(true);
  });

  it('clones the adverse class of a two-class target: B saves without a re-pick and equals A, OutcomeConfig included', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B']);
    const captured = captureSave();
    const first = saveable();
    await goalStep(first, 'Segment', 'W1');
    choose(first, '#adverse-class', 'B');
    await first.componentInstance.SaveDraft();

    const second = saveable(captured.Saved[0]);
    await settle(second);
    const b = second.componentInstance;
    expect([b.AdverseClass, b.AdverseClassChoices, b.CanSave()]).toEqual(['B', ['A', 'B'], true]);
    await b.SaveDraft();
    expect(captured.Saved[1]?.FeatureSteps).toEqual(captured.Saved[0]?.FeatureSteps);
    expect(JSON.parse(captured.Saved[1]?.FeatureSteps || '{}').OutcomeConfig.OutcomeStyles).toEqual({ A: { BadgeColor: 'green' }, B: { BadgeColor: 'red' } });
  });

  it('does not carry a cloned adverse class over to another target chosen before the first class read resolves', async () => {
    const read = vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B']);
    const captured = captureSave();
    const first = saveable();
    await goalStep(first, 'Segment', 'W1');
    choose(first, '#adverse-class', 'B');
    await first.componentInstance.SaveDraft();

    let finishCloneRead: (labels: string[]) => void = () => undefined;
    read.mockReset();
    read.mockImplementationOnce(() => new Promise<string[]>((resolve) => { finishCloneRead = resolve; }));
    read.mockResolvedValue(['A', 'B']);
    const second = saveable(captured.Saved[0]);
    choose(second, '#target-variable', 'Region');
    await settle(second);
    finishCloneRead(['A', 'B']);
    await settle(second);
    const b = second.componentInstance;
    expect([b.TargetVariable, b.AdverseClassChoices, b.AdverseClass, b.CanSave()]).toEqual(['Region', ['A', 'B'], '', false]);
    choose(second, '#adverse-class', 'A');
    expect(b.CanSave()).toBe(true);
  });

  it('clones the protocol-default inner validation', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const captured = captureSave();
    const first = saveable();
    await goalStep(first, 'Segment', 'W1');
    await first.componentInstance.SaveDraft();
    const second = saveable(captured.Saved[0]);
    await settle(second);
    await second.componentInstance.SaveDraft();
    expect([captured.Saved[1]?.FeatureSteps, captured.Saved[1]?.ValidationStrategy]).toEqual([captured.Saved[0]?.FeatureSteps, captured.Saved[0]?.ValidationStrategy]);
    expect(second.componentInstance.ValidationStrategyType).toEqual('train_test_split');
  });

  it('saves only the ValidationStrategy fields the protocol mapping reads: Strategy, K for k-fold, the fixed holdout share; never a TestSize', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const captured = captureSave();
    const first = saveable();
    await goalStep(first, 'Segment', 'W1');
    await first.componentInstance.SaveDraft();
    const kfold = saveable();
    await goalStep(kfold, 'Segment', 'W1');
    kfold.componentInstance.ValidationStrategyType = 'kfold';
    kfold.componentInstance.KFolds = 7;
    await kfold.componentInstance.SaveDraft();
    expect(captured.Saved.map((p) => JSON.parse(p.ValidationStrategy || '{}'))).toEqual([
      { Strategy: 'train_test_split', LockedHoldoutFraction: 0.15 },
      { Strategy: 'kfold', LockedHoldoutFraction: 0.15, K: 7 },
    ]);
  });

  it('offers no test-holdout slider, and says evaluation follows the Evaluation Protocol the pipeline is bound to, by name', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const fixture = saveable();
    await goalStep(fixture, 'Segment', 'W1');
    fixture.componentInstance.GoToStep('algorithm');
    fixture.detectChanges();
    const card = Query(fixture, '[data-testid="ps-wizard-validation"]');
    expect(card?.querySelectorAll('input[type="range"]').length).toBe(0);
    expect(Query(fixture, '[data-testid="ps-wizard-protocol-note"]')?.textContent?.replace(/\s+/g, ' ')).toContain('Evaluation Protocol "Segment model — protocol"');
  });

  it('keeps the defaults, and does not throw, when the cloned FeatureSteps or ValidationStrategy is unreadable', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const broken: MJMLTrainingPipelineEntity = Object.assign(pipelineDouble(), {
      Name: 'Broken', Description: '', TargetEntityID: 'W1', TargetVariable: 'Segment', ProblemType: 'classification',
      FeatureSteps: '{not json', ValidationStrategy: '{not json', LeakageGuard: null,
    });
    const fixture = saveable(broken);
    await settle(fixture);
    const c = fixture.componentInstance;
    expect([c.ImputeStrategy, c.ValidationStrategyType, c.KFolds, c.SelectedFeaturesCount])
      .toEqual(['median', 'train_test_split', 5, 5]);
  });
});
