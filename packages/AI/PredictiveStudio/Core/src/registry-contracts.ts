/**
 * @module registry-contracts
 *
 * C5 — the Model Registry and the lifecycle gate, ported from the target-design contracts
 * (`reference/contracts/contracts.ts` L44-L64, L758-L1014, L1115-L1335) under the product names of D-037 (statics on
 * the owning classes, no free-function aliases) with PR 4's deltas (§5.2):
 *
 * - D4-02 / §6.2a: the status-write authorisation names persisted statuses (`PersistedModelStatus`, which adds
 *   `KeepBaseline` and `Unevaluated`) and is validated against the §5.1 lifecycle table.
 * - D4-42 / §6.2a: `PublishRules.ReverifyPublish` re-derives the decision with PR 3's guarded gate
 *   (`GateRules.DecideGuardedGate`) and honours `PromotionRule.autoPublishKeepBaseline`.
 * - D4-16 (D-029): `validated → published` and rollback take any `Actor` and an optional sign-off; the new
 *   `PublishRecord` and the new `TransitionRefusal` kinds.
 * - D4-17: `RollbackTrigger` (in `evaluation-protocol.ts`, beside `RetrainTrigger`: it is a `PromotionRule` member).
 * - D4-45: the in-process `ArtifactLoad` gains `unverified` (a model row with no registered `ArtifactSha256`).
 *
 * Issued values (Ruling Q21): `Delivery`, `IncumbentCheck` and `RegisteredDelivery` are classes with an ES `#issued`
 * field and a private constructor, created only by their static factories, and frozen (instance and view). Object
 * spread does not copy `#` fields, so a spread forgery neither type-checks as the class nor passes `IsIssued`. A cast
 * still compiles: the guarantee is `PublishRules.ReverifyPublish`, which the gate and the PreSave hook run on stored
 * data and which trusts no passed object. Every ID comparison goes through `UUIDsEqual`.
 *
 * Casing (D-054, D-039): shapes written to a column, a file or a wire keep the contract's camelCase (`StoredFile`, the
 * Delivery and RegisteredDelivery views, `OutputSemantics`, `TransitionRefusal`, `PublishRecord`);
 * shapes that never leave the process are PascalCase.
 */
import { UUIDsEqual } from '@memberjunction/global';
import type { MetricWithInterval, NonNegative, PromotionRule } from './evaluation-protocol';
import { GateRules, type GateDecision, type GateGuardInputs, type PairedComparison, type StoredGateIntervals } from './gate';
import type { EvidenceSnapshot, SemanticsCheck, SignOff } from './governance-contracts';
import type { Actor, HumanActor } from './prediction-unit';
import type { StoredGateRecord } from './run-evaluation';
import type { TaskType } from './task-type';
import type { BaselineResult, CodeVersion, LeakageFlag, ReturnedArtifact } from './trainer-contract';
import type { FeatureVersionPin } from './assembly-contract';

// ====================================================================================================== primitives ==

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

// ============================================================================================ C5 Model Registry ==

/**
 * The contract's four lifecycle states. Mapping to the persisted statuses (§5.1, D4-02): each state is the status of
 * the same name ({@link StatusWriteRules.StatusByState}); `KeepBaseline` is the `validated` state of a
 * keep-simple-baseline delivery that shipped an artifact; `Unevaluated` is a pre-change model demoted by the registry
 * job's migration (§5.6), outside the contract's states; a no-signal delivery has no model row and so no status (its
 * "validated for the record" is the run-level refusal record, D4-56).
 */
export type LifecycleState = 'draft' | 'validated' | 'published' | 'archived';

/**
 * A status the `MJ: ML Models.Status` CHECK accepts. Core imports only `@memberjunction/global` (D-041), so the union is
 * written out; Task M1.7's test asserts it equals the generated `MJMLModelEntity['Status']` once CodeGen has run.
 */
export type PersistedModelStatus = 'Draft' | 'Validated' | 'Published' | 'Archived' | 'KeepBaseline' | 'Unevaluated';

/**
 * Which class a score is for and which direction is adverse (S9.5). Only the task type is stored; the scored class and
 * adverse direction are derived by `TaskTypeRules.ScoreSemantics`, so there is one source of truth.
 */
