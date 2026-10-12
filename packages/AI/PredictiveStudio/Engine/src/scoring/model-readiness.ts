/**
 * @module scoring/model-readiness
 *
 * **"Needs training" readiness** for an `MJ: ML Models` row. A model row can exist
 * without a trained artifact — most commonly when an app seeds model metadata
 * (metrics, feature schema, fitted preprocessing) but the serialized model only ever
 * existed on the machine that trained it. Such a model cannot score anything, so
 * Predictive Studio refuses it up front with one clear message instead of
 * publishing it, or failing every record of a scoring run into the error-rate
 * circuit breaker.
 *
 * The single source of truth for the check and its wording, shared by the scoring
 * processor's run-level preflight and the promotion gate.
 */

/** The minimal model shape the readiness check reads. */
export interface ModelArtifactRef {
  /** The model's id (for the message). */
  ID: string;
  /** FK to the `MJ: Files` row holding the serialized model; null/empty when untrained. */
  ArtifactFileID: string | null | undefined;
}

/**
 * Whether the model has a trained artifact reference. A model without one
 * **needs training** — it can't score and must not be published.
 */
export function ModelHasTrainedArtifact(model: ModelArtifactRef): boolean {
  return typeof model.ArtifactFileID === 'string' && model.ArtifactFileID.trim().length > 0;
}

/**
 * The plain-language "needs training" message for a model with no artifact reference.
 *
 * @param modelId the `MJ: ML Models` id
 */
export function ModelNeedsTrainingMessage(modelId: string): string {
  return (
    `ML Model '${modelId}' needs training: it has no trained model artifact (ArtifactFileID is empty), ` +
    `so it cannot score records or be published. Train its pipeline in Predictive Studio, then publish ` +
    `the resulting model and point scoring at it.`
  );
}

/**
 * The message for a model whose artifact reference exists but whose bytes can't be
 * read on this server (e.g. the model was trained on another host, or local artifact
 * storage was cleared). Retraining on this server restores it.
 *
 * @param modelId the `MJ: ML Models` id
 * @param artifactFileId the `MJ: Files` id the model points at
 */
export function ModelArtifactMissingMessage(modelId: string, artifactFileId: string): string {
  return (
    `ML Model '${modelId}' needs training on this server: its model artifact '${artifactFileId}' could not ` +
    `be loaded (it may have been trained on another host, or its artifact storage was cleared). ` +
    `Retrain its pipeline in Predictive Studio, then publish the resulting model.`
  );
}

/**
 * Thrown when a model can't score because it needs training — it is missing, has no
 * artifact reference, or its artifact bytes can't be loaded on this server. A distinct
 * class so callers (the opt-in auto-train path) can tell "needs training" apart from
 * any other scoring failure without matching on message text.
 */
export class ModelNeedsTrainingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelNeedsTrainingError';
  }
}
