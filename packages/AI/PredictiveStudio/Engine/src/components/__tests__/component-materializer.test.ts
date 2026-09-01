import { describe, it, expect } from 'vitest';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { FeatureSchemaEntry } from '@memberjunction/predictive-studio-core';

import {
  ComponentMaterializer,
  planModelMaterialization,
  bindingDataTypeForField,
  type BindingPlan,
  type IComponentEntityFactory,
  type MaterializationInput,
  type TargetEntityMetadata,
  type TargetField,
} from '../component-materializer';
import type { DatedSourceSpec } from '../../feature-assembly';
import type { FkGraphEntity } from '../join-path';

/**
 * Tests for the model → component projection. The PLANNER is pure, so most of these assert
 * on plans directly (no fakes at all); the persistence half is exercised through in-memory
 * entity stand-ins, including the failure paths that must degrade rather than throw.
 */

// ---------------------------------------------------------------------------
// Fixtures: a Members entity with real-looking fields, and an Activities child.
// ---------------------------------------------------------------------------

const MEMBERS_ENTITY_ID = 'ent-members';
const ACTIVITIES_ENTITY_ID = 'ent-activities';

function field(id: string, name: string, dataType: TargetField['DataType']): [string, TargetField] {
  return [name.toLowerCase(), { ID: id, Name: name, DataType: dataType }];
}

const MEMBERS: TargetEntityMetadata = {
  EntityID: MEMBERS_ENTITY_ID,
  EntityName: 'Members',
  FieldsByName: new Map<string, TargetField>([
    field('f-tenure', 'tenure', 'Number'),
    field('f-city', 'city', 'Category'),
    field('f-joined', 'JoinedAt', 'Date'),
    field('f-renewed', 'Renewed', 'Boolean'),
  ]),
};

const FK_GRAPH: FkGraphEntity[] = [
  { ID: MEMBERS_ENTITY_ID, Name: 'Members', Fields: [] },
  { ID: ACTIVITIES_ENTITY_ID, Name: 'Activities', Fields: [{ Name: 'MemberID', RelatedEntityID: MEMBERS_ENTITY_ID }] },
];

const ENTITY_IDS = new Map<string, string>([
  ['members', MEMBERS_ENTITY_ID],
  ['activities', ACTIVITIES_ENTITY_ID],
]);

const DATED_SOURCES: DatedSourceSpec[] = [
  {
    EntityName: 'Activities',
    ForeignKeyField: 'MemberID',
    DateField: 'ActivityDate',
    Features: [{ OutputColumn: 'activity_count_asof', Aggregate: 'count', EmitPresence: true }],
  },
];

const SCHEMA: FeatureSchemaEntry[] = [
  { Name: 'tenure', Kind: 'numeric' },
  { Name: 'city', Kind: 'categorical' },
  { Name: 'activity_count_asof', Kind: 'numeric' },
  { Name: 'activity_count_asof__present', Kind: 'numeric' },
  { Name: 'emb_0', Kind: 'embedding' },
];

function baseInput(overrides: Partial<MaterializationInput> = {}): MaterializationInput {
  return {
    componentName: 'Member Renewal Predictor v5',
    componentTypeID: 'type-xgboost',
    mlModelID: 'model-1',
    targetEntity: MEMBERS,
    targetVariable: 'Renewed',
    problemType: 'classification',
    featureSchema: SCHEMA,
    datedSources: DATED_SOURCES,
    hyperparameters: { max_depth: 4 },
    fkGraph: FK_GRAPH,
    entityIdsByName: ENTITY_IDS,
    ...overrides,
  };
}

function bindingFor(plan: { Bindings: BindingPlan[] }, role: BindingPlan['Role'], name: string): BindingPlan {
  const found = plan.Bindings.find((b) => b.Role === role && b.Name === name);
  expect(found, `no ${role} binding named '${name}'`).toBeDefined();
  return found as BindingPlan;
}

// ---------------------------------------------------------------------------

