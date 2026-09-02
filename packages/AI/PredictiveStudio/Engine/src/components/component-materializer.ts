/**
 * @module components/component-materializer
 *
 * Turns a freshly-trained model into a **component instance** — the row in
 * `MJ: ML Components` that says "this model IS a Glass-Box Rubric / an XGBoost / a
 * Logistic Regression", plus the `MJ: ML Component Bindings` that tie its inputs and
 * outputs to **real MJ entities and fields**.
 *
 * That last part is the whole point. A trained model's `FeatureSchema` is a list of
 * column names — `tenure`, `activity_count_asof`, `city` — which is enough to score
 * with and useless for reasoning about. A binding says `tenure` is
 * `Members.MembershipTenureMonths`, a Number, higher-is-better; that
 * `activity_count_asof` reaches `Activities` through `Activities.MemberID`; and that
 * the model's `class` output predicts `Members.Renewed`. Once that exists, a model's
 * parts have **business meaning**, not just mathematical meaning: they can be
 * searched, compared across models, reused, and narrated.
 *
 * Design rules:
 *  - **Planning is pure.** {@link planModelMaterialization} takes plain data (a field
 *    lookup, the feature schema, the dated sources) and returns a plan. No provider,
 *    no entities, no I/O — so every naming/typing/path decision is unit-testable.
 *  - **Persistence is best-effort and NEVER fails training.** The model is the
 *    deliverable; its component projection is provenance. {@link ComponentMaterializer}
 *    collects warnings and returns them rather than throwing.
 *  - **Unresolved is recorded, not guessed.** A feature that matches no field on the
 *    target entity still gets a binding — with a null `EntityFieldID` and a `Meaning`
 *    saying where it came from. A guessed field id would be a silent lie.
 */

import { LogError, LogStatus } from '@memberjunction/core';
import type { BaseEntity, UserInfo, IMetadataProvider, EntityInfo } from '@memberjunction/core';
import type { MJMLComponentEntity, MJMLComponentBindingEntity, MJMLModelEntity } from '@memberjunction/core-entities';
import type {
  ComponentGraphNode,
  FeatureSchemaEntry,
  ProblemType,
  TrainedComponentState,
} from '@memberjunction/predictive-studio-core';

import type { DatedSourceSpec } from '../feature-assembly';
import { findAutoPathHops, type FkGraphEntity, type RelationshipHop } from './join-path';

// region: types ---------------------------------------------------------------

/** The binding-row `DataType` union, derived from the generated entity so it tracks the CHECK. */
export type BindingDataType = NonNullable<MJMLComponentBindingEntity['DataType']>;
/** The binding-row `Role` union, derived from the generated entity. */
export type BindingRole = MJMLComponentBindingEntity['Role'];

/** One field on the target entity, reduced to what binding resolution needs. */
export interface TargetField {
  /** `MJ: Entity Fields` primary key. */
  ID: string;
  /** Field name as it appears in the feature schema. */
  Name: string;
  /** The binding `DataType` this field maps to. */
  DataType: BindingDataType;
}

/**
 * The target entity's identity + its fields indexed by LOWERCASED name. Built from live
 * metadata by {@link readTargetEntityMetadata}, or hand-built in tests.
 */
export interface TargetEntityMetadata {
  /** `MJ: Entities` primary key of the training-unit entity. */
  EntityID: string;
  /** Entity name (for `Meaning` prose). */
  EntityName: string;
  /** Fields keyed by `Name.toLowerCase()`. */
  FieldsByName: Map<string, TargetField>;
}

