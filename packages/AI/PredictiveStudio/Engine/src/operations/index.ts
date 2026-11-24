/**
 * @module operations
 *
 * Barrel for the **Predictive Studio Remote Operations** — the twelve Manual-mode
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
 *   - `PredictiveStudio.GetModelEvidence`        → {@link PredictiveStudioGetModelEvidenceServerOperation}
 *   - `PredictiveStudio.SignOffModel`            → {@link PredictiveStudioSignOffModelServerOperation}
 *   - `PredictiveStudio.WithdrawScoringBinding`  → {@link PredictiveStudioWithdrawScoringBindingServerOperation}
 *   - `PredictiveStudio.RunModelMonitoring`      → {@link PredictiveStudioRunModelMonitoringServerOperation}
 *   - `PredictiveStudio.MigratePreGateModels`    → {@link PredictiveStudioMigratePreGateModelsServerOperation}
 *
 * The evidence, sign-off and pre-change migration operations have no Action peer: an agent may not sign off (D4-04).
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
export * from './get-model-evidence.operation';
export * from './sign-off-model.operation';
export * from './withdraw-scoring-binding.operation';
export * from './run-model-monitoring.operation';
export * from './migrate-pre-gate-models.operation';

import { PredictiveStudioTrainModelServerOperation } from './train-model.operation';
import { PredictiveStudioScoreRecordSetServerOperation } from './score-record-set.operation';
import { PredictiveStudioRunFeaturePipelineServerOperation } from './run-feature-pipeline.operation';
import { PredictiveStudioStartExperimentSessionServerOperation } from './start-experiment-session.operation';
import { PredictiveStudioControlExperimentSessionServerOperation } from './control-experiment-session.operation';
import { PredictiveStudioPromoteModelServerOperation } from './promote-model.operation';
import { PredictiveStudioCreateScoringProcessServerOperation } from './create-scoring-process.operation';
import { PredictiveStudioGetModelEvidenceServerOperation } from './get-model-evidence.operation';
import { PredictiveStudioSignOffModelServerOperation } from './sign-off-model.operation';
import { PredictiveStudioWithdrawScoringBindingServerOperation } from './withdraw-scoring-binding.operation';
import { PredictiveStudioRunModelMonitoringServerOperation } from './run-model-monitoring.operation';
import { PredictiveStudioMigratePreGateModelsServerOperation } from './migrate-pre-gate-models.operation';

/**
 * Tree-shaking anchor — call from a server bootstrap to guarantee the twelve
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
  void PredictiveStudioGetModelEvidenceServerOperation;
  void PredictiveStudioSignOffModelServerOperation;
  void PredictiveStudioWithdrawScoringBindingServerOperation;
  void PredictiveStudioRunModelMonitoringServerOperation;
  void PredictiveStudioMigratePreGateModelsServerOperation;
}
