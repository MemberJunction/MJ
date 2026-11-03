import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { RenderComponentFixture, Query, QueryAll } from '@memberjunction/ng-test-utils';
import type { EntityFieldInfo, EntityInfo, IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import type { MJMLAlgorithmEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
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

/** The TS type MJ metadata gives each SQL type the fixtures use (EntityFieldInfo.TSType). */
const TS_TYPES: Record<string, 'string' | 'number' | 'boolean'> = { int: 'number', decimal: 'number', real: 'number', bit: 'boolean' };

const field = (Name: string, Type: string, IsPrimaryKey = false): EntityFieldInfo =>
  Object.assign(Object.create(null), { Name, Type, TSType: TS_TYPES[Type] || 'string', IsPrimaryKey, AllowsNull: true });

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

/** A saved Prediction Unit (or protocol) row double: the columns the row writer set. */
interface UnitRowDouble {
  ID: string;
  LabelRule?: string;
  Name?: string;
  [column: string]: string | number | boolean | null | object | undefined;
}

/** A provider double that saves through the real binding, with the pipelines and units it saved, in order. */
interface BoundWorld {
  readonly Provider: IMetadataProvider;
  readonly Pipelines: MJMLTrainingPipelineEntity[];
  readonly Units: UnitRowDouble[];
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

  it('imputes the columns the trainer types as numeric (TSType number, not a primary key): a real column yes, a numeric key no', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const captured = captureSave();
    const scored: EntityInfo = Object.assign(Object.create(null), {
      ID: 'S1', Name: 'Scored Members', BaseView: 'vwScored', VirtualEntity: false, AllowUserSearchAPI: true,
      Fields: [field('MemberNo', 'int', true), field('Score', 'real'), field('Tenure', 'int'), field('Segment', 'nvarchar')],
    });
    const fixture = saveable();
    const provider = fixture.componentInstance.provider;
    if (provider) Object.assign(provider, { Entities: [scored] });
    await goalStep(fixture, 'Segment', 'S1');
    await fixture.componentInstance.SaveDraft();
    expect(steps(captured.Saved[0]).filter((st) => st.Kind === 'impute').map((st) => st.Kind === 'impute' ? st.Column : null)).toEqual(['Score', 'Tenure']);
  });

  it('disables the imputation strategy, saying why, while no numeric feature is selected: there is nothing for it to apply to', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const fixture = saveable();
    await goalStep(fixture, 'Segment');
    const c = fixture.componentInstance;
    const imputeSelect = async (): Promise<{ Disabled: boolean | 'no select'; Note: string | null }> => {
      c.GoToStep('preprocessing');
      await settle(fixture); // ngModel applies [disabled] after a tick
      const select = Query(fixture, '[data-testid="ps-wizard-impute-strategy"]');
      const note = Query(fixture, '[data-testid="ps-wizard-impute-note"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
      return { Disabled: select instanceof HTMLSelectElement ? select.disabled : 'no select', Note: note };
    };
    expect(await imputeSelect()).toEqual({ Disabled: false, Note: null });
    const tenure = c.FieldItems.find((i) => i.field.Name === 'Tenure');
    if (tenure) tenure.selected = false;
    expect(await imputeSelect()).toEqual({
      Disabled: true,
      Note: 'No numeric feature is selected, so there is nothing to impute and no strategy is saved.',
    });
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

  it('saves only the steps that change training: select and one impute per numeric column, no standardize or one-hot', async () => {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockResolvedValue(['A', 'B', 'C']);
    const captured = captureSave();
    const fixture = saveable();
    await goalStep(fixture, 'Segment', 'W1');
    await fixture.componentInstance.SaveDraft();
    expect(steps(captured.Saved[0]).map((st) => st.Id)).toEqual(['step_select', 'step_impute_Tenure', 'step_impute_Spend', 'step_impute_Age']);
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
    expect(steps(pipelineA).map((st) => st.Kind)).toEqual(['select', 'impute', 'impute']);
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

  /**
   * A provider whose entity objects save through the real `SaveWithBindings` (unit, protocol, then the pipeline, which
   * `bind()` rewrites), and whose view returns the saved unit rows by ID — the wizard's clone reads its unit back here.
   */
  function boundWorld(): BoundWorld {
    const w: BoundWorld = { Provider: Object.create(null), Pipelines: [], Units: [] };
    const saveable = <T extends { ID: string }>(into: T[], prefix: string, extra: Record<string, null>): T => {
      const r: T = Object.assign(Object.create(null), {
        ID: '', LatestResult: null, ...extra, NewRecord: (): boolean => true,
        Save: async (): Promise<boolean> => {
          // a pipeline's ID is minted on save; a unit's row writer already set its own
          if (!r.ID) r.ID = `${prefix}-${into.length + 1}`;
          into.push(r);
          return true;
        },
      });
      return r;
    };
    Object.assign(w.Provider, {
      Entities: [ENTITY, WIDE], CurrentUser: { ID: 'U1' },
      GetEntityObject: async (entity: string): Promise<MJMLTrainingPipelineEntity | UnitRowDouble> => {
        if (entity === 'MJ: ML Training Pipelines') return saveable(w.Pipelines, 'P', { Hyperparameters: null, FeatureSteps: null, PredictionUnitID: null });
        return saveable<UnitRowDouble>(entity === 'MJ: Prediction Units' ? w.Units : [], entity === 'MJ: Prediction Units' ? 'U' : 'EP', {});
      },
      RunView: async (params: RunViewParams): Promise<RunViewResult<UnitRowDouble>> => {
        const rows = params.EntityName === 'MJ: Prediction Units' ? w.Units.filter((u) => typeof params.ExtraFilter === 'string' && params.ExtraFilter.includes(`'${u.ID}'`)) : [];
        return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
      },
    });
    return w;
  }

  /** The label read as the view answers it: the classes of a real column, and the view's error for any other name. */
  function readLabelsOfRealColumns(): void {
    vi.spyOn(PipelineWizardBindings, 'ReadClassLabels').mockImplementation(async (f) => {
      if (!WIDE.Fields.some((x) => x.Name === f.TargetVariable)) throw new Error(`Invalid column name '${f.TargetVariable}'`);
      return ['A', 'B'];
    });
  }

  it('clones a pipeline saved through the real binding: B gets back the target column, adverse class and steps, with no error notice', async () => {
    readLabelsOfRealColumns();
    const notify = vi.spyOn(MJNotificationService.prototype, 'CreateSimpleNotification');
    const w = boundWorld();
    const first = RenderComponentFixture(PSPipelineWizardComponent, { inputs: { provider: w.Provider, engine: Object.assign(Object.create(null), { Algorithms: [XGB] }) } });
    await goalStep(first, 'Segment', 'W1');
    choose(first, '#adverse-class', 'B');
    await first.componentInstance.SaveDraft();
    const a = w.Pipelines[0];
    // bind() wrote the unit's rule text over the label column, as the server requires
    expect([a?.TargetVariable, Boolean(a?.PredictionUnitID)]).toEqual(['Segment within 1 days', true]);

    const second = RenderComponentFixture(PSPipelineWizardComponent, { inputs: { provider: w.Provider, engine: Object.assign(Object.create(null), { Algorithms: [XGB] }), CloneFromPipeline: a } });
    await settle(second);
    const b = second.componentInstance;
    const segment = b.FieldItems.find((i) => i.field.Name === 'Segment');
    expect([b.TargetVariable, segment?.isTarget, segment?.selected, b.AdverseClass, b.CanSave()]).toEqual(['Segment', true, false, 'B', true]);
    await b.SaveDraft();
    const pipelineB = w.Pipelines[1];
    expect([w.Units[1]?.LabelRule, pipelineB?.TargetVariable]).toEqual([w.Units[0]?.LabelRule, a?.TargetVariable]);
    expect(PipelineWizardBindings.AdverseClassFromFeatureSteps(pipelineB?.FeatureSteps || null)).toBe('B');
    expect(pipelineB?.FeatureSteps).toEqual(a?.FeatureSteps);
    expect(notify.mock.calls.filter(([, style]) => style === 'error' || style === 'warning')).toEqual([]);
  });

  it('opens a clone whose unit labels rows by a rule, not a column, with the target unset and a note naming the unit', async () => {
    readLabelsOfRealColumns();
    const notify = vi.spyOn(MJNotificationService.prototype, 'CreateSimpleNotification');
    const w = boundWorld();
    const first = RenderComponentFixture(PSPipelineWizardComponent, { inputs: { provider: w.Provider, engine: Object.assign(Object.create(null), { Algorithms: [XGB] }) } });
    await goalStep(first, 'Segment', 'W1');
    choose(first, '#adverse-class', 'B');
    await first.componentInstance.SaveDraft();
    const unit = w.Units[0];
    if (unit) unit.LabelRule = JSON.stringify({ kind: 'next-period', periodIndexField: 'Tenure', offset: 1 });

    const second = RenderComponentFixture(PSPipelineWizardComponent, { inputs: { provider: w.Provider, engine: Object.assign(Object.create(null), { Algorithms: [XGB] }), CloneFromPipeline: w.Pipelines[0] } });
    await settle(second);
    const b = second.componentInstance;
    expect([b.TargetVariable, b.FieldItems.some((i) => i.isTarget), b.CanSave()]).toEqual(['', false, false]);
    expect(notify.mock.calls.map(([message]) => message).filter((m) => m.includes(String(unit?.Name)))).toHaveLength(1);
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
