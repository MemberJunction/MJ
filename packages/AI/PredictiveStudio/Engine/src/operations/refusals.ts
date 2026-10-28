import type { RemoteOpResult } from '@memberjunction/core';
import { InvalidMajorityBaselineRuleError, type PredictiveStudioRefusalCode } from '@memberjunction/predictive-studio-core';
import { ReadCapExceededError } from '../feature-assembly/read-cap-error';
import { TrainingRefusedError } from '../training/training-refusal';
import { AsOfSettingHasNoEffectError } from '../training/as-of-refusal';
import { ModelNotScorableError, ModelNeedsTrainingError } from '../scoring/model-readiness';
import { ExperimentSessionsUnavailableError } from '../actions/run-experiment.deps';

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
    if (e instanceof ReadCapExceededError) return 'READ_CAP_EXCEEDED';
    if (e instanceof TrainingRefusedError) return PredictiveStudioRefusals.trainingRefusalCode(e);
    // A modeling plan that asks for point-in-time assembly is refused before any pipeline exists (the pipeline builder).
    if (e instanceof AsOfSettingHasNoEffectError) return 'AS_OF_NO_EFFECT';
    if (e instanceof ModelNotScorableError) return 'MODEL_NOT_SCORABLE';
    if (e instanceof ModelNeedsTrainingError) return 'MODEL_NEEDS_TRAINING';
    if (e instanceof ExperimentSessionsUnavailableError) return 'EXPERIMENT_SESSIONS_UNAVAILABLE';
    if (e instanceof InvalidMajorityBaselineRuleError) return 'INVALID_EVALUATION_SETTING';
    return null;
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
      case 'select-changes-after-decision-date': return 'AS_OF_SOURCE_UNDATED';
      default: return null;
    }
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
