/**
 * The words the lifecycle UI shows (§5.4; D4-49, D4-56): the chip of each persisted `MJ: ML Models.Status` with its
 * stored `StatusReason`, the note for a pre-change model that still serves, the run-level outcomes that ship no model
 * row, every lifecycle-gate refusal and every scoring refusal in plain words. Browser-safe and shared: the model detail (core-entity-forms)
 * and the dashboards' registry and production views read the same text from here, so neither imports the other.
 */
import type { ListsEveryMember } from './json-value';
import type { LeakageFlag } from './trainer-contract';
import type { PersistedLifecycleState, PersistedModelStatus, TransitionRefusal } from './registry-contracts';
import type { ScoringRefusal } from './scoring-contracts';

/** Every persisted model status, in lifecycle order. */
export const PERSISTED_MODEL_STATUSES = ['Draft', 'Validated', 'Published', 'Archived', 'KeepBaseline', 'Unevaluated'] as const satisfies readonly PersistedModelStatus[];
/** Compile-time completeness: a status added to `PersistedModelStatus` without listing it here breaks the build. */
const persistedStatusesComplete: ListsEveryMember<PersistedModelStatus, (typeof PERSISTED_MODEL_STATUSES)[number]> = true;
void persistedStatusesComplete;

/** Every lifecycle-gate refusal kind: each must have words in {@link TransitionRefusalText.For}. */
export const ALL_TRANSITION_REFUSAL_KINDS = [
  'illegal-transition',
  'no-sign-off',
  'gate-no-signal',
  'unacknowledged-leakage-flags',
  'semantics-check-failed',
  'actor-not-permitted',
  'does-not-beat-incumbent',
  'status-written-outside-gate',
  'artifact-unverifiable',
  'publish-in-progress',
  'keep-baseline-not-auto-published',
  'sign-off-wait-closed',
  'kept-existing-rule',
  'calibration-held',
  'not-servable',
  'model-not-found',
  'reason-required',
  'incumbent-not-current',
] as const satisfies readonly TransitionRefusal['kind'][];
/** Compile-time completeness: a refusal kind added to `TransitionRefusal` without listing it here breaks the build. */
const refusalKindsComplete: ListsEveryMember<TransitionRefusal['kind'], (typeof ALL_TRANSITION_REFUSAL_KINDS)[number]> = true;
void refusalKindsComplete;

/** The text of one lifecycle chip: the status label and the stored reason beneath it. */
export interface LifecycleLabel {
  /** What the chip says. */
  readonly Label: string;
  /** The model's stored `StatusReason`, or null when it has none. */
  readonly Detail: string | null;
}

/** The chip text of each persisted status. */
const STATUS_LABELS: { readonly [S in PersistedModelStatus]: string } = {
  Draft: 'Draft',
  Validated: 'Validated',
  Published: 'Published',
  Archived: 'Archived',
  KeepBaseline: 'Ships the simple baseline',
  Unevaluated: 'Unevaluated — trained before the lifecycle gate; retrain to publish',
};

/** The words of each lifecycle state a refusal names. */
const STATE_WORDS: { readonly [S in PersistedLifecycleState]: string } = {
  draft: 'Draft',
  validated: 'Validated',
  published: 'Published',
  archived: 'Archived',
  unevaluated: 'Unevaluated',
  'keep-baseline': 'KeepBaseline',
};

/** What each leakage flag kind means, in words. */
const LEAKAGE_FLAG_WORDS: { readonly [K in LeakageFlag['kind']]: string } = {
  'single-feature-auc': 'a single feature predicts the outcome on its own',
  'time-shifted-label': 'the model still scores well against a time-shifted label',
  'drop-column': 'dropping one column changes the score sharply',
  'high-cardinality-id': 'an identifier-like column is used as a feature',
};

