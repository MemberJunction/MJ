/**
 * Runtime check: trains one pipeline in-process through the production engine wiring and prints the run summary as
 * one JSON line — with the stored gate outcome and its reason, and `modelId: null` when the decision shipped no model —
 * or the typed refusal (`{"refused": …}`). Training needs the Python sidecar
 * (`PREDICTIVE_STUDIO_SIDECAR_URL`), so the check runs only with `PS_INTEGRATION=1`; without it the script exits 0
 * after saying so. Training stores its artifacts through an active File Storage Provider: when none is active, the first
 * by priority is switched on for the run and back off afterwards (`ActivateStorage` / `RestoreStorage`, which the
 * pipeline migration check shares).
 *
 * With `--via-operation` the training goes through the `PredictiveStudio.TrainModel` Remote Operation, dispatched
 * in-process (`DispatchRemoteOperationInProcess`, the server path every client call reaches), and the line is the
 * operation's result: `{"operation": {Success, ResultCode, ErrorMessage, Output}}` plus the run's stored gate outcome.
 *
 * Usage (from the repo root, against the database the harness resolves):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-train-pipeline-check.ts <pipelineId> [--via-operation]
 *
 * Exit code: 0 = trained (a model shipped or nothing shipped) or refused (all printed), 2 = no pipeline ID given,
 * 1 = any other error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import '@memberjunction/core-entities';
import { DispatchRemoteOperationInProcess, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFileStorageProviderEntity, MJMLTrainingRunEntity, PredictiveStudioTrainModelInput, PredictiveStudioTrainModelOutput } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { GateRecords } from '@memberjunction/predictive-studio-core';
import { TrainingDelegation, TrainingRefusedError } from '@memberjunction/predictive-studio';

/**
 * Training stores its artifacts through the active File Storage Provider. When none is active (this private test
 * database keeps them off), the first by priority is switched on through the entity layer and switched back off
 * afterwards. Returns the provider switched on, or null.
 */
export async function ActivateStorage(provider: IMetadataProvider, user: UserInfo): Promise<MJFileStorageProviderEntity | null> {
  const rows = await RunView.FromMetadataProvider(provider).RunView<MJFileStorageProviderEntity>(
    { EntityName: 'MJ: File Storage Providers', OrderBy: 'Priority ASC, ID ASC', ResultType: 'entity_object', BypassCache: true }, user);
  if (!rows.Success) throw new Error(rows.ErrorMessage);
  if (rows.Results.some((r) => r.IsActive)) return null;
  const first = rows.Results[0];
  if (first === undefined) throw new Error('no MJ: File Storage Providers rows exist');
  first.IsActive = true;
  if (!(await first.Save())) throw new Error(`activating ${first.Name}: ${first.LatestResult?.CompleteMessage}`);
  return first;
}

export async function RestoreStorage(row: MJFileStorageProviderEntity | null): Promise<void> {
  if (row === null) return;
  row.IsActive = false;
  if (!(await row.Save())) throw new Error(`deactivating ${row.Name}: ${row.LatestResult?.CompleteMessage}`);
  console.log(JSON.stringify({ storage: `switched ${row.Name} back off` }));
}

/** Trains through the `PredictiveStudio.TrainModel` operation in-process and prints its result with the run's gate outcome. */
async function trainViaOperation(pipelineId: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
  const input: PredictiveStudioTrainModelInput = { pipelineId };
  const result = await DispatchRemoteOperationInProcess<PredictiveStudioTrainModelInput, PredictiveStudioTrainModelOutput>('PredictiveStudio.TrainModel', input, { user }, provider);
  const runId = result.Output ? result.Output.trainingRunId : null;
  const runs = runId === null ? null : await RunView.FromMetadataProvider(provider).RunView<Pick<MJMLTrainingRunEntity, 'ValidationResults' | 'Status'>>(
    { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['ValidationResults', 'Status'], ResultType: 'simple', BypassCache: true }, user);
  const run = runs !== null && runs.Success ? runs.Results[0] : undefined;
  const gate = run === undefined ? null : GateRecords.ParseStoredGateRecord(run.ValidationResults);
  console.log(JSON.stringify({
    operation: { Success: result.Success, ResultCode: result.ResultCode || null, ErrorMessage: result.ErrorMessage || null, Output: result.Output || null },
    runStatus: run === undefined ? null : run.Status, gateOutcome: gate === null ? null : gate.decision.outcome, gateReason: gate === null ? null : gate.reason.text,
  }));
}

/** Trains the pipeline named on the command line and prints what happened. */
async function main(): Promise<void> {
  const pipelineId = process.argv[2];
  if (!pipelineId) {
    console.error('usage: ps-train-pipeline-check.ts <pipelineId>');
    process.exit(2);
  }
  if (process.env.PS_INTEGRATION !== '1') {
    console.log('PS_INTEGRATION is not 1: training needs the sidecar, so nothing was trained.');
    return;
  }
  const { provider, user, pool } = await BootstrapAI();
  try {
    const storage = await ActivateStorage(provider, user);
    try {
      if (process.argv.includes('--via-operation')) return await trainViaOperation(pipelineId, provider, user);
      await trainViaEngine(pipelineId, provider, user);
    } finally {
      await RestoreStorage(storage);
    }
  } finally {
    await pool.close();
  }
}

/** Trains through the engine delegation and prints the run summary, or the typed refusal. */
async function trainViaEngine(pipelineId: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
  try {
    const result = await TrainingDelegation.TrainModelViaEngine({ pipelineId }, provider, user);
    // A completed run whose gate decision ships nothing (no-signal, or the unit's rule kept) has no model: a valid result.
    const gate = GateRecords.ParseStoredGateRecord(result.run.ValidationResults);
    console.log(JSON.stringify({
      runId: result.run.ID, status: result.run.Status, modelId: result.model === null ? null : result.model.ID,
      gateOutcome: gate === null ? null : gate.decision.outcome, gateReason: gate === null ? null : gate.reason.text,
      evaluationProtocolId: result.run.EvaluationProtocolID, trainingSnapshotId: result.run.TrainingSnapshotID,
    }));
  } catch (e) {
    if (!(e instanceof TrainingRefusedError)) throw e;
    console.log(JSON.stringify({ refused: e.Refusal }));
  }
}

// Run only as a script: the migration check imports the storage helpers above.
if (process.argv[1] !== undefined && process.argv[1].endsWith('ps-train-pipeline-check.ts')) main().catch((e: Error) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
