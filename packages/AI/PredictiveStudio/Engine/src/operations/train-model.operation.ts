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
 * it carries no training logic. The engine trains the pipeline under its Prediction
 * Unit and bound Evaluation Protocol and stores the gate decision on the run; the
 * production wiring is shared with the Train action via {@link TrainingDelegation.TrainModelViaEngine},
 * and the output is read from the run with {@link TrainModelMapping}, as the action reads it.
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
import { RunViewEvaluationProtocolStore, type IEvaluationProtocolStore } from '../training/evaluation-protocol-store';
import { TrainingDelegation } from './delegation';
import { PredictiveStudioRefusals } from './refusals';
import { TrainModelMapping } from './train-model.mapping';

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

  /**
   * Refuses a retired input by name, trains, then returns the run's stored decision. A retired input is refused
   * before any progress is reported, so a refused call never starts a training run.
   */
  protected async InternalExecute(
    input: PredictiveStudioTrainModelInput,
    provider: IMetadataProvider,
    user: UserInfo,
    context: RemoteOpServerContext,
  ): Promise<PredictiveStudioTrainModelOutput> {
    if (!input?.pipelineId) {
      throw new Error('pipelineId is required');
    }
    const retired = TrainModelMapping.RetiredInputRefusal('TrainModel', TrainModelMapping.PresentRetiredInputs(input));
    if (retired !== null) throw retired;
    const engineInput = this.toEngineInput(input);
    this.reportProgress(context, 0, `Training model from pipeline ${input.pipelineId}…`);
    const result = await TrainingDelegation.TrainModelViaEngine(engineInput, provider, user, this.engine());
    // The output is mapped (and may fail closed) before the finishing line, so "completed" is never followed by an error.
    const out = TrainModelMapping.TrainModelOutputFrom(await TrainModelMapping.GatherRunFacts(result, this.protocolStore(provider, user)));
    this.reportProgress(context, 1, TrainModelMapping.FinishedMessage(out));
    return out;
  }

  /**
   * Map the operation's typed input onto the engine's {@link TrainModelInput}. The retired inputs are refused before
   * this runs (the type no longer carries them), so only the pipeline, the session iteration and the sidecar version map.
   */
  protected toEngineInput(input: PredictiveStudioTrainModelInput): TrainModelInput {
    const engineInput: TrainModelInput = { pipelineId: input.pipelineId };
    if (input.experimentSessionIterationId) {
      engineInput.experimentSessionIterationId = input.experimentSessionIterationId;
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

  /** Where the run's protocol version is read, through the request's provider and user. Overridable for tests. */
  protected protocolStore(provider: IMetadataProvider, user: UserInfo): IEvaluationProtocolStore {
    return new RunViewEvaluationProtocolStore(provider, user);
  }

  private reportProgress(context: RemoteOpServerContext, processed: 0 | 1, message: string): void {
    context.emitProgress({ OperationKey: this.OperationKey, Processed: processed, ...(processed === 1 ? { Total: 1 } : {}), Status: 'Running', Message: message });
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioTrainModelOperation(): void {
  // intentionally empty
}
