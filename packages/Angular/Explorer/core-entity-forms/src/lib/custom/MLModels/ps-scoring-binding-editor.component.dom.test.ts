import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { AuthorizationInfo, EntityInfo, RunView, type IMetadataProvider, type RemoteOpResult, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { ValidationErrorInfo } from '@memberjunction/global';
import {
  PredictiveStudioWithdrawScoringBindingOperation,
  type MJMLModelEntity,
  type MJMLModelScoringBindingEntity,
  type PredictiveStudioWithdrawScoringBindingInput,
  type PredictiveStudioWithdrawScoringBindingOutput,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CreateFakeProvider, Query, QueryAll, RenderComponentFixture } from '@memberjunction/ng-test-utils';
import { PredictionViewAuthorization } from '@memberjunction/predictive-studio-core';
import { PSScoringBindingEditorComponent } from './ps-scoring-binding-editor.component';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for <ps-scoring-binding-editor> (§5.8.2, §5.4): a binding is created with no column and the seeded view
 * authorization by default, saved through the entity layer (the server's `MJMLModelScoringBindingEntityServer`
 * validation), each refusal shown beside its field, and withdrawn through `PredictiveStudio.WithdrawScoringBinding`.
 */

/** The model members the editor reads. */
type ModelDouble = Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Pipeline' | 'ProblemType' | 'Version'>;

/** The binding fields the editor writes, plus the members of the entity layer it calls. */
class BindingDouble {
  public ID = '';
  public MLTrainingPipelineID = '';
  public FeatureName = '';
  public TargetEntityID: string | null = null;
  public TargetColumn: string | null = null;
  public TargetColumnSource: string | null = null;
  public ViewAuthorizationID: string | null = null;
  public RetentionDays: number | null = null;
  public Status: MJMLModelScoringBindingEntity['Status'] = 'Active';
  public LatestResult: { Success: boolean; Errors: ValidationErrorInfo[]; CompleteMessage: string } | null = null;

  /** The stored values {@link Revert} restores; set by {@link MarkStored} and by a successful save. */
  private stored: ReturnType<BindingDouble['fields']> | null = null;

  constructor(private readonly world: World) {}

  public NewRecord(): boolean {
    return true;
  }

  /** Records the current values as the stored row (an existing binding the read returned). */
  public MarkStored(): this {
    this.stored = this.fields();
    return this;
  }

  /** Puts back the stored values, as `BaseEntity.Revert` does. */
  public Revert(): boolean {
    if (this.stored) Object.assign(this, this.stored);
    return true;
  }

  public async Save(): Promise<boolean> {
    const refusal = this.world.SaveRefusal;
    if (refusal) {
      this.LatestResult = { Success: false, Errors: [new ValidationErrorInfo(refusal.Source, refusal.Message, null)], CompleteMessage: refusal.Message };
      return false;
    }
    this.ID = this.ID || `B-${this.world.Saved.length + 1}`;
    this.world.Saved.push({ ...this.fields() });
    this.stored = this.fields();
    return true;
  }

  private fields(): Pick<BindingDouble, 'ID' | 'MLTrainingPipelineID' | 'FeatureName' | 'TargetEntityID' | 'TargetColumn' | 'TargetColumnSource' | 'ViewAuthorizationID' | 'RetentionDays'> {
    const { ID, MLTrainingPipelineID, FeatureName, TargetEntityID, TargetColumn, TargetColumnSource, ViewAuthorizationID, RetentionDays } = this;
    return { ID, MLTrainingPipelineID, FeatureName, TargetEntityID, TargetColumn, TargetColumnSource, ViewAuthorizationID, RetentionDays };
  }
}

interface World {
  Saved: Array<Partial<BindingDouble>>;
  SaveRefusal: { Source: string; Message: string } | null;
}

const viewModelPredictions = new AuthorizationInfo({ ID: 'A-VIEW', Name: PredictionViewAuthorization.DefaultName, IsActive: true });
const otherAuthorization = new AuthorizationInfo({ ID: 'A-OTHER', Name: 'Run Reports', IsActive: true });

/** A real entity: its fields' ReadOnly derives from AllowUpdateAPI and the key, as in production. */
const persons = new EntityInfo({
  ID: 'E-PERSONS',
  Name: 'Persons',
  EntityFields: [
    { Name: 'ID', IsPrimaryKey: true, AllowUpdateAPI: false },
    { Name: 'RenewalRisk', IsPrimaryKey: false, AllowUpdateAPI: true },
    { Name: 'CreatedAt', IsPrimaryKey: false, AllowUpdateAPI: false },
  ],
});

const pipeline = { ID: 'P1', Name: 'Renewal', TargetEntityID: persons.ID };
const model: ModelDouble = { ID: 'M1', PipelineID: pipeline.ID, Pipeline: pipeline.Name, ProblemType: 'classification', Version: 3 };

interface RenderOptions {
  saveRefusal?: { Source: string; Message: string };
  existing?: BindingDouble[];
  /** Holds each batched read until the returned promise settles (a slow read). */
  holdRead?: (params: RunViewParams[]) => Promise<void>;
  /** The bindings each pipeline's read returns, by pipeline ID; `existing` when absent. */
  bindingsByPipeline?: Record<string, BindingDouble[]>;
  /** The model the editor opens on; the Renewal model when absent. */
  model?: ModelDouble;
}

async function RenderEditor(o: RenderOptions = {}): Promise<{ f: ComponentFixture<PSScoringBindingEditorComponent>; world: World }> {
  const world: World = { Saved: [], SaveRefusal: o.saveRefusal || null };
  const fake = CreateFakeProvider<BindingDouble | typeof pipeline>({
    runViewResults: (p: RunViewParams) => (p.EntityName === 'MJ: ML Training Pipelines' ? [pipeline] : p.EntityName === 'MJ: ML Model Scoring Bindings' ? bindingsFor(p, o) : []),
    entities: [persons],
  });
  // the provider's own RunViews, typed through the RunView seam the editor reads with
  const runViews = RunView.FromMetadataProvider(fake).ProviderToUse;
  const fakeRunViews = runViews.RunViews.bind(runViews);
  const provider: IMetadataProvider = Object.assign(fake, {
    RunViews: async (params: RunViewParams[], user?: UserInfo) => {
      if (o.holdRead) await o.holdRead(params);
      return fakeRunViews(params, user);
    },
    Authorizations: [otherAuthorization, viewModelPredictions],
    // the editor creates its entity through the provider; the double carries only the members the editor calls
    GetEntityObject: async () => new BindingDouble(world) as unknown as MJMLModelScoringBindingEntity,
  });
  vi.spyOn(MJNotificationService.prototype, 'CreateSimpleNotification').mockImplementation(() => undefined);
  // Inputs are set untyped (setInput), so the double carrying only the members the editor reads is passed as is.
  const f = RenderComponentFixture(PSScoringBindingEditorComponent, { inputs: { Model: o.model || model, Provider: provider } });
  await settle(f);
  return { f, world };
}

/** True when the read's filter names `id` (quoted). */
function filterNames(p: RunViewParams, id: string): boolean {
  return typeof p.ExtraFilter === 'string' && p.ExtraFilter.includes(`'${id}'`);
}

/** The bindings a binding read returns: its pipeline's, from `bindingsByPipeline`, else `existing`. */
function bindingsFor(p: RunViewParams, o: RenderOptions): BindingDouble[] {
  for (const [pipelineId, rows] of Object.entries(o.bindingsByPipeline || {})) {
    if (filterNames(p, pipelineId)) return rows;
  }
  return o.existing || [];
}

const settle = async (f: ComponentFixture<PSScoringBindingEditorComponent>): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  f.detectChanges();
};
const el = <T extends Element>(f: ComponentFixture<PSScoringBindingEditorComponent>, testId: string): T => Query(f, `[data-testid="${testId}"]`) as T;
const Type = (f: ComponentFixture<PSScoringBindingEditorComponent>, testId: string, text: string): void => {
  const input = el<HTMLInputElement>(f, testId);
  input.value = text;
  input.dispatchEvent(new Event('input'));
  f.detectChanges();
};
const Choose = (f: ComponentFixture<PSScoringBindingEditorComponent>, testId: string, value: string): void => {
  const select = el<HTMLSelectElement>(f, testId);
  select.value = value;
  select.dispatchEvent(new Event('change'));
  f.detectChanges();
};
const Click = async (f: ComponentFixture<PSScoringBindingEditorComponent>, testId: string): Promise<void> => {
  el<HTMLElement>(f, testId).click();
  await settle(f);
};
const Text = (f: ComponentFixture<PSScoringBindingEditorComponent>, testId: string): string => (Query(f, `[data-testid="${testId}"]`)?.textContent || '').replace(/\s+/g, ' ').trim();

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('PSScoringBindingEditorComponent (DOM)', () => {
  it('creates a binding with no column and the seeded view authorization by default', async () => {
    const { f, world } = await RenderEditor();
    await Click(f, 'ps-binding-new');
    Type(f, 'ps-binding-feature-name', 'Renewal risk');
    await Click(f, 'ps-binding-save');
    expect(world.Saved[world.Saved.length - 1]).toMatchObject({
      FeatureName: 'Renewal risk', MLTrainingPipelineID: pipeline.ID, TargetEntityID: persons.ID,
      ViewAuthorizationID: viewModelPredictions.ID, TargetColumn: null, TargetColumnSource: null, RetentionDays: null,
    });
  });

  it('shows the validation error next to the column copy when the source does not fit the model', async () => {
    const { f } = await RenderEditor({ saveRefusal: { Source: 'TargetColumnSource', Message: 'not a class of the Published model' } });
    await Click(f, 'ps-binding-new');
    Type(f, 'ps-binding-feature-name', 'Renewal risk');
    await Click(f, 'ps-binding-copy');
    Choose(f, 'ps-binding-copy-column', 'RenewalRisk');
    Type(f, 'ps-binding-copy-source', '$.Probabilities.gold');
    await Click(f, 'ps-binding-save');
    expect(Text(f, 'ps-binding-copy-error')).toContain('not a class of the Published model');
    expect(Query(f, '[data-testid="ps-binding-feature-name-error"]')).toBeNull();
  });

  it('a column copy defaults its source to the classification\'s adverse probability and offers only updatable fields', async () => {
    const { f, world } = await RenderEditor();
    await Click(f, 'ps-binding-new');
    Type(f, 'ps-binding-feature-name', 'Renewal risk');
    await Click(f, 'ps-binding-copy');
    // the first option is the "Choose a column…" placeholder
    expect(QueryAll(f, '[data-testid="ps-binding-copy-column"] option').slice(1).map((o) => o.getAttribute('value'))).toEqual(['RenewalRisk']);
    Choose(f, 'ps-binding-copy-column', 'RenewalRisk');
    await Click(f, 'ps-binding-save');
    expect(world.Saved[0]).toMatchObject({ TargetColumn: 'RenewalRisk', TargetColumnSource: '$.AdverseProbability' });
  });

  it('states that a copied value is governed by the entity\'s field permissions, not the binding\'s authorization', async () => {
    const { f } = await RenderEditor();
    await Click(f, 'ps-binding-new');
    await Click(f, 'ps-binding-copy');
    expect(Text(f, 'ps-binding-copy-note')).toContain('field permissions');
  });

  it('withdraws an Active binding through PredictiveStudio.WithdrawScoringBinding', async () => {
    const sent: PredictiveStudioWithdrawScoringBindingInput[] = [];
    vi.spyOn(PredictiveStudioWithdrawScoringBindingOperation.prototype, 'Execute').mockImplementation(async (input: PredictiveStudioWithdrawScoringBindingInput): Promise<RemoteOpResult<PredictiveStudioWithdrawScoringBindingOutput>> => {
      sent.push(input);
      return { Success: true, ResultCode: 'SUCCESS', Output: { cleared: 2, keptHuman: 1 } };
    });
    const world: World = { Saved: [], SaveRefusal: null };
    const existing = Object.assign(new BindingDouble(world), { ID: 'B-LIVE', FeatureName: 'Renewal risk', MLTrainingPipelineID: pipeline.ID, TargetEntityID: persons.ID, ViewAuthorizationID: viewModelPredictions.ID });
    const { f } = await RenderEditor({ existing: [existing] });
    expect(Text(f, 'ps-binding-row')).toContain('Renewal risk');
    await Click(f, 'ps-binding-withdraw');
    await Click(f, 'ps-binding-withdraw-confirm');
    expect(sent).toEqual([{ bindingId: 'B-LIVE' }]);
  });

  /** A stored Active binding kept 30 days under the seeded authorization. */
  const storedBinding = (world: World): BindingDouble =>
    Object.assign(new BindingDouble(world), { ID: 'B-LIVE', FeatureName: 'Renewal risk', MLTrainingPipelineID: pipeline.ID, TargetEntityID: persons.ID, ViewAuthorizationID: viewModelPredictions.ID, RetentionDays: 30 }).MarkStored();

  it('a refused save of an existing binding leaves its row showing the stored values', async () => {
    const world: World = { Saved: [], SaveRefusal: null };
    const existing = storedBinding(world);
    const { f, world: rendered } = await RenderEditor({ existing: [existing] });
    rendered.SaveRefusal = { Source: 'RetentionDays', Message: 'too short' };
    world.SaveRefusal = rendered.SaveRefusal;
    await Click(f, 'ps-binding-edit');
    Choose(f, 'ps-binding-view-authorization', '1: A-OTHER');
    Type(f, 'ps-binding-retention', '3');
    await Click(f, 'ps-binding-save');
    // the form keeps what was typed; the row and the entity are the stored binding
    expect(Text(f, 'ps-binding-form')).toContain('too short');
    expect([existing.ViewAuthorizationID, existing.RetentionDays]).toEqual([viewModelPredictions.ID, 30]);
    expect(Text(f, 'ps-binding-row')).toContain('kept 30 days');
  });

  it('after a refusal and Cancel, editing again starts from the stored values', async () => {
    const world: World = { Saved: [], SaveRefusal: { Source: 'RetentionDays', Message: 'too short' } };
    const existing = storedBinding(world);
    const { f } = await RenderEditor({ existing: [existing] });
    await Click(f, 'ps-binding-edit');
    Type(f, 'ps-binding-retention', '3');
    await Click(f, 'ps-binding-save');
    await Click(f, 'ps-binding-cancel');
    await Click(f, 'ps-binding-edit');
    expect(el<HTMLInputElement>(f, 'ps-binding-retention').value).toBe('30');
    expect(f.componentInstance.Draft?.ViewAuthorizationID).toBe(viewModelPredictions.ID);
  });

  it('a slow read of the previous model never replaces the current model\'s bindings', async () => {
    const world: World = { Saved: [], SaveRefusal: null };
    const slowPipeline = 'P-SLOW';
    let release: () => void = () => undefined;
    const slowRead = new Promise<void>((resolve) => { release = resolve; });
    const { f } = await RenderEditor({
      bindingsByPipeline: {
        [slowPipeline]: [Object.assign(new BindingDouble(world), { ID: 'B-OLD', FeatureName: 'Old model feature', MLTrainingPipelineID: slowPipeline })],
        [pipeline.ID]: [Object.assign(new BindingDouble(world), { ID: 'B-NEW', FeatureName: 'Current model feature', MLTrainingPipelineID: pipeline.ID })],
      },
      holdRead: (params) => (params.some((p) => filterNames(p, slowPipeline)) ? slowRead : Promise.resolve()),
      model: { ...model, ID: 'M-OLD', PipelineID: slowPipeline },
    });
    f.componentRef.setInput('Model', model);
    await settle(f);
    release();
    await settle(f);
    expect(f.componentInstance.Bindings.map((b) => b.FeatureName)).toEqual(['Current model feature']);
  });
});