export interface OutputSemantics {
  readonly task: TaskType;  // case-violation-ok-legacy-back-compat: stored MJ: ML Models.OutputSemantics JSON key
}

/**
 * What the registry knows of one `MJ: ML Models` row. The delivery carries the gate decision inside it: the entry has no
 * other gate field, so the two cannot disagree. Lineage names the exact version rows (D-014, D-015), not a version
 * number beside an ID.
 */
export interface ModelRegistryEntry {
  /** `MJ: ML Models`.ID */
  readonly ModelID: string;
  /** The `MJ: ML Training Pipelines` row the model belongs to. */
  readonly PipelineID: string;
  /** The model's version within its pipeline (unique per pipeline). */
  readonly Version: number;
  /** The persisted status; only the lifecycle gate writes it. */
  readonly Status: PersistedModelStatus;
  /**
   * What the gate delivered. Scoring loads its artifact: for keep-simple-baseline that is the simple member's artifact.
   * A no-signal delivery has no artifact and no model row.
   */
  readonly Delivery: RegisteredDelivery;
  /** Where the model came from: the exact version rows and files it was trained and evaluated on. */
  readonly Lineage: {
    /** The `MJ: ML Training Snapshots` row the model was trained on. */
    readonly TrainingSnapshotID: string;
    /** SHA-256 of that snapshot's content. */
    readonly SnapshotHash: string;
    /** The `MJ: ML Evaluation Protocols` version row the run was evaluated under. */
    readonly EvaluationProtocolID: string;
    /** The `MJ: ML Prediction Units` version row the run trained for. */
    readonly PredictionUnitID: string;
    /** The code the run executed. */
    readonly CodeVersion: CodeVersion;
    /** The `MJ: ML Training Runs` row that produced the model. */
    readonly TrainingRunID: string;
    /** The Feature Pipeline outputs the model's features were read at. */
    readonly PinnedFeatureVersions: readonly FeatureVersionPin[];
  };
  /** Hash of the feature schema; scoring refuses a matrix whose schema hash differs. */
  readonly FeatureSchemaHash: string;
  /** The model's declared output semantics (task type only). */
  readonly Semantics: OutputSemantics;
  /** The holdout evaluation, read from stored records. No gate field: the gate lives in `Delivery`. */
  readonly Evaluation: {
    /** The primary proper score on the locked holdout, with its interval. */
    readonly Primary: MetricWithInterval;
    /** Each baseline's holdout score. */
    readonly Baselines: readonly BaselineResult[];
  };
  /** The leakage audit's findings on the run. */
  readonly LeakageFlags: readonly LeakageFlag[];
}

/**
 * One verified artifact load: never a quiet null (S7.1). `unverified` is a model row with no registered `ArtifactSha256`
 * (a pre-change model, which M7's data migration makes `Unevaluated`, §5.6): nothing to verify against, so it never
 * serves as verified.
 */
export type ArtifactLoad =
  | { readonly Status: 'verified'; readonly Sha256: string; readonly Bytes: Uint8Array }
  | { readonly Status: 'missing'; readonly FileID: string }
  | { readonly Status: 'hash-mismatch'; readonly Expected: string; readonly Actual: string }
  | { readonly Status: 'unverified'; readonly ModelID: string };

/** Freezes an issued value's view and everything it reaches. Module-internal; the issued classes call it. */
class IssuedValue {
  /** Freezes `x` and, recursively, every object it reaches that is not frozen already. */
  public static DeepFreeze<T>(x: T): T {
    if (typeof x === 'object' && x !== null && !Object.isFrozen(x)) {
      Object.freeze(x);
      for (const v of Object.values(x)) IssuedValue.DeepFreeze(v);
    }
    return x;
  }
}

// ======================================================================================================= Delivery ==

