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
 * the production wiring is shared with the Train action via {@link trainModelViaEngine}.
 *
 * Marked `LongRunning` (training can take a while): it emits coarse start/finish
 * progress through the server context. The engine does not expose a per-epoch
 * progress hook today, so progress is bounded to the lifecycle phases rather than
 * fabricated row counts.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation, type RemoteOpServerContext } from '@memberjunction/core';
import {
  PredictiveStudioTrainModelOperation,
  type PredictiveStudioTrainModelInput,
  type PredictiveStudioTrainModelOutput,
} from '@memberjunction/core-entities';

import type { TrainModelInput } from '../training/types';
import { TrainingEngine } from '../training/training-engine';
import { trainModelViaEngine, wasTrainingLeakageFlagged } from './delegation';

/**
 * Server implementation of `PredictiveStudio.TrainModel`. Extends the CodeGen-emitted
 * {@link PredictiveStudioTrainModelOperation} base (which carries the `OperationKey`,
 * `ExecutionMode='LongRunning'`, and `RequiredScope='predictive:execute'`) and
 * supplies only the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.TrainModel')
export class PredictiveStudioTrainModelServerOperation extends PredictiveStudioTrainModelOperation {
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

    context.emitProgress({
      OperationKey: this.OperationKey,
      Processed: 0,
      Status: 'Running',
      Message: `Training model from pipeline ${input.pipelineId}…`,
    });

    const result = await trainModelViaEngine(this.toEngineInput(input), provider, user, this.engine());

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
      leakageFlagged: wasTrainingLeakageFlagged(result),
      status: result.model.Status,
    };
  }

  /**
   * Map the operation's typed input onto the engine's {@link TrainModelInput}.
   * The shapes are nearly 1:1; `labelEventDates` is the only field that differs —
   * the wire shape carries ISO date strings, the engine wants `Date`s.
   */
  protected toEngineInput(input: PredictiveStudioTrainModelInput): TrainModelInput {
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
    if (input.labelEventDates) {
      engineInput.labelEventDates = this.parseLabelEventDates(input.labelEventDates);
    }
    return engineInput;
  }

  /** Parse the wire's `{ recordKey: ISO-string }` label-event map into `Date`s. */
  protected parseLabelEventDates(map: Record<string, string>): Record<string, Date> {
    const out: Record<string, Date> = {};
    for (const [key, iso] of Object.entries(map)) {
      out[key] = new Date(iso);
    }
    return out;
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