/** Everything {@link planModelMaterialization} needs. All plain data — no entities. */
export interface MaterializationInput {
  /** Display name for the component instance (typically the model's name/version). */
  componentName: string;
  /** The leaf `MJ: ML Component Types` id this model is an instance of. */
  componentTypeID: string;
  /** The trained model's id (`MJ: ML Models`), or null when planning ahead of the save. */
  mlModelID: string | null;
  /** The training-unit entity's metadata, for input/output field resolution. */
  targetEntity: TargetEntityMetadata;
  /** The label column the model predicts. */
  targetVariable: string;
  /** Classification or regression — decides the output shape. */
  problemType: ProblemType;
  /** The model's frozen, ordered feature schema. */
  featureSchema: FeatureSchemaEntry[];
  /** As-of sources, so features derived from them get a real relationship path. */
  datedSources?: DatedSourceSpec[];
  /** Hyperparameters, stored on the component `Spec` (they are configuration, not bindings). */
  hyperparameters?: Record<string, unknown>;
  /**
   * Structural entity list for FK-path resolution (`EntityInfo[]` satisfies it). When absent,
   * as-of bindings record the declared foreign key alone instead of the full hop chain.
   */
  fkGraph?: FkGraphEntity[];
  /** `MJ: Entities` ids keyed by lowercased entity name, for as-of source resolution. */
  entityIdsByName?: Map<string, string>;
  /**
   * The composition this model was trained as, when it was composed. Present ⇒ one child
   * `MJ: ML Components` row is written per node below the root, so a bagging wrapper over a
   * forest is stored as two components in a parent/child relationship rather than one opaque
   * row that merely says "bagging".
   */
  composition?: CompositionMaterializationInput;
}

/** Everything needed to project a composed model's non-root nodes into component rows. */
export interface CompositionMaterializationInput {
  /** The graph as the pipeline described it — the source of component-type NAMES and slots. */
  graph: ComponentGraphNode;
  /** What the sidecar reported per node, depth-first root-first. Pairs 1:1 with the graph walk. */
  states: TrainedComponentState[];
  /** `MJ: ML Component Types` ids keyed by lowercased type name. */
  typeIdsByName: Map<string, string>;
  /**
   * `DriverClass` keyed by lowercased type name. Used only to VERIFY that the graph walk and the
   * sidecar's reported states line up; a name missing here skips the check for that node rather
   * than failing the whole composition.
   */
  driverByTypeName?: Map<string, string>;
}

/** One planned non-root `MJ: ML Components` row in a composed model. */
export interface ComposedComponentPlan {
  /** Index into the plan list of this node's parent; the root is index -1. */
  ParentIndex: number;
  /** Resolved component type, or null when the tree does not have the named type. */
  ComponentTypeID: string | null;
  /** The type name as written in the graph — kept for the row name and for warnings. */
  ComponentTypeRef: string;
  /** The parent slot this node fills. */
  SlotName: string | null;
  /** Position among its siblings within the same slot, so order is reproducible. */
  Sequence: number;
  /** Configuration for this node alone. */
  Spec: Record<string, unknown>;
  /** False for a reused node — it arrived already fitted and this run did not train it. */
  IsTrained: boolean;
  /** The `MJ: ML Components` row this node reuses, when it reuses one. */
  SourceComponentID: string | null;
}

/** One planned `MJ: ML Component Bindings` row. */
export interface BindingPlan {
  Role: BindingRole;
  Name: string;
  EntityID: string | null;
  EntityFieldID: string | null;
  RelationshipPath: RelationshipHop[] | null;
  DataType: BindingDataType | null;
  HigherIsBetter: boolean | null;
  Meaning: string;
}

/** The planned root `MJ: ML Components` row + its bindings. */
export interface MaterializationPlan {
  ComponentTypeID: string;
  Name: string;
  MLModelID: string | null;
  /** JSON-serializable component spec (hyperparameters + the assembly facts worth freezing). */
  Spec: Record<string, unknown>;
  Bindings: BindingPlan[];
  /** Non-fatal notes: features that resolved to no field, unreachable as-of paths, etc. */
  Warnings: string[];
}

/** What {@link ComponentMaterializer.materialize} did. */
export interface MaterializationResult {
  /** The created component's id, or null when materialization was skipped/failed. */
  ComponentID: string | null;
  /** How many binding rows were written. */
  BindingCount: number;
  /** Non-fatal notes from planning and persistence. */
  Warnings: string[];
  /** How many non-root component rows a composed model produced. Zero for a plain model. */
  ComposedComponentCount: number;
}

/** Entity-creation seam (structurally identical to the training engine's `IEntityFactory`). */
export interface IComponentEntityFactory {
  getEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
}

/** Injected dependencies for {@link ComponentMaterializer.materialize}. */
export interface MaterializationDeps {
  entityFactory: IComponentEntityFactory;
  contextUser?: UserInfo;
}

// region: metadata adapter ----------------------------------------------------

/**
 * Map an MJ field's TypeScript type (+ value-list-ness) onto the binding `DataType`
 * vocabulary. A string field with a value list is a `Category` — that distinction is
 * what lets a consumer know the field's values are a closed set worth reasoning over.
 */