/** The discriminated view of a Delivery: the gate outcome fixes the role of the artifact. */
export type DeliveryView =
  // case-violation-ok-legacy-back-compat: the contract's DeliveryView keys (in-process; it holds the sidecar wire artifact with bytesBase64, never stored; RegisteredDeliveryView is the stored form)
  | { readonly gate: Extract<GateDecision, { readonly outcome: 'model' }>; readonly artifact: ReturnedArtifact & { readonly role: 'model' } }
  // case-violation-ok-legacy-back-compat: the contract's DeliveryView keys (in-process; it holds the sidecar wire artifact with bytesBase64, never stored; RegisteredDeliveryView is the stored form)
  | { readonly gate: Extract<GateDecision, { readonly outcome: 'keep-simple-baseline' }>; readonly artifact: ReturnedArtifact & { readonly role: 'simpleBaseline' } }
  // case-violation-ok-legacy-back-compat: the contract's DeliveryView keys (in-process; it holds the sidecar wire artifact with bytesBase64, never stored; RegisteredDeliveryView is the stored form)
  | { readonly gate: Extract<GateDecision, { readonly outcome: 'no-signal' }>; readonly artifact: null };

/** Why `Delivery.Create` refused: the shipped artifact is missing or duplicated, or its class order is not the task's. */
export type DeliveryError =
  | { readonly Kind: 'no-artifact-for-shipped'; readonly Shipped: string; readonly Returned: readonly string[] }
  | { readonly Kind: 'duplicate-artifact-for-shipped'; readonly Shipped: string }
  | { readonly Kind: 'class-order-mismatch'; readonly Declared: readonly string[]; readonly Artifact: readonly string[] | null };

/** What the gate delivers: the gate decision and the role-tagged artifact it ships. Created only by {@link Delivery.Create}. */
export class Delivery {
  readonly #issued = true;
  /** The frozen view. */
  public readonly View: DeliveryView;

  private constructor(view: DeliveryView) {
    this.View = IssuedValue.DeepFreeze(view);
    Object.freeze(this);
  }

  /** True only for a value `Delivery.Create` issued; a spread or a cast is not. */
  public static IsIssued(x: Delivery): boolean {
    return typeof x === 'object' && x !== null && #issued in x;
  }

  /**
   * Selects the artifact whose `candidate` is `gate.shipped`, assigns the role from the gate, and delivers none for
   * no-signal; refuses a missing or duplicated shipped artifact and a class order that differs from `task`.
   */
  public static Create(
    gate: GateDecision,
    artifacts: readonly ReturnedArtifact[],
    task: TaskType,
  ): { readonly Ok: true; readonly Delivery: Delivery } | { readonly Ok: false; readonly Error: DeliveryError } {
    if (gate.outcome === 'no-signal') return { Ok: true, Delivery: new Delivery({ gate, artifact: null }) };
    const shipped = gate.shipped;
    const matches = artifacts.filter((x) => x.candidate === shipped);
    const artifact = matches[0];
    if (artifact === undefined) {
      return { Ok: false, Error: { Kind: 'no-artifact-for-shipped', Shipped: shipped, Returned: artifacts.map((x) => x.candidate) } };
    }
    if (matches.length > 1) return { Ok: false, Error: { Kind: 'duplicate-artifact-for-shipped', Shipped: shipped } };
    if (!Delivery.sameClassOrder(task, artifact)) {
      const declared = task.kind === 'binary' || task.kind === 'multiclass' ? task.classOrder : [];
      return { Ok: false, Error: { Kind: 'class-order-mismatch', Declared: declared, Artifact: artifact.classOrder } };
    }
    const view: DeliveryView =
      gate.outcome === 'model'
        ? { gate, artifact: { ...artifact, role: 'model' } }
        : { gate, artifact: { ...artifact, role: 'simpleBaseline' } };
    return { Ok: true, Delivery: new Delivery(view) };
  }

  /** A classification artifact lists the task's classes in the task's order; any other artifact lists none. */
  private static sameClassOrder(task: TaskType, artifact: ReturnedArtifact): boolean {
    if (task.kind !== 'binary' && task.kind !== 'multiclass') return artifact.classOrder === null;
    const a = artifact.classOrder;
    return a !== null && a.length === task.classOrder.length && a.every((c, k) => c === task.classOrder[k]);
  }
}

// ================================================================================================ IncumbentCheck ==

