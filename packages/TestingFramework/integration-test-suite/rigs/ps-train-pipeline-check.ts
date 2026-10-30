/**
 * Runtime check: trains one pipeline in-process through the production engine wiring and prints the run summary as
 * one JSON line, or the typed refusal (`{"refused": …}`). Training needs the Python sidecar
 * (`PREDICTIVE_STUDIO_SIDECAR_URL`), so the check runs only with `PS_INTEGRATION=1`; without it the script exits 0
 * after saying so.
 *
 * Usage (from the repo root, against the database the harness resolves):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-train-pipeline-check.ts <pipelineId>
 *
 * Exit code: 0 = trained or refused (both printed), 2 = no pipeline ID given, 1 = any other error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import '@memberjunction/core-entities';
import { TrainingDelegation, TrainingRefusedError } from '@memberjunction/predictive-studio';

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
    const result = await TrainingDelegation.TrainModelViaEngine({ pipelineId }, provider, user);
    console.log(JSON.stringify({
      runId: result.run.ID, status: result.run.Status, modelId: result.model.ID,
      evaluationProtocolId: result.run.EvaluationProtocolID, trainingSnapshotId: result.run.TrainingSnapshotID,
    }));
  } catch (e) {
    if (!(e instanceof TrainingRefusedError)) throw e;
    console.log(JSON.stringify({ refused: e.Refusal }));
  } finally {
    await pool.close();
  }
}

main().catch((e: Error) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
