/**
 * @module training/train-request
 *
 * The one place a `/train` request is put together. The training of a pipeline without a Prediction Unit builds it
 * from its assembled matrix; a unit run builds it from its Training Snapshot's rows (`SnapshotRetrainer`). Both go
 * through {@link TrainRequestBuilder.Build}, so the two request shapes cannot drift apart.
 */
import type { FeatureSchemaEntry, MatrixData, PreprocessingOp, TrainRequest } from '@memberjunction/predictive-studio-core';

/** Everything a `/train` request carries; the locked holdout travels beside it, never inside it. */
export interface TrainRequestParts {
  readonly Algorithm: TrainRequest['algorithm'];
  readonly ProblemType: TrainRequest['problem_type'];
  readonly Hyperparameters: TrainRequest['hyperparameters'];
  readonly Validation: TrainRequest['validation'];
  readonly FeatureSchema: readonly FeatureSchemaEntry[];
  readonly Preprocessing: readonly PreprocessingOp[];
  /** The label column. */
  readonly Target: string;
  /** The rows the model may train and tune on. */
  readonly Data: MatrixData;
}

/** Builds `/train` requests. Static members on one owner. */
export class TrainRequestBuilder {
  /** The `/train` request for these parts; the feature schema and preprocessing are copied, so the request owns its lists. */
  public static Build(parts: TrainRequestParts): TrainRequest {
    return {
      algorithm: parts.Algorithm,
      problem_type: parts.ProblemType,
      hyperparameters: parts.Hyperparameters,
      validation: parts.Validation,
      feature_schema: [...parts.FeatureSchema],
      preprocessing: [...parts.Preprocessing],
      target: parts.Target,
      data: parts.Data,
    };
  }
}
