/**
 * @module actions
 *
 * Barrel for the **Predictive Studio Actions** — the thin MemberJunction Action
 * boundaries (CLAUDE.md "Actions are boundaries") over the already-built engine
 * service classes, so agents / UI / workflows can invoke train / score /
 * experiment / promote.
 *
 * Each action validates its params, delegates to the relevant engine service
 * (`TrainingEngine` / `MLModelInferenceProcessor` / `ExperimentOrchestrator`)
 * through injectable seams, and maps results back onto the action's output params.
 * The engines + their dependency bundles are created behind overridable factory
 * seams so the actions are unit-testable with no live DB and no sidecar.
 *
 * Driver-class keys (matching the `metadata/actions/predictive-studio/` rows):
 *   - {@link PredictiveStudioTrainModelAction}       → `PredictiveStudioTrainModelAction`
 *   - {@link PredictiveStudioScoreRecordSetAction}   → `PredictiveStudioScoreRecordSetAction`
 *   - {@link PredictiveStudioRunExperimentAction}    → `PredictiveStudioRunExperimentAction`
 *   - {@link PredictiveStudioPromoteModelAction}     → `PredictiveStudioPromoteModelAction`
 */

export * from './base-predictive-studio.action';
export * from './train-model.action';
export * from './score-record-set.action';
export * from './score-record-set.runner';
export * from './run-experiment.action';
export * from './run-experiment.deps';
export * from './promote-model.action';
export * from './promote-model.gate';
export * from './model-scoring-action-generator';
export * from './schedule-model-scoring.action';

import { PredictiveStudioTrainModelAction } from './train-model.action';
import { PredictiveStudioScoreRecordSetAction } from './score-record-set.action';
import { PredictiveStudioRunExperimentAction } from './run-experiment.action';
import { PredictiveStudioPromoteModelAction } from './promote-model.action';
import { PredictiveStudioScheduleModelScoringAction } from './schedule-model-scoring.action';

/**
 * Tree-shaking anchor — call from a server bootstrap to guarantee the
 * `@RegisterClass(BaseAction, ...)` registrations are not eliminated by the
 * bundler. Referencing the classes through this function creates a static code
 * path the bundler keeps (mirrors `LoadMLModelInferenceProcessor`).
 */
export function LoadPredictiveStudioActions(): void {
  void PredictiveStudioTrainModelAction;
  void PredictiveStudioScoreRecordSetAction;
  void PredictiveStudioRunExperimentAction;
  void PredictiveStudioPromoteModelAction;
  void PredictiveStudioScheduleModelScoringAction;
}
