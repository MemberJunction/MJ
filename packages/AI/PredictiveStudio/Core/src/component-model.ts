/**
 * @module component-model
 *
 * Structural type contracts for the **typed ML component model** — "everything is a component."
 * A model decomposes into typed, pluggable components (model primitives, preprocessing,
 * statistical methods, inputs/outputs, parameters, and slot-bearing structures), organized in an
 * inheritance TREE whose nodes carry only what is true of every descendant. These are the pure
 * row shapes the resolver ({@link resolveComponentProfile}) and lint consume — structurally
 * satisfied by the generated `MJ: ML Component Type*` entities, but dependency-free so the same
 * module runs in the server engine, unit tests, and the browser Components tab.
 */

/** The seven component spaces — the tree's roots. Mirrors `CK_MLComponentType_Kind`. */
export type ComponentKind =
  | 'Model'
  | 'Preprocessing'
  | 'Statistic'
  | 'Input'
  | 'Output'
  | 'Parameter'
  | 'Structure';

/**
 * The inheritable property keys a tree node may carry. Mirrors
 * `CK_MLComponentTypeProperty_PropertyKey`; the Engine pins this union to the generated
 * `MJMLComponentTypePropertyEntity['PropertyKey']` at compile time (Core cannot import
 * core-entities, so lockstep is enforced from the Engine side).
 */
export type ComponentPropertyKey =
  | 'CompatibleProblemTypes'
  | 'PreprocessingBank'
  | 'HyperparameterBank'
  | 'StatisticalGate'
  | 'CompatibleSlotTypes'
  | 'DefaultNormalization'
  | 'GuidanceRationale'
  | 'Explainability'
  | 'MissingDataPolicy'
  | 'ValidationDefaults'
  | 'RequiredInputKinds';

/** How a property row participates in resolution. Mirrors `CK_MLComponentTypeProperty_Operation`. */
export type PropertyOperation = 'Add' | 'Remove' | 'Replace';

/**
 * How a key's rows fold across the root→leaf chain. Fixed **per key in code** (never per row), so
 * two nodes can never disagree about how a key merges:
 * - `union`    — items keyed by `ItemKey`, insertion order root→leaf; `Remove` vetoes an
 *                inherited item (legal, but the lint reports it as a partition smell).
 * - `append`   — ordered list root→leaf; `Replace` swaps the inherited item with the same
 *                `ItemKey` in place.
 * - `override` — single value; the nearest (deepest) node wins.
 * - `narrow`   — single set value; nearest wins AND must be a subset of the inherited effective
 *                set (lint-enforced) — a child may only restrict, never widen.
 * - `mergeObject` — shallow object merge root→leaf (deeper keys override shallower ones).
 */
export type PropertyMergeMode = 'union' | 'append' | 'override' | 'narrow' | 'mergeObject';

/** The fixed merge mode for every property key. */
export const PROPERTY_MERGE_MODES: Record<ComponentPropertyKey, PropertyMergeMode> = {
  CompatibleProblemTypes: 'narrow',
  PreprocessingBank: 'union',
  HyperparameterBank: 'append',
  StatisticalGate: 'union',
  CompatibleSlotTypes: 'union',
  DefaultNormalization: 'override',
  GuidanceRationale: 'append',
  Explainability: 'override',
  MissingDataPolicy: 'override',
  ValidationDefaults: 'mergeObject',
  RequiredInputKinds: 'union',
};

/** One node of the component-type inheritance tree (a `MJ: ML Component Types` row, structurally). */
export interface ComponentTypeNode {
  ID: string;
  /** Parent node; null on the seven Kind roots. */
  ParentID: string | null;
  /** Unique display name — seed `@lookup` references resolve by it. */
  Name: string;
  /** Which component space the node belongs to; equal to the parent's (lint rule). */
  Kind: ComponentKind;
  /** Interior/family node that cannot be instantiated. */
  IsAbstract: boolean;
  /** Whether instances of this component can be fit to data. */
  Trainable: boolean;
  /** Execution key for concrete leaves (sidecar estimator / preprocessing op / step kind / TS class). */
  DriverClass: string | null;
  /** JSON Schema an instance's Spec must satisfy (raw JSON string, as stored). */
  SpecSchema: string | null;
  /** JSON default Spec (raw JSON string, as stored). */
  DefaultSpec: string | null;
  /**
   * The archetype's prose identity — what this KIND of component means, in business terms. The
   * other half of the dual identity: the fields above say what it IS, this says what it MEANS, and
   * it is what a component-tree browser shows next to the name.
   */
  Story: string | null;
  /** Draft | Published | Deprecated. */
  Status: string;
}

/** One inheritable property row (a `MJ: ML Component Type Properties` row, structurally). */
export interface ComponentTypePropertyRow {
  ComponentTypeID: string;
  PropertyKey: ComponentPropertyKey;
  Operation: PropertyOperation;
  /** Stable item identity for `union`/`append` targeting; null for single-valued keys. */
  ItemKey: string | null;
  /** JSON payload of the item, as stored. Parsed lazily by consumers. */
  Value: string;
  /** Ordering within (type, key) for append-mode keys. */
  Sequence: number;
  /** Why this holds for every descendant of the node it sits on. */
  Rationale: string | null;
}

