/**
 * JSON shapes for the `MJ: ML Models` columns that store Predictive Studio contract values: `CodeVersion`
 * (`CodeVersion`), `OutputSemantics` (`OutputSemantics`) and `Delivery` (`RegisteredDeliveryView`).
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it verbatim, and CodeGen emits it inline
 * (once per entity, however many fields bind it), so it cannot import another file. CodeGen emits typed
 * `CodeVersionObject`, `OutputSemanticsObject` and `DeliveryObject` accessors on `MJMLModelEntity`.
 *
 * **Lockstep contract**: every type here is mirrored, field for field, by the type of the same name in
 * `@memberjunction/predictive-studio-core` (`packages/AI/PredictiveStudio/Core/src/`): `CodeVersion` in
 * `trainer-contract.ts`; `OutputSemantics`, `RegisteredDeliveryView` and `StoredFile` in `registry-contracts.ts`;
 * `TaskType` in `task-type.ts`; `GateDecision` in `gate.ts`. Runtime code reads the columns through those Core types,
 * so a member added there must be added here. Edit both in the same commit; Core's
 * `src/__tests__/jsontype-mirrors.compile.test.ts` fails when they drift.
 * The keys are camelCase because they are stored JSON and trainer wire names.
 */

/** The code a run executed: the repository commit, the sidecar version, the library versions, threads and seed. */
export interface CodeVersion {
  readonly psGitSha: string;  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  readonly sidecarVersion: string;  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  readonly libraryVersions: Readonly<Record<string, string>>;  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  readonly threads: number;  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  readonly seed: number;  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
}

/**
 * Which class a score is for and which direction is adverse (S9.5). Only the task type is stored; the scored class and
 * adverse direction are derived by `TaskTypeRules.ScoreSemantics`, so there is one source of truth.
 */
export interface OutputSemantics {
  readonly task: TaskType;  // case-violation-ok-legacy-back-compat: stored MJ: ML Models.OutputSemantics JSON key
}

/** The declared task type of a Prediction Unit. */
export type TaskType =
  // case-violation-ok-legacy-back-compat: stored task type JSON field name
  | { readonly kind: 'binary'; readonly classOrder: readonly [string, string]; readonly adverseIndex: 0 | 1 }
  // case-violation-ok-legacy-back-compat: stored task type JSON field name
  | { readonly kind: 'multiclass'; readonly classOrder: readonly string[]; readonly adverseIndices: readonly number[] }
  // case-violation-ok-legacy-back-compat: stored task type JSON field name
  | { readonly kind: 'continuous' }
  // case-violation-ok-legacy-back-compat: stored task type JSON field name
  | { readonly kind: 'count' }
  // case-violation-ok-legacy-back-compat: stored task type JSON field name
  | { readonly kind: 'non-negative'; readonly tweediePower: number }
  // case-violation-ok-legacy-back-compat: stored task type JSON field name
  | { readonly kind: 'forecast'; readonly valueKind: 'continuous' | 'count' | 'non-negative' };

/** The registry's view of a delivery, persisted as `MJ: ML Models.Delivery` JSON: the stored file with the gate inside. */
export type RegisteredDeliveryView =
  | {
      readonly kind: 'delivered';  // case-violation-ok-legacy-back-compat: stored MJ: ML Models.Delivery JSON key
      readonly gate: Exclude<GateDecision, { readonly outcome: 'no-signal' }>;  // case-violation-ok-legacy-back-compat: stored MJ: ML Models.Delivery JSON key
      readonly shipped: string;  // case-violation-ok-legacy-back-compat: stored MJ: ML Models.Delivery JSON key
      readonly shippedRole: 'model' | 'simpleBaseline';  // case-violation-ok-legacy-back-compat: stored MJ: ML Models.Delivery JSON key
      readonly artifact: StoredFile;  // case-violation-ok-legacy-back-compat: stored MJ: ML Models.Delivery JSON key
    }
  // case-violation-ok-legacy-back-compat: stored MJ: ML Models.Delivery JSON keys
  | { readonly kind: 'no-signal'; readonly gate: Extract<GateDecision, { readonly outcome: 'no-signal' }>; readonly artifact: null };

/** A file held through MJ's file-storage provider (`MJ: Files` row + `FileStorageBase` driver), stored write-once. */
export interface StoredFile {
  /** `MJ: Files`.ID */
  readonly fileId: string;  // case-violation-ok-legacy-back-compat: stored Delivery JSON key
  /** `MJ: File Storage Providers`.ID; never the OS temp directory. */
  readonly storageProviderId: string;  // case-violation-ok-legacy-back-compat: stored Delivery JSON key
  /** Object name passed to `FileStorageBase.PutObject` / `GetObject`. */
  readonly providerKey: string;  // case-violation-ok-legacy-back-compat: stored Delivery JSON key
  /** Lower-case hex SHA-256 of the stored bytes. */
  readonly sha256: string;  // case-violation-ok-legacy-back-compat: stored Delivery JSON key
  /** Size of the stored bytes. */
  readonly sizeBytes: number;  // case-violation-ok-legacy-back-compat: stored Delivery JSON key
  /** Write-once: a second PutObject to this key is refused by the registry. */
  readonly writeOnce: true;  // case-violation-ok-legacy-back-compat: stored Delivery JSON key
}

/** The gate's decision: what ships (a model, the best simple baseline, or nothing) and the branch that decided it. */
export type GateDecision =
  | {
      readonly outcome: 'model';  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly branch: 'a:beats-best-simple' | 'a:Q15-only-model-beats-dummy';  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly shipped: string;  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly shippedRole: 'model';  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly note: 'no simple baseline carries demonstrable signal' | null;  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
    }
  | {
      readonly outcome: 'keep-simple-baseline';  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly branch: 'b:keep-simple-baseline';  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly shipped: string;  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly shippedRole: 'simpleBaseline';  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly note: null;  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
    }
  | {
      readonly outcome: 'no-signal';  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly branch: 'c:no-signal';  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly shipped: null;  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly shippedRole: null;  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
      readonly note: null;  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
    };