/** The lifecycle chip text and the run-level outcome labels. */
export class LifecycleLabels {
  /**
   * The chip of a model: its status label and its stored reason.
   *
   * @param status the model's persisted `Status`
   * @param reason the model's `StatusReason`; blank reads as none
   */
  public static For(status: PersistedModelStatus, reason: string | null): LifecycleLabel {
    const detail = reason && reason.trim().length > 0 ? reason : null;
    return { Label: STATUS_LABELS[status], Detail: detail };
  }

  /** True when `value` is a persisted model status (an operation output carries the status as a plain string). */
  public static IsPersistedStatus(value: string): value is PersistedModelStatus {
    return (PERSISTED_MODEL_STATUSES as readonly string[]).includes(value);
  }

  /**
   * The note a pre-change model that still serves carries beside its chip (`ServingWhileUnevaluated`), or null for any
   * other model.
   */
  public static ServingNote(status: PersistedModelStatus, servingWhileUnevaluated: boolean): string | null {
    return status === 'Unevaluated' && servingWhileUnevaluated ? 'Still serving — not evaluated under a protocol' : null;
  }

  /**
   * The label of a run whose decision shipped no model row, read from its run-level refusal record (D4-56): "No signal"
   * or "Kept the existing rule"; null for every other refusal (those are model-level and the chip shows the model).
   */
  public static RunOutcome(refusal: TransitionRefusal): string | null {
    switch (refusal.kind) {
      case 'gate-no-signal': return 'No signal';
      case 'kept-existing-rule': return 'Kept the existing rule';
      default: return null;
    }
  }
}

/** Every lifecycle-gate refusal (`TransitionRefusal`) in plain words. */
export class TransitionRefusalText {
  /** The sentence the UI shows for `refusal`, with the kind's own detail. */
  public static For(refusal: TransitionRefusal): string {
    switch (refusal.kind) {
      case 'illegal-transition':
        return `The lifecycle does not allow moving a ${STATE_WORDS[refusal.from]} model to ${STATE_WORDS[refusal.to]}.`;
      case 'no-sign-off':
        return 'The evaluation protocol requires a person to sign off before this model is published, and there is no approving sign-off over its current evidence.';
      case 'gate-no-signal':
        return `The training run found no signal worth shipping: ${refusal.reason}`;
      case 'unacknowledged-leakage-flags':
        return `Possible target leakage was flagged (${refusal.flags.map((f) => LEAKAGE_FLAG_WORDS[f]).join('; ')}). A sign-off that overrides each flag with a reason is needed before publishing.`;
      case 'semantics-check-failed':
        return `The model's output does not match how its surfaces read it: ${refusal.mismatches.join('; ')}.`;
      case 'actor-not-permitted':
        return TransitionRefusalText.actorNotPermitted(refusal.actor);
      case 'does-not-beat-incumbent':
        return `The model does not beat the model published now: the paired difference is ${TransitionRefusalText.num(refusal.comparison.value)} with a 95% interval of [${TransitionRefusalText.num(refusal.comparison.ci[0])}, ${TransitionRefusalText.num(refusal.comparison.ci[1])}].`;
      case 'status-written-outside-gate':
        return 'The status was changed outside the lifecycle gate, so the change was refused.';
      case 'artifact-unverifiable':
        return `The model file could not be verified (${refusal.detail}). A model is never served from a file that does not verify, so the change was refused, and a model demoted for it stays out of service until its file is restored and verifies against its registered hash.`;
      case 'publish-in-progress':
        return 'Another publish of this pipeline is in progress. This is temporary; try again in a moment.';
      case 'keep-baseline-not-auto-published':
        return 'The run kept the simple baseline. The protocol does not publish a baseline automatically, so a person has to publish it.';
      case 'sign-off-wait-closed':
        return refusal.closedBy === 'expired'
          ? 'The sign-off wait closed: no sign-off arrived before the protocol\'s deadline.'
          : 'The sign-off wait closed: a newer training run of the pipeline was evaluated.';
      case 'kept-existing-rule':
        return `The run kept the existing rule (${refusal.rule}); it produced no model.`;
      case 'calibration-held':
        return `The model's probabilities are poorly calibrated (slope ${refusal.slope === null ? 'not measured' : TransitionRefusalText.num(refusal.slope)}), so it was held back.`;
      case 'not-servable':
        return `The model cannot be served: ${refusal.reason}`;
      case 'model-not-found':
        return `No model with ID ${refusal.modelId} was found.`;
      case 'reason-required':
        return 'A reason is required to archive or roll back a model.';
      case 'incumbent-not-current':
        return `The run was compared with model ${refusal.comparedWith}, but model ${refusal.current} is published now. A new training run compares against it.`;
    }
  }

