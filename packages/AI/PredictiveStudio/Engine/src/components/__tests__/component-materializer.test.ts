import { describe, it, expect } from 'vitest';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { ComponentGraphNode, FeatureSchemaEntry, TrainedComponentState } from '@memberjunction/predictive-studio-core';

import {
  ComponentMaterializer,
  planComposedComponents,
  planModelMaterialization,
  bindingDataTypeForField,
  type BindingPlan,
  type IComponentEntityFactory,
  type CompositionMaterializationInput,
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
  it('carries the component configuration on Spec, and nothing else', () => {
    const plan = planModelMaterialization(baseInput());
    expect(plan.ComponentTypeID).toBe('type-xgboost');
    expect(plan.MLModelID).toBe('model-1');
    // Spec must be the configuration ALONE: the server-side entity subclass validates it against
    // the component type's SpecSchema, and any extra property fails a schema that declares
    // `additionalProperties: false`. Target entity/variable, problem type and feature count live on
    // the model row and the Input bindings respectively, so nothing is lost by their absence.
    expect(plan.Spec).toEqual({ max_depth: 4 });
  });

  it('produces a Spec that satisfies a strict SpecSchema (additionalProperties: false)', () => {
    // Regression guard for the bug this shape fixes: a component type with a real schema — the
    // Glass-Box Rubric is the first — could never be materialized, so a model built on it silently
    // got no component row, no story, and no reuse entry.
    const plan = planModelMaterialization(baseInput());
    const allowed = new Set(['max_depth']);
    for (const key of Object.keys(plan.Spec)) {
      expect(allowed.has(key)).toBe(true);
    }
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
  public ParentComponentID: string | null = null;
  public SlotName: string | null = null;
  public SourceComponentID: string | null = null;
  public Sequence = 0;
  public Spec: string | null = null;
  public IsTrained = false;
  public PromotionState = '';
  public Status = '';
  public Version = 0;
  /** Distinct ids per row, so parent/child links in a composed model are actually checkable. */
  constructor(seq = 1) {
    super(seq === 1 ? 'component-1' : `component-${seq}`);
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
      const c = new FakeComponent(this.Components.length + 1);
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

async function materialize(
  factory: FakeFactory,
  model = new FakeModel(),
  input = baseInput(),
  artifactStore?: { save: (bytes: Uint8Array, name: string) => Promise<string> },
) {
  const result = await new ComponentMaterializer().materialize(
    model as unknown as MJMLModelEntity,
    input,
    { entityFactory: factory, artifactStore },
  );
  return { result, model };
}

/** Records what was stored, so a test can assert the BYTES a sub-component was given. */
class FakeArtifactStore {
  public Saved: Array<{ name: string; bytes: Uint8Array }> = [];
  public save = async (bytes: Uint8Array, name: string): Promise<string> => {
    this.Saved.push({ name, bytes });
    return `file-${this.Saved.length}`;
  };
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


// ---------------------------------------------------------------------------
// Composed models: one component row per node, not one opaque root.
// ---------------------------------------------------------------------------

const BAGGED_FOREST: ComponentGraphNode = {
  ComponentTypeRef: 'Bagging Wrapper',
  Params: { n_estimators: 5 },
  Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator', Params: { max_depth: 4 } }],
};

const BAGGED_STATES: TrainedComponentState[] = [
  { driver: 'bagging', fitted: true },
  { driver: 'random_forest', slot: 'base_estimator', fitted: true },
];

const TYPE_IDS = new Map<string, string>([
  ['bagging wrapper', 'type-bagging'],
  ['random forest', 'type-rf'],
  ['stacking wrapper', 'type-stacking'],
  ['logistic regression', 'type-logreg'],
]);
const TYPE_DRIVERS = new Map<string, string>([
  ['bagging wrapper', 'bagging'],
  ['random forest', 'random_forest'],
  ['stacking wrapper', 'stacking'],
  ['logistic regression', 'logistic_regression'],
]);

function composition(overrides: Partial<CompositionMaterializationInput> = {}): CompositionMaterializationInput {
  return {
    graph: BAGGED_FOREST,
    states: BAGGED_STATES,
    typeIdsByName: TYPE_IDS,
    driverByTypeName: TYPE_DRIVERS,
    ...overrides,
  };
}

const driverOf = (name: string): string | null => TYPE_DRIVERS.get(name.trim().toLowerCase()) ?? null;


describe('planModelMaterialization — features promoted to components of their own', () => {
  // Driver keys as the seeded Input subtree carries them.
  const INPUT_TYPES = new Map<string, string>([
    ['select', 'type-column'],
    ['asof_count', 'type-asof-count'],
    ['asof_exists', 'type-asof-exists'],
    ['asof_recency', 'type-asof-recency'],
    ['embedding', 'type-embedding'],
  ]);

  it('gives every typable feature its own component and moves its binding onto it', () => {
    const plan = planModelMaterialization({ ...baseInput(), inputTypeIdsByDriver: INPUT_TYPES });
    expect(plan.Inputs.map((i) => [i.Binding.Name, i.DriverKey])).toEqual([
      ['tenure', 'select'],
      ['city', 'select'],
      ['activity_count_asof', 'asof_count'],
      ['activity_count_asof__present', 'asof_exists'],
      ['emb_0', 'embedding'],
    ]);
    // Every promoted input fills the model's `inputs` slot, in a reproducible order.
    expect(plan.Inputs.every((i) => i.SlotName === 'inputs')).toBe(true);
    expect(plan.Inputs.map((i) => i.Sequence)).toEqual([0, 1, 2, 3, 4]);
    // Their bindings are no longer on the root.
    expect(plan.Bindings.some((b) => b.Role === 'Input' && b.Name === 'tenure')).toBe(false);
  });

  it('types a feature by its Kind when origin alone cannot place it', () => {
    // `emb_0` matches no field and no dated source, but its Kind names its own origin — it is an
    // Embedding input in exactly the sense a column is a Column input, so it earns a row (and
    // therefore a story) rather than being demoted to an anonymous binding.
    const plan = planModelMaterialization({ ...baseInput(), inputTypeIdsByDriver: INPUT_TYPES });
    expect(plan.Inputs.find((i) => i.Binding.Name === 'emb_0')?.DriverKey).toBe('embedding');
  });

  it('keeps a genuinely untypable feature as a root binding rather than inventing a type for it', () => {
    // A derived assembly column: numeric (so its Kind says nothing about origin), matching no
    // field and no dated source. Dropping it would lose the model's record of an input it
    // actually consumed; typing it would assert a lineage that does not exist.
    const derived: FeatureSchemaEntry[] = [...SCHEMA, { Name: 'city_x_tenure', Kind: 'numeric' }];
    const plan = planModelMaterialization({ ...baseInput(), featureSchema: derived, inputTypeIdsByDriver: INPUT_TYPES });
    expect(plan.Inputs.some((i) => i.Binding.Name === 'city_x_tenure')).toBe(false);
    expect(plan.Bindings.some((b) => b.Role === 'Input' && b.Name === 'city_x_tenure')).toBe(true);
  });

  it('freezes the as-of configuration on the component, so a reuser can judge it', () => {
    const plan = planModelMaterialization({ ...baseInput(), inputTypeIdsByDriver: INPUT_TYPES });
    const count = plan.Inputs.find((i) => i.Binding.Name === 'activity_count_asof');
    expect(count?.Spec).toMatchObject({
      aggregate: 'count',
      source: 'Activities',
      foreignKey: 'MemberID',
      dateField: 'ActivityDate',
    });
    // A plain column carries no as-of configuration to freeze.
    expect(plan.Inputs.find((i) => i.Binding.Name === 'tenure')?.Spec).toEqual({});
  });

  it('records a warning, and keeps the binding, when the tree lacks the resolved driver', () => {
    const partial = new Map<string, string>([['select', 'type-column']]);
    const plan = planModelMaterialization({ ...baseInput(), inputTypeIdsByDriver: partial });
    expect(plan.Inputs.map((i) => i.DriverKey)).toEqual(['select', 'select']);
    expect(plan.Bindings.some((b) => b.Name === 'activity_count_asof')).toBe(true);
    expect(plan.Warnings.some((w) => w.includes('asof_count') && w.includes('not in the component tree'))).toBe(true);
  });

  it('promotes nothing when no driver map is supplied, leaving the previous shape intact', () => {
    const plan = planModelMaterialization(baseInput());
    expect(plan.Inputs).toEqual([]);
    expect(plan.Bindings.filter((b) => b.Role === 'Input')).toHaveLength(SCHEMA.length);
  });
});

describe('planComposedComponents', () => {
  it('flattens the graph depth-first, parenting each node by position', () => {
    const warnings: string[] = [];
    const plans = planComposedComponents(composition(), driverOf, warnings);

    expect(warnings).toEqual([]);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ ParentIndex: -1, ComponentTypeID: 'type-bagging', SlotName: null });
    expect(plans[1]).toMatchObject({ ParentIndex: 0, ComponentTypeID: 'type-rf', SlotName: 'base_estimator', Sequence: 0 });
    // Each node's own params plus the driver it ran as — enough to rebuild the node from the row.
    expect(plans[1].Spec).toEqual({ max_depth: 4 });
  });

  it('marks a reused node as not-trained and records what it reuses', () => {
    const graph: ComponentGraphNode = {
      ComponentTypeRef: 'Bagging Wrapper',
      Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator', ReuseInstanceID: 'comp-a' }],
    };
    const states: TrainedComponentState[] = [
      { driver: 'bagging', fitted: true },
      { driver: 'random_forest', slot: 'base_estimator', fitted: false, reuse_instance_id: 'comp-a' },
    ];
    const plans = planComposedComponents(composition({ graph, states }), driverOf, []);
    expect(plans[1].IsTrained).toBe(false);
    expect(plans[1].SourceComponentID).toBe('comp-a');
  });

  it('refuses the whole composition when the two walks disagree in length', () => {
    const warnings: string[] = [];
    const plans = planComposedComponents(composition({ states: [BAGGED_STATES[0]] }), driverOf, warnings);
    // Half a tree attached to the wrong parents is worse than no tree.
    expect(plans).toEqual([]);
    expect(warnings[0]).toContain('has 2 component(s) but the sidecar reported 1');
  });

  it('refuses the whole composition when a node and its state name different drivers', () => {
    const warnings: string[] = [];
    const drifted: TrainedComponentState[] = [
      { driver: 'bagging', fitted: true },
      { driver: 'logistic_regression', slot: 'base_estimator', fitted: true },
    ];
    expect(planComposedComponents(composition({ states: drifted }), driverOf, warnings)).toEqual([]);
    expect(warnings[0]).toContain('The two walks have diverged');
  });

  it('records an unresolved component type instead of guessing one', () => {
    const warnings: string[] = [];
    const plans = planComposedComponents(
      composition({ typeIdsByName: new Map([['bagging wrapper', 'type-bagging']]) }),
      driverOf,
      warnings,
    );
    expect(plans[1].ComponentTypeID).toBeNull();
    expect(warnings[0]).toContain("Composed node 'Random Forest' has no matching ML Component Type");
  });
});

describe('ComponentMaterializer.materialize — composed models', () => {
  it('writes a child row per node, parented and slotted', async () => {
    const factory = new FakeFactory();
    const { result } = await materialize(factory, new FakeModel(), baseInput({ composition: composition() }));

    expect(result.ComposedComponentCount).toBe(1);
    expect(factory.Components).toHaveLength(2);

    const [root, child] = factory.Components;
    expect(child.ParentComponentID).toBe(root.ID);
    expect(child.SlotName).toBe('base_estimator');
    expect(child.ComponentTypeID).toBe('type-rf');
    expect(child.IsTrained).toBe(true);
    // The model is reached through the root; a sub-component does not claim to BE the model.
    expect(child.MLModelID).toBeNull();
    expect(child.Name).toBe('Member Renewal Predictor v5 › base_estimator');
    expect(child.PromotionState).toBe('Draft');
  });

  it('writes nothing extra for a plain model', async () => {
    const factory = new FakeFactory();
    const { result } = await materialize(factory);
    expect(result.ComposedComponentCount).toBe(0);
    expect(factory.Components).toHaveLength(1);
  });

  it('skips a subtree whose parent could not be written, and says so', async () => {
    // A stack whose middle node has no resolvable type: its own row is skipped, and so is the
    // grandchild that would otherwise be re-parented onto something that was never written.
    const graph: ComponentGraphNode = {
      ComponentTypeRef: 'Stacking Wrapper',
      Children: [
        {
          ComponentTypeRef: 'Bagging Wrapper',
          SlotName: 'estimators',
          Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' }],
        },
        { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator' },
      ],
    };
    const states: TrainedComponentState[] = [
      { driver: 'stacking', fitted: true },
      { driver: 'bagging', slot: 'estimators', fitted: true },
      { driver: 'random_forest', slot: 'base_estimator', fitted: true },
      { driver: 'logistic_regression', slot: 'final_estimator', fitted: true },
    ];
    const typeIdsByName = new Map([
      ['stacking wrapper', 'type-stacking'],
      ['random forest', 'type-rf'],
      ['logistic regression', 'type-logreg'],
    ]);

    const factory = new FakeFactory();
    const { result } = await materialize(
      factory,
      new FakeModel(),
      baseInput({ componentTypeID: 'type-stacking', composition: composition({ graph, states, typeIdsByName }) }),
    );

    expect(result.ComposedComponentCount).toBe(1); // only the final_estimator survives
    expect(result.Warnings.some((w) => w.includes("'Bagging Wrapper' has no matching ML Component Type"))).toBe(true);
    expect(result.Warnings.some((w) => w.includes("'Random Forest' was skipped because its parent was not written"))).toBe(true);
  });
});

describe('ComponentMaterializer — the root component as a reusable part', () => {
  it("records the model's artifact on the root, which is what makes it freezable in another model", () => {
    const plan = planModelMaterialization({ ...baseInput(), artifactFileID: 'file-1' });
    expect(plan.ArtifactFileID).toBe('file-1');
  });

  it('plans a null artifact when planning ahead of training, rather than inventing one', () => {
    expect(planModelMaterialization(baseInput()).ArtifactFileID).toBeNull();
  });
});

describe('ComponentMaterializer — a sub-component that another model can use', () => {
  /** A bagged forest whose child came back with its own serialized estimator. */
  const withChildArtifact = () =>
    composition({
      states: [
        { driver: 'bagging', fitted: true },
        { driver: 'random_forest', slot: 'base_estimator', fitted: true, artifact_b64: Buffer.from('child-bytes').toString('base64') },
      ],
    });

  it("stores the child's own artifact, which is what makes it freezable elsewhere", async () => {
    const factory = new FakeFactory();
    const store = new FakeArtifactStore();

    await materialize(factory, new FakeModel(), baseInput({ composition: withChildArtifact() }), store);

    expect(store.Saved).toHaveLength(1);
    expect(Buffer.from(store.Saved[0].bytes).toString()).toBe('child-bytes');
    const child = factory.Components.find((c) => c.SlotName === 'base_estimator');
    expect(child?.ArtifactFileID).toBe('file-1');
  });

  it('still catalogues the child without a store, and says it is not reusable', async () => {
    const factory = new FakeFactory();

    const { result } = await materialize(factory, new FakeModel(), baseInput({ composition: withChildArtifact() }));

    // The composition is still described and searchable — only reuse is unavailable.
    expect(result.ComposedComponentCount).toBe(1);
    expect(factory.Components.find((c) => c.SlotName === 'base_estimator')?.ArtifactFileID).toBeUndefined();
    // The gap is stated here rather than surfacing much later as a refused reuse.
    expect(result.Warnings.some((w) => w.includes('cannot be frozen into another model'))).toBe(true);
  });

  it('stores nothing for a node the sidecar could not separate', async () => {
    const factory = new FakeFactory();
    const store = new FakeArtifactStore();

    // BAGGED_STATES carries no artifact — bagging exposes an unfitted template, not the bags.
    const { result } = await materialize(factory, new FakeModel(), baseInput({ composition: composition() }), store);

    expect(store.Saved).toHaveLength(0);
    // Not reusable is not an error, so it must not produce a warning either.
    expect(result.Warnings.some((w) => w.includes('cannot be frozen'))).toBe(false);
  });

  it('records a failed store as a warning rather than losing the component row', async () => {
    const factory = new FakeFactory();
    const broken = { save: async () => { throw new Error('disk full'); } };

    const { result } = await materialize(factory, new FakeModel(), baseInput({ composition: withChildArtifact() }), broken);

    expect(result.ComposedComponentCount).toBe(1);
    expect(result.Warnings.some((w) => w.includes('disk full') && w.includes('not reusable'))).toBe(true);
  });
});
