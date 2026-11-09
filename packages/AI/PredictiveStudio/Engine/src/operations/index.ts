/**
 * @module operations
 *
 * Barrel for the **Predictive Studio Remote Operations** — the seven Manual-mode
 * server bodies for the CodeGen-emitted `PredictiveStudio.*` operation bases
 * (`@memberjunction/core-entities` → `generated/remote_operations.ts`).
 *
 * Each operation is the typed peer of the corresponding Predictive Studio Action:
 * an agent / UI / workflow invokes the operation by stable key, the framework
 * applies the scope / permission gates, and the subclass maps the typed input →
 * engine delegation → the typed output. The production wiring is SHARED with the
 * Actions (`./delegation`), so the two invocation surfaces train / score /
 * experiment / promote through one path.
 *
 * Operation keys → server subclass:
 *   - `PredictiveStudio.TrainModel`              → {@link PredictiveStudioTrainModelServerOperation}
 *   - `PredictiveStudio.ScoreRecordSet`          → {@link PredictiveStudioScoreRecordSetServerOperation}
 *   - `PredictiveStudio.RunFeaturePipeline`      → {@link PredictiveStudioRunFeaturePipelineServerOperation}
 *   - `PredictiveStudio.StartExperimentSession`  → {@link PredictiveStudioStartExperimentSessionServerOperation}
 *   - `PredictiveStudio.ControlExperimentSession`→ {@link PredictiveStudioControlExperimentSessionServerOperation}
 *   - `PredictiveStudio.PromoteModel`            → {@link PredictiveStudioPromoteModelServerOperation}
 *   - `PredictiveStudio.CreateScoringProcess`    → {@link PredictiveStudioCreateScoringProcessServerOperation}
 */

export * from './delegation';
export * from './refusals';
export * from './train-model.operation';
export * from './score-record-set.operation';
export * from './run-feature-pipeline.operation';
export * from './start-experiment-session.operation';
export * from './control-experiment-session.operation';
export * from './promote-model.operation';
export * from './create-scoring-process.operation';

import { PredictiveStudioTrainModelServerOperation } from './train-model.operation';
import { PredictiveStudioScoreRecordSetServerOperation } from './score-record-set.operation';
import { PredictiveStudioRunFeaturePipelineServerOperation } from './run-feature-pipeline.operation';
import { PredictiveStudioStartExperimentSessionServerOperation } from './start-experiment-session.operation';
import { PredictiveStudioControlExperimentSessionServerOperation } from './control-experiment-session.operation';
import { PredictiveStudioPromoteModelServerOperation } from './promote-model.operation';
import { PredictiveStudioCreateScoringProcessServerOperation } from './create-scoring-process.operation';

/**
 * Tree-shaking anchor — call from a server bootstrap to guarantee the seven
 * `@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.*')` registrations are
 * not eliminated by the bundler. Referencing the classes through this function
 * creates a static code path the bundler keeps (mirrors `LoadPredictiveStudioActions`
 * and `LoadRecordProcessControlOperations`).
 */
export function LoadPredictiveStudioOperations(): void {
  void PredictiveStudioTrainModelServerOperation;
  void PredictiveStudioScoreRecordSetServerOperation;
  void PredictiveStudioRunFeaturePipelineServerOperation;
  void PredictiveStudioStartExperimentSessionServerOperation;
  void PredictiveStudioControlExperimentSessionServerOperation;
  void PredictiveStudioPromoteModelServerOperation;
  void PredictiveStudioCreateScoringProcessServerOperation;
}
