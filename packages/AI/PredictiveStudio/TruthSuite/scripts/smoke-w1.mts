import { RunFixtures } from '../src/harness/run-fixtures';
import { W_WORLD_DENY_FIELDS, W_WORLD_FEATURES } from '../src/harness/w-world';

const h = await RunFixtures.GetRunHarness();
const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
const p = await h.CreatePipeline({
  Name: `PSTruth: smoke W1 s42 ${h.RunID}`,
  Dataset: w1,
  Target: 'Renewed',
  ProblemType: 'classification',
  Features: [...W_WORLD_FEATURES],
  Algorithm: 'logistic_regression',
  AsOf: { Mode: 'none' },
  Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
  DenyFields: [...W_WORLD_DENY_FIELDS],
});
const t = await h.Train(p, { MaxRows: 1_000_000 });
if (!t.Ok || !t.ModelID) {
  throw new Error(`smoke training failed: ${t.ErrorMessage || 'no modelId'}`);
}
const m = await h.ReadModel(t.ModelID);
const auc = m.HoldoutMetrics['auc'] ?? m.HoldoutMetrics['roc_auc'] ?? null;
const rp = await h.ScoreViaRecordProcess(m.ModelID, w1, "[Year] = 2024 AND Region = 'NA'");
const succeeded = rp.Details.filter((d) => d.Status === 'Succeeded').length;
console.log(`train ${m.TrainingRowCount} / holdout ${m.HoldoutRowCount}`);
console.log(`holdout AUC ${auc}`);
console.log(`${succeeded} Succeeded (run status: ${rp.Status})`);
process.exit(0);