/** The shipped candidate does not beat the published incumbent by the margin. */
export interface IncumbentLoss {
  readonly Kind: 'does-not-beat-incumbent';
  readonly IncumbentModelID: string;
  readonly Margin: NonNegative;
  /** The comparison with `beats` recomputed from its lower bound. */
  readonly Comparison: PairedComparison;
}

/** The view of an issued incumbent check: no incumbent, or the candidate beats it. */
export type IncumbentCheckView =
  | { readonly Kind: 'no-incumbent'; readonly Delivery: Delivery; readonly IncumbentModelID: null }
  | {
      readonly Kind: 'beats-incumbent';
      readonly Delivery: Delivery;
      readonly IncumbentModelID: string;
      readonly Margin: NonNegative;
      readonly Comparison: PairedComparison;
    };

/**
 * Spec §5: the shipped candidate beats the published incumbent by the margin (paired lower bound strictly above it, same
 * holdout rows). Created only by {@link IncumbentCheck.Compare}.
 */
export class IncumbentCheck {
  readonly #issued = true;
  /** The frozen view. */
  public readonly View: IncumbentCheckView;

  private constructor(view: IncumbentCheckView) {
    this.View = IssuedValue.DeepFreeze(view);
    Object.freeze(this);
  }

  /** True only for a value `IncumbentCheck.Compare` issued; a spread or a cast is not. */
  public static IsIssued(x: IncumbentCheck): boolean {
    return typeof x === 'object' && x !== null && #issued in x;
  }

  /**
   * Compares the delivery's shipped candidate with the incumbent. Computes `beats` itself from the comparison's lower
   * bound (`ci[0] > margin`; the caller's `beats` is ignored) and takes the candidate from the delivery. Returns
   * `no-incumbent` only for a null id, an {@link IncumbentLoss} when the candidate does not beat, and null when nothing
   * can be compared: an unissued delivery, a no-signal delivery, or an incumbent with no stored comparison.
   */
  public static Compare(
    delivery: Delivery,
    incumbentModelId: string | null,
    margin: NonNegative,
    comparison: PairedComparison | null,
  ): IncumbentCheck | IncumbentLoss | null {
    if (!Delivery.IsIssued(delivery) || delivery.View.artifact === null) return null;
    if (incumbentModelId === null) return new IncumbentCheck({ Kind: 'no-incumbent', Delivery: delivery, IncumbentModelID: null });
    if (comparison === null) return null;
    const recomputed: PairedComparison = { value: comparison.value, ci: [comparison.ci[0], comparison.ci[1]], beats: comparison.ci[0] > margin };
    if (!recomputed.beats) return { Kind: 'does-not-beat-incumbent', IncumbentModelID: incumbentModelId, Margin: margin, Comparison: recomputed };
    return new IncumbentCheck({ Kind: 'beats-incumbent', Delivery: delivery, IncumbentModelID: incumbentModelId, Margin: margin, Comparison: recomputed });
  }
}

// ============================================================================================ RegisteredDelivery ==

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

/**
 * The registry's record of what it stores and serves, with the gate inside it. Created only by
 * {@link RegisteredDelivery.Register}, which checks that the stored file's SHA-256 equals the delivered artifact's. At
 * publish it is re-derived, not trusted ({@link PublishRules.ReverifyPublish}).
 */
export class RegisteredDelivery {
  readonly #issued = true;
  /** The frozen view (what `MJ: ML Models.Delivery` stores). */
  public readonly View: RegisteredDeliveryView;

  private constructor(view: RegisteredDeliveryView) {
    this.View = IssuedValue.DeepFreeze(view);
    Object.freeze(this);
  }

  /** True only for a value `RegisteredDelivery.Register` issued; a spread or a cast is not. */
  public static IsIssued(x: RegisteredDelivery): boolean {
    return typeof x === 'object' && x !== null && #issued in x;
  }

