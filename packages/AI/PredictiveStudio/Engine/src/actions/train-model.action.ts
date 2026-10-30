/**
 * @module actions/train-model.action
 *
 * **Train ML Model** action — the thin Action boundary over {@link TrainingEngine}
 * (plan §3 / §12). It lets an agent / workflow / UI kick off a training run by
 * pipeline id and read back the produced model id, its honest holdout metrics, and
 * whether the run was leakage-flagged.
 *
 * Per CLAUDE.md "Actions are boundaries": this action does NOT do any training
 * logic. It validates `PipelineID`, builds the engine's production dependency
 * bundle (entity factory + record loader + sidecar + artifact store), delegates to
 * `TrainingEngine.trainModel`, then maps the result onto output params. The engine
 * and the deps bundle are created behind overridable factory seams so unit tests
 * substitute mocks with no live DB and no sidecar.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

import { TrainingEngine } from '../training/training-engine';
import type { TrainingDeps, TrainModelResult } from '../training/types';
import { TrainingDelegation } from '../operations/delegation';
import { BasePredictiveStudioAction } from './base-predictive-studio.action';
import { PredictiveStudioRefusals } from '../operations/refusals';

/** The driver-class key this action registers under (matches the metadata row). */
export { TRAIN_MODEL_DRIVER_CLASS } from './driver-classes';
import { TRAIN_MODEL_DRIVER_CLASS } from './driver-classes';

/**
 * Trains a model from a `MJ: ML Training Pipelines` definition and surfaces the
 * resulting model id, holdout metrics, and leakage flag.
 *
 * Outputs: `ModelID` (string), `HoldoutMetrics` (JSON string), `LeakageFlagged`
 * (boolean).
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

      const maxRows = this.getNumericParam(params, 'MaxRows');

      const engine = this.createEngine();
      const deps = await this.buildDeps(params);

      const result = await engine.trainModel({ pipelineId, maxRows }, deps);
      return this.mapResult(params, result);
    } catch (e) {
      LogError(e);
      const error = e instanceof Error ? e : new Error(String(e));
      // A refusal keeps its typed code (the same one the operation returns), so agents never parse the message.
      return this.fail(PredictiveStudioRefusals.CodeOf(error) || 'TRAINING_FAILED', `Training failed: ${error.message}`);
    }
  }

  /**
   * Map the engine's {@link TrainModelResult} onto the action's output params.
   * `LeakageFlagged` is read from the run's notes (the engine records a loud
   * `LEAKAGE WARNING` there when single-feature dominance was detected — §6.4).
   */
  protected mapResult(params: RunActionParams, result: TrainModelResult): ActionResultSimple {
    const leakageFlagged = this.wasLeakageFlagged(result);
    this.addOutputParam(params, 'ModelID', result.model.ID);
    this.addOutputParam(params, 'HoldoutMetrics', result.model.HoldoutMetrics ?? null);
    this.addOutputParam(params, 'LeakageFlagged', leakageFlagged);

    const note = leakageFlagged
      ? ' A single feature is doing almost all the predicting — a human must confirm this is not target leakage before the model is trusted.'
      : '';
    return this.ok(params, `Trained model ${result.model.ID} (v${result.model.Version}).${note}`);
  }

  /**
   * Whether the training run was leakage-flagged. The engine keeps the model in
   * `Draft` and records a plain-language `LEAKAGE WARNING` in the run's `Notes`
   * when single-feature dominance was detected (§6.4); we read that signal here.
   */
  protected wasLeakageFlagged(result: TrainModelResult): boolean {
    return (result.run.Notes ?? '').includes('LEAKAGE WARNING');
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
}