export function bindingDataTypeForField(tsType: string, hasValueList: boolean): BindingDataType {
  switch (tsType) {
    case 'number':
      return 'Number';
    case 'boolean':
      return 'Boolean';
    case 'Date':
      return 'Date';
    default:
      return hasValueList ? 'Category' : 'Text';
  }
}

/**
 * Read the target entity's identity + fields off live metadata into the pure
 * {@link TargetEntityMetadata} shape the planner consumes.
 *
 * @returns the metadata, or `null` when the entity is not in metadata (the caller then
 *   skips materialization rather than writing bindings pointing at nothing).
 */
export function readTargetEntityMetadata(provider: IMetadataProvider, entityName: string): TargetEntityMetadata | null {
  const entity = provider.EntityByName(entityName);
  if (!entity) {
    return null;
  }
  return targetEntityFromEntityInfo(entity);
}

/** Project an `EntityInfo` into {@link TargetEntityMetadata}. Exported for reuse + tests. */
export function targetEntityFromEntityInfo(entity: EntityInfo): TargetEntityMetadata {
  const fieldsByName = new Map<string, TargetField>();
  for (const f of entity.Fields) {
    fieldsByName.set(f.Name.toLowerCase(), {
      ID: f.ID,
      Name: f.Name,
      DataType: bindingDataTypeForField(f.TSType, (f.ValueListType ?? 'None') !== 'None'),
    });
  }
  return { EntityID: entity.ID, EntityName: entity.Name, FieldsByName: fieldsByName };
}

// region: planning (pure) -----------------------------------------------------

/**
 * Plan the root component + bindings for a trained model. Pure: same input, same plan.
 *
 * Bindings produced:
 *  - one `Input` per feature-schema entry — bound to the target entity's field when the
 *    name matches, to the dated source's entity (with an FK path) when the feature came
 *    from one, and left unbound with an explanatory `Meaning` otherwise;
 *  - one `Output` for the numeric `score`, and for classification a second `class`
 *    output bound to the field the model predicts.
 */
export function planModelMaterialization(input: MaterializationInput): MaterializationPlan {
  const warnings: string[] = [];
  const asOfOwners = indexAsOfFeatures(input.datedSources ?? []);
  const bindings: BindingPlan[] = [];

  for (const feature of input.featureSchema) {
    bindings.push(planInputBinding(feature, input, asOfOwners, warnings));
  }
  bindings.push(...planOutputBindings(input, warnings));

  return {
    ComponentTypeID: input.componentTypeID,
    Name: input.componentName,
    MLModelID: input.mlModelID,
    Spec: {
      hyperparameters: input.hyperparameters ?? {},
      targetEntityName: input.targetEntity.EntityName,
      targetVariable: input.targetVariable,
      problemType: input.problemType,
      featureCount: input.featureSchema.length,
    },
    Bindings: bindings,
    Warnings: warnings,
  };
}

/**
 * Plan the non-root component rows of a composed model. Pure.
 *
 * The graph and the sidecar's `component_states` are both depth-first, root-first, in declared
 * child order, so they pair positionally. That pairing is **verified, not assumed**: if a node's
 * driver does not match the state at its position the pairing has drifted, and the whole
 * composition is reported as unmaterializable rather than written with children attached to the
 * wrong parents — a wrong provenance tree is worse than none.
 *
 * @param input the graph, the reported states, and the type-name lookup
 * @param driverOf resolves a component-type name to its driver, for the pairing check
 * @param warnings collector; every skipped or unresolved node explains itself here
 */