  /** Registers an issued delivery with its stored file; refuses an unissued delivery, a hash mismatch and a no-signal file. */
  public static Register(
    delivery: Delivery,
    stored: StoredFile | null,
  ): { readonly Ok: true; readonly Registered: RegisteredDelivery } | { readonly Ok: false; readonly Reason: string } {
    if (!Delivery.IsIssued(delivery)) return { Ok: false, Reason: 'delivery was not issued by Delivery.Create' };
    const v = delivery.View;
    if (v.artifact === null) {
      if (stored !== null) return { Ok: false, Reason: 'no-signal delivery with a stored file' };
      return { Ok: true, Registered: new RegisteredDelivery({ kind: 'no-signal', gate: v.gate, artifact: null }) };
    }
    if (stored === null || stored.sha256 !== v.artifact.sha256) {
      return { Ok: false, Reason: 'stored file hash differs from the delivered artifact' };
    }
    return {
      Ok: true,
      Registered: new RegisteredDelivery({ kind: 'delivered', gate: v.gate, shipped: v.artifact.candidate, shippedRole: v.artifact.role, artifact: stored }),
    };
  }
}

// ================================================================================================ publish guarantee ==

/**
 * Everything {@link PublishRules.ReverifyPublish} reads, all from stored rows, none from the caller's objects (Ruling
 * Q21): the stored gate intervals, guard inputs and incumbent diff come from the run's stored gate record
 * (`MJ: ML Training Runs.ValidationResults.gate`); the pinned protocol from the same run; the protocol row is the
 * `MJ: ML Evaluation Protocols` version row it names and supplies the margin and the promotion rule (neither the
 * booleans nor the margin are the caller's, N9); the artifacts are the run's registered files; the registered delivery
 * is the model row's `Delivery` JSON; the current Published model is read after the pipeline row is locked (N8).
 */
export interface StoredPublishInputs {
  readonly ModelID: string;
  readonly Task: TaskType;
  readonly GateIntervals: StoredGateIntervals;
  /** The stored guard inputs `GateRules.DecideGuardedGate` takes (D4-45). */
  readonly GateGuards: GateGuardInputs;
  /** The protocol version the training run was evaluated under, as stored on the run. */
  readonly PinnedProtocol: { readonly ProtocolID: string; readonly ProtocolVersion: number };
  /** The protocol version row loaded by the pinned ID; its promotion rule (margin, `autoPublishKeepBaseline`) applies. */
  readonly ProtocolRow: { readonly ID: string; readonly Version: number; readonly Promotion: PromotionRule };
  readonly RegisteredArtifacts: readonly ReturnedArtifact[];
  readonly RegisteredDelivery: { readonly Shipped: string | null; readonly ArtifactSha256: string | null };
  readonly IncumbentDiff: StoredGateRecord['incumbentDiff'];
  readonly CurrentPublishedModelID: string | null;
  /** Who started this publish attempt: a keep-simple-baseline outcome passes for a human without `autoPublishKeepBaseline`. */
  readonly Initiator: Actor;
}

/** The re-derived publish, or why it is refused. */
export type PublishReverification =
  | {
      readonly Ok: true;
      readonly Shipped: string;
      readonly ArtifactSha256: string;
      /** The model this publish archives (the current Published model), or null for a first model. */
      readonly Replaces: string | null;
      /** The decision as re-derived from the stored intervals (the publish record's `GateDecision` copy). */
      // case-violation-ok-legacy-back-compat: `outcome` is the stored GateDecision discriminant this filter names
      readonly Gate: Exclude<GateDecision, { readonly outcome: 'no-signal' }>;
    }
  | {
      readonly Ok: false;
      readonly Reason:
        | 'protocol-mismatch'
        | 'gate-no-signal'
        | 'delivery-refused'
        | 'delivery-mismatch'
        | 'keep-baseline-not-auto-published'
        | 'incumbent-not-current'
        | 'incumbent-diff-missing'
        | 'does-not-beat-incumbent';
      readonly Detail: string;
    };

/** A refusal of {@link PublishRules.ReverifyPublish}. */
type PublishRefusal = Extract<PublishReverification, { readonly Ok: false }>;