  /** The words of an actor-not-permitted refusal for each kind of actor. */
  private static actorNotPermitted(actor: Extract<TransitionRefusal, { readonly kind: 'actor-not-permitted' }>['actor']): string {
    switch (actor) {
      case 'human': return 'Your account cannot make this change: it needs update permission on ML Models.';
      case 'agent': return 'An agent is not permitted to make this change.';
      case 'scheduled-job': return 'This scheduled job is not permitted to make this change.';
      case 'system': return 'This system process is not permitted to make this change.';
    }
  }

  /** A comparison number to three decimals. */
  private static num(x: number): string {
    return x.toFixed(3);
  }
}

/** Every scoring refusal (`MJ: ML Scoring Runs.Refusal`) in plain words, for the scoring runs list. */
export class ScoringRefusalText {
  /** The sentence the UI shows for `refusal`, with the columns, counts or IDs it names. */
  public static For(refusal: ScoringRefusal): string {
    switch (refusal.kind) {
      case 'model-not-published': return `The model's status is ${refusal.status}; only a Published model scores.`;
      case 'model-flagged': return refusal.dominance
        ? `The model is flagged: feature ${refusal.dominance.topFeature} carries ${refusal.dominance.topShare} of its importance, over the threshold ${refusal.dominance.threshold}.`
        : `The model is flagged for possible leakage (${refusal.flags.map((f) => LEAKAGE_FLAG_WORDS[f]).join('; ') || 'no flag kind named'}).`;
      case 'artifact-missing': return `The model's artifact file ${refusal.fileId} is missing.`;
      case 'artifact-hash-mismatch': return `The model's artifact bytes hash to ${refusal.actual}, not the registered ${refusal.expected}.`;
      case 'artifact-unverified': return 'The model has no registered artifact hash to verify its artifact against.';
      case 'feature-schema-mismatch': return `The assembled feature columns do not match the model's schema (missing: ${ScoringRefusalText.list(refusal.missingColumns)}; extra: ${ScoringRefusalText.list(refusal.extraColumns)}; retyped: ${ScoringRefusalText.list(refusal.typeMismatches)}).`;
      case 'scope-entity-mismatch': return `The scope is over ${refusal.scopeEntity}, but the model scores ${refusal.modelEntity}.`;
      case 'assembly-refused': return 'Feature assembly refused the scope.';
      case 'nan-or-empty-feature-column': return `Feature column(s) ${refusal.columns.join(', ')} hold no value on any scored record.`;
      case 'no-published-model': return "The binding's pipeline has no Published model.";
      case 'binding-withdrawn': return 'The scoring binding was withdrawn.';
      case 'binding-not-authorized': return "The caller does not hold the scoring binding's view authorization.";
      case 'as-of-unsupported': return `The model was trained without a Prediction Unit and scores only the run date, not ${refusal.asOf}.`;
      case 'leakage-unknown': return 'The model has no stored feature importance to test for leakage.';
      case 'feature-values-not-writable': return 'The caller may not create and update Feature Values, so the run would write nothing it scores.';
    }
  }

  /** A column list, or "none". */
  private static list(columns: readonly string[]): string {
    return columns.length > 0 ? columns.join(', ') : 'none';
  }
}