/** One declared slot (a `MJ: ML Component Type Slots` row, structurally). */
export interface ComponentTypeSlotRow {
  ComponentTypeID: string;
  Name: string;
  Description?: string | null;
  /** Descendant-or-self of this node may fill the slot. */
  AcceptsComponentTypeID: string;
  MinCount: number;
  /** null = unbounded. */
  MaxCount: number | null;
  DefaultComponentTypeID: string | null;
  Sequence: number;
}

/** One resolved property item, with the node that contributed it. */
export interface ResolvedPropertyItem {
  ItemKey: string | null;
  /** Parsed JSON when `Value` parses; the raw string otherwise. */
  Value: unknown;
  Rationale: string | null;
  /** The tree node whose row produced this item (post-Replace: the replacing node). */
  SourceTypeID: string;
}

/**
 * A leaf's fully-resolved profile: everything a model built from this component needs in order to
 * be used well — the merged banks, gates, defaults and slots, with per-key provenance.
 */
export interface ResolvedComponentProfile {
  /** The node the profile was resolved for (usually, but not necessarily, a leaf). */
  Leaf: ComponentTypeNode;
  /** The inheritance chain, root first, ending at `Leaf`. */
  Chain: ComponentTypeNode[];
  /**
   * Effective properties per key. `union`/`append` keys resolve to the merged item list;
   * `override`/`narrow`/`mergeObject` keys resolve to a single-item list holding the effective
   * value (so consumers read one shape).
   */
  Properties: Partial<Record<ComponentPropertyKey, ResolvedPropertyItem[]>>;
  /** Effective slots: union by Name down the chain, `Accepts` narrowed where redeclared. */
  Slots: ResolvedSlot[];
  /** Node IDs that contributed to each key, root-first — drives the "inherited from" UI chips. */
  Provenance: Partial<Record<ComponentPropertyKey, string[]>>;
}

/** One effective slot on a resolved profile. */
export interface ResolvedSlot {
  Name: string;
  Description: string | null;
  AcceptsComponentTypeID: string;
  MinCount: number;
  MaxCount: number | null;
  DefaultComponentTypeID: string | null;
  Sequence: number;
  /** The node whose declaration (or narrowing redeclaration) is in effect. */
  SourceTypeID: string;
}

/** Severity of a tree-lint finding. `Error` findings make the tree unusable; `Warning` = partition smell. */
export type TreeLintSeverity = 'Error' | 'Warning' | 'Info';

/** One finding from {@link lintComponentTree} — the "principled partition" enforcer's output. */
export interface TreeLintFinding {
  Severity: TreeLintSeverity;
  /** Stable rule identifier (e.g. `kind-consistency`, `descendant-contradiction`). */
  Rule: string;
  /** The node the finding anchors to. */
  NodeID: string;
  Message: string;
  /** A second node involved in the finding (the contradicting descendant, the missing parent, …). */
  RelatedNodeID?: string;
}

/**
 * The ten point-in-time aggregate kinds an As-Of Aggregate input component can compute — the
 * widened vocabulary ported from Sonar's `Factor.Aggregation` (`asof_*` DriverClass leaves under
 * Input → As-Of Aggregate). The executor keeps the legacy two-kind spelling
 * (`days_since_last_activity` = `recency`, `activity_count` = `count`) as aliases.
 */
export type AsOfAggregateKind =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'distinct_count'
  | 'recency'
  | 'exists'
  | 'rate_per_period'
  | 'trend_slope';

/**
 * The time window an as-of aggregate computes over, relative to the per-record as-of date —
 * ported from Sonar's `CompiledWindow` (see `metadata/ml-component-types/schemas/asof-window.schema.json`):
 *
 * - `Rolling`        — `(asOf − length, asOf]`; the LOWER bound is exclusive. Month lengths use
 *                      clamped calendar subtraction (31 Jul − 1 month = 30 Jun).
 * - `Calendar`       — the calendar period containing the as-of date, period start (inclusive) → asOf.
 * - `SinceEvent`     — `[anchorDate + offset, asOf]`; the window STARTS at a per-record date
 *                      (e.g. join date) read from `AnchorDateField` on the target record.
 * - `RenewalRelative`— `[anchorDate + offset, anchorDate]` capped at asOf; the window ENDS at a
 *                      per-record date (e.g. renewal date).
 * - `AllTime`        — no window; everything at-or-before asOf.
 */
export type AsOfWindowSpec =
  | { Kind: 'Rolling'; LengthDays?: number; LengthMonths?: number }
  | { Kind: 'Calendar'; Period: 'month' | 'quarter' | 'year' }
  | { Kind: 'SinceEvent'; AnchorDateField: string; OffsetDays?: number }
  | { Kind: 'RenewalRelative'; AnchorDateField: string; OffsetDays?: number }
  | { Kind: 'AllTime' };