describe('bindingDataTypeForField', () => {
  it('maps MJ TS types onto the binding vocabulary, with value lists as Category', () => {
    expect(bindingDataTypeForField('number', false)).toBe('Number');
    expect(bindingDataTypeForField('boolean', false)).toBe('Boolean');
    expect(bindingDataTypeForField('Date', false)).toBe('Date');
    expect(bindingDataTypeForField('string', false)).toBe('Text');
    // A closed set of values is the thing that makes a string field reasoning-worthy.
    expect(bindingDataTypeForField('string', true)).toBe('Category');
  });
});

describe('planModelMaterialization — inputs bound to real fields', () => {
  it('binds a feature that names a target-entity field to that field', () => {
    const plan = planModelMaterialization(baseInput());
    const tenure = bindingFor(plan, 'Input', 'tenure');
    expect(tenure.EntityID).toBe(MEMBERS_ENTITY_ID);
    expect(tenure.EntityFieldID).toBe('f-tenure');
    expect(tenure.DataType).toBe('Number');
    expect(tenure.RelationshipPath).toBeNull();
    expect(tenure.Meaning).toContain('Members.tenure');
  });

  it('matches field names case-insensitively', () => {
    const plan = planModelMaterialization(
      baseInput({ featureSchema: [{ Name: 'JOINEDAT', Kind: 'numeric' }] }),
    );
    expect(bindingFor(plan, 'Input', 'JOINEDAT').EntityFieldID).toBe('f-joined');
  });

  it('never asserts a direction it cannot know', () => {
    const plan = planModelMaterialization(baseInput());
    // HigherIsBetter is a human/story judgment — inventing one would be a guess dressed as fact.
    expect(plan.Bindings.every((b) => b.HigherIsBetter === null)).toBe(true);
  });

  it('records an unresolvable derived feature rather than guessing a field', () => {
    const plan = planModelMaterialization(baseInput());
    const emb = bindingFor(plan, 'Input', 'emb_0');
    expect(emb.EntityFieldID).toBeNull();
    expect(emb.EntityID).toBe(MEMBERS_ENTITY_ID);
    expect(emb.Meaning).toContain('Derived embedding feature');
    expect(plan.Warnings.some((w) => w.includes("'emb_0'"))).toBe(true);
  });
});

describe('planModelMaterialization — as-of inputs get a real join path', () => {
  it('binds an as-of feature to the dated source entity with the resolved FK hops', () => {
    const plan = planModelMaterialization(baseInput());
    const asOf = bindingFor(plan, 'Input', 'activity_count_asof');
    expect(asOf.EntityID).toBe(ACTIVITIES_ENTITY_ID);
    expect(asOf.EntityFieldID).toBeNull();
    expect(asOf.RelationshipPath).toEqual([{ fks: ['MemberID'], entity: 'Activities' }]);
    expect(asOf.Meaning).toContain('as of the decision date');
  });

  it('gives the presence mask its own distinct meaning', () => {
    const plan = planModelMaterialization(baseInput());
    const present = bindingFor(plan, 'Input', 'activity_count_asof__present');
    expect(present.EntityID).toBe(ACTIVITIES_ENTITY_ID);
    expect(present.Meaning).toContain('separates a real zero from missing data');
  });

  it('falls back to the declared foreign key when no FK graph is supplied', () => {
    const plan = planModelMaterialization(baseInput({ fkGraph: undefined }));
    expect(bindingFor(plan, 'Input', 'activity_count_asof').RelationshipPath).toEqual([
      { fks: ['MemberID'], entity: 'Activities' },
    ]);
  });

  it('warns and falls back when the join path is unreachable, instead of throwing', () => {
    // Activities no longer points at Members → findAutoPathHops throws; we must degrade.
    const brokenGraph: FkGraphEntity[] = [
      { ID: MEMBERS_ENTITY_ID, Name: 'Members', Fields: [] },
      { ID: ACTIVITIES_ENTITY_ID, Name: 'Activities', Fields: [] },
    ];
    const plan = planModelMaterialization(baseInput({ fkGraph: brokenGraph }));
    expect(bindingFor(plan, 'Input', 'activity_count_asof').RelationshipPath).toEqual([
      { fks: ['MemberID'], entity: 'Activities' },
    ]);
    expect(plan.Warnings.some((w) => w.includes('auto-resolve the join path'))).toBe(true);
  });
});