export function planComposedComponents(
  input: CompositionMaterializationInput,
  driverOf: (typeName: string) => string | null,
  warnings: string[],
): ComposedComponentPlan[] {
  const flat: Array<{ node: ComponentGraphNode; parentIndex: number; sequence: number }> = [];
  walkGraphPreOrder(input.graph, -1, 0, flat);

  if (flat.length !== input.states.length) {
    warnings.push(
      `Composition not materialized: the graph has ${flat.length} component(s) but the sidecar reported ${input.states.length}. ` +
        `Writing them anyway would attach components to the wrong parents.`,
    );
    return [];
  }

  const plans: ComposedComponentPlan[] = [];
  for (let i = 0; i < flat.length; i++) {
    const { node, parentIndex, sequence } = flat[i];
    const state = input.states[i];
    const expectedDriver = driverOf(node.ComponentTypeRef);
    if (expectedDriver && state.driver !== expectedDriver) {
      warnings.push(
        `Composition not materialized: at position ${i} the graph says '${node.ComponentTypeRef}' (${expectedDriver}) ` +
          `but the sidecar reported '${state.driver}'. The two walks have diverged.`,
      );
      return [];
    }
    const componentTypeID = input.typeIdsByName.get(node.ComponentTypeRef.trim().toLowerCase()) ?? null;
    if (!componentTypeID) {
      // Recorded, never guessed — an unresolved type leaves a row-less gap with a reason.
      warnings.push(`Composed node '${node.ComponentTypeRef}' has no matching ML Component Type; its row was skipped.`);
    }
    plans.push({
      ParentIndex: parentIndex,
      ComponentTypeID: componentTypeID,
      ComponentTypeRef: node.ComponentTypeRef,
      SlotName: node.SlotName ?? null,
      Sequence: sequence,
      Spec: { ...(node.Params ?? {}), driver: state.driver },
      IsTrained: state.fitted,
      SourceComponentID: node.ReuseInstanceID ?? null,
    });
  }
  return plans;
}

/** Flatten a graph depth-first, root first, recording each node's parent position. */
function walkGraphPreOrder(
  node: ComponentGraphNode,
  parentIndex: number,
  sequence: number,
  out: Array<{ node: ComponentGraphNode; parentIndex: number; sequence: number }>,
): void {
  const myIndex = out.length;
  out.push({ node, parentIndex, sequence });
  const children = node.Children ?? [];
  for (let i = 0; i < children.length; i++) {
    walkGraphPreOrder(children[i], myIndex, i, out);
  }
}

/** Which dated source (and feature) produced each as-of output column, by column name. */
function indexAsOfFeatures(datedSources: DatedSourceSpec[]): Map<string, { source: DatedSourceSpec; aggregate: string; field?: string }> {
  const byColumn = new Map<string, { source: DatedSourceSpec; aggregate: string; field?: string }>();
  for (const ds of datedSources) {
    for (const f of ds.Features) {
      byColumn.set(f.OutputColumn, { source: ds, aggregate: f.Aggregate, field: f.Field });
      if (f.EmitPresence) {
        // The presence mask is a distinct column with its own meaning: "was there any data at all".
        byColumn.set(`${f.OutputColumn}__present`, { source: ds, aggregate: 'presence', field: f.Field });
      }
    }
  }
  return byColumn;
}

/** Plan one `Input` binding, resolving it to the most specific real thing we can name. */
function planInputBinding(
  feature: FeatureSchemaEntry,
  input: MaterializationInput,
  asOfOwners: ReturnType<typeof indexAsOfFeatures>,
  warnings: string[],
): BindingPlan {
  const direct = input.targetEntity.FieldsByName.get(feature.Name.toLowerCase());
  if (direct) {
    return {
      Role: 'Input',
      Name: feature.Name,
      EntityID: input.targetEntity.EntityID,
      EntityFieldID: direct.ID,
      RelationshipPath: null,
      DataType: direct.DataType,
      // Direction is a judgment the model cannot make for itself — a human or the story
      // tagger sets it later. Asserting one here would be a guess dressed as a fact.
      HigherIsBetter: null,
      Meaning: `${input.targetEntity.EntityName}.${direct.Name}, read directly off the record being scored.`,
    };
  }

  const asOf = asOfOwners.get(feature.Name);
  if (asOf) {
    return planAsOfBinding(feature, asOf, input, warnings);
  }

  warnings.push(
    `Feature '${feature.Name}' matched no field on '${input.targetEntity.EntityName}' and no dated source; ` +
      `its binding is recorded unresolved (it is likely a derived column such as a one-hot or embedding dimension).`,
  );
  return {
    Role: 'Input',
    Name: feature.Name,
    EntityID: input.targetEntity.EntityID,
    EntityFieldID: null,
    RelationshipPath: null,
    DataType: feature.Kind === 'categorical' ? 'Category' : 'Number',
    HigherIsBetter: null,
    Meaning: `Derived ${feature.Kind} feature '${feature.Name}' — computed during assembly, not a stored field.`,
  };
}

