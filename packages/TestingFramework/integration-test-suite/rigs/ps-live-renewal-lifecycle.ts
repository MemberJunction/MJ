/**
 * ps-live-renewal-lifecycle.ts — headless, CLIENT-SIDE end-to-end lifecycle test of
 * Predictive Studio against an ALREADY-RUNNING MJAPI (http://localhost:4000), driven
 * entirely over GraphQL via the same GraphQLDataProvider a browser uses.
 *
 * It trains a REAL Member-Renewal classifier on the live AssociationDemo `Memberships`
 * data through the Predictive Studio Remote Operations:
 *
 *   PredictiveStudio.TrainModel    → MJAPI → TrainingEngine → Python sidecar (/train)
 *   PredictiveStudio.ScoreRecordSet→ MJAPI → MLModelInferenceProcessor → sidecar (/predict)
 *   PredictiveStudio.PromoteModel  → MJAPI → LifecycleGate (transition 'evaluate')
 *
 * Nothing about the ML is mocked. The ops are invoked exactly as any caller would:
 *   `await new SomeOperation().Execute(input, { provider, user })` — the call marshals
 *   over GraphQL to MJAPI, which dispatches to the registered server operation.
 *
 * THROWAWAY: it reuses (or creates) the driver's ML Algorithm row, creates an ML Training
 * Pipeline and binds it to version 1 of its Prediction Unit and Evaluation Protocol through the
 * harness's pipeline migration (`lib/ps-rig-lifecycle.ts`, every row saved over GraphQL), trains,
 * scores, promotes, then deletes every row it created through the harness cleanup (pipeline,
 * unit, protocol, model, training runs, Training Snapshot and stored files, and the algorithm if
 * it created it), children first — a row it cannot delete fails the rig. It is NOT part of any
 * build or run-all harness.
 *
 * AUTH: system API key from MJ_API_KEY (x-mj-api-key) via the shared harness — no secrets here.
 *
 * USAGE (from the repo root, with MJAPI already up on :4000 and its Python sidecar reachable):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-live-renewal-lifecycle.ts
 */
