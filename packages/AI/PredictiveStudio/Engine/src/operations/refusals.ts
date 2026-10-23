import type { RemoteOpResult } from '@memberjunction/core';
import type { PredictiveStudioRefusalCode } from '@memberjunction/predictive-studio-core';
import { ReadCapExceededError } from '../feature-assembly/read-cap-error';
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
    if (e instanceof AsOfSettingHasNoEffectError) return 'AS_OF_NO_EFFECT';
    if (e instanceof ModelNotScorableError) return 'MODEL_NOT_SCORABLE';
    if (e instanceof ModelNeedsTrainingError) return 'MODEL_NEEDS_TRAINING';
    if (e instanceof ExperimentSessionsUnavailableError) return 'EXPERIMENT_SESSIONS_UNAVAILABLE';
    return null;
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
