import { RemoteOperationError, type RemoteOpResult } from '@memberjunction/core';
import { InvalidMajorityBaselineRuleError, PredictiveStudioRefusalCodes, type PredictiveStudioRefusalCode, type ScoringRefusal } from '@memberjunction/predictive-studio-core';
import { ReadCapExceededError } from '../feature-assembly/read-cap-error';
import { TrainingRefusedError } from '../training/training-refusal';
import { AsOfSettingHasNoEffectError } from '../training/as-of-refusal';
import { ArtifactUnavailableError, ModelNotScorableError, ModelNeedsTrainingError, ModelNotServableError } from '../scoring/model-readiness';
import { ExperimentSessionsUnavailableError } from '../actions/run-experiment.deps';
import { ScoringRefusedError } from '../scoring/scoring-refused-error';

/**
 * Turns Predictive Studio refusal errors into typed `ResultCode`s on the operation result.
 *
 * Why this repeats `BaseRemotableOperation.ExecuteServer`'s three outcomes: the base maps every throw to
 * `EXECUTION_ERROR`, which loses the refusal type before it reaches the caller, and changing that base belongs to
 * MJCore, outside Predictive Studio. Keep the FORBIDDEN / SUCCESS / EXECUTION_ERROR shapes identical to the base.
 */
export class PredictiveStudioRefusals {
  /** The refusal code for a Predictive Studio refusal error; null for any other error. */
  public static CodeOf(e: Error): PredictiveStudioRefusalCode | null {
    // A typed refusal thrown through Refusal()/InvalidInput() keeps its code when ExecuteServer below catches it.
    if (e instanceof RemoteOperationError && PredictiveStudioRefusalCodes.IsRefusal(e.ResultCode)) return e.ResultCode;
    if (e instanceof ScoringRefusedError) return e.Result.Status === 'failed' ? 'SCORING_RUN_FAILED' : PredictiveStudioRefusals.ScoringRefusalCode(e.Result.Reason);
    if (e instanceof ReadCapExceededError) return 'READ_CAP_EXCEEDED';
    if (e instanceof TrainingRefusedError) return PredictiveStudioRefusals.trainingRefusalCode(e);
    // A modeling plan that asks for point-in-time assembly is refused before any pipeline exists (the pipeline builder).
    if (e instanceof AsOfSettingHasNoEffectError) return 'AS_OF_NO_EFFECT';
    if (e instanceof ModelNotScorableError) return 'MODEL_NOT_SCORABLE';
    if (e instanceof ModelNeedsTrainingError) return 'MODEL_NEEDS_TRAINING';
    if (e instanceof ModelNotServableError) return 'MODEL_NOT_SERVABLE';
    if (e instanceof ArtifactUnavailableError) return PredictiveStudioRefusals.artifactRefusalCode(e);
    if (e instanceof ExperimentSessionsUnavailableError) return 'EXPERIMENT_SESSIONS_UNAVAILABLE';
    if (e instanceof InvalidMajorityBaselineRuleError) return 'INVALID_EVALUATION_SETTING';
    return null;
  }

  /** The code of a scoring refusal, read off its kind; every kind has one (a new kind fails to compile). */
  public static ScoringRefusalCode(reason: ScoringRefusal): PredictiveStudioRefusalCode {
    switch (reason.kind) {
      case 'model-not-published': return 'MODEL_NOT_PUBLISHED';
      case 'model-flagged': return 'MODEL_FLAGGED';
      case 'artifact-missing': return 'ARTIFACT_MISSING';
      case 'artifact-hash-mismatch': return 'ARTIFACT_HASH_MISMATCH';
      case 'artifact-unverified': return 'ARTIFACT_UNVERIFIED';
      case 'feature-schema-mismatch': return 'FEATURE_SCHEMA_MISMATCH';
      case 'scope-entity-mismatch': return 'SCOPE_ENTITY_MISMATCH';
      case 'assembly-refused': return 'ASSEMBLY_REFUSED';
      case 'nan-or-empty-feature-column': return 'EMPTY_FEATURE_COLUMN';
      case 'no-published-model': return 'NO_PUBLISHED_MODEL';
      case 'binding-withdrawn': return 'BINDING_WITHDRAWN';
      case 'binding-not-authorized': return 'BINDING_NOT_AUTHORIZED';
      case 'as-of-unsupported': return 'AS_OF_UNSUPPORTED';
      case 'leakage-unknown': return 'LEAKAGE_UNKNOWN';
      case 'feature-values-not-writable': return 'FEATURE_VALUES_NOT_WRITABLE';
      case 'feature-version-mismatch': return 'FEATURE_VERSION_MISMATCH';
      default: return PredictiveStudioRefusals.unknownScoringRefusal(reason);
    }
  }

