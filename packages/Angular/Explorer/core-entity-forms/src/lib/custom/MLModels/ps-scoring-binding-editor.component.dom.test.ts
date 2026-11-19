import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { AuthorizationInfo, type EntityFieldInfo, type EntityInfo, type IMetadataProvider, type RemoteOpResult, type RunViewParams } from '@memberjunction/core';
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
import { PSScoringBindingEditorComponent, VIEW_MODEL_PREDICTIONS } from './ps-scoring-binding-editor.component';

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

  constructor(private readonly world: World) {}

  public NewRecord(): boolean {
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

const viewModelPredictions = new AuthorizationInfo({ ID: 'A-VIEW', Name: VIEW_MODEL_PREDICTIONS, IsActive: true });
const otherAuthorization = new AuthorizationInfo({ ID: 'A-OTHER', Name: 'Run Reports', IsActive: true });

const persons: Pick<EntityInfo, 'ID' | 'Name'> & { Fields: Array<Pick<EntityFieldInfo, 'Name' | 'ReadOnly' | 'IsPrimaryKey' | 'AllowUpdateAPI'>> } = {
  ID: 'E-PERSONS',
  Name: 'Persons',
  Fields: [
    { Name: 'ID', ReadOnly: false, IsPrimaryKey: true, AllowUpdateAPI: false },
    { Name: 'RenewalRisk', ReadOnly: false, IsPrimaryKey: false, AllowUpdateAPI: true },
    { Name: 'CreatedAt', ReadOnly: true, IsPrimaryKey: false, AllowUpdateAPI: false },
  ],
};

const pipeline = { ID: 'P1', Name: 'Renewal', TargetEntityID: persons.ID };
const model: ModelDouble = { ID: 'M1', PipelineID: pipeline.ID, Pipeline: pipeline.Name, ProblemType: 'classification', Version: 3 };

interface RenderOptions {
  saveRefusal?: { Source: string; Message: string };
  existing?: BindingDouble[];
}

async function RenderEditor(o: RenderOptions = {}): Promise<{ f: ComponentFixture<PSScoringBindingEditorComponent>; world: World }> {
  const world: World = { Saved: [], SaveRefusal: o.saveRefusal || null };
  const fake = CreateFakeProvider<BindingDouble | typeof pipeline>({
    runViewResults: (p: RunViewParams) => (p.EntityName === 'MJ: ML Training Pipelines' ? [pipeline] : p.EntityName === 'MJ: ML Model Scoring Bindings' ? o.existing || [] : []),
    // the entity double carries only the members the editor reads (its fields' updatability)
    entities: [persons as unknown as Partial<EntityInfo>],
  });
  const provider: IMetadataProvider = Object.assign(fake, {
    Authorizations: [otherAuthorization, viewModelPredictions],
    // the editor creates its entity through the provider; the double carries only the members the editor calls
    GetEntityObject: async () => new BindingDouble(world) as unknown as MJMLModelScoringBindingEntity,
  });
  vi.spyOn(MJNotificationService.prototype, 'CreateSimpleNotification').mockImplementation(() => undefined);
  // The component's input is the generated entity class; the double carries only the members it reads.
  const f = RenderComponentFixture(PSScoringBindingEditorComponent, { inputs: { Model: model as unknown as MJMLModelEntity, Provider: provider } });
  await settle(f);
  return { f, world };
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
});