/** Plan an as-of input binding, resolving the FK hop chain when the graph is available. */
function planAsOfBinding(
  feature: FeatureSchemaEntry,
  asOf: { source: DatedSourceSpec; aggregate: string; field?: string },
  input: MaterializationInput,
  warnings: string[],
): BindingPlan {
  const sourceEntityID = input.entityIdsByName?.get(asOf.source.EntityName.toLowerCase()) ?? null;
  const path = resolveAsOfPath(asOf.source, input, sourceEntityID, warnings);
  const overWhat = asOf.field ? ` of ${asOf.source.EntityName}.${asOf.field}` : '';
  const meaning =
    asOf.aggregate === 'presence'
      ? `Whether the record had ANY ${asOf.source.EntityName} rows as of the decision date — the flag that separates a real zero from missing data.`
      : `${asOf.aggregate}${overWhat} over the ${asOf.source.EntityName} rows that existed as of the decision date, ` +
        `joined by ${asOf.source.EntityName}.${asOf.source.ForeignKeyField} and cut at ${asOf.source.EntityName}.${asOf.source.DateField}.`;

  return {
    Role: 'Input',
    Name: feature.Name,
    EntityID: sourceEntityID,
    EntityFieldID: null,
    RelationshipPath: path,
    DataType: 'Number',
    HigherIsBetter: null,
    Meaning: meaning,
  };
}

/**
 * Resolve the FK hop chain from the target entity to the dated source. Falls back to the
 * single declared foreign key when the graph isn't supplied or the auto-resolver refuses
 * (unreachable / ambiguous) — the declared FK is a fact; a guessed multi-hop path is not.
 */
function resolveAsOfPath(
  source: DatedSourceSpec,
  input: MaterializationInput,
  sourceEntityID: string | null,
  warnings: string[],
): RelationshipHop[] {
  const declared: RelationshipHop[] = [{ fks: [source.ForeignKeyField], entity: source.EntityName }];
  if (!input.fkGraph || !sourceEntityID) {
    return declared;
  }
  try {
    const hops = findAutoPathHops(input.fkGraph, input.targetEntity.EntityID, sourceEntityID);
    return hops.length > 0 ? hops : declared;
  } catch (err) {
    warnings.push(
      `Could not auto-resolve the join path from '${input.targetEntity.EntityName}' to '${source.EntityName}' ` +
        `(${err instanceof Error ? err.message : String(err)}); recorded the declared foreign key '${source.ForeignKeyField}' instead.`,
    );
    return declared;
  }
}

/** Plan the model's outputs: always a numeric `score`, plus `class` for classification. */
function planOutputBindings(input: MaterializationInput, warnings: string[]): BindingPlan[] {
  const targetField = input.targetEntity.FieldsByName.get(input.targetVariable.toLowerCase());
  if (!targetField) {
    warnings.push(
      `Target variable '${input.targetVariable}' is not a field on '${input.targetEntity.EntityName}' ` +
        `(it may be an expression); the output binding is recorded without a field reference.`,
    );
  }

  const score: BindingPlan = {
    Role: 'Output',
    Name: 'score',
    EntityID: input.targetEntity.EntityID,
    EntityFieldID: null,
    RelationshipPath: null,
    DataType: 'Number',
    HigherIsBetter: null,
    Meaning:
      input.problemType === 'classification'
        ? `Predicted probability that '${input.targetVariable}' holds for this ${input.targetEntity.EntityName} record.`
        : `Predicted value of '${input.targetVariable}' for this ${input.targetEntity.EntityName} record.`,
  };

  if (input.problemType !== 'classification') {
    // For regression the score IS the prediction of the target field — bind it there.
    return [{ ...score, EntityFieldID: targetField?.ID ?? null }];
  }

  return [
    score,
    {
      Role: 'Output',
      Name: 'class',
      EntityID: input.targetEntity.EntityID,
      EntityFieldID: targetField?.ID ?? null,
      RelationshipPath: null,
      DataType: targetField?.DataType ?? 'Category',
      HigherIsBetter: null,
      Meaning: `The predicted class for '${input.targetVariable}' — what this model exists to decide.`,
    },
  ];
}

// region: persistence ---------------------------------------------------------

/**
 * Writes a {@link MaterializationPlan} to `MJ: ML Components` + `MJ: ML Component Bindings`
 * and points the model at the root component.
 *
 * **Never throws.** Training has already succeeded by the time this runs; losing the
 * component projection is a provenance gap, not a training failure. Failures come back as
 * warnings on {@link MaterializationResult} and are logged.
 */
