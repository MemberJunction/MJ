/**
 * @module refusal-codes
 *
 * The machine-readable reasons Predictive Studio refuses a training or scoring request. They travel as the remote
 * operation's `ResultCode`, so callers (the UI, the gate checks) branch on the code and never on the message text.
 */

/** Every refusal code; the {@link PredictiveStudioRefusalCode} union is derived from this list. */
const REFUSAL_CODES = [
  'READ_CAP_EXCEEDED',
  'AS_OF_NO_EFFECT',
  'MODEL_NOT_SCORABLE',
  'MODEL_NEEDS_TRAINING',
  'EXPERIMENT_SESSIONS_UNAVAILABLE',
  /** A pipeline's evaluation setting is not a known value (e.g. `ValidationStrategy.MajorityBaselineRule`). */
  'INVALID_EVALUATION_SETTING',
  /** A pipeline asks for point-in-time assembly but points at no Prediction Unit, which is where that assembly lives. */
  'UNIT_REQUIRED',
  /** A feature's source cannot be read as of a decision date: its change history does not cover the date, or it changed after it. */
  'AS_OF_SOURCE_UNDATED',
  /** A pipeline names an Evaluation Protocol that cannot be found; training is judged only under its protocol. */
  'PROTOCOL_REQUIRED',
  /** The trainer stopped because the run reached its protocol's compute budget. */
  'BUDGET_EXCEEDED',
] as const;

/** Why a Train or Score request was refused. */
export type PredictiveStudioRefusalCode = (typeof REFUSAL_CODES)[number];

/** The refusal codes and the check that a result code is one of them. */
export class PredictiveStudioRefusalCodes {
  public static readonly All: ReadonlyArray<PredictiveStudioRefusalCode> = REFUSAL_CODES;

  /** True when `code` is a Predictive Studio refusal (a generic code such as `EXECUTION_ERROR` is not). */
  public static IsRefusal(code: string | undefined): code is PredictiveStudioRefusalCode {
    return code !== undefined && (PredictiveStudioRefusalCodes.All as ReadonlyArray<string>).includes(code);
  }
}
