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
 *
 * A trained model is also refused when the sidecar's `/predict` does not serve its artifact: a forecast whose shipped
 * artifact is a series forecaster (a series model or a series baseline) is refused there (`SeriesForecasterNotServedError`),
 * so the promotion gate never publishes one and scoring refuses it up front ({@link ModelReadiness}).
 */

import type { MJMLModelEntity } from '@memberjunction/core-entities';

import { TrainerModelLineageReader } from '../training/trainer-model-lineage';

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

/** The minimal model shape the `/predict` servability check reads. */
export interface ModelServingRef {
  /** The model's id (for the message). */
  ID: string;
  /** The model's `Lineage` JSON; its `shippedDriver` names the driver of the shipped artifact. */
  Lineage: string | null | undefined;
}

/**
 * Whether the sidecar's `/predict` serves a trained model's artifact. `/predict` scores rows with a trainer predictor
 * only; a forecast's series model or series baseline is refused there (`load_v2_envelope` in the sidecar's
 * `app/artifacts.py`), so such a model must never be published or bound to scoring. A forecast unit's tabular finalist
 * is a trainer predictor and is served.
 */
export class ModelReadiness {
  /**
   * The driver keys whose artifact is a series forecaster: the sidecar's series algorithms (`SERIES_ALGOS`) and series
   * baseline kinds (`BaselineKind`) in `app/temporal.py`. A test compares the two lists.
   */
  public static readonly SeriesForecasterDrivers: readonly string[] = ['ar1_const', 'trend_season_ols', 'trend_season_ar1', 'naive', 'seasonal-naive', 'mean'];

  /**
   * True unless the model's Lineage names a series forecaster as the driver of its shipped artifact. A model whose
   * Lineage names no shipped driver (trained before the trainer recorded one) is served, as before.
   *
   * @param model the model's id and Lineage
   */
  public static IsServedByPredict(model: ModelServingRef): boolean {
    const driver = TrainerModelLineageReader.ShippedDriverOf(model.Lineage);
    return driver === null || !ModelReadiness.SeriesForecasterDrivers.includes(driver);
  }

  /**
   * The plain-language refusal for a model whose artifact `/predict` does not serve.
   *
   * @param modelId the `MJ: ML Models` id
   */
  public static NotServedByPredictMessage(modelId: string): string {
    return (
      `ML Model '${modelId}' cannot be published or score records: forecast models are not served by /predict yet, ` +
      `and this model's artifact is a forecast's series forecaster. Keep it for review in Predictive Studio, or train ` +
      `the forecast with a tabular algorithm to get a model that scores.`
    );
  }
}

/**
 * Thrown when a model's artifact is not served by the sidecar's `/predict` ({@link ModelReadiness.IsServedByPredict}).
 * Distinct from "needs training" so auto-train never retrains for it (a retrain would ship the same kind of artifact).
 */
export class ModelNotServableError extends Error {
  constructor(public readonly ModelID: string) {
    super(`MLModelInferenceProcessor: ${ModelReadiness.NotServedByPredictMessage(ModelID)}`);
    this.name = 'ModelNotServableError';
  }
}

/**
 * Thrown when a model's lifecycle status forbids scoring. Distinct from "needs training" so auto-train never reacts
 * to it. Only Validated (preview) and Published models score (containment of F-SCO-1; the lifecycle gate's
 * publish rules own the final rule).
 */
export class ModelNotScorableError extends Error {
  constructor(public readonly ModelID: string, public readonly Status: MJMLModelEntity['Status']) {
    super(`MLModelInferenceProcessor: ${ModelNotScorableError.Message(ModelID, Status)}`);
    this.name = 'ModelNotScorableError';
  }

  /** The refusal message for a model whose status may not score. */
  public static Message(modelId: string, status: MJMLModelEntity['Status']): string {
    const next =
      status === 'Draft'
        ? 'Move it to Validated through the promotion gate first.'
        : 'Score with a Published version of the pipeline, or un-archive this model through the promotion gate.';
    return `ML Model '${modelId}' is ${status} and cannot score records: only Validated or Published models score. ${next}`;
  }
}
