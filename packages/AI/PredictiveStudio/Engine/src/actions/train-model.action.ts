/**
 * @module actions/train-model.action
 *
 * **Train ML Model** action — the thin Action boundary over {@link TrainingEngine}.
 * It lets an agent / workflow / UI kick off a training run by pipeline id and read back
 * the run's stored gate decision and reason, its Training Snapshot and Evaluation
 * Protocol, the produced model id (none when the decision ships no model), the
 * test-set scores, and whether one feature dominates the predictions.
 *
 * Per CLAUDE.md "Actions are boundaries": this action does NOT do any training
 * logic. It validates `PipelineID`, refuses the retired `MaxRows` input by name (as
 * the `PredictiveStudio.TrainModel` operation refuses its retired inputs), builds the
 * engine's production dependency bundle, delegates to `TrainingEngine.trainModel`,
 * then reads the outputs with {@link TrainModelMapping}, the same mapping the
 * operation uses. The engine and the deps bundle are created behind overridable
 * factory seams so unit tests substitute mocks with no live DB and no sidecar.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import type { PredictiveStudioTrainModelOutput } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

import { TrainingEngine } from '../training/training-engine';
import type { TrainingDeps } from '../training/types';
import { RunViewEvaluationProtocolStore, type IEvaluationProtocolStore } from '../training/evaluation-protocol-store';
import { TrainingDelegation } from '../operations/delegation';
import { TrainModelMapping } from '../operations/train-model.mapping';
import { BasePredictiveStudioAction } from './base-predictive-studio.action';
import { PredictiveStudioRefusals } from '../operations/refusals';

/** The driver-class key this action registers under (matches the metadata row). */
export { TRAIN_MODEL_DRIVER_CLASS } from './driver-classes';
import { TRAIN_MODEL_DRIVER_CLASS } from './driver-classes';

/**
 * Trains a model from a `MJ: ML Training Pipelines` definition and surfaces the run's
 * stored gate decision.
 *
 * Outputs: `ModelID` (null when no model is produced), `HoldoutMetrics` (JSON string),
 * `LeakageFlagged` (boolean), `GateOutcome`, `GateReason`, `TrainingSnapshotID` and
 * `EvaluationProtocolID`.
 */
@RegisterClass(BaseAction, TRAIN_MODEL_DRIVER_CLASS)
export class PredictiveStudioTrainModelAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const pipelineId = this.getStringParam(params, 'PipelineID');
      if (!pipelineId) {
        return this.fail('VALIDATION_ERROR', 'PipelineID parameter is required');
      }
      // A supplied MaxRows is refused by name, never ignored: every eligible row is read.
      const retired = TrainModelMapping.RetiredInputRefusal('Train ML Model', this.findParam(params, 'MaxRows') ? ['maxRows'] : [], ['MaxRows']);
      if (retired !== null) throw retired;

      const deps = await this.buildDeps(params);
      const result = await this.createEngine().trainModel({ pipelineId }, deps);
      const facts = await TrainModelMapping.GatherRunFacts(result, this.protocolStore(deps));
      return this.mapResult(params, TrainModelMapping.TrainModelOutputFrom(facts));
    } catch (e) {
      LogError(e);
      const error = e instanceof Error ? e : new Error(String(e));
      // A refusal keeps its typed code (the same one the operation returns), so agents never parse the message.
      return this.fail(PredictiveStudioRefusals.CodeOf(error) || 'TRAINING_FAILED', `Training failed: ${error.message}`);
    }
  }

  /**
   * Map the Train output (the same one the operation returns) onto the action's output params. A run whose gate
   * decision ships no model succeeds with `ModelID` null; its message is the stored reason.
   */
  protected mapResult(params: RunActionParams, out: PredictiveStudioTrainModelOutput): ActionResultSimple {
    // `||`: an absent output member is an empty output param (null), never `undefined`.
    this.addOutputParam(params, 'ModelID', out.modelId || null);
    this.addOutputParam(params, 'HoldoutMetrics', out.holdoutMetrics || null);
    this.addOutputParam(params, 'LeakageFlagged', out.leakageFlagged);
    this.addOutputParam(params, 'GateOutcome', out.gateOutcome || null);
    this.addOutputParam(params, 'GateReason', out.gateReason || null);
    this.addOutputParam(params, 'TrainingSnapshotID', out.trainingSnapshotId || null);
    this.addOutputParam(params, 'EvaluationProtocolID', out.evaluationProtocolId || null);
    const note = out.modelId && out.leakageFlagged
      ? ' A single feature is doing almost all the predicting — a human must confirm this is not target leakage before the model is trusted.'
      : '';
    return this.ok(params, `${TrainModelMapping.FinishedMessage(out)}${note}`);
  }

  // ----- injectable engine + deps seams (overridden in tests) ----------------

  /** Construct the {@link TrainingEngine}. Overridable so tests inject a mock. */
  protected createEngine(): TrainingEngine {
    return new TrainingEngine();
  }

  /**
   * Build the engine's production dependency bundle from the action's run params
   * (threading `ContextUser` + `Provider` for isolation/multi-provider
   * correctness) through {@link TrainingDelegation.BuildTrainingDeps} — the same wiring the Train
   * Model operation uses, so both surfaces pick the artifact-store family the same
   * way. Overridable so tests inject in-memory seams.
   */
  protected async buildDeps(params: RunActionParams): Promise<TrainingDeps> {
    const provider = params.Provider || Metadata.Provider; // global-provider-ok: RunActionParams.Provider is optional; ActionEngine contract falls back to the global provider (ActionEngine-Base.ts:413-419)
    return TrainingDelegation.BuildTrainingDeps(provider, params.ContextUser);
  }

  /**
   * Where the run's protocol version is read: the deps' protocol store (the one training read the protocol through),
   * or a store on the deps' provider and user, as the engine defaults it. Overridable so tests serve protocol rows.
   */
  protected protocolStore(deps: TrainingDeps): IEvaluationProtocolStore {
    // `||`: an absent store falls back to the engine's default store.
    return deps.protocols || new RunViewEvaluationProtocolStore(deps.provider, deps.contextUser);
  }
}
