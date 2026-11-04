/**
 * ps-live-writeback-demo.ts — headless, CLIENT-SIDE demonstration of the FULL Predictive
 * Studio WRITE-BACK data loop against an ALREADY-RUNNING MJAPI (http://localhost:4000),
 * driven entirely over GraphQL via the same GraphQLDataProvider a browser uses.
 *
 * Where the renewal/multimodel lifecycle scripts SCORE ephemerally (dryRun:true, predictions
 * returned in the response only), THIS script proves the closed loop: a model's predictions
 * are WRITTEN BACK into real entity columns and then READ BACK from those columns.
 *
 *   entity fields  →  PredictiveStudio.TrainModel    (MJAPI → TrainingEngine → sidecar /train)
 *                  →  PredictiveStudio.ScoreRecordSet (MJAPI → MLModelInferenceProcessor → /predict)
 *                         with writeBack OutputMapping → predictions persisted to columns
 *                  →  RunView the same rows           (the predictions now live in the columns)
 *
 * The write-back uses the Record-Set-Processing OutputMapping format: a JSONPath-per-field map
 * from the prediction payload (which exposes `class` and `score`) onto entity field names:
 *
 *   writeBack: { OutputMapping: { fields: { PredictedRenewalClass: '$.class', RenewalScore: '$.score' } } }
 *
 * The two THROWAWAY target columns were codegen'd onto the AssociationDemo `Memberships`
 * entity (vwMemberships / Membership table):
 *   - PredictedRenewalClass  NVARCHAR(50)   ← receives the predicted class string
 *   - RenewalScore           FLOAT          ← receives the numeric model output
 *
 * Nothing about the ML is mocked. The ops are invoked exactly as any caller would:
 *   `await new SomeOperation().Execute(input, { provider, user })` — the call marshals over
 *   GraphQL to MJAPI, which dispatches to the registered server operation.
 *
 * THROWAWAY: it reuses (or creates) the driver's ML Algorithm row, creates an ML Training
 * Pipeline bound to version 1 of its Prediction Unit and Evaluation Protocol through the
 * harness's pipeline migration (`lib/ps-rig-lifecycle.ts`, every row saved over GraphQL), trains,
 * publishes, scores WITH write-back and reads the columns back. It then deletes every row it
 * created through the harness cleanup, children first, every Delete() checked — a row it cannot
 * delete fails the rig: the scoring Action that publishing generated with its params, the model,
 * its training run(s), Training Snapshot and stored files, the pipeline, unit and protocol, and the
 * algorithm when it created it. The written-back column
 * VALUES intentionally remain on the Membership rows (that's the whole point) — this script
 * prints them, then NULLs them out at the very end so the demo is repeatable.
 *
 * AUTH: system API key from MJ_API_KEY (x-mj-api-key) via the shared harness — no secrets here.
 *
 * PREREQUISITES:
 *   - MJAPI up on :4000, built WITH:
 *       • the Predictive Studio server-bootstrap fix (ops registered),
 *       • model files stored through `PS_STORAGE_PROVIDER` (default "Local File System", rooted at STORAGE_LOCAL_ROOT),
 *       • the score-loader fix (model artifact loads for scoring),
 *       • the write-back runner fix (OutputMapping persists predictions to columns).
 *   - The Python sidecar reachable by MJAPI (managed child-process default is fine).
 *   - AssociationDemo data loaded (Memberships populated).
 *   - The two prediction columns codegen'd onto Memberships: PredictedRenewalClass, RenewalScore.
 *   - MJ_API_KEY set in the environment (or .env resolved by the harness).
 *
 * USAGE (from the repo root, with MJAPI already up on :4000 and its Python sidecar reachable):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-live-writeback-demo.ts
 */
