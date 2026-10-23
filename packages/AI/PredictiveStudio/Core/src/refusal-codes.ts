/**
 * @module refusal-codes
 *
 * The machine-readable reasons Predictive Studio refuses a training or scoring request. They travel as the remote
 * operation's `ResultCode`, so callers (the UI, the gate checks) branch on the code and never on the message text.
 */

/** Why a Train or Score request was refused. */
export type PredictiveStudioRefusalCode =
  | 'READ_CAP_EXCEEDED'
  | 'AS_OF_NO_EFFECT'
  | 'MODEL_NOT_SCORABLE'
  | 'MODEL_NEEDS_TRAINING'
  | 'EXPERIMENT_SESSIONS_UNAVAILABLE';

/** The refusal codes and the check that a result code is one of them. */
export class PredictiveStudioRefusalCodes {
  public static readonly All: ReadonlyArray<PredictiveStudioRefusalCode> = [
    'READ_CAP_EXCEEDED', 'AS_OF_NO_EFFECT', 'MODEL_NOT_SCORABLE', 'MODEL_NEEDS_TRAINING', 'EXPERIMENT_SESSIONS_UNAVAILABLE',
  ];

  /** True when `code` is a Predictive Studio refusal (a generic code such as `EXECUTION_ERROR` is not). */
  public static IsRefusal(code: string | undefined): code is PredictiveStudioRefusalCode {
    return code !== undefined && (PredictiveStudioRefusalCodes.All as ReadonlyArray<string>).includes(code);
  }
}
