/**
 * @module operations/train-model.operation
 *
 * **Train ML Model** Remote Operation — the server body for the Manual-mode
 * `PredictiveStudio.TrainModel` operation. It is the typed peer of the Train
 * *Action*: an agent / UI / workflow (client or in-process) invokes the operation
 * by key, the framework applies the scope / permission gates, and this subclass
 * maps the typed input → `TrainingEngine.trainModel` → the typed output.
 *
 * Per CLAUDE.md "transport-layer architecture", the operation is a THIN adapter —
 * it carries no training logic. The actual orchestration (locked-holdout carve,
 * sidecar `/train`, immutable model persist, leakage flag) lives in the engine, and
 * the production wiring is shared with the Train action via {@link TrainingDelegation.TrainModelViaEngine}.
 *
 * Marked `LongRunning` (training can take a while): it emits coarse start/finish
 * progress through the server context. The engine does not expose a per-epoch
 * progress hook today, so progress is bounded to the lifecycle phases rather than
 * fabricated row counts.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, RemoteOpResult, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation, type RemoteOpServerContext } from '@memberjunction/core';
import {
  PredictiveStudioTrainModelOperation,
  type PredictiveStudioTrainModelInput,
  type PredictiveStudioTrainModelOutput,
} from '@memberjunction/core-entities';

import type { TrainModelInput } from '../training/types';
import { TrainingEngine } from '../training/training-engine';
import { TrainingRefusedError } from '../training/training-refusal';
import { TrainingDelegation, WasTrainingLeakageFlagged } from './delegation';
import { PredictiveStudioRefusals } from './refusals';

/**
 * Server implementation of `PredictiveStudio.TrainModel`. Extends the CodeGen-emitted
 * {@link PredictiveStudioTrainModelOperation} base (which carries the `OperationKey`,
 * `ExecutionMode='LongRunning'`, and `RequiredScope='predictive:execute'`) and
 * supplies only the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.TrainModel')
export class PredictiveStudioTrainModelServerOperation extends PredictiveStudioTrainModelOperation {
  /** Returns refusals as typed `ResultCode`s (see `PredictiveStudioRefusals`). */
  public override async ExecuteServer(
    input: PredictiveStudioTrainModelInput,
    context: RemoteOpServerContext,
  ): Promise<RemoteOpResult<PredictiveStudioTrainModelOutput>> {
    return PredictiveStudioRefusals.ExecuteServer(
      () => this.Authorize(input, context.user),
      () => this.InternalExecute(input, context.provider, context.user, context),
      this.OperationKey,
    );
  }

  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioTrainModelInput,
    provider: IMetadataProvider,
    user: UserInfo,
    context: RemoteOpServerContext,
  ): Promise<PredictiveStudioTrainModelOutput> {
    if (!input?.pipelineId) {
      throw new Error('pipelineId is required');
    }
    // Mapped before any progress is reported: a refused input never starts a training run.
    const engineInput = this.toEngineInput(input);

    context.emitProgress({
      OperationKey: this.OperationKey,
      Processed: 0,
      Status: 'Running',
      Message: `Training model from pipeline ${input.pipelineId}…`,
    });

    const result = await TrainingDelegation.TrainModelViaEngine(engineInput, provider, user, this.engine());

    context.emitProgress({
      OperationKey: this.OperationKey,
      Processed: 1,
      Total: 1,
      Status: 'Running',
      Message: `Trained model ${result.model.ID} (v${result.model.Version}).`,
    });

    return {
      modelId: result.model.ID,
      trainingRunId: result.run.ID,
      version: result.model.Version,
      holdoutMetrics: result.model.HoldoutMetrics ?? undefined,
      leakageFlagged: WasTrainingLeakageFlagged(result),
      status: result.model.Status,
    };
  }

  /**
   * Map the operation's typed input onto the engine's {@link TrainModelInput}. Decision dates come from the pipeline's
   * Prediction Unit, so a point-in-time `asOf` input and `labelEventDates` are refused by name (`input-not-accepted`)
   * instead of being silently ignored; an `asOf` of `Mode: 'none'` asks for nothing and is accepted.
   */
  protected toEngineInput(input: PredictiveStudioTrainModelInput): TrainModelInput {
    if (input.asOf && input.asOf.Mode !== 'none') {
      throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'asOf', why: "decision dates come from the pipeline's Prediction Unit; the asOf input is no longer accepted (it was silently ignored before)" } });
    }
    if (input.labelEventDates) {
      throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'labelEventDates', why: "decision dates come from the pipeline's Prediction Unit; labelEventDates are no longer accepted (they were silently ignored before)" } });
    }
    const engineInput: TrainModelInput = { pipelineId: input.pipelineId };
    if (input.experimentSessionIterationId) {
      engineInput.experimentSessionIterationId = input.experimentSessionIterationId;
    }
    if (input.maxRows != null) {
      engineInput.maxRows = input.maxRows;
    }
    if (input.primaryKeyField) {
      engineInput.primaryKeyField = input.primaryKeyField;
    }
    if (input.sidecarVersion) {
      engineInput.sidecarVersion = input.sidecarVersion;
    }
    return engineInput;
  }

  /**
   * The {@link TrainingEngine} instance to delegate to. Overridable so unit tests
   * inject a mock engine with no live DB / sidecar (mirrors the Action's seam).
   */
  protected engine(): TrainingEngine {
    return new TrainingEngine();
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioTrainModelOperation(): void {
  // intentionally empty
}
