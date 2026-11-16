import {
  type MJMLTrainingPipelineEntity,
  PredictiveStudioTrainModelOperation,
  type PredictiveStudioTrainAsOf,
  type PredictiveStudioTrainModelInput,
  type RetiredTrainModelInputs,
} from '@memberjunction/core-entities';
import { PredictiveStudioRefusalCodes } from '@memberjunction/predictive-studio-core';
import type { RunContext } from './run-fixtures';
import type { TrainAttempt } from './types';

/** Training operation wrapper for the truth harness. */
export class HarnessTraining {
  /**
   * Execute `PredictiveStudio.TrainModel` and return a `TrainAttempt` (never throws for a product refusal). `MaxRows`
   * and `AsOf` are retired inputs the operation refuses by name; they are sent only when given, so a probe can measure
   * that refusal and every other call sends none.
   */
  public static async Train(
    ctx: RunContext,
    pipeline: MJMLTrainingPipelineEntity,
    opts?: { MaxRows?: number; AsOf?: PredictiveStudioTrainAsOf },
  ): Promise<TrainAttempt> {
    const t0 = Date.now();
    const r = await new PredictiveStudioTrainModelOperation().Execute(HarnessTraining.payload(pipeline, opts), { provider: ctx.Provider, user: ctx.User });
    const durationMs = Date.now() - t0;
    if (!r.Success || !r.Output) {
      return {
        Ok: false,
        ErrorMessage: r.ErrorMessage || null,
        RefusalCode: PredictiveStudioRefusalCodes.IsRefusal(r.ResultCode) ? r.ResultCode : null,
        ModelID: null,
        TrainingRunID: null,
        HoldoutMetricsJSON: null,
        DurationMs: durationMs,
      };
    }
    return {
      Ok: true,
      ErrorMessage: null,
      RefusalCode: null,
      ModelID: r.Output.modelId || null,
      TrainingRunID: r.Output.trainingRunId || null,
      HoldoutMetricsJSON: r.Output.holdoutMetrics || null,
      DurationMs: durationMs,
    };
  }

  /** The operation input, carrying a retired key only when the caller gave it (a present key is refused, even empty). */
  private static payload(pipeline: MJMLTrainingPipelineEntity, opts?: { MaxRows?: number; AsOf?: PredictiveStudioTrainAsOf }): PredictiveStudioTrainModelInput & RetiredTrainModelInputs {
    return {
      pipelineId: pipeline.ID,
      sidecarVersion: 'truth-suite',
      ...(opts?.MaxRows === undefined ? {} : { maxRows: opts.MaxRows }),
      ...(opts?.AsOf === undefined ? {} : { asOf: opts.AsOf }),
    };
  }
}
