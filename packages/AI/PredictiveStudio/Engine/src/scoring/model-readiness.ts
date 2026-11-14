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
 * processor's run-level preflight and the lifecycle gate.
 *
 * A trained model is also refused when the sidecar's `/predict` does not serve its artifact: a forecast whose shipped
 * artifact is a series forecaster (a series model or a series baseline) is refused there (`SeriesForecasterNotServedError`),
 * so the lifecycle gate never publishes one and scoring refuses it up front ({@link ModelReadiness}).
 */

import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { ArtifactLoad, ScoringRefusal } from '@memberjunction/predictive-studio-core';

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
 * Thrown when a model can't score because it needs training: no model is configured, the model is not found, or the
 * model row was never trained (it has no artifact file). A distinct class so callers (the opt-in auto-train path) can
 * tell "needs training" apart from any other scoring failure without matching on message text. A model whose
 * registered artifact cannot be served is refused with {@link ArtifactUnavailableError} instead.
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
        ? 'Evaluate it through the lifecycle gate, then publish it.'
        : 'Score with a Published version of the pipeline, or publish (or roll back to) this model through the lifecycle gate.';
    return `ML Model '${modelId}' is ${status} and cannot score records: only Validated or Published models score. ${next}`;
  }
}

/** The scoring refusal of an artifact that is not served: lost, changed since it was registered, or never registered. */
export type ArtifactRefusal = Extract<ScoringRefusal, { kind: 'artifact-missing' | 'artifact-hash-mismatch' | 'artifact-unverified' }>;

/**
 * Thrown when a model's artifact load is not `verified` (`ArtifactRegistry.Load`): its file row or stored object is gone
 * (`artifact-missing`), its stored bytes do not hash to the registered SHA-256 (`artifact-hash-mismatch`, both hashes
 * named), or the model has no registered SHA-256 (`artifact-unverified`). Callers branch on {@link Refusal}'s `kind`,
 * never on the message: the opt-in auto-train reacts to `artifact-missing` only, since a retrain must not paper over a
 * changed or unregistered artifact.
 *
 * {@link Refusal} is the stored scoring-refusal contract and carries only what its kind defines; the message also
 * names the model and its artifact file, which the thrower knows, so every log line says which model and file failed.
 */
export class ArtifactUnavailableError extends Error {
  /**
   * @param Refusal the stored scoring refusal
   * @param Source the component that refused (`MLModelInferenceProcessor`, `MLModelChallengerScoreRunner`), the message prefix
   * @param ModelID the `MJ: ML Models` row whose artifact was loaded
   * @param FileID the model's `ArtifactFileID`
   */
  constructor(
    public readonly Refusal: ArtifactRefusal,
    public readonly Source: string,
    public readonly ModelID: string,
    public readonly FileID: string,
  ) {
    super(`${Source}: ${ArtifactUnavailableError.Message(Refusal, ModelID, FileID)}`);
    this.name = 'ArtifactUnavailableError';
  }

  /**
   * The error for a load that is not `verified`.
   *
   * @param load a `missing`, `hash-mismatch` or `unverified` load
   * @param source the component that refused (the message prefix)
   * @param modelId the model whose artifact was loaded
   * @param fileId the model's artifact file
   */
  public static For(load: Exclude<ArtifactLoad, { Status: 'verified' }>, source: string, modelId: string, fileId: string): ArtifactUnavailableError {
    return new ArtifactUnavailableError(ArtifactUnavailableError.RefusalOf(load), source, modelId, fileId);
  }

  /**
   * The refusal for a load that is not `verified`.
   *
   * @param load a `missing`, `hash-mismatch` or `unverified` load
   */
  public static RefusalOf(load: Exclude<ArtifactLoad, { Status: 'verified' }>): ArtifactRefusal {
    switch (load.Status) {
      case 'missing': return { kind: 'artifact-missing', fileId: load.FileID };
      case 'hash-mismatch': return { kind: 'artifact-hash-mismatch', expected: load.Expected, actual: load.Actual };
      case 'unverified': return { kind: 'artifact-unverified', modelId: load.ModelID };
    }
  }

  /** The plain-language refusal message: every kind names the model and its artifact file, plus both hashes on a mismatch. */
  public static Message(refusal: ArtifactRefusal, modelId: string, fileId: string): string {
    switch (refusal.kind) {
      case 'artifact-missing':
        return (
          `ML Model '${modelId}': its model artifact file '${refusal.fileId}' is missing from storage (its MJ: Files row or ` +
          `stored object is gone), so the model cannot score. Retrain its pipeline in Predictive Studio, then publish the ` +
          `resulting model.`
        );
      case 'artifact-hash-mismatch':
        return (
          `ML Model '${modelId}': its stored model artifact file '${fileId}' does not match its registered SHA-256 ` +
          `(registered ${refusal.expected}, stored bytes hash to ${refusal.actual}), so it is not served. The stored bytes ` +
          `changed after the model was registered.`
        );
      case 'artifact-unverified':
        return (
          `ML Model '${refusal.modelId}' has no registered artifact SHA-256 for its artifact file '${fileId}', so the artifact ` +
          `cannot be verified and is not served. Retrain its pipeline in Predictive Studio to register a verified artifact.`
        );
    }
  }
}