/** The publish guarantee: re-derives every publish from stored data. */
export class PublishRules {
  /**
   * Checks that the protocol row is the run's pinned version and takes the margin from it; re-derives the decision with
   * PR 3's guarded gate (`GateRules.DecideGuardedGate`) from the stored intervals and guard inputs; recomputes the
   * Delivery from the registered artifacts and compares candidate and hash with the registered delivery; lets a
   * keep-simple-baseline outcome through only under `autoPublishKeepBaseline` or for a human initiator (D-031, D4-16);
   * checks the incumbent is the currently published model and recomputes `ci[0] > margin` from the stored diff.
   */
  public static ReverifyPublish(inputs: StoredPublishInputs): PublishReverification {
    const protocol = PublishRules.checkPinnedProtocol(inputs);
    if (protocol !== null) return protocol;
    const margin = inputs.ProtocolRow.Promotion.margin;
    const guarded = GateRules.DecideGuardedGate(inputs.GateIntervals, margin, inputs.GateGuards);
    const gate = guarded.Decision;
    if (gate.outcome === 'no-signal') {
      const why = guarded.GuardRefusal === null ? 'recomputed gate is no-signal' : `recomputed gate is no-signal: guard ${guarded.GuardRefusal.kind}`;
      return { Ok: false, Reason: 'gate-no-signal', Detail: why };
    }
    const delivered = PublishRules.checkDelivery(inputs, gate);
    if (!delivered.Ok) return delivered;
    const keep = PublishRules.checkKeepBaseline(inputs, gate);
    if (keep !== null) return keep;
    const art = delivered.Artifact;
    if (inputs.CurrentPublishedModelID === null) {
      return { Ok: true, Shipped: art.candidate, ArtifactSha256: art.sha256, Replaces: null, Gate: gate };
    }
    const incumbent = PublishRules.checkIncumbent(inputs, inputs.CurrentPublishedModelID, margin);
    if (incumbent !== null) return incumbent;
    return { Ok: true, Shipped: art.candidate, ArtifactSha256: art.sha256, Replaces: inputs.CurrentPublishedModelID, Gate: gate };
  }

  /** Step 1: the protocol row is the version the run pinned. */
  private static checkPinnedProtocol(x: StoredPublishInputs): PublishRefusal | null {
    if (UUIDsEqual(x.ProtocolRow.ID, x.PinnedProtocol.ProtocolID) && x.ProtocolRow.Version === x.PinnedProtocol.ProtocolVersion) return null;
    return {
      Ok: false,
      Reason: 'protocol-mismatch',
      Detail: `run pinned ${x.PinnedProtocol.ProtocolID} v${x.PinnedProtocol.ProtocolVersion}, row is ${x.ProtocolRow.ID} v${x.ProtocolRow.Version}`,
    };
  }

  /** Steps 3–5: the Delivery recomputed from the registered artifacts names the registered candidate and hash. */
  private static checkDelivery(
    x: StoredPublishInputs,
    gate: Exclude<GateDecision, { readonly outcome: 'no-signal' }>,
  ): { readonly Ok: true; readonly Artifact: ReturnedArtifact } | PublishRefusal {
    const d = Delivery.Create(gate, x.RegisteredArtifacts, x.Task);
    if (!d.Ok) return { Ok: false, Reason: 'delivery-refused', Detail: d.Error.Kind };
    const art = d.Delivery.View.artifact;
    if (art === null) return { Ok: false, Reason: 'gate-no-signal', Detail: 'no artifact' };
    if (art.candidate !== x.RegisteredDelivery.Shipped || art.sha256 !== x.RegisteredDelivery.ArtifactSha256) {
      return { Ok: false, Reason: 'delivery-mismatch', Detail: `recomputed ${art.candidate}/${art.sha256}` };
    }
    return { Ok: true, Artifact: art };
  }

  /** A keep-simple-baseline outcome publishes only under `autoPublishKeepBaseline` or on a human's explicit request. */
  private static checkKeepBaseline(x: StoredPublishInputs, gate: Exclude<GateDecision, { readonly outcome: 'no-signal' }>): PublishRefusal | null {
    if (gate.outcome !== 'keep-simple-baseline') return null;
    if (x.ProtocolRow.Promotion.autoPublishKeepBaseline || x.Initiator.kind === 'human') return null;
    return {
      Ok: false,
      Reason: 'keep-baseline-not-auto-published',
      Detail: `the ${x.Initiator.kind} initiator cannot publish a keep-simple-baseline outcome: protocol ${x.ProtocolRow.ID} v${x.ProtocolRow.Version} does not set autoPublishKeepBaseline`,
    };
  }

