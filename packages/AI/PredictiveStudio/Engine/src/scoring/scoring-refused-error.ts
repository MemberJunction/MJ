/**
 * @module scoring/scoring-refused-error
 *
 * The error a scoring caller throws for a scoring call that did not complete: refused before any record was written,
 * or failed at a batch. It carries the {@link ScoringResult} itself, so a refusal is never flattened: the operation maps
 * it to its code (`PredictiveStudioRefusals.CodeOf`), the Action and the Record Process keep the result's fields, and
 * the message states the refusal in plain words with its columns or counts and the scoring run's ID. The structured
 * refusal is also stored on the `MJ: ML Scoring Runs` row the ID names.
 */
import { FeatureValuePins, type ScoringRefusal, type ScoringResult } from '@memberjunction/predictive-studio-core';

/** A scoring result that did not complete. */
export type ScoringNotCompleted = Extract<ScoringResult, { readonly Status: 'refused' | 'failed' }>;

/** A scoring call that was refused or failed; {@link Result} is the call's result (its `ScoringRunID` names the run). */
export class ScoringRefusedError extends Error {
  /** @param Result the refused or failed scoring result */
  constructor(public readonly Result: ScoringNotCompleted) {
    super(ScoringRefusedError.Describe(Result));
    this.name = 'ScoringRefusedError';
  }

  /** The result in plain words, naming the scoring run. Pure. */
  public static Describe(result: ScoringNotCompleted): string {
    if (result.Status === 'failed') {
      const first = result.FirstErrors[0];
      const firstError = first ? ` First error${first.recordId ? ` (record ${first.recordId})` : ''}: ${first.message}` : '';
      return `Scoring failed: ${result.Failed} of ${result.Total} records failed and the run stopped at that batch (scoring run ${result.ScoringRunID}).${firstError}`;
    }
    return `Scoring refused: ${ScoringRefusedError.Reason(result.Reason)} (scoring run ${result.ScoringRunID}; refusal ${JSON.stringify(result.Reason)}).`;
  }

  /** One refusal in plain words, with the columns, counts or IDs it names. Pure; every kind has a case. */
  public static Reason(reason: ScoringRefusal): string {
    switch (reason.kind) {
      case 'model-not-published': return `the model's status is ${reason.status}, and only a Published model scores`;
      case 'model-flagged': return reason.dominance
        ? `the model is flagged: feature ${reason.dominance.topFeature} carries ${reason.dominance.topShare} of its importance, over the threshold ${reason.dominance.threshold}`
        : `the model is flagged for leakage (${reason.flags.join(', ') || 'no flag kind named'})`;
      case 'artifact-missing': return `the model's artifact file ${reason.fileId} is missing`;
      case 'artifact-hash-mismatch': return `the model's artifact bytes hash to ${reason.actual}, not the registered ${reason.expected}`;
      case 'artifact-unverified': return `the model ${reason.modelId} has no registered artifact hash to verify its artifact against`;
      case 'feature-schema-mismatch': return `the assembled feature columns do not match the model's schema (missing: ${ScoringRefusedError.list(reason.missingColumns)}; extra: ${ScoringRefusedError.list(reason.extraColumns)}; retyped: ${ScoringRefusedError.list(reason.typeMismatches)})`;
      case 'scope-entity-mismatch': return `the scope is over ${reason.scopeEntity}, but the model scores ${reason.modelEntity}`;
      case 'assembly-refused': return `feature assembly refused the scope (${JSON.stringify(reason.refusal)})`;
      case 'nan-or-empty-feature-column': return `feature column(s) ${reason.columns.join(', ')} hold no value on any scored record`;
      case 'no-published-model': return `the binding's pipeline ${reason.pipelineId} has no Published model`;
      case 'binding-withdrawn': return `the scoring binding ${reason.bindingId} was withdrawn`;
      case 'binding-not-authorized': return `the caller does not hold the view authorization of scoring binding ${reason.bindingId}`;
      case 'as-of-unsupported': return `the model ${reason.modelId} was trained without a Prediction Unit and scores only the run date, not ${reason.asOf}`;
      case 'leakage-unknown': return `the model ${reason.modelId} has no stored feature importance to test for leakage`;
      case 'feature-values-not-writable': return `the caller ${reason.userId} may not create and update MJ: Feature Values, so the run would write nothing it scores`;
      case 'feature-version-mismatch': return `the model reads ${reason.featureName} at ${FeatureValuePins.VersionOf(reason.pinned)}, but ${FeatureValuePins.VersionOf(reason.active)} is in use now; retrain the model`;
      default: return ScoringRefusedError.unknown(reason);
    }
  }

  /** A column list, or "none". */
  private static list(columns: readonly string[]): string {
    return columns.length > 0 ? columns.join(', ') : 'none';
  }

  /** Unreachable while every kind has a case: a new kind fails to compile here. */
  private static unknown(reason: never): string {
    return `refusal ${JSON.stringify(reason)}`;
  }
}
