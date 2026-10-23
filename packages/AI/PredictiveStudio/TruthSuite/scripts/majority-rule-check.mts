/**
 * Runtime check of the majority-baseline rule: trains the W1-signal s42 logistic model once per rule
 * through MJAPI (the Train operation, as a browser does) and prints what the stored model says. `pnpm run truth:majority-rule`.
 */
import { EvaluationLineage } from '@memberjunction/predictive-studio-core';
import { RunFixtures } from '../src/harness/run-fixtures';
import { W_WORLD_FEATURES, W_WORLD_DENY_FIELDS } from '../src/harness/w-world';
import type { PipelineSpec } from '../src/harness/types';

async function main(): Promise<void> {
  const h = await RunFixtures.GetRunHarness();
  const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
  for (const rule of EvaluationLineage.MajorityBaselineRules) {
    const spec: PipelineSpec = {
      Name: `PSTruth: majority-rule ${rule} ${h.RunID}`, Dataset: w1, Target: 'Renewed', ProblemType: 'classification',
      Features: [...W_WORLD_FEATURES], Algorithm: 'logistic_regression', AsOf: { Mode: 'none' }, DenyFields: [...W_WORLD_DENY_FIELDS],
      // the containment gates' spec() validation, plus the rule under test
      Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2, MajorityBaselineRule: rule },
    };
    const attempt = await h.Train(await h.CreatePipeline(spec), { MaxRows: 1000000 });
    if (!attempt.ModelID) throw new Error(`training failed under '${rule}': ${attempt.ErrorMessage || 'no message'}`);
    const m = await h.ReadModel(attempt.ModelID);
    console.log(JSON.stringify({
      rule, recorded: EvaluationLineage.Read(m.LineageJSON)?.MajorityBaselineRule || null,
      auc: m.HoldoutMetrics['auc'] ?? null,   // `??` on purpose: an AUC of 0 is a legitimate value
      grade: m.Trust.grade, canAct: m.Trust.canAct, majorityBaseline: m.Trust.MajorityBaseline || null,
    }));
  }
}

try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(1);
}