import { RunRecords } from '@memberjunction/predictive-studio-truth-suite';
import { LoadEnv, LoadClientConfig } from './lib/harness';
import { GateAnswer } from './lib/ps-promote';
import { RequireCheck, ShippedModelID } from './lib/ps-train-output';
import { BindUnitAndProtocol, DeleteRecordedRows, EnsureDriverAlgorithm, ReportCleanup, type RigAlgorithm } from './lib/ps-rig-lifecycle';
import { Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { GraphQLProviderConfigData, setupGraphQLClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import '@memberjunction/core-entities';
import {
  MJMLTrainingPipelineEntity,
  PredictiveStudioTrainModelOperation,
  PredictiveStudioScoreRecordSetOperation,
  PredictiveStudioPromoteModelOperation,
} from '@memberjunction/core-entities';

const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-live-renewal-lifecycle (safe to delete)';

function banner(title: string): void {
  console.log(`\n${'═'.repeat(78)}\n  ${title}\n${'═'.repeat(78)}`);
}

/** Fail fast with a clear message when MJAPI isn't reachable. */
async function preflight(url: string, apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mj-api-key': apiKey },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.log(`SKIP: MJAPI not reachable at ${url} — start MJAPI (and set PS_INTEGRATION=1 + the sidecar) to run this wire test.`);
    process.exit(0);
  }
  if (!response.ok) {
    console.log(`SKIP: MJAPI at ${url} answered HTTP ${response.status} — set MJ_API_KEY + start MJAPI to run this wire test.`);
    process.exit(0);
  }
}

/**
 * Connect the GraphQLDataProvider to the live MJAPI and return:
 *  - `md`: a `Metadata` wrapper for entity helpers (GetEntityObject / EntityByName)
 *  - `route`: the GraphQLDataProvider itself — the IRemoteOperationProvider that
 *    marshals `.Execute()` over the `ExecuteRemoteOperation` GraphQL mutation
 *  - `user`: the resolved CurrentUser
 */
async function connect(): Promise<{ md: Metadata; route: IMetadataProvider; user: UserInfo }> {
  LoadEnv();
  const client = LoadClientConfig();
  await preflight(client.Url, client.MJAPIKey);
  const config = new GraphQLProviderConfigData(
    '', client.Url, '', async () => '', '__mj', undefined, undefined, client.MJAPIKey,
  );
  await setupGraphQLClient(config);
  const md = new Metadata(); // global-provider-ok: standalone integration/demo script
  const route = GraphQLDataProvider.Instance;
  const user = md.CurrentUser;
  if (!user) {
    throw new Error('No CurrentUser resolved after client setup — check the API key.');
  }
  console.log(`Connected to ${client.Url} as ${user.Name ?? user.Email ?? user.ID}`);
  return { md, route, user };
}

/** Resolve an entity's ID by name (throws if not found). */
function entityId(md: Metadata, name: string): string {
  const e = md.EntityByName(name);
  if (!e) {
    throw new Error(`Entity '${name}' not found in metadata.`);
  }
  return e.ID;
}

/** Build the renewal pipeline's JSON config columns and save the pipeline row. */
async function createPipeline(md: Metadata, user: UserInfo, algorithmId: string): Promise<MJMLTrainingPipelineEntity> {
  // Features available leak-free on the target row (vwMemberships): AutoRenew (bit→numeric
  // passthrough) + MembershipType (categorical → one-hot). The FeatureAssembly executor
  // reads `select` columns straight off the target Membership row (no joins), so we only
  // select columns that actually exist on vwMemberships.
  const sourceBindings = [{ Kind: 'Entity', Ref: 'Memberships' }];
  const featureSteps = {
    Steps: [
      { Id: 'select-raw', Kind: 'select', Columns: ['AutoRenew', 'MembershipType'] },
      { Id: 'onehot-type', Kind: 'onehot', Column: 'MembershipType' },
    ],
  };
  const asOf = { Mode: 'none' };
  // Deny the post-outcome fields that would leak the label.
  const leakageGuard = {
    DenyFields: ['CancellationDate', 'CancellationReason', 'RenewalDate', 'EndDate', 'StartDate'],
    SingleFeatureDominanceThreshold: 0.85,
  };
  const validation = { Strategy: 'holdout', LockedHoldoutFraction: 0.2 };

  const p = await md.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
  p.NewRecord();
  p.Name = TAG;
  p.Description = 'Member renewal classifier on AssociationDemo Memberships (Status).';
  p.Version = 1;
  p.Status = 'Draft';
  p.TargetEntityID = entityId(md, 'Memberships');
  p.TargetVariable = 'Status';
  p.ProblemType = 'classification';
  p.AlgorithmID = algorithmId;
  p.SourceBindings = JSON.stringify(sourceBindings);
  p.FeatureSteps = JSON.stringify(featureSteps);
  p.AsOfStrategy = JSON.stringify(asOf);
  p.LeakageGuard = JSON.stringify(leakageGuard);
  p.ValidationStrategy = JSON.stringify(validation);
  if (!(await p.Save())) {
    throw new Error(`Failed to create pipeline: ${p.LatestResult?.CompleteMessage}`);
  }
  return p;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const { md, route, user } = await connect();

  const records = new RunRecords();
  let algorithm: RigAlgorithm | undefined;
  let cleanupFailures = 0;

  try {
    // ── 1. Resolve entities + algorithm ──────────────────────────────────────
    banner('1. RESOLVE ENTITIES + ALGORITHM');
    const membership = md.EntityByName('Memberships');
    const member = md.EntityByName('Members');
    console.log(`  Memberships entity: ${membership?.Name} (${membership?.ID})`);
    console.log(`  Members entity:     ${member?.Name} (${member?.ID})`);
    if (!membership) {
      // Honor the suite's skip contract (see run-all.ts): missing AssociationDemo is an
      // environment condition, not a failure — mirror the sibling ps-live scripts.
      console.log('  SKIP: Memberships entity not found — is AssociationDemo loaded? (exiting 0)');
      process.exit(0);
    }
    algorithm = await EnsureDriverAlgorithm(route, user, DRIVER_KEY, TAG);
    console.log(`  Algorithm row: ${algorithm.ID} (driver '${DRIVER_KEY}', ${algorithm.Created ? 'created' : 'reused'})`);

    // ── 2. Create the renewal pipeline ───────────────────────────────────────
    banner('2. CREATE ML TRAINING PIPELINE + BIND UNIT AND PROTOCOL');
    const pipeline = await createPipeline(md, user, algorithm.ID);
    records.RecordPipeline(pipeline.ID);
    console.log(`  Pipeline ${pipeline.ID}`);
    // Training refuses a pipeline without a Prediction Unit (UNIT_REQUIRED): bind version 1 of each, saved over GraphQL.
    await BindUnitAndProtocol(route, user, pipeline, records);
    console.log(`  Bound Prediction Unit ${pipeline.PredictionUnitID} and Evaluation Protocol ${pipeline.EvaluationProtocolID}`);
    console.log(`  Target: Memberships.Status (classification), Algorithm=${DRIVER_KEY}`);
    console.log(`  Features: select[AutoRenew, MembershipType] + onehot[MembershipType]`);
    console.log(`  Leakage deny: CancellationDate, CancellationReason, RenewalDate, EndDate, StartDate`);
    console.log(`  Validation: holdout, LockedHoldoutFraction=0.2`);

    // ── 3. Train (over GraphQL → MJAPI → TrainingEngine → sidecar) ────────────
    // NOTE: attached over-the-wire onProgress would require a live GraphQL-WS endpoint
    // (the client opens a RemoteOperationProgress subscription). We connect with an empty
    // wsurl (like the other client-side scripts), so we DON'T attach onProgress here — the
    // synchronous train Output already carries the honest holdout metrics + leakage flag.
    banner('3. TRAIN (PredictiveStudio.TrainModel)');
    const trainStart = Date.now();
    const trainResult = await new PredictiveStudioTrainModelOperation().Execute(
      { pipelineId: pipeline.ID, sidecarVersion: 'ps-live-renewal-lifecycle' },
      { provider: route, user },
    );
    console.log(`  Execute() Success=${trainResult.Success}${trainResult.ErrorMessage ? ` Error=${trainResult.ErrorMessage}` : ''} (${Date.now() - trainStart}ms)`);
    if (!trainResult.Success || !trainResult.Output) {
      throw new Error(`Training failed: ${trainResult.ErrorMessage}`);
    }
    const out = trainResult.Output;
    const shippedModelId = ShippedModelID(out, 'score and promote', RequireCheck);
    if (shippedModelId === null) throw new Error(`Training shipped no model to score and promote: ${out.gateOutcome ?? 'no gate decision'}.`);
    records.RecordModel(shippedModelId);
    console.log(`  modelId       = ${shippedModelId}`);
    console.log(`  trainingRunId = ${out.trainingRunId}`);
    console.log(`  version       = ${out.version}`);
    console.log(`  status        = ${out.status}`);
    console.log(`  leakageFlagged= ${out.leakageFlagged}`);
    console.log(`  holdoutMetrics= ${out.holdoutMetrics ?? '(none)'}`);

    // ── 4. Score (filter scope over Memberships, ephemeral dry-run) ──────────
    banner('4. SCORE (PredictiveStudio.ScoreRecordSet)');
    const scoreStart = Date.now();
    const scoreResult = await new PredictiveStudioScoreRecordSetOperation().Execute(
      {
        modelId: shippedModelId,
        scope: { filter: { entityName: 'Memberships', extraFilter: '', maxRows: 25 } },
        dryRun: true,
      },
      { provider: route, user },
    );
    console.log(`  Execute() Success=${scoreResult.Success}${scoreResult.ErrorMessage ? ` Error=${scoreResult.ErrorMessage}` : ''} (${Date.now() - scoreStart}ms)`);
    if (!scoreResult.Success || !scoreResult.Output) {
      throw new Error(`Scoring failed: ${scoreResult.ErrorMessage}`);
    }
    const s = scoreResult.Output;
    console.log(`  scored=${s.scored} failed=${s.failed} skipped=${s.skipped} wroteBack=${s.wroteBack}`);
    const samples = (s.predictions ?? []).slice(0, 8);
    for (const p of samples) {
      console.log(`    • record ${p.recordId?.slice(0, 8)}… → class='${p.class}' score=${p.score?.toFixed(4)}`);
    }

    // ── 5. Evaluate (Draft → Validated or KeepBaseline, the stored decision) through the lifecycle gate ──
    banner('5. EVALUATE (PredictiveStudio.PromoteModel, transition evaluate)');
    const promoteResult = await new PredictiveStudioPromoteModelOperation().Execute(
      { modelId: shippedModelId, transition: 'evaluate', reason: 'ps-live-renewal-lifecycle smoke test' },
      { provider: route, user },
    );
    console.log(`  Execute() Success=${promoteResult.Success}${promoteResult.ErrorMessage ? ` Error=${promoteResult.ErrorMessage}` : ''}`);
    if (!promoteResult.Success || !promoteResult.Output) {
      throw new Error(`Evaluation failed: ${promoteResult.ErrorMessage}`);
    }
    console.log(`  applied=${promoteResult.Output.applied} status=${promoteResult.Output.status}${promoteResult.Output.refusal ? ` refusal=${promoteResult.Output.refusal.kind}` : ''}`);
    const reached = promoteResult.Output.status;
    if (!promoteResult.Output.applied || (reached !== 'Validated' && reached !== 'KeepBaseline')) {
      throw new Error(`Evaluation left ML Model ${shippedModelId} ${reached} (the lifecycle gate's answer: ${GateAnswer(promoteResult.Output.refusal)})`);
    }

    banner('LIFECYCLE COMPLETE');
    console.log(`  Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    banner('CLEANUP');
    cleanupFailures = ReportCleanup(await DeleteRecordedRows(route, user, records, algorithm));
  }
  process.exit(cleanupFailures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nLIFECYCLE ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
