/**
 * JSON shapes for the `MJ: ML Model Publish Records` columns that store Predictive Studio contract values: `Initiator`
 * (`Actor`), `GateDecision` (`GateDecision`), `Evidence` (`EvidenceSnapshot`) and `Refusal` (`TransitionRefusal`).
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it verbatim, and CodeGen emits it inline
 * (once per entity, however many fields bind it), so it cannot import another file. CodeGen emits typed
 * `InitiatorObject`, `GateDecisionObject`, `EvidenceObject` and `RefusalObject` accessors on
 * `MJMLModelPublishRecordEntity`.
 *
 * **Lockstep contract**: every type here is mirrored, field for field, by the type of the same name in
 * `@memberjunction/predictive-studio-core` (`packages/AI/PredictiveStudio/Core/src/`): `Actor` in `prediction-unit.ts`;
 * `GateDecision` and `PairedComparison` in `gate.ts`; `EvidenceSnapshot` in `governance-contracts.ts`;
 * `TransitionRefusal`, `LifecycleState`, `PersistedLifecycleState` and `StatusGuardDecision` in `registry-contracts.ts`; `Interval`,
 * `MetricWithInterval`, `ProperScore`, `SecondaryMetric` and `MetricKey` in `evaluation-protocol.ts`; `LeakageFlag` in
 * `trainer-contract.ts`. Runtime code reads the columns through those Core types, so a member added there must be added
 * here. Edit both in the same commit; Core's `src/__tests__/jsontype-mirrors.compile.test.ts` fails when they drift.
 * The keys are camelCase because they are stored JSON and trainer wire names.
 */

/**
 * Who authored a version or started an action — data, never a permission by itself. `human` is a user; `agent`,
 * `scheduled-job` and `system` are the automated authors. A `system` actor started by a Record Process run
 * (auto-train) names that run in `processRunId`.
 */
export type Actor =
  | { readonly kind: 'human'; readonly userId: string }  // case-violation-ok-legacy-back-compat: stored Prediction Unit JSON field name
  | { readonly kind: 'agent'; readonly agentRunId: string }  // case-violation-ok-legacy-back-compat: stored Prediction Unit JSON field name
  | { readonly kind: 'scheduled-job'; readonly scheduledJobRunId: string }  // case-violation-ok-legacy-back-compat: stored Prediction Unit JSON field name
  // case-violation-ok-legacy-back-compat: stored Prediction Unit and publish-record Initiator JSON field names
  | { readonly kind: 'system'; readonly component: string; readonly processRunId?: string };

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

/** What the approver (or the automated gate) was shown, built server-side from stored rows at signing or publish. */
export interface EvidenceSnapshot {
  readonly holdoutPrimary: MetricWithInterval;  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  readonly comparisons: Readonly<Record<string, PairedComparison>>;  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  readonly gate: GateDecision;  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  readonly leakageFlags: readonly LeakageFlag[];  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  /** The training data window, as ISO dates (yyyy-mm-dd). */
  readonly dataWindow: { readonly from: string; readonly to: string };  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  readonly snapshotHash: string;  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
}

/** A confidence interval at `level` around an estimate. */
export interface Interval { readonly level: number; readonly lower: number; readonly upper: number }  // case-violation-ok-legacy-back-compat: stored Evaluation Protocol JSON field name
/** One metric's value on `n` rows, with its interval. */
export interface MetricWithInterval { readonly metric: MetricKey; readonly value: number; readonly interval: Interval; readonly n: number }  // case-violation-ok-legacy-back-compat: stored Evaluation Protocol JSON field name

/** The proper scoring rule a protocol ranks candidates by, per target family. */
export type ProperScore =
  | { readonly family: 'binary'; readonly metric: 'log-loss' | 'brier' }  // case-violation-ok-legacy-back-compat: stored Evaluation Protocol JSON field name
  | { readonly family: 'multiclass'; readonly metric: 'multiclass-log-loss' }  // case-violation-ok-legacy-back-compat: stored Evaluation Protocol JSON field name
  | { readonly family: 'continuous'; readonly metric: 'rmse' | 'mae' }  // case-violation-ok-legacy-back-compat: stored Evaluation Protocol JSON field name
  | { readonly family: 'count'; readonly metric: 'poisson-deviance' }  // case-violation-ok-legacy-back-compat: stored Evaluation Protocol JSON field name
  | { readonly family: 'non-negative'; readonly metric: 'tweedie-deviance' }  // case-violation-ok-legacy-back-compat: stored Evaluation Protocol JSON field name
  | { readonly family: 'forecast'; readonly metric: 'mase' | 'rmse' };  // case-violation-ok-legacy-back-compat: stored Evaluation Protocol JSON field name
