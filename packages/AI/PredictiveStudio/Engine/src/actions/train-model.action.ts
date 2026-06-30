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
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

import { TrainingEngine } from '../training/training-engine';
import { MetadataEntityFactory, RunViewRecordLoader, MJSidecarTrainer } from '../training/seams';
import { resolveActiveFileStorageProviderId, buildArtifactStore } from '../training/artifact-store';
import type { TrainingDeps, TrainModelResult } from '../training/types';
import { BasePredictiveStudioAction } from './base-predictive-studio.action';

/** The driver-class key this action registers under (matches the metadata row). */
export const TRAIN_MODEL_DRIVER_CLASS = 'PredictiveStudioTrainModelAction';

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
      return this.fail('TRAINING_FAILED', `Training failed: ${e instanceof Error ? e.message : String(e)}`);
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
   * correctness). Resolves the active File Storage Provider once and picks the
   * artifact-store family accordingly (MJ-Files when a provider is active, local
   * disk when none is — the dev/on-prem fallback; see
   * {@link resolveActiveFileStorageProviderId}). Async so the provider lookup is
   * part of the wiring; overridable so tests inject in-memory seams.
   */
  protected async buildDeps(params: RunActionParams): Promise<TrainingDeps> {
    const entityFactory = new MetadataEntityFactory(params.Provider);
    const providerId = await resolveActiveFileStorageProviderId(params.ContextUser, params.Provider);
    return {
      entityFactory,
      recordLoader: new RunViewRecordLoader(),
      sidecar: new MJSidecarTrainer(),
      artifactStore: buildArtifactStore(providerId, entityFactory),
      contextUser: params.ContextUser,
      provider: params.Provider,
    };
  }
}
