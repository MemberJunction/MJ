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
  FeatureKind,
  ProblemType,
  TrainedComponentState,
} from '@memberjunction/predictive-studio-core';

import type { DatedSourceSpec } from '../feature-assembly';
import { findAutoPathHops, type FkGraphEntity, type RelationshipHop } from './join-path';
import type { IArtifactStore } from '../training/types';

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
   * The trained model's artifact (`MJ: Files` id), which IS the root component's fitted state.
   *
   * Without it the root is written `IsTrained: true` carrying nothing to load, and the frozen-reuse
   * loader correctly refuses it — so a model can never be dropped into another model's slot. That
   * is the whole "combine existing models under a base structure" path, silently unavailable.
   */
  artifactFileID?: string | null;
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
  /**
   * `MJ: ML Component Types` ids keyed by `DriverClass`, restricted to the `Input` subtree
   * (`select`, `asof_count`, `asof_recency`, …).
   *
   * When supplied, every resolvable feature is promoted to a component ROW OF ITS OWN, filling the
   * model's `inputs` slot, and its binding hangs off that row instead of the root. That is what
   * makes a feature independently describable and therefore independently reusable: a story and a
   * story vector live on a component, so with everything collapsed onto one root row the catalog
   * can only be searched at model granularity — "find me something that measures engagement
   * recency" can only ever return whole models.
   *
   * Absent ⇒ the previous shape (one root component, all bindings on it), so callers that have no
   * component tree loaded are unaffected.
   */
  inputTypeIdsByDriver?: Map<string, string>;
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
  /**
   * This node's own serialized estimator, when the sidecar could separate one.
   *
   * Present ⇒ the node is independently reusable and gets its own `ArtifactFileID`. Null ⇒ it
   * exists as a described part of its parent but cannot be frozen into another model — which is
   * the honest state for a bagging template or a reused child, and must not be papered over.
   */
  ArtifactB64: string | null;
}

/**
 * One planned Input component: a single feature promoted from "a binding on the model" to a
 * component in its own right, filling the model's `inputs` slot.
 */
export interface InputComponentPlan {
  /** The resolved `Input` leaf (Column, As-Of Count, As-Of Recency, …). */
  ComponentTypeID: string;
  /** The `DriverClass` the type was resolved by — carried for warnings and tests. */
  DriverKey: string;
  /** Row name: the model name plus the feature, so it reads standalone in a catalog. */
  Name: string;
  /** The parent slot this fills — always `inputs`. */
  SlotName: string;
  /** Position among siblings, so ordering is reproducible. */
  Sequence: number;
  /** The feature's own configuration (aggregate, field, window for as-of; empty for a column). */
  Spec: Record<string, unknown>;
  /** The binding that moves from the root onto this component. */
  Binding: BindingPlan;
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
  /** The model artifact that is this root component's fitted state; null when planning ahead of training. */
  ArtifactFileID: string | null;
  /**
   * Bindings that stay on the ROOT: the outputs, plus any input the tree could not type (a derived
   * assembly column with no Input leaf to be an instance of). Never silently dropped.
   */
  Bindings: BindingPlan[];
  /** Features promoted to components of their own. Empty when no `inputTypeIdsByDriver` was given. */
  Inputs: InputComponentPlan[];
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
  /** How many features were written as components of their own, filling the `inputs` slot. */
  InputComponentCount: number;
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
  /**
   * Where a composed sub-component's own artifact is stored, giving it an `ArtifactFileID` of its
   * own and therefore making it reusable in a DIFFERENT model.
   *
   * Optional: without it the sub-component rows are still written (the composition is still
   * described and searchable), they simply cannot be frozen elsewhere. That degradation is
   * recorded as a warning rather than left to be discovered at the point of reuse.
   */
  artifactStore?: IArtifactStore;
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
  const inputs: InputComponentPlan[] = [];

