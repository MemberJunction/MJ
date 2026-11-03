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

const algorithm = (ID: string, Name: string, properties: string[]): MJMLAlgorithmEntity =>
  Object.assign(Object.create(null), {
    ID, Name, DriverClass: Name.toLowerCase(), DefaultHyperparameters: null,
    HyperparameterSchema: JSON.stringify({ type: 'object', properties: Object.fromEntries(properties.map((p) => [p, { type: 'number' }])) }),
  });

const XGB = algorithm('A1', 'XGBoost', ['n_estimators', 'max_depth', 'learning_rate', 'subsample']);
const LOGISTIC = algorithm('A2', 'Logistic', ['C', 'penalty']);

function renderWizard(algorithms: MJMLAlgorithmEntity[] = [XGB]): ComponentFixture<PSPipelineWizardComponent> {
  const provider: IMetadataProvider = Object.assign(Object.create(null), { Entities: [ENTITY], CurrentUser: { ID: 'U1' } });
  const engine: PredictiveStudioEngine = Object.assign(Object.create(null), { Algorithms: algorithms });
  return RenderComponentFixture(PSPipelineWizardComponent, { inputs: { provider, engine } });
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

async function goalStep(fixture: ComponentFixture<PSPipelineWizardComponent>, target: string): Promise<void> {
  const c = fixture.componentInstance;
  c.PipelineName = 'Segment model';
  c.OnEntitySelected('E1');
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
