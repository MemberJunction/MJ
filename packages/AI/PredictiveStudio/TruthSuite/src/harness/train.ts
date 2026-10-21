import {
  type MJMLTrainingPipelineEntity,
  PredictiveStudioTrainModelOperation,
  type PredictiveStudioTrainAsOf,
} from '@memberjunction/core-entities';
import type { RunContext } from './run-fixtures';
import type { TrainAttempt } from './types';

/** Training operation wrapper for the truth harness. */
export class HarnessTraining {
  /** Execute `PredictiveStudio.TrainModel` and return a `TrainAttempt` (never throws for a product refusal). */
  public static async Train(
    ctx: RunContext,
    pipeline: MJMLTrainingPipelineEntity,
    opts?: { MaxRows?: number; AsOf?: PredictiveStudioTrainAsOf },
  ): Promise<TrainAttempt> {
    const t0 = Date.now();
    const r = await new PredictiveStudioTrainModelOperation().Execute(
      {
        pipelineId: pipeline.ID,
        maxRows: opts?.MaxRows,
        asOf: opts?.AsOf,
        sidecarVersion: 'truth-suite',
      },
      { provider: ctx.Provider, user: ctx.User },
    );
    const durationMs = Date.now() - t0;
    if (!r.Success || !r.Output) {
      return {
        Ok: false,
        ErrorMessage: r.ErrorMessage || null,
        ModelID: null,
        TrainingRunID: null,
        HoldoutMetricsJSON: null,
        DurationMs: durationMs,
      };
    }
    return {
      Ok: true,
      ErrorMessage: null,
      ModelID: r.Output.modelId || null,
      TrainingRunID: r.Output.trainingRunId || null,
      HoldoutMetricsJSON: r.Output.holdoutMetrics || null,
      DurationMs: durationMs,
    };
  }
}