describe('planModelMaterialization — outputs', () => {
  it('emits a probability score plus a class bound to the predicted field (classification)', () => {
    const plan = planModelMaterialization(baseInput());
    const score = bindingFor(plan, 'Output', 'score');
    expect(score.DataType).toBe('Number');
    expect(score.EntityFieldID).toBeNull();
    expect(score.Meaning).toContain('Predicted probability');

    const cls = bindingFor(plan, 'Output', 'class');
    expect(cls.EntityFieldID).toBe('f-renewed');
    expect(cls.DataType).toBe('Boolean');
  });

  it('emits a single score bound to the target field for regression', () => {
    const plan = planModelMaterialization(
      baseInput({ problemType: 'regression', targetVariable: 'tenure' }),
    );
    const outputs = plan.Bindings.filter((b) => b.Role === 'Output');
    expect(outputs).toHaveLength(1);
    expect(outputs[0].Name).toBe('score');
    expect(outputs[0].EntityFieldID).toBe('f-tenure');
  });

  it('warns when the target variable is an expression, not a field', () => {
    const plan = planModelMaterialization(baseInput({ targetVariable: 'CASE WHEN x THEN 1 ELSE 0 END' }));
    expect(bindingFor(plan, 'Output', 'class').EntityFieldID).toBeNull();
    expect(plan.Warnings.some((w) => w.includes('is not a field on'))).toBe(true);
  });
});

describe('planModelMaterialization — the component row', () => {
  it('carries the hyperparameters and the assembly facts on Spec', () => {
    const plan = planModelMaterialization(baseInput());
    expect(plan.ComponentTypeID).toBe('type-xgboost');
    expect(plan.MLModelID).toBe('model-1');
    expect(plan.Spec).toEqual({
      hyperparameters: { max_depth: 4 },
      targetEntityName: 'Members',
      targetVariable: 'Renewed',
      problemType: 'classification',
      featureCount: SCHEMA.length,
    });
  });

  it('is deterministic — same input, same plan', () => {
    expect(planModelMaterialization(baseInput())).toEqual(planModelMaterialization(baseInput()));
  });
});

// ---------------------------------------------------------------------------
// Persistence half — in-memory entity stand-ins.
// ---------------------------------------------------------------------------

/** Minimal saved-entity stand-in with a controllable Save outcome. */
class FakeRow {
  public ID = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  public SaveOk = true;
  public SaveCount = 0;
  constructor(private readonly idOnSave: string) {}
  public NewRecord(): boolean {
    return true;
  }
  public async Save(): Promise<boolean> {
    this.SaveCount++;
    if (!this.SaveOk) {
      this.LatestResult = { CompleteMessage: 'save refused' };
      return false;
    }
    this.ID = this.ID || this.idOnSave;
    return true;
  }
}

class FakeComponent extends FakeRow {
  public ComponentTypeID = '';
  public Name = '';
  public MLModelID: string | null = null;
  public Sequence = 0;
  public Spec: string | null = null;
  public IsTrained = false;
  public PromotionState = '';
  public Status = '';
  public Version = 0;
  constructor() {
    super('component-1');
  }
}

class FakeBinding extends FakeRow {
  public ComponentID = '';
  public Role = '';
  public Name = '';
  public EntityID: string | null = null;
  public EntityFieldID: string | null = null;
  public RelationshipPath: string | null = null;
  public DataType: string | null = null;
  public HigherIsBetter: boolean | null = null;
  public Meaning: string | null = null;
  constructor(seq: number) {
    super(`binding-${seq}`);
  }
}

class FakeModel extends FakeRow {
  public RootComponentID: string | null = null;
  constructor() {
    super('model-1');
    this.ID = 'model-1';
  }
}

/** Entity factory over the fakes above, recording everything it hands out. */
class FakeFactory implements IComponentEntityFactory {
  public readonly Components: FakeComponent[] = [];
  public readonly Bindings: FakeBinding[] = [];
  public ComponentSaveOk = true;
  public FailBindingNamed: string | null = null;