/** The metrics reported beside the primary score; never used to rank. */
export type SecondaryMetric = 'auc' | 'accuracy' | 'f1' | 'precision' | 'recall' | 'r2' | 'calibration-slope';
/** Every metric a run may report: the proper scores and the secondary metrics. */
export type MetricKey = ProperScore['metric'] | SecondaryMetric;

/** A paired comparison of two scorers' losses on the same holdout rows. */
export interface PairedComparison {
  /** Mean of (base loss − candidate loss); positive favours the candidate. */
  readonly value: number;  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
  /** The interval on `value` at the protocol's lower-bound level. */
  readonly ci: readonly [number, number];  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
  /** True when ci[0] > the protocol's margin. */
  readonly beats: boolean;  // case-violation-ok-legacy-back-compat: trainer wire and stored gate record field name
}

/** One leakage-audit finding. */
export type LeakageFlag =
  | { readonly kind: 'single-feature-auc'; readonly sourceColumn: string; readonly heldOutAuc: number }  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  | { readonly kind: 'time-shifted-label'; readonly scoreWithShiftedLabel: number }  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  | { readonly kind: 'drop-column'; readonly sourceColumn: string; readonly scoreDrop: number }  // case-violation-ok-legacy-back-compat: trainer sidecar wire name
  | { readonly kind: 'high-cardinality-id'; readonly sourceColumn: string; readonly distinctRatio: number };  // case-violation-ok-legacy-back-compat: trainer sidecar wire name

/** Why a lifecycle transition was refused; stored as `MJ: ML Model Publish Records.Refusal` JSON. */
export type TransitionRefusal =
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'illegal-transition'; readonly from: PersistedLifecycleState; readonly to: PersistedLifecycleState }
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'no-sign-off' }
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'gate-no-signal'; readonly reason: string }
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'unacknowledged-leakage-flags'; readonly flags: readonly LeakageFlag['kind'][] }
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'semantics-check-failed'; readonly mismatches: readonly string[] }
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'actor-not-permitted'; readonly actor: Actor['kind'] }
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'does-not-beat-incumbent'; readonly incumbentModelId: string; readonly comparison: PairedComparison }
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'status-written-outside-gate'; readonly guard: Extract<StatusGuardDecision, { readonly Allow: false }> }
  /** Storage unreachable while verifying the artifact; transient (D4-16). */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'artifact-unverifiable'; readonly detail: string }
  /** The publish lock timed out; transient (D4-16). */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'publish-in-progress' }
  /** A keep-simple-baseline outcome without `autoPublishKeepBaseline` or a human request; final (D-031, D4-16). */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'keep-baseline-not-auto-published' }
  /** The registry job closed a sign-off wait: a newer run was evaluated, or `signOffExpiryDays` passed (D4-19). */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'sign-off-wait-closed'; readonly closedBy: 'newer-run-evaluated' | 'expired' }
  /** A run whose decision kept the incumbent heuristic: no model row (PR 3 Q3-5; D4-56). */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'kept-existing-rule'; readonly rule: string }
  /** The shipped finalist's calibration hides its family (the trainer's CALIBRATION HOLD); the slope, or null when unmeasured (D4-57). */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'calibration-held'; readonly slope: number | null }
  /** The model cannot be served (no artifact file, or a delivery that ships nothing); the reason in words (D4-57). */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'not-servable'; readonly reason: string }
  /** No model row has this ID, or the ID is not a UUID (refused before any read). */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'model-not-found'; readonly modelId: string }
  /** An archive or a rollback without a reason. */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'reason-required' }
  /** The run's stored comparison is against a model other than the one Published now (another publish replaced it, §5.7 R2); final. */
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'incumbent-not-current'; readonly comparedWith: string; readonly current: string };

/** A lifecycle state of the contract. */
export type LifecycleState = 'draft' | 'validated' | 'published' | 'archived';

/** A lifecycle state as a refusal names it: the contract's four plus `unevaluated` and `keep-baseline` (D4-90). */
export type PersistedLifecycleState = LifecycleState | 'unevaluated' | 'keep-baseline';

/** The Status guard's decision for one save of `MJ: ML Models`. */
export type StatusGuardDecision =
  | { readonly Allow: true; readonly Reason: 'create-as-draft' | 'status-unchanged' | 'gate-authorised' }
  | {
      readonly Allow: false;
      readonly Reason:
        | 'create-not-draft'
        | 'stored-row-unreadable'
        | 'deferred-in-transaction-group'
        | 'status-changed-outside-gate'
        | 'gate-transition-mismatch'
        | 'serving-flag-set-outside-migration';
    };
