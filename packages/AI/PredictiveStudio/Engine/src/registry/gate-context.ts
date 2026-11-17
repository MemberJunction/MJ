/**
 * @module registry/gate-context
 *
 * The lifecycle gate's request, outcome and context shapes (§5.2). Casing follows D-067: the request mirrors the
 * PromoteModel remote operation's camelCase wire input, the outcomes and in-process results are PascalCase, and the
 * refusal stored on a publish record is Core's camelCase `TransitionRefusal`. Unions a generated entity field carries
 * are derived from that field (`MJMLModelEntity['Status']`, `MJMLModelPublishRecordEntity['Purpose']`), so a CHECK change
 * reaches them at CodeGen.
 */
import type { MJMLModelEntity, MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import type {
  Actor,
  ArtifactLoad,
  EvidenceSnapshot,
  PersistedModelStatus,
  PublishReverification,
  SemanticsCheck,
  SignOff,
  TransitionRefusal,
} from '@memberjunction/predictive-studio-core';

import type { ModelScoringActionGenerator } from '../actions/model-scoring-action-generator';
import type { RegistryContext } from './registry-context';

/**
 * The per-model scoring Action seam the gate keeps in step with a model's status after a transition commits: generated
 * on a move into `Published`, disabled on a move out of it. Production: {@link ModelScoringActionGenerator}.
 */
export type ScoringActionSync = Pick<ModelScoringActionGenerator, 'GenerateForModel' | 'DisableForModel'>;

/** Builds the evidence a publish (or a sign-off) freezes, from stored rows only (production: `StoredEvidenceBuilder`). */
export interface IGateEvidenceBuilder {
  /** The evidence for `modelId` as the stored rows hold it now. */
  Build(modelId: string, ctx: RegistryContext): Promise<EvidenceSnapshot>;
}

/** The pre-publication semantics check of the model's output bindings (production: `StoredSemanticsCheck`). */
export interface IGateSemanticsCheck {
  /** The check of `model`'s output bindings against its declared semantics. */
  Check(model: MJMLModelEntity, ctx: RegistryContext): Promise<SemanticsCheck>;
}

/** The members of a publish request the sign-off lookup reads. */
export type SignOffRequest = Pick<PublishRequest, 'modelId' | 'purpose' | 'signOffId'>;

/** Finds the approving human sign-off a publish may consume (production: `StoredSignOffLookup`, over the sign-off records). */
export interface IGateSignOffLookup {
  /**
   * The approving sign-off the request names (`signOffId`) for its model and purpose, made over the evidence whose
   * SHA-256 is `evidenceSha256` (the evidence the publish rebuilt from stored rows); null when there is none.
   */
  FindApproving(request: SignOffRequest, evidenceSha256: string, ctx: RegistryContext): Promise<SignOff | null>;
}

/** What every gate call runs under: the request's user and provider, plus the evidence, semantics and sign-off seams. */
export interface GateContext extends RegistryContext {
  readonly EvidenceBuilder: IGateEvidenceBuilder;
  readonly SemanticsCheck: IGateSemanticsCheck;
  readonly SignOffLookup: IGateSignOffLookup;
}

/** What `Evaluate` acts on: a model row, or a training run (whose model, when it has one, is its `ResultingModelID`). */
export type EvaluateSubject = (
  // case-violation-ok-legacy-back-compat: §5.2's verbatim subject shape, camelCase like the PromoteModel wire input it is built from
  | { readonly modelId: string }
  // case-violation-ok-legacy-back-compat: §5.2's verbatim subject shape, camelCase like the PromoteModel wire input it is built from
  | { readonly trainingRunId: string }
) & EvaluateAttempt;

/** Whether an Evaluate runs as the first step of a publish attempt (D4-143). */
export interface EvaluateAttempt {
  /**
   * The purpose of the publish attempt this Evaluate is the first step of. Set only by
   * `AutomatedPublisher.EvaluateAndPublish` (`'publish'`). When it is set, a model-level refusal (`not-servable`,
   * `gate-no-signal` of a run with a model row, `calibration-held`, `actor-not-permitted`, the transient
   * `publish-in-progress`) is recorded as that attempt's `refusal` record, as a withheld publish is. A bare Evaluate (the
   * UI, the operation, a build with auto-publish off) leaves it unset, and its model-level refusal is not recorded.
   */
  readonly AttemptPurpose?: Extract<PublishRequest['purpose'], 'publish'>;
}

/** A model evaluated into its status, a run whose decision shipped no model row (recorded at run level), or a refusal. */
export type EvaluateOutcome =
  | { readonly Kind: 'evaluated'; readonly ModelID: string; readonly From: 'Draft'; readonly To: Extract<MJMLModelEntity['Status'], 'Validated' | 'KeepBaseline'> }
  | {
      readonly Kind: 'run-recorded';
      readonly TrainingRunID: string;
      readonly Refusal: Extract<TransitionRefusal, { readonly kind: 'gate-no-signal' | 'kept-existing-rule' }>;
      readonly RefusalRecordID: string;
    }
  | { readonly Kind: 'refused'; readonly Refusal: TransitionRefusal };

/** Mirrors the PromoteModel remote operation's input (camelCase wire names, like the shipped `PredictiveStudioPromoteModelInput`). */
export interface PublishRequest {
  // case-violation-ok-legacy-back-compat: mirrors the PromoteModel remote operation's camelCase wire input (§5.2, D-067)
  readonly modelId: string;
  /** `publish` (Validated / KeepBaseline → Published) or `rollback` (Archived → Published). */
  // case-violation-ok-legacy-back-compat: mirrors the PromoteModel remote operation's camelCase wire input (§5.2, D-067)
  readonly purpose: Exclude<MJMLModelPublishRecordEntity['Purpose'], 'evaluate' | 'adopt'>;
  /** The person, agent run, auto-train Process Run or scheduled job run that started the attempt. */
  // case-violation-ok-legacy-back-compat: mirrors the PromoteModel remote operation's camelCase wire input (§5.2, D-067)
  readonly initiator: Actor;
  /** The optional sign-off, only when the protocol sets `requiresHumanSignOff`. */
  // case-violation-ok-legacy-back-compat: mirrors the PromoteModel remote operation's camelCase wire input (§5.2, D-067)
  readonly signOffId: string | null;
  /** Required for a rollback. */
  // case-violation-ok-legacy-back-compat: mirrors the PromoteModel remote operation's camelCase wire input (§5.2, D-067)
  readonly reason: string | null;
}

/** The purpose of an applied `publish` record a retry finds: a publish, a rollback, or an adoption (M7.2). */
export type AppliedPublishPurpose = Extract<MJMLModelPublishRecordEntity['Purpose'], 'publish' | 'rollback' | 'adopt'>;

/**
 * A publish applied, an idempotent retry of an applied run, or a withheld attempt with its recorded refusal. `Purpose`
 * is the request's (`published`, `withheld`) or the found record's (`already-published`); R1's restore of a model whose
 * status was changed outside the gate is a `publish`-purpose publish.
 */
export type PublishOutcome =
  | {
      readonly Kind: 'published';
      readonly Purpose: PublishRequest['purpose'];
      readonly ModelID: string;
      readonly PublishRecordID: string;
      readonly Replaces: string | null;
      readonly Approver: MJMLModelPublishRecordEntity['ApproverKind'];
    }
  | { readonly Kind: 'already-published'; readonly Purpose: AppliedPublishPurpose; readonly ModelID: string; readonly PublishRecordID: string }
  | {
      readonly Kind: 'withheld';
      readonly Purpose: PublishRequest['purpose'];
      readonly ModelID: string;
      readonly Status: MJMLModelEntity['Status'];
      readonly Refusal: TransitionRefusal;
      readonly Transient: boolean;
      readonly RefusalRecordID: string;
    };

/**
 * Who a refusal's audit (the `refusal` record and the model's `StatusReason`) is written as: the caller (`ctx.ContextUser`,
 * who holds the permissions the writes need), or the gate's own write identity, the MJ system user on the same provider
 * and transaction, for a caller the gate refused for lacking them (`actor-not-permitted`, D4-134), so the refusal is
 * still recorded (§5.7 R4).
 */
export type RefusalWriteIdentity = 'caller' | 'gate';

/** The result of an archive (and of any status change outside `Publish`). */
export type GateApplyResult =
  | { readonly Ok: true; readonly ModelID: string; readonly From: MJMLModelEntity['Status']; readonly To: MJMLModelEntity['Status']; readonly Archived: string | null }
  | { readonly Ok: false; readonly Refusal: TransitionRefusal | { readonly Kind: 'artifact'; readonly Load: Exclude<ArtifactLoad, { Status: 'verified' }> } };

/** Both publish locks held, with the model's persisted status read by the model lock; or the refusal of the attempt. */
export type LockResult =
  | { readonly Locked: true; readonly PersistedStatus: PersistedModelStatus }
  | { readonly Locked: false; readonly Refusal: Extract<TransitionRefusal, { readonly kind: 'publish-in-progress' | 'model-not-found' }> };

/** The artifact state a definite (not thrown) unverified load records on the model (`ArtifactStatus`, `ArtifactCheckedAt`). */
export interface ArtifactCheck {
  readonly Status: MJMLModelEntity['ArtifactStatus'];
  readonly CheckedAt: Date;
}

/** Who approved an applied publish: the gate itself, or the named user (an interactive publisher or a sign-off's approver). */
export type PublishApprover =
  | { readonly Kind: 'automated-gate' }
  | { readonly Kind: 'user'; readonly UserID: string };

/** Everything a passing publish writes, or why it is withheld. */
export type PublishCheck =
  | {
      readonly Ok: true;
      /** The publish as `PublishRules.ReverifyPublish` re-derived it from the stored rows. */
      readonly Reverified: Extract<PublishReverification, { readonly Ok: true }>;
      /** The model archived in the publish transaction (the current Published model), or null. */
      readonly Replaces: string | null;
      readonly Evidence: EvidenceSnapshot;
      readonly EvidenceSha256: string;
      /** The approving sign-off consumed, when the protocol required one. */
      readonly SignOff: SignOff | null;
      readonly Approver: PublishApprover;
    }
  | {
      readonly Ok: false;
      readonly Refusal: TransitionRefusal;
      readonly Transient: boolean;
      /** Set when the artifact load returned a definite non-verified state, which the refusal path records on the model. */
      readonly Artifact: ArtifactCheck | null;
    };