  /** Unreachable while every scoring refusal kind has a code. */
  private static unknownScoringRefusal(reason: never): PredictiveStudioRefusalCode {
    throw new Error(`PredictiveStudioRefusals: scoring refusal ${JSON.stringify(reason)} has no code`);
  }

  /** The code of an artifact that is not served, read off its refusal kind. */
  private static artifactRefusalCode(e: ArtifactUnavailableError): PredictiveStudioRefusalCode {
    switch (e.Refusal.kind) {
      case 'artifact-missing': return 'ARTIFACT_MISSING';
      case 'artifact-hash-mismatch': return 'ARTIFACT_HASH_MISMATCH';
      case 'artifact-unverified': return 'ARTIFACT_UNVERIFIED';
    }
  }

  /**
   * The code of a refused training run, read off its refusal kind. Kinds without a code return null, so the operation
   * reports `EXECUTION_ERROR`; the detailed kind and stage stay in the run's `ValidationResults.refusal`.
   */
  private static trainingRefusalCode(e: TrainingRefusedError): PredictiveStudioRefusalCode | null {
    const reason = e.Refusal.reason;
    switch (reason.kind) {
      case 'unit-required': return 'UNIT_REQUIRED';
      // The asOf input still has no effect; it is now refused by name instead of being ignored.
      case 'input-not-accepted': return reason.input === 'asOf' ? 'AS_OF_NO_EFFECT' : null;
      case 'decision-date-before-change-history':
      case 'decision-date-before-feature-history':
      case 'select-changes-after-decision-date': return 'AS_OF_SOURCE_UNDATED';
      case 'protocol-required': return 'PROTOCOL_REQUIRED';
      case 'time-index-needs-time-holdout': return 'TIME_HOLDOUT_REQUIRED';
      // Only a stop at the compute budget has a code; every other trainer stage is reported as a failure.
      case 'trainer-failed': return reason.stage === 'budget-exceeded' ? 'BUDGET_EXCEEDED' : null;
      default: return null;
    }
  }

  /**
   * The typed refusal a remote operation throws from `InternalExecute`: a `RemoteOperationError` whose `ResultCode` is a
   * code from Core's catalog (`PredictiveStudioRefusalCodes`), which the base `ExecuteServer` returns as
   * `Success: false` with that code and `message` as `ErrorMessage`.
   */
  public static Refusal(code: PredictiveStudioRefusalCode, message: string): RemoteOperationError {
    return new RemoteOperationError(code, message);
  }

  /** The `INVALID_INPUT` refusal of an input that breaks the operation's wire contract, naming the field and the problem. */
  public static InvalidInput(operationKey: string, field: string, problem: string): RemoteOperationError {
    return PredictiveStudioRefusals.Refusal('INVALID_INPUT', `${operationKey} input: ${field} ${problem}`);
  }

  /** The operation's server-side run with refusal errors returned as their codes. */
  public static async ExecuteServer<TOut>(
    authorize: () => Promise<boolean>,
    execute: () => Promise<TOut>,
    operationKey: string,
  ): Promise<RemoteOpResult<TOut>> {
    try {
      if (!(await authorize())) {
        return { Success: false, ResultCode: 'FORBIDDEN', ErrorMessage: `Not authorized to run operation '${operationKey}'` };
      }
      return { Success: true, ResultCode: 'SUCCESS', Output: await execute() };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return { Success: false, ResultCode: PredictiveStudioRefusals.CodeOf(error) || 'EXECUTION_ERROR', ErrorMessage: error.message };
    }
  }
}
