/**
 * JSON shapes for the `MJ: ML Scoring Runs` columns that store Predictive Studio contract values: `Scope`
 * (`ScoringScope`), `ReadPolicy` (`ReadPolicy`), `RequestedBy` (`Actor`), `EntityMapping` (`EntityRef`), `Refusal`
 * (`ScoringRefusal`) and `FirstErrors` (an array of `ScoringRowError`, at most 20).
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it verbatim, and CodeGen emits it inline
 * (once per entity, however many fields bind it), so it cannot import another file. CodeGen emits typed
 * `ScopeObject`, `ReadPolicyObject`, `RequestedByObject`, `EntityMappingObject`, `RefusalObject` and
 * `FirstErrorsObject` accessors on `MJMLScoringRunEntity`.
 *
 * **Lockstep contract**: every type here is mirrored, field for field, by the type of the same name in
 * `@memberjunction/predictive-studio-core` (`packages/AI/PredictiveStudio/Core/src/`): `ScoringScope`, `EntityRef`,
 * `ScoringRefusal` and `ScoringRowError` in `scoring-contracts.ts`; `ReadPolicy` and `AssemblyRefusal` in
 * `assembly-contract.ts`; `Actor` in `prediction-unit.ts`; `PersistedModelStatus` in `registry-contracts.ts`;
 * `LeakageFlag` in `trainer-contract.ts`. Runtime code reads the columns through those Core types, so a member added
 * there must be added here. Edit both in the same commit; Core's `src/__tests__/jsontype-mirrors.compile.test.ts`
 * fails when they drift. The keys are camelCase because they are stored JSON.
 */

/** Which records one scoring call scores. */
export type ScoringScope =
  // case-violation-ok-legacy-back-compat: stored scoring-run Scope JSON keys
  | { readonly kind: 'record-ids'; readonly entity: string; readonly ids: readonly string[] }
  // case-violation-ok-legacy-back-compat: stored scoring-run Scope JSON keys
  | { readonly kind: 'view'; readonly entity: string; readonly userViewId: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Scope JSON keys
  | { readonly kind: 'filter'; readonly entity: string; readonly extraFilter: string };

/** How the scope's rows were read: all of them, or in pages of `pageSize`. */
export type ReadPolicy = { readonly mode: 'complete' } | { readonly mode: 'paged'; readonly pageSize: number };  // case-violation-ok-legacy-back-compat: stored assembly JSON field name

/**
 * Who asked for the run — data, never a permission by itself. `human` is a user; `agent`, `scheduled-job` and `system`
 * are the automated authors. A `system` actor started by a Record Process run names that run in `processRunId`.
 */
export type Actor =
  | { readonly kind: 'human'; readonly userId: string }  // case-violation-ok-legacy-back-compat: stored scoring-run RequestedBy JSON field name
  | { readonly kind: 'agent'; readonly agentRunId: string }  // case-violation-ok-legacy-back-compat: stored scoring-run RequestedBy JSON field name
  | { readonly kind: 'scheduled-job'; readonly scheduledJobRunId: string }  // case-violation-ok-legacy-back-compat: stored scoring-run RequestedBy JSON field name
  // case-violation-ok-legacy-back-compat: stored scoring-run RequestedBy JSON field names
  | { readonly kind: 'system'; readonly component: string; readonly processRunId?: string };

/** A reference to a stored row: its entity name and its ID. */
export interface EntityRef {
  readonly entity: string;  // case-violation-ok-legacy-back-compat: stored scoring-run EntityMapping JSON key
  readonly id: string;  // case-violation-ok-legacy-back-compat: stored scoring-run EntityMapping JSON key
}

/** A model status as stored on `MJ: ML Models.Status`. */
export type PersistedModelStatus = 'Draft' | 'Validated' | 'Published' | 'Archived' | 'KeepBaseline' | 'Unevaluated';

/** A leakage flag the trainer raised; a refusal names only its `kind`. */
export type LeakageFlag =
  | { readonly kind: 'single-feature-auc'; readonly sourceColumn: string; readonly heldOutAuc: number }  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  | { readonly kind: 'time-shifted-label'; readonly scoreWithShiftedLabel: number }  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  | { readonly kind: 'drop-column'; readonly sourceColumn: string; readonly scoreDrop: number }  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  | { readonly kind: 'high-cardinality-id'; readonly sourceColumn: string; readonly distinctRatio: number };  // case-violation-ok-legacy-back-compat: trainer sidecar wire name

/** Why feature assembly refused, carried by an `assembly-refused` scoring refusal. */
export type AssemblyRefusal =
  | { readonly kind: 'select-changes-after-decision-date'; readonly entity: string; readonly field: string; readonly changesAfter: number }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'decision-date-before-change-history'; readonly entity: string; readonly field: string; readonly historyStart: string | null; readonly rowsAffected: number }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'truncated-read'; readonly entity: string; readonly rowsExpected: number; readonly rowsRead: number }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'non-numeric-in-numeric-column'; readonly column: string; readonly sampleValue: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'future-period-lag'; readonly column: string; readonly lag: number; readonly horizonPeriods: number }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'unpinned-feature-version'; readonly featureName: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'scope-entity-mismatch'; readonly modelEntity: string; readonly scopeEntity: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'unresolved-column'; readonly entity: string; readonly field: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'incumbent-score-missing'; readonly entity: string; readonly rows: number; readonly firstRowIds: readonly string[] }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'virtual-field'; readonly entity: string; readonly field: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'unsupported-step-kind'; readonly stepId: string; readonly stepKind: string }  // case-violation-ok-legacy-back-compat: stored assembly JSON field name
  | { readonly kind: 'invalid-date-in-history'; readonly entity: string; readonly field: string; readonly value: string };  // case-violation-ok-legacy-back-compat: stored assembly JSON field name

/** Why a scoring call wrote nothing, decided before any assembly. */
export type ScoringRefusal =
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'model-not-published'; readonly status: PersistedModelStatus }
  /** The model carries leakage flags, or the dominance re-run over its stored feature importance flagged one feature. */
  | {
      readonly kind: 'model-flagged';  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly flags: readonly LeakageFlag['kind'][];  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly dominance?: {  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
        readonly topFeature: string;  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
        readonly topShare: number;  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
        readonly threshold: number;  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      };
    }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'artifact-missing'; readonly fileId: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'artifact-hash-mismatch'; readonly expected: string; readonly actual: string }
  | {
      readonly kind: 'feature-schema-mismatch';  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly expectedHash: string;  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly actualHash: string;  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly missingColumns: readonly string[];  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly extraColumns: readonly string[];  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
      readonly typeMismatches: readonly string[];  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON key
    }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'scope-entity-mismatch'; readonly modelEntity: string; readonly scopeEntity: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'assembly-refused'; readonly refusal: AssemblyRefusal }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'nan-or-empty-feature-column'; readonly columns: readonly string[] }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'no-published-model'; readonly pipelineId: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'binding-withdrawn'; readonly bindingId: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'binding-not-authorized'; readonly bindingId: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'as-of-unsupported'; readonly modelId: string; readonly asOf: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'leakage-unknown'; readonly modelId: string }
  // case-violation-ok-legacy-back-compat: stored scoring-run Refusal JSON keys
  | { readonly kind: 'artifact-unverified'; readonly modelId: string };

/** One record that failed to score; `FirstErrors` stores an array of these (at most 20). */
export interface ScoringRowError {
  readonly recordId: string;  // case-violation-ok-legacy-back-compat: stored scoring-run FirstErrors JSON key
  readonly message: string;  // case-violation-ok-legacy-back-compat: stored scoring-run FirstErrors JSON key
}
