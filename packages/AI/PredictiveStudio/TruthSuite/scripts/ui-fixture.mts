/**
 * UI fixture: two W1-signal s42 models the UI check opens — a coefficient model (logistic regression)
 * and a split-importance model — each promoted Draft → Validated → Published through the product's promote operation
 * and scored through the record process, so the Predictions catalog lists them with predictions. Writes
 * $TRUTH_RESULTS_DIR/artifacts/ui-fixture.json and prints its path. `pnpm run truth:ui-fixture`.
 */
import { RunFixtures } from '../src/harness/run-fixtures';
import { W_WORLD_FEATURES, W_WORLD_DENY_FIELDS } from '../src/harness/w-world';
import type { AlgorithmKey, LoadedDataset, PipelineSpec, TruthHarness } from '../src/harness/types';

/** Split / impurity importance models, tried in this order; the first that publishes is the fixture's tree model. */
const TREE_ALGORITHMS: ReadonlyArray<AlgorithmKey> = ['lightgbm', 'xgboost', 'random_forest'];

interface UIFixtureModel { algorithm: AlgorithmKey; pipelineName: string; modelId: string; grade: string; canAct: boolean }

/** A Published, record-process-scored model, or the reason it could not be made. */
async function publishedScoredModel(h: TruthHarness, w1: LoadedDataset, algorithm: AlgorithmKey): Promise<UIFixtureModel | string> {
  const pipelineName = `PSTruth: UI W1 ${algorithm} ${h.RunID}`;
  const spec: PipelineSpec = {
    Name: pipelineName, Dataset: w1, Target: 'Renewed', ProblemType: 'classification', Features: [...W_WORLD_FEATURES], Algorithm: algorithm,
    AsOf: { Mode: 'none' }, Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'warn' }, DenyFields: [...W_WORLD_DENY_FIELDS],
  };
  const trained = await h.Train(await h.CreatePipeline(spec), { MaxRows: 1000000 });
  if (!trained.ModelID) return `${algorithm}: training failed: ${trained.ErrorMessage || 'no message'}`;
  for (const target of ['Validated', 'Published'] as const) {
    const promoted = await h.Promote(trained.ModelID, target, `truth suite UI fixture: ${target}`);
    if (!promoted.Promoted) return `${algorithm}: promote to ${target} refused (status ${promoted.Status})`;
  }
  const run = await h.ScoreViaRecordProcess(trained.ModelID, w1, "Region = 'NA' AND [Year] = 2024");
  if (run.Status !== 'Completed') return `${algorithm}: record-process scoring ended ${run.Status}`;
  const m = await h.ReadModel(trained.ModelID);
  return { algorithm, pipelineName, modelId: trained.ModelID, grade: m.Trust.grade, canAct: m.Trust.canAct };
}

async function main(): Promise<void> {
  const h = await RunFixtures.GetRunHarness();
  const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
  const coefficient = await publishedScoredModel(h, w1, 'logistic_regression');
  if (typeof coefficient === 'string') throw new Error(coefficient);
  if (!coefficient.canAct) {
    throw new Error(`coefficient model ${coefficient.modelId} is not actionable (grade=${coefficient.grade}, canAct=false)`);
  }
  const treeRefusals: string[] = [];
  let tree: UIFixtureModel | null = null;
  for (const algorithm of TREE_ALGORITHMS) {
    const attempt = await publishedScoredModel(h, w1, algorithm);
    if (typeof attempt !== 'string') { tree = attempt; break; }
    treeRefusals.push(attempt);
  }
  if (!tree) throw new Error(`no split-importance model could be published: ${treeRefusals.join('; ')}`);
  console.log(await h.WriteArtifact('ui-fixture', { coefficient, tree, treeRefusals }));
}

try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(1);
}