  async getEntityObject<T extends BaseEntity>(entityName: string, _u?: UserInfo): Promise<T> {
    if (entityName === 'MJ: ML Components') {
      const c = new FakeComponent();
      c.SaveOk = this.ComponentSaveOk;
      this.Components.push(c);
      return c as unknown as T;
    }
    if (entityName === 'MJ: ML Component Bindings') {
      const b = new FakeBinding(this.Bindings.length + 1);
      this.Bindings.push(b);
      return b as unknown as T;
    }
    throw new Error(`unexpected entity '${entityName}'`);
  }
}

async function materialize(factory: FakeFactory, model = new FakeModel(), input = baseInput()) {
  const result = await new ComponentMaterializer().materialize(
    model as unknown as MJMLModelEntity,
    input,
    { entityFactory: factory },
  );
  return { result, model };
}

describe('ComponentMaterializer.materialize', () => {
  it('writes the root component, every binding, and links the model back', async () => {
    const factory = new FakeFactory();
    const { result, model } = await materialize(factory);

    expect(result.ComponentID).toBe('component-1');
    expect(result.BindingCount).toBe(SCHEMA.length + 2); // 5 inputs + score + class
    expect(factory.Bindings).toHaveLength(SCHEMA.length + 2);

    const component = factory.Components[0];
    expect(component.ComponentTypeID).toBe('type-xgboost');
    expect(component.MLModelID).toBe('model-1');
    expect(component.IsTrained).toBe(true);
    // A freshly trained model is Draft — the component must not outrun it.
    expect(component.PromotionState).toBe('Draft');
    expect(component.Status).toBe('Draft');

    expect(model.RootComponentID).toBe('component-1');
  });

  it('serializes RelationshipPath as JSON only when there is a path', async () => {
    const factory = new FakeFactory();
    await materialize(factory);
    const asOf = factory.Bindings.find((b) => b.Name === 'activity_count_asof');
    expect(JSON.parse(asOf!.RelationshipPath!)).toEqual([{ fks: ['MemberID'], entity: 'Activities' }]);
    expect(factory.Bindings.find((b) => b.Name === 'tenure')!.RelationshipPath).toBeNull();
  });

  it('records the planner warnings on the result', async () => {
    const factory = new FakeFactory();
    const { result } = await materialize(factory);
    expect(result.Warnings.some((w) => w.includes("'emb_0'"))).toBe(true);
  });

  it('returns a warning instead of throwing when the component row will not save', async () => {
    const factory = new FakeFactory();
    factory.ComponentSaveOk = false;
    const { result, model } = await materialize(factory);

    expect(result.ComponentID).toBeNull();
    expect(result.BindingCount).toBe(0);
    expect(result.Warnings.some((w) => w.includes('Materialization failed'))).toBe(true);
    // The model is untouched — a provenance failure must not mutate the trained model.
    expect(model.RootComponentID).toBeNull();
  });

  it('keeps going when one binding fails, so a partial map still lands', async () => {
    const factory = new FakeFactory();
    // Refuse the very first binding's save.
    const original = factory.getEntityObject.bind(factory);
    factory.getEntityObject = async <T extends BaseEntity>(name: string, u?: UserInfo): Promise<T> => {
      const row = await original<T>(name, u);
      if (name === 'MJ: ML Component Bindings' && factory.Bindings.length === 1) {
        (row as unknown as FakeBinding).SaveOk = false;
      }
      return row;
    };

    const { result } = await materialize(factory);
    expect(result.BindingCount).toBe(SCHEMA.length + 1); // one short of the full set
    expect(result.Warnings.some((w) => w.includes('was not saved'))).toBe(true);
    expect(result.ComponentID).toBe('component-1');
  });

  it('warns rather than throws when the model cannot be linked back', async () => {
    const factory = new FakeFactory();
    const model = new FakeModel();
    model.SaveOk = false;
    const { result } = await materialize(factory, model);
    expect(result.ComponentID).toBe('component-1');
    expect(result.Warnings.some((w) => w.includes('was not linked to component'))).toBe(true);
  });
});