  /** Steps 7–9: a stored comparison exists, against the model published now, and its lower bound beats the margin. */
  private static checkIncumbent(x: StoredPublishInputs, current: string, margin: NonNegative): PublishRefusal | null {
    const diff = x.IncumbentDiff;
    if (diff === null) return { Ok: false, Reason: 'incumbent-diff-missing', Detail: 'no stored comparison' };
    if (!UUIDsEqual(diff.incumbentModelId, current)) {
      return { Ok: false, Reason: 'incumbent-not-current', Detail: `compared with ${diff.incumbentModelId}` };
    }
    if (!GateRules.BeatsByMargin(diff, margin)) {
      return { Ok: false, Reason: 'does-not-beat-incumbent', Detail: `lower ${diff.lower} <= margin ${margin}` };
    }
    return null;
  }
}

// ========================================================================================== lifecycle and status ==

/**
 * A `MJ: ML Models.Status` transition, audited through Record Changes. The lifecycle gate is the one writer of Status on
 * every path; the PreSave hook enforces it (see {@link StatusWriteRules}). D4-16 (D-029): `validated → published` and
 * the rollback `archived → published` take any `Actor`; a sign-off is required only when the pinned protocol sets
 * `requiresHumanSignOff` or a user overrides leakage flags. The gate re-derives everything with
 * {@link PublishRules.ReverifyPublish} and publishes only what that returns; there is no `Replaces` field.
 */
export type LifecycleTransition =
  | {
      readonly From: 'draft';
      readonly To: 'validated';
      readonly ModelID: string;
      readonly Actor: Actor;
      /** Leakage audit ran and the snapshot hash matches the registry entry. */
      readonly Checks: { readonly LeakageAuditRun: true; readonly SnapshotHashVerified: true };
    }
  | {
      readonly From: 'validated';
      readonly To: 'published';
      readonly ModelID: string;
      readonly Actor: Actor;
      readonly SignOff?: SignOff & { readonly Decision: 'approve' };
      readonly SemanticsCheck: SemanticsCheck & { readonly Result: { readonly Status: 'passed' } };
      /** The single source of the gate, what ships and the model replaced; re-derived by the gate, never trusted. */
      readonly IncumbentCheck: IncumbentCheck;
    }
  | { readonly From: 'published'; readonly To: 'archived'; readonly ModelID: string; readonly Actor: Actor; readonly Reason: string }
  | {
      readonly From: 'archived';
      readonly To: 'published';
      readonly ModelID: string;
      readonly Actor: Actor;
      readonly SignOff?: SignOff & { readonly Decision: 'approve' };
      readonly Reason: 'rollback';
    };

/**
 * The Status guard's decision for one save of `MJ: ML Models`: the incoming Status against the Status persisted in the
 * database (read by the hook itself, never `OldValue`) and the transition the gate authorised, if any.
 */
export type StatusGuardDecision =
  | { readonly Allow: true; readonly Reason: 'create-as-draft' | 'status-unchanged' | 'gate-authorised' }
  | {
      readonly Allow: false;
      readonly Reason:
        | 'create-not-draft'
        | 'stored-row-unreadable'
        | 'deferred-in-transaction-group'
        | 'status-changed-outside-gate'
        | 'gate-transition-mismatch';
    };

/**
 * What the hook read for the persisted Status: `create` when the entity is not saved yet; `unreadable` when it is saved
 * but the hook's own read returned no row or failed (the guard fails closed, N7).
 */
export type PersistedStatus =
  | { readonly Kind: 'create' }
  | { readonly Kind: 'row'; readonly Status: PersistedModelStatus }
  | { readonly Kind: 'unreadable' };

/** The PreSave Status guard's rules over persisted statuses (§6.2a) and the §5.1 lifecycle table. */
export class StatusWriteRules {
  /**
   * The persisted status of each contract lifecycle state. The mapping is one-way: `KeepBaseline` is the `validated`
   * state of a keep-simple-baseline delivery, and `Unevaluated` (a demoted pre-change model) has no contract state
   * (see {@link LifecycleState}).
   */
  public static readonly StatusByState: { readonly [K in LifecycleState]: PersistedModelStatus } = {
    draft: 'Draft',
    validated: 'Validated',
    published: 'Published',
    archived: 'Archived',
  };