export class ComponentMaterializer {
  /**
   * Plan and persist the root component for a trained model.
   *
   * @param model the SAVED model row — its `RootComponentID` is updated in place and re-saved
   * @param input the planning input (its `mlModelID` is overridden with the model's own id)
   * @param deps entity-creation seam + context user
   */
  public async materialize(
    model: MJMLModelEntity,
    input: MaterializationInput,
    deps: MaterializationDeps,
  ): Promise<MaterializationResult> {
    const plan = planModelMaterialization({ ...input, mlModelID: model.ID });
    try {
      const component = await this.writeComponent(plan, deps);
      const bindingCount = await this.writeBindings(component.ID, plan, deps, plan.Warnings);
      await this.linkModel(model, component.ID, plan.Warnings);
      const composedCount = await this.writeComposedComponents(component.ID, input, plan, deps);
      LogStatus(
        `ComponentMaterializer: model ${model.ID} materialized as component ${component.ID} with ${bindingCount} binding(s)` +
          (composedCount > 0 ? ` and ${composedCount} composed sub-component(s).` : '.'),
      );
      return {
        ComponentID: component.ID,
        BindingCount: bindingCount,
        ComposedComponentCount: composedCount,
        Warnings: plan.Warnings,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`ComponentMaterializer: materialization failed for model ${model.ID}: ${message}`);
      return {
        ComponentID: null,
        BindingCount: 0,
        ComposedComponentCount: 0,
        Warnings: [...plan.Warnings, `Materialization failed: ${message}`],
      };
    }
  }

