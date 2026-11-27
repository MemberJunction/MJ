/**
 * @module refusal-codes
 *
 * The machine-readable reasons Predictive Studio refuses a training, scoring or sign-off request. They travel as the remote
 * operation's `ResultCode`, so callers (the UI, the gate checks) branch on the code and never on the message text.
 */

/** Every refusal code; the {@link PredictiveStudioRefusalCode} union is derived from this list. */
const REFUSAL_CODES = [
  'READ_CAP_EXCEEDED',
  'AS_OF_NO_EFFECT',
  'MODEL_NOT_SCORABLE',
  'MODEL_NEEDS_TRAINING',
  /** The model's artifact is a forecast's series forecaster, which the sidecar's `/predict` does not serve. */
  'MODEL_NOT_SERVABLE',
  'EXPERIMENT_SESSIONS_UNAVAILABLE',
  /** A pipeline's evaluation setting is not a known value (e.g. `ValidationStrategy.MajorityBaselineRule`). */
  'INVALID_EVALUATION_SETTING',
  /** A pipeline asks for point-in-time assembly but points at no Prediction Unit, which is where that assembly lives. */
  'UNIT_REQUIRED',
  /** A feature's source cannot be read as of a decision date: its change history does not cover the date, it changed after it, or a Feature Value has no value in effect then. */
  'AS_OF_SOURCE_UNDATED',
  /** A pipeline names an Evaluation Protocol that cannot be found; training is judged only under its protocol. */
  'PROTOCOL_REQUIRED',
  /** The trainer stopped because the run reached its protocol's compute budget. */
  'BUDGET_EXCEEDED',
  /** A pipeline that declares a time index is bound to a protocol whose holdout does not respect time (seeded-random). */
  'TIME_HOLDOUT_REQUIRED',
  /** A model's registered artifact file has no row or no stored object, so it cannot score (`artifact-missing`). */
  'ARTIFACT_MISSING',
  /** A model's stored artifact bytes do not hash to its registered `ArtifactSha256` (`artifact-hash-mismatch`). */
  'ARTIFACT_HASH_MISMATCH',
  /** A model row has no registered `ArtifactSha256`, so its artifact cannot be verified and is not served (`artifact-unverified`). */
  'ARTIFACT_UNVERIFIED',
  /** A sign-off was attempted by an API-key caller or the system user: only a person can sign off (D4-04, `not-human`). */
  'NOT_HUMAN',
  /** A sign-off overrides leakage flags with a blank reason (`overrides-without-reason`). */
  'OVERRIDES_WITHOUT_REASON',
  /** A sign-off names an Archived model (D4-19, `model-archived`). */
  'MODEL_ARCHIVED',
  /** A remote operation's input breaks its wire contract (a missing field, or a value outside its declared set); the message names the field. */
  'INVALID_INPUT',
  /** A scoring call names a model whose status may not score (`model-not-published`). */
  'MODEL_NOT_PUBLISHED',
  /** A scoring call names a model with leakage flags, or one the dominance re-run flagged (`model-flagged`). */
  'MODEL_FLAGGED',
  /** The assembled feature columns do not match the model's stored schema; the message names the columns (`feature-schema-mismatch`). */
  'FEATURE_SCHEMA_MISMATCH',
  /** The scope's entity is neither the model's nor the binding's entity, and no entity mapping is given (`scope-entity-mismatch`). */
  'SCOPE_ENTITY_MISMATCH',
  /** Feature assembly refused the scope (a capped read, a row the change history does not cover; `assembly-refused`). */
  'ASSEMBLY_REFUSED',
  /** A feature column holds no value on any scored row (`nan-or-empty-feature-column`). */
  'EMPTY_FEATURE_COLUMN',
  /** The binding's pipeline has no Published model to score with (`no-published-model`). */
  'NO_PUBLISHED_MODEL',
  /** The scoring binding was withdrawn (`binding-withdrawn`). */
  'BINDING_WITHDRAWN',
  /** The caller does not hold the binding's view authorization (`binding-not-authorized`). */
  'BINDING_NOT_AUTHORIZED',
  /** A model trained without a Prediction Unit scores only the run date (`as-of-unsupported`). */
  'AS_OF_UNSUPPORTED',
  /** A pre-change model kept serving has no stored feature importance to test for dominance (`leakage-unknown`). */
  'LEAKAGE_UNKNOWN',
  /** A writing run's caller may not create and update `MJ: Feature Values` (`feature-values-not-writable`, D4-165). */
  'FEATURE_VALUES_NOT_WRITABLE',
  /** A model reads a feature at a pinned version that is no longer the one in use; retrain it (`feature-version-mismatch`, PR 5 G7.6). */
  'FEATURE_VERSION_MISMATCH',
  /** A scoring run stopped at a batch in which a record failed; the run row names the first errors. */
  'SCORING_RUN_FAILED',
] as const;

/** Why a Train, Score or SignOffModel request was refused. */
export type PredictiveStudioRefusalCode = (typeof REFUSAL_CODES)[number];

/** The refusal codes and the check that a result code is one of them. */
export class PredictiveStudioRefusalCodes {
  public static readonly All: ReadonlyArray<PredictiveStudioRefusalCode> = REFUSAL_CODES;

  /** True when `code` is a Predictive Studio refusal (a generic code such as `EXECUTION_ERROR` is not). */
  public static IsRefusal(code: string | undefined): code is PredictiveStudioRefusalCode {
    return code !== undefined && (PredictiveStudioRefusalCodes.All as ReadonlyArray<string>).includes(code);
  }
}