  /** The §5.1 lifecycle table: every transition the gate may authorise, by persisted status. */
  private static readonly authorisedTransitions: { readonly [F in PersistedModelStatus]: readonly PersistedModelStatus[] } = {
    Draft: ['Validated', 'KeepBaseline'],
    Validated: ['Published', 'Archived'],
    KeepBaseline: ['Published', 'Archived'],
    Unevaluated: ['Archived'],
    Published: ['Unevaluated', 'Archived'],
    Archived: ['Published'],
  };

  /** True when the §5.1 lifecycle table has a row from `from` to `to`. `Unevaluated` never reaches `Published`. */
  public static IsAuthorisedTransition(from: PersistedModelStatus, to: PersistedModelStatus): boolean {
    return StatusWriteRules.authorisedTransitions[from].includes(to);
  }

  /**
   * The PreSave Status guard decision. A create must be `Draft`; an unreadable stored row is refused (fail closed); a
   * non-gate save inside a TransactionGroup is refused (the deferred write widens the window between the hook's read and
   * the write, N6); an unchanged Status is allowed; a change needs the gate's authorisation of exactly this
   * `From → To`, which must also be a row of the lifecycle table.
   */
  public static DecideStatusWrite(
    incoming: PersistedModelStatus,
    persisted: PersistedStatus,
    authorised: { readonly From: PersistedModelStatus; readonly To: PersistedModelStatus } | null,
    inTransactionGroup: boolean,
  ): StatusGuardDecision {
    if (persisted.Kind === 'create') {
      return incoming === 'Draft' ? { Allow: true, Reason: 'create-as-draft' } : { Allow: false, Reason: 'create-not-draft' };
    }
    if (persisted.Kind === 'unreadable') return { Allow: false, Reason: 'stored-row-unreadable' };
    if (authorised === null && inTransactionGroup) return { Allow: false, Reason: 'deferred-in-transaction-group' };
    if (incoming === persisted.Status) return { Allow: true, Reason: 'status-unchanged' };
    if (authorised === null) return { Allow: false, Reason: 'status-changed-outside-gate' };
    const matches = authorised.From === persisted.Status && authorised.To === incoming;
    return matches && StatusWriteRules.IsAuthorisedTransition(authorised.From, authorised.To)
      ? { Allow: true, Reason: 'gate-authorised' }
      : { Allow: false, Reason: 'gate-transition-mismatch' };
  }
}

/** Why a lifecycle transition was refused; stored as `MJ: ML Model Publish Records.Refusal` JSON. */
export type TransitionRefusal =
  // case-violation-ok-legacy-back-compat: stored publish-record Refusal JSON keys
  | { readonly kind: 'illegal-transition'; readonly from: LifecycleState; readonly to: LifecycleState }
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
  | { readonly kind: 'kept-existing-rule'; readonly rule: string };

/**
 * One row of `MJ: ML Model Publish Records` (D-029, D4-08): an optional human sign-off, an applied publish (automatic or
 * by a person, including rollbacks and pre-change adoptions) or a refusal. `modelId` is null only on a run-level refusal
 * (`purpose: 'evaluate'`, D4-56).
 */
export interface PublishRecord {
  readonly id: string;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly modelId: string | null;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly trainingRunId: string | null;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly kind: 'sign-off' | 'publish' | 'refusal';  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly purpose: 'publish' | 'rollback' | 'evaluate' | 'adopt';  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly approver: { readonly kind: 'automated-gate' } | HumanActor;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly initiator: Actor;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  /** ISO instant. */
  readonly recordedAt: string;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly gate: GateDecision | null;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly evidence: EvidenceSnapshot | null;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly evidenceSha256: string | null;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly signOffId: string | null;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly replacesModelId: string | null;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly refusal: TransitionRefusal | null;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
  readonly transient: boolean;  // case-violation-ok-legacy-back-compat: publish-record column JSON shape
}