  /**
   * Write one `MJ: ML Components` row per node BELOW the root of a composed model, parented and
   * slotted so the stored tree matches the trained one.
   *
   * The root already exists (it is the model's own component row), so index 0 of the plan is
   * mapped onto it rather than duplicated. A node whose type could not be resolved is skipped
   * along with its subtree — attaching grandchildren to a missing parent would fabricate a shape
   * that was never trained.
   */
  private async writeComposedComponents(
    rootComponentID: string,
    input: MaterializationInput,
    plan: MaterializationPlan,
    deps: MaterializationDeps,
  ): Promise<number> {
    if (!input.composition) {
      return 0;
    }
    const nodes = planComposedComponents(
      input.composition,
      (name) => input.composition?.driverByTypeName?.get(name.trim().toLowerCase()) ?? null,
      plan.Warnings,
    );
    if (nodes.length === 0) {
      return 0;
    }

    // Index 0 IS the root row; every child links to whatever id its parent index resolved to.
    const idsByIndex: Array<string | null> = [rootComponentID];
    let written = 0;

    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      const parentID = idsByIndex[node.ParentIndex] ?? null;
      if (!node.ComponentTypeID || !parentID) {
        if (!parentID) {
          plan.Warnings.push(`Composed node '${node.ComponentTypeRef}' was skipped because its parent was not written.`);
        }
        idsByIndex.push(null);
        continue;
      }
      const row = await deps.entityFactory.getEntityObject<MJMLComponentEntity>('MJ: ML Components', deps.contextUser);
      row.NewRecord();
      row.ComponentTypeID = node.ComponentTypeID;
      row.Name = `${plan.Name} › ${node.SlotName ?? node.ComponentTypeRef}`;
      // Sub-components belong to the model through their parent, not directly — MLModelID stays
      // on the root so "the components OF this model" is one unambiguous query.
      row.MLModelID = null;
      row.ParentComponentID = parentID;
      row.SlotName = node.SlotName;
      row.Sequence = node.Sequence;
      row.Spec = JSON.stringify(node.Spec);
      row.IsTrained = node.IsTrained;
      row.SourceComponentID = node.SourceComponentID;
      row.PromotionState = 'Draft';
      row.Status = 'Draft';
      row.Version = 1;
      if (await row.Save()) {
        idsByIndex.push(row.ID);
        written++;
      } else {
        plan.Warnings.push(
          `Failed to write composed node '${node.ComponentTypeRef}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
        idsByIndex.push(null);
      }
    }
    return written;
  }

  /** Create + save the root `MJ: ML Components` row. */
  private async writeComponent(plan: MaterializationPlan, deps: MaterializationDeps): Promise<MJMLComponentEntity> {
    const component = await deps.entityFactory.getEntityObject<MJMLComponentEntity>('MJ: ML Components', deps.contextUser);
    component.NewRecord();
    component.ComponentTypeID = plan.ComponentTypeID;
    component.Name = plan.Name;
    component.MLModelID = plan.MLModelID;
    component.Sequence = 0;
    component.Spec = JSON.stringify(plan.Spec);
    // The model artifact IS this component's trained state; a trained root is by definition trained.
    component.IsTrained = true;
    // A newly trained model is Draft until a human (or the promotion gate) says otherwise —
    // the component's promotion state must not outrun the model's.
    component.PromotionState = 'Draft';
    component.Status = 'Draft';
    component.Version = 1;
    if (!(await component.Save())) {
      throw new Error(`Failed to create ML Component: ${component.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return component;
  }

  /**
   * Write the binding rows. A single binding failure is recorded and skipped rather than
   * aborting the rest — a partial map of a model's inputs beats no map at all.
   */
  private async writeBindings(
    componentID: string,
    plan: MaterializationPlan,
    deps: MaterializationDeps,
    warnings: string[],
  ): Promise<number> {
    let written = 0;
    for (const b of plan.Bindings) {
      const binding = await deps.entityFactory.getEntityObject<MJMLComponentBindingEntity>(
        'MJ: ML Component Bindings',
        deps.contextUser,
      );
      binding.NewRecord();
      binding.ComponentID = componentID;
      binding.Role = b.Role;
      binding.Name = b.Name;
      binding.EntityID = b.EntityID;
      binding.EntityFieldID = b.EntityFieldID;
      binding.RelationshipPath = b.RelationshipPath ? JSON.stringify(b.RelationshipPath) : null;
      binding.DataType = b.DataType;
      binding.HigherIsBetter = b.HigherIsBetter;
      binding.Meaning = b.Meaning;
      if (await binding.Save()) {
        written++;
      } else {
        warnings.push(`Binding '${b.Role}:${b.Name}' was not saved: ${binding.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
    }
    return written;
  }

  /** Point the model at its root component. A failure here is a warning, not a throw. */
  private async linkModel(model: MJMLModelEntity, componentID: string, warnings: string[]): Promise<void> {
    model.RootComponentID = componentID;
    if (!(await model.Save())) {
      warnings.push(
        `Model ${model.ID} was not linked to component ${componentID}: ${model.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
    }
  }
}

// region: the training-engine seam --------------------------------------------

/**
 * Everything the materialization seam needs about a model that just finished training.
 * Deliberately plain — the seam's production implementation does the metadata lookups.
 */
export interface TrainedModelContext {
  /** The SAVED model row (gets `RootComponentID` written back). */
  model: MJMLModelEntity;
  /** `MJ: ML Algorithms` id — resolved to the leaf component type by the implementation. */
  algorithmID: string;
  /** Display name for the component instance. */
  componentName: string;
  /** Training-unit entity name. */
  targetEntityName: string;
  /** Label column the model predicts. */
  targetVariable: string;
  /** Classification or regression. */
  problemType: ProblemType;
  /** The model's frozen feature schema. */
  featureSchema: FeatureSchemaEntry[];
  /** As-of sources frozen on the model, for relationship-path bindings. */
  datedSources?: DatedSourceSpec[];
  /** Hyperparameters, stored on the component `Spec`. */
  hyperparameters?: Record<string, unknown>;
  /** The composition the pipeline described, when it described one. */
  componentGraph?: ComponentGraphNode;
  /** What the sidecar reported per composed node — absent for a plain single-estimator model. */
  componentStates?: TrainedComponentState[];
}

/**
 * The seam {@link TrainingEngine} calls after a successful train. Implementations MUST NOT
 * throw — training has already succeeded and the model is saved; a materialization failure
 * is provenance lost, not work lost.
 */
export interface IModelComponentMaterializer {
  /**
   * Project a freshly-trained model into `MJ: ML Components` + `MJ: ML Component Bindings`.
   *
   * @param ctx the trained model + the facts needed to bind its inputs and outputs
   * @param deps entity-creation seam + context user
   * @param provider optional provider, for entity/field metadata resolution
   */
  materializeTrainedModel(
    ctx: TrainedModelContext,
    deps: MaterializationDeps,
    provider?: IMetadataProvider,
  ): Promise<MaterializationResult>;
}