import { RunRecords } from '@memberjunction/predictive-studio-truth-suite';
import { LoadEnv, LoadClientConfig } from './lib/harness';
import { RequireCheck, ShippedModelID } from './lib/ps-train-output';
import { PromoteToPublished } from './lib/ps-promote';
import { BindUnitAndProtocol, DeleteRecordedRows, EnsureDriverAlgorithm, ReportCleanup, type RigAlgorithm } from './lib/ps-rig-lifecycle';
import { Metadata, RunView, UserInfo, BaseEntity, IMetadataProvider, CompositeKey } from '@memberjunction/core';
import { GraphQLProviderConfigData, setupGraphQLClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import '@memberjunction/core-entities';
import {
  MJMLTrainingPipelineEntity,
  PredictiveStudioTrainModelOperation,
  PredictiveStudioScoreRecordSetOperation,
} from '@memberjunction/core-entities';

const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-live-writeback-demo (safe to delete)';
/** How many Membership rows to score + write back + read back. */
const ROW_COUNT = 10;
/** The two throwaway prediction columns on the Memberships entity. */
const CLASS_COLUMN = 'PredictedRenewalClass';
const SCORE_COLUMN = 'RenewalScore';

/** The exact ExtraFilter used for BOTH the score scope and the read-back — same rows. */
const ROW_FILTER = '';

/** Shape of the rows we read back from the prediction columns (no `any`, no entity overhead). */
interface MembershipReadback {
  ID: string;
  Status: string;
  PredictedRenewalClass: string | null;
  RenewalScore: number | null;
}

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
  p.Description = 'Member renewal classifier on AssociationDemo Memberships (Status) — write-back demo.';
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

/** Read the prediction columns back off the same rows we scored, so we can prove they persisted. */
async function readBackPredictions(user: UserInfo): Promise<MembershipReadback[]> {
  const rv = new RunView();
  const result = await rv.RunView<MembershipReadback>(
    {
      EntityName: 'Memberships',
      Fields: ['ID', 'Status', CLASS_COLUMN, SCORE_COLUMN],
      ExtraFilter: ROW_FILTER,
      MaxRows: ROW_COUNT,
      ResultType: 'simple',
      BypassCache: true, // bypass server cache so we read true DB state after the write-back
    },
    user,
  );
  if (!result.Success) {
    throw new Error(`Read-back RunView failed: ${result.ErrorMessage}`);
  }
  return result.Results ?? [];
}

/** Print the read-back rows as a table: ID · actual Status · PredictedRenewalClass · RenewalScore. */
function printReadbackTable(rows: MembershipReadback[]): void {
  const pad = (v: string, n: number): string => (v.length > n ? `${v.slice(0, n - 1)}…` : v.padEnd(n));
  console.log(`  ${pad('ID', 38)} ${pad('Status', 14)} ${pad(CLASS_COLUMN, 24)} ${pad('RenewalScore', 14)}`);
  console.log(`  ${'-'.repeat(38)} ${'-'.repeat(14)} ${'-'.repeat(24)} ${'-'.repeat(14)}`);
  for (const r of rows) {
    const cls = r.PredictedRenewalClass ?? '(null)';
    const score = r.RenewalScore == null ? '(null)' : r.RenewalScore.toFixed(4);
    console.log(`  ${pad(r.ID, 38)} ${pad(r.Status ?? '', 14)} ${pad(cls, 24)} ${pad(score, 14)}`);
  }
}

/**
 * NULL out the prediction columns we wrote so the demo is repeatable. Best-effort, per row —
 * a failure to clear one row is logged but never aborts the rest.
 */
async function clearWrittenColumns(md: Metadata, user: UserInfo, rows: MembershipReadback[]): Promise<void> {
  let cleared = 0;
  for (const r of rows) {
    if (r.PredictedRenewalClass == null && r.RenewalScore == null) {
      continue; // nothing was written to this row
    }
    try {
      // NOTE: the strongly-typed AssociationDemoMembershipEntity (with typed
      // PredictedRenewalClass / RenewalScore setters) lives in `mj_generatedentities`,
      // which is NOT a dependency of MJServer and is intentionally not imported by these
      // throwaway client-side scripts (they stay on @memberjunction/core-entities +
      // BaseEntity, matching ps-live-renewal/multimodel-lifecycle). Clearing two columns to
      // null on a generic handle is the established cleanup idiom in this script suite.
      const m = await md.GetEntityObject<BaseEntity>('Memberships', user);
      if (!(await m.InnerLoad(CompositeKey.FromID(r.ID)))) {
        continue;
      }
      m.Set(CLASS_COLUMN, null);
      m.Set(SCORE_COLUMN, null);
      if (await m.Save()) {
        cleared++;
      } else {
        console.log(`    FAILED to clear Membership ${r.ID} — ${m.LatestResult?.CompleteMessage}`);
      }
    } catch (e) {
      console.log(`    skip clear Membership ${r.ID}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`  cleared prediction columns on ${cleared}/${rows.length} rows`);
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const { md, route, user } = await connect();

  const records = new RunRecords();
  let algorithm: RigAlgorithm | undefined;
  let cleanupFailures = 0;
  // Rows we read back — captured so cleanup can NULL out whatever the write-back persisted,
  // even if a later step threw.
  let readbackRows: MembershipReadback[] = [];

  try {
    // ── 1. Resolve entities + algorithm ──────────────────────────────────────
    banner('1. RESOLVE ENTITIES + ALGORITHM');
    const membership = md.EntityByName('Memberships');
    console.log(`  Memberships entity: ${membership?.Name} (${membership?.ID})`);
    if (!membership) {
      // Honor the suite's skip contract (see run-all.ts): missing AssociationDemo is an
      // environment condition, not a failure — mirror the sibling ps-live scripts.
      console.log('  SKIP: Memberships entity not found — is AssociationDemo loaded? (exiting 0)');
      process.exit(0);
    }
    // Sanity-check the throwaway prediction columns exist on the entity metadata.
    const hasClassCol = membership.Fields.some((f) => f.Name === CLASS_COLUMN);
    const hasScoreCol = membership.Fields.some((f) => f.Name === SCORE_COLUMN);
    console.log(`  Prediction columns: ${CLASS_COLUMN}=${hasClassCol ? 'present' : 'MISSING'}, ${SCORE_COLUMN}=${hasScoreCol ? 'present' : 'MISSING'}`);
    if (!hasClassCol || !hasScoreCol) {
      throw new Error(`Prediction columns missing on Memberships — codegen the ${CLASS_COLUMN} / ${SCORE_COLUMN} columns first.`);
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
    banner('3. TRAIN (PredictiveStudio.TrainModel)');
    const trainStart = Date.now();
    const trainResult = await new PredictiveStudioTrainModelOperation().Execute(
      { pipelineId: pipeline.ID, sidecarVersion: 'ps-live-writeback-demo' },
      { provider: route, user },
    );
    console.log(`  Execute() Success=${trainResult.Success}${trainResult.ErrorMessage ? ` Error=${trainResult.ErrorMessage}` : ''} (${Date.now() - trainStart}ms)`);
    if (!trainResult.Success || !trainResult.Output) {
      throw new Error(`Training failed: ${trainResult.ErrorMessage}`);
    }
    const out = trainResult.Output;
    const shippedModelId = ShippedModelID(out, 'publish and score with write-back', RequireCheck);
    if (shippedModelId === null) throw new Error(`Training shipped no model to publish and score with write-back: ${out.gateOutcome ?? 'no gate decision'}.`);
    records.RecordModel(shippedModelId);
    console.log(`  modelId       = ${shippedModelId}`);
    console.log(`  trainingRunId = ${out.trainingRunId}`);
    console.log(`  version       = ${out.version}`);
    console.log(`  status        = ${out.status}`);
    console.log(`  leakageFlagged= ${out.leakageFlagged}`);
    console.log(`  holdoutMetrics= ${out.holdoutMetrics ?? '(none)'}`);
    // Scoring refuses a Draft model (MODEL_NOT_SCORABLE), so promote it to Published first.
    console.log(`  promoted      → ${await PromoteToPublished(route, user, shippedModelId, TAG)}`);

    // ── 4. Score WITH write-back (NOT dryRun) ────────────────────────────────
    // The OutputMapping maps the prediction payload's `class` / `score` onto the two
    // entity columns. The Record-Set-Processing runner persists them to the Membership rows.
    banner('4. SCORE WITH WRITE-BACK (PredictiveStudio.ScoreRecordSet)');
    const scoreStart = Date.now();
    const scoreResult = await new PredictiveStudioScoreRecordSetOperation().Execute(
      {
        modelId: shippedModelId,
        scope: { filter: { entityName: 'Memberships', extraFilter: ROW_FILTER, maxRows: ROW_COUNT } },
        dryRun: false,
        writeBack: {
          OutputMapping: {
            fields: {
              [CLASS_COLUMN]: '$.class',
              [SCORE_COLUMN]: '$.score',
            },
          },
        },
      },
      { provider: route, user },
    );
    console.log(`  Execute() Success=${scoreResult.Success}${scoreResult.ErrorMessage ? ` Error=${scoreResult.ErrorMessage}` : ''} (${Date.now() - scoreStart}ms)`);
    if (!scoreResult.Success || !scoreResult.Output) {
      throw new Error(`Scoring (write-back) failed: ${scoreResult.ErrorMessage}`);
    }
    const s = scoreResult.Output;
    console.log(`  scored=${s.scored} failed=${s.failed} skipped=${s.skipped} wroteBack=${s.wroteBack}`);
    if (!s.wroteBack) {
      console.log('  WARNING: wroteBack=false — the runner did not persist predictions (check the write-back runner fix).');
    }

    // ── 5. Read the values back off the entity columns ───────────────────────
    banner('5. READ BACK (RunView Memberships — prediction columns)');
    readbackRows = await readBackPredictions(user);
    console.log(`  Read ${readbackRows.length} rows back. The model's predictions now live in entity columns:`);
    printReadbackTable(readbackRows);
    const writtenCount = readbackRows.filter((r) => r.PredictedRenewalClass != null || r.RenewalScore != null).length;
    console.log(`\n  ${writtenCount}/${readbackRows.length} rows carry a written-back prediction.`);

    banner('WRITE-BACK LOOP COMPLETE');
    console.log(`  Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`  NOTE: the written-back column VALUES persisted to the Membership rows (that's the point).`);
    console.log(`  The cleanup step below NULLs them out again so this demo is repeatable.`);
  } finally {
    // Repeatability: clear the written-back columns (printed above) before deleting the model/pipeline.
    banner('CLEAR WRITTEN-BACK COLUMNS (repeatability)');
    if (readbackRows.length > 0) {
      await clearWrittenColumns(md, user, readbackRows);
    } else {
      console.log('  (no read-back rows captured — nothing to clear)');
    }
    banner('CLEANUP');
    cleanupFailures = ReportCleanup(await DeleteRecordedRows(route, user, records, algorithm));
  }
  process.exit(cleanupFailures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nWRITE-BACK DEMO ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