  for (const feature of input.featureSchema) {
    const binding = planInputBinding(feature, input, asOfOwners, warnings);
    // Promote the feature to a component of its own when the tree can say WHAT KIND of input it
    // is. Anything untypable (a derived assembly column) stays a binding on the root rather than
    // being invented into a component type it is not an instance of.
    const driver = input.inputTypeIdsByDriver ? inputDriverForFeature(feature, input, asOfOwners) : null;
    const typeId = driver ? input.inputTypeIdsByDriver?.get(driver) : undefined;
    if (driver && typeId) {
      inputs.push({
        ComponentTypeID: typeId,
        DriverKey: driver,
        Name: `${input.componentName} › ${feature.Name}`,
        SlotName: MODEL_INPUTS_SLOT,
        Sequence: inputs.length,
        Spec: inputSpecForFeature(feature, asOfOwners, input.datedSources ?? []),
        Binding: binding,
      });
      continue;
    }
    if (driver && !typeId) {
      warnings.push(
        `Feature '${feature.Name}' resolves to input driver '${driver}', which is not in the ` +
          `component tree; its binding stays on the model rather than becoming a component.`,
      );
    }
    bindings.push(binding);
  }
  bindings.push(...planOutputBindings(input, warnings));

  return {
    ComponentTypeID: input.componentTypeID,
    Name: input.componentName,
    MLModelID: input.mlModelID,
    // The component's Spec IS its configuration, because that is what the component type's
    // `SpecSchema` describes (for an algorithm leaf, SpecSchema is the hyperparameter schema).
    // Wrapping the config under a `hyperparameters` key and adding assembly facts alongside it
    // made the Spec unable to satisfy ANY real schema: the server-side entity subclass validates
    // Spec against SpecSchema, and a schema with `additionalProperties: false` (or any required
    // config key) rejected every one of those extra properties. That went unnoticed only because
    // every seeded leaf but one carries a null SpecSchema, which skips validation entirely — so
    // the first component type to declare a schema, Glass-Box Rubric, could never be materialized,
    // and a model built on it silently got no component row, no story, and no reuse entry.
    //
    // The dropped fields were redundant, not lost: target entity/variable and problem type live on
    // the `MJ: ML Models` row this component points at, and the feature count is the number of
    // Input bindings written below.
    Spec: { ...(input.hyperparameters ?? {}) },
    ArtifactFileID: input.artifactFileID ?? null,
    Bindings: bindings,
    Inputs: inputs,
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
      // Same rule as the root: Spec is the node's own configuration, so it can satisfy the
      // component type's SpecSchema. The sidecar driver key is NOT config — it is derivable
      // from the component type's `DriverClass`, and carrying it here made a child unable to
      // pass any schema declaring `additionalProperties: false`.
      Spec: { ...(node.Params ?? {}) },
      IsTrained: state.fitted,
      SourceComponentID: node.ReuseInstanceID ?? null,
      ArtifactB64: state.artifact_b64 ?? null,
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


/** The slot on the abstract `Model` node that every model's inputs fill. */
export const MODEL_INPUTS_SLOT = 'inputs';

/**
 * Normalize an as-of aggregate to the `DriverClass` of its `Input` leaf.
 *
 * The two legacy spellings (`activity_count`, `days_since_last_activity`) are aliases kept for
 * pipelines authored before the vocabulary widened, and the presence mask is a synthetic kind the
 * binding indexer invents for `<col>__present`; all three must land on the same leaf as their
 * modern equivalent or the same feature would be typed differently depending on how it was spelled.
 */
export function asOfDriverKey(aggregate: string): string {
  const canonical =
    aggregate === 'activity_count' ? 'count'
    : aggregate === 'days_since_last_activity' ? 'recency'
    : aggregate === 'presence' ? 'exists'
    : aggregate;
  return `asof_${canonical}`;
}

/**
 * `FeatureKind` → the `DriverClass` of the `Input` leaf that kind is always an instance of.
 *
 * Only the kinds that map 1:1 appear here. `numeric` and `categorical` are deliberately absent:
 * they describe a value's TYPE, not its origin, so the same kind covers a plain column and an
 * as-of aggregate — origin has to be resolved first, which is what {@link inputDriverForFeature}
 * does before falling back to this table.
 */
const DRIVER_BY_FEATURE_KIND: Readonly<Partial<Record<FeatureKind, string>>> = {
  embedding: 'embedding',
  'llm-derived': 'llm-derived',
  forecast: 'forecast',
};

/** The `DriverClass` of the `Input` leaf a feature is an instance of, or null when untypable. */
function inputDriverForFeature(
  feature: FeatureSchemaEntry,
  input: MaterializationInput,
  asOfOwners: ReturnType<typeof indexAsOfFeatures>,
): string | null {
  // Origin first: an as-of aggregate and a plain column can both be `numeric`, so the feature's
  // Kind cannot distinguish them.
  const asOf = asOfOwners.get(feature.Name);
  if (asOf) return asOfDriverKey(asOf.aggregate);
  if (input.targetEntity.FieldsByName.has(feature.Name.toLowerCase())) return 'select';
  // Then the kinds that name their own origin. A feature produced by a model we CALL rather than
  // read — an embedding, an LLM-derived value, and in future a forecast — is an input in exactly
  // the same sense as a column, and deserves its own component row so it can carry a story and be
  // found by meaning. Leaving these unmapped made them invisible to reuse for no reason.
  return DRIVER_BY_FEATURE_KIND[feature.Kind] ?? null;
}

/** The configuration worth freezing on an as-of input component — what a reuser needs to judge it. */
function inputSpecForFeature(
  feature: FeatureSchemaEntry,
  asOfOwners: ReturnType<typeof indexAsOfFeatures>,
  datedSources: DatedSourceSpec[],
): Record<string, unknown> {
  const asOf = asOfOwners.get(feature.Name);
  if (!asOf) return {};
  const featureSpec = asOf.source.Features.find((f) => f.OutputColumn === feature.Name);
  const spec: Record<string, unknown> = {
    aggregate: asOf.aggregate,
    source: asOf.source.EntityName,
    foreignKey: asOf.source.ForeignKeyField,
    dateField: asOf.source.DateField,
  };
  if (asOf.field) spec.field = asOf.field;
  if (featureSpec?.Window) spec.window = featureSpec.Window;
  void datedSources;
  return spec;
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
    // The model is saved by now, so its artifact id is available — and it is the root component's
    // fitted state, not merely the model's.
    const plan = planModelMaterialization({
      ...input,
      mlModelID: model.ID,
      artifactFileID: input.artifactFileID ?? model.ArtifactFileID ?? null,
    });
    try {
      const component = await this.writeComponent(plan, deps);
      let bindingCount = await this.writeBindings(component.ID, plan.Bindings, deps, plan.Warnings);
      await this.linkModel(model, component.ID, plan.Warnings);
      const inputCount = await this.writeInputComponents(component.ID, plan, deps);
      bindingCount += inputCount.bindingsWritten;
      const composedCount = await this.writeComposedComponents(component.ID, input, plan, deps);
      LogStatus(
        `ComponentMaterializer: model ${model.ID} materialized as component ${component.ID} with ${bindingCount} binding(s)` +
          (inputCount.componentsWritten > 0 ? `, ${inputCount.componentsWritten} input component(s)` : '') +
          (composedCount > 0 ? ` and ${composedCount} composed sub-component(s).` : '.'),
      );
      return {
        ComponentID: component.ID,
        BindingCount: bindingCount,
        InputComponentCount: inputCount.componentsWritten,
        ComposedComponentCount: composedCount,
        Warnings: plan.Warnings,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`ComponentMaterializer: materialization failed for model ${model.ID}: ${message}`);
      return {
        ComponentID: null,
        BindingCount: 0,
        InputComponentCount: 0,
        ComposedComponentCount: 0,
        Warnings: [...plan.Warnings, `Materialization failed: ${message}`],
      };
    }
  }


  /**
   * Write one `MJ: ML Components` row per planned input, filling the root's `inputs` slot, and
   * move that feature's binding onto it.
   *
   * Each row is what makes a feature independently reusable: `Story` and `StoryVector` live on a
   * component, so a feature that is merely a binding can never be described in its own words nor
   * found by meaning. An individual failure is recorded and skipped — losing one input's row is
   * better than losing the model's whole provenance map.
   */
  private async writeInputComponents(
    rootComponentID: string,
    plan: MaterializationPlan,
    deps: MaterializationDeps,
  ): Promise<{ componentsWritten: number; bindingsWritten: number }> {
    let componentsWritten = 0;
    let bindingsWritten = 0;
    for (const spec of plan.Inputs) {
      const row = await deps.entityFactory.getEntityObject<MJMLComponentEntity>('MJ: ML Components', deps.contextUser);
      row.NewRecord();
      row.ComponentTypeID = spec.ComponentTypeID;
      row.Name = spec.Name;
      row.MLModelID = plan.MLModelID;
      row.ParentComponentID = rootComponentID;
      row.SlotName = spec.SlotName;
      row.Sequence = spec.Sequence;
      row.Spec = JSON.stringify(spec.Spec);
      // An input is a computed feature, not a fitted estimator — it holds no learned state of its
      // own, so claiming it is trained would misreport what the reuse search is offering.
      row.IsTrained = false;
      row.PromotionState = 'Draft';
      row.Status = 'Draft';
      row.Version = 1;
      if (!(await row.Save())) {
        plan.Warnings.push(
          `Input component '${spec.Name}' was not saved: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
        continue;
      }
      componentsWritten++;
      bindingsWritten += await this.writeBindings(row.ID, [spec.Binding], deps, plan.Warnings);
    }
    return { componentsWritten, bindingsWritten };
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
      // Its OWN artifact — this is what separates "a described part of a model" from "a trained
      // part another model can use". Without it the row is catalogued and not reusable.
      const artifactFileID = await this.storeNodeArtifact(node, plan, deps);
      if (artifactFileID) {
        row.ArtifactFileID = artifactFileID;
      }
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

  /**
   * Persist one composed node's own artifact, returning the file id to record on its row.
   *
   * Returns null — and says why once — whenever the node cannot be made independently reusable,
   * so the gap is visible in the materialization warnings instead of surfacing much later as a
   * refused reuse.
   */
  private async storeNodeArtifact(
    node: ComposedComponentPlan,
    plan: MaterializationPlan,
    deps: MaterializationDeps,
  ): Promise<string | null> {
    if (!node.ArtifactB64) {
      return null;
    }
    if (!deps.artifactStore) {
      plan.Warnings.push(
        `'${node.ComponentTypeRef}' was trained and could be reused elsewhere, but no artifact store was supplied, ` +
          `so it is catalogued without one and cannot be frozen into another model.`,
      );
      return null;
    }
    try {
      const bytes = Uint8Array.from(Buffer.from(node.ArtifactB64, 'base64'));
      return await deps.artifactStore.save(bytes, `component-${node.ComponentTypeRef}-${node.Sequence}.bin`, deps.contextUser);
    } catch (err) {
      plan.Warnings.push(
        `Could not store the artifact for '${node.ComponentTypeRef}': ${err instanceof Error ? err.message : String(err)}. ` +
          `It is catalogued but not reusable.`,
      );
      return null;
    }
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
    // The model artifact IS this component's trained state, so it is recorded here too — that is
    // what makes the root loadable as a FROZEN child in another model's slot. Written `IsTrained`
    // without it, the component advertises a fitted state it cannot produce, and the reuse loader
    // refuses it at the point of use rather than here.
    component.IsTrained = true;
    if (plan.ArtifactFileID) {
      component.ArtifactFileID = plan.ArtifactFileID;
    }
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
    bindings: BindingPlan[],
    deps: MaterializationDeps,
    warnings: string[],
  ): Promise<number> {
    let written = 0;
    for (const b of bindings) {
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
