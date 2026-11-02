/**
 * Runtime check: trains one pipeline in-process through the production engine wiring and prints the run summary as
 * one JSON line — with the stored gate outcome and its reason, and `modelId: null` when the decision shipped no model —
 * or the typed refusal (`{"refused": …}`). Training needs the Python sidecar
 * (`PREDICTIVE_STUDIO_SIDECAR_URL`), so the check runs only with `PS_INTEGRATION=1`; without it the script exits 0
 * after saying so. Training stores its artifacts through an active File Storage Provider: when none is active, the first
 * by priority is switched on for the run and back off afterwards (`RigStorage`, which the pipeline migration check
 * shares).
 *
 * With `--via-operation` the training goes through the `PredictiveStudio.TrainModel` Remote Operation, dispatched
 * in-process (`DispatchRemoteOperationInProcess`, the server path every client call reaches), and the line is the
 * operation's result: `{"operation": {Success, ResultCode, ErrorMessage, Output}}` plus the run's stored gate outcome.
 * `--retired=<keys>` (with `--via-operation`) also sends the named retired inputs (`asOf`, `labelEventDates`, `maxRows`,
 * `primaryKeyField`, comma-separated) with sample values, to show the operation refuses each by name before training.
 *
 * Usage (from the repo root, against the database the harness resolves):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-train-pipeline-check.ts <pipelineId> [--via-operation [--retired=maxRows,asOf]]
 *
 * Exit code: 0 = trained (a model shipped or nothing shipped) or refused (all printed), 2 = no pipeline ID given,
 * 1 = any other error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import '@memberjunction/core-entities';
import { DispatchRemoteOperationInProcess, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
  MJMLTrainingRunEntity, PredictiveStudioTrainModelInput, PredictiveStudioTrainModelOutput, RetiredTrainModelInputs,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { GateRecords } from '@memberjunction/predictive-studio-core';
import { TrainingDelegation, TrainingRefusedError } from '@memberjunction/predictive-studio';
import { RigStorage } from './lib/rig-storage';

/** Sample values for each retired input a `--retired=` flag names (the operation refuses them by presence). */
const RETIRED_SAMPLES: Required<RetiredTrainModelInputs> = {
  asOf: { Mode: 'none' }, labelEventDates: { 'sample-row': '2026-01-01' }, maxRows: 1000, primaryKeyField: 'ID',
};

/** The retired inputs the `--retired=` flag names, with their sample values. */
function retiredInputsFromArgs(): RetiredTrainModelInputs {
  const flag = process.argv.find((a) => a.startsWith('--retired='));
  if (flag === undefined) return {};
  const out: RetiredTrainModelInputs = {};
  for (const key of flag.slice('--retired='.length).split(',')) {
    if (key === 'asOf') out.asOf = RETIRED_SAMPLES.asOf;
    else if (key === 'labelEventDates') out.labelEventDates = RETIRED_SAMPLES.labelEventDates;
    else if (key === 'maxRows') out.maxRows = RETIRED_SAMPLES.maxRows;
    else if (key === 'primaryKeyField') out.primaryKeyField = RETIRED_SAMPLES.primaryKeyField;
    else throw new Error(`--retired: '${key}' is not a retired TrainModel input`);
  }
  return out;
}

/** Trains through the `PredictiveStudio.TrainModel` operation in-process and prints its result with the run's gate outcome. */
async function trainViaOperation(pipelineId: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
  const input: PredictiveStudioTrainModelInput & RetiredTrainModelInputs = { pipelineId, ...retiredInputsFromArgs() };
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
    const storage = await RigStorage.Activate(provider, user);
    try {
      if (process.argv.includes('--via-operation')) return await trainViaOperation(pipelineId, provider, user);
      await trainViaEngine(pipelineId, provider, user);
    } finally {
      await RigStorage.Restore(storage);
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

main().catch((e: Error) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
