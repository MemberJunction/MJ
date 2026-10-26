/**
 * Gate G0.10 "W1 → S5.4": two trainings each of logistic regression, xgboost, lightgbm and random forest on W1-signal
 * s42 give predictions equal within 1e-9, 4 of 4. What this proves: the validation split is seeded (an unseeded split
 * changes the training rows of every algorithm), and the estimators are seeded (random forest bootstraps, so it is the
 * algorithm whose predictions move when the estimator seed is dropped; the other three run without sampling on their
 * sidecar defaults). The trainings run on the sidecar the gate run points at; the truth-suite sidecar
 * (`pnpm run truth:sidecar`) pins OMP_NUM_THREADS=1. The thread count is the sidecar process's setting, which this test
 * process cannot read, so it is not reported as a measured value.
 */
import { IndexByUUID } from '@memberjunction/global';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { HarnessDatasets, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The algorithms G0.10 trains twice: the three without sampling, and random forest, the one default that bootstraps. */
const DETERMINISM_ALGORITHMS = ['logistic_regression', 'xgboost', 'lightgbm', 'random_forest'] as const;

/** The training and scoring of one G0.10 repetition. */
class DeterminismSteps {
  /** Train the pipeline, promote the model to Validated (Draft models are refused for scoring) and score `records`. */
  public static async TrainAndScore(h: TruthHarness, p: MJMLTrainingPipelineEntity, records: string[], label: string): Promise<number[]> {
    const t = await h.Train(p, { MaxRows: 1_000_000 });
    if (!t.ModelID) throw new Error(`${label} failed: ${t.ErrorMessage}`);
    // The promote is the product's promote operation.
    const promoted = await h.Promote(t.ModelID, 'Validated', 'truth suite fixture: promote (G0.10)');
    if (!promoted.Promoted) throw new Error(`${label}: could not promote model ${t.ModelID} to Validated (${promoted.Status})`);
    const s = await h.Score(t.ModelID, { scope: { records } });
    if (!s.Ok || s.Predictions.length !== records.length) {
      throw new Error(`${label}: scored ${s.Predictions.length} of ${records.length}`);
    }
    // One index per scoring (O(n) instead of a scan per record); a UUIDMap because SQL Server and the sidecar may spell
    // the same id in different case.
    const byId = IndexByUUID(s.Predictions, (x) => x.RecordID);
    return records.map((id) => byId.Get(id)?.Score ?? Number.NaN); // `??`: a score of 0 is legitimate
  }
}

export const PsGateW1S54Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s5-4.G0.10', Name: 'G0.10 W1 → S5.4: two trainings reproduce predictions within 1e-9, 4 of 4 algorithms', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const records = HarnessDatasets.FirstRowIDs(w1, 500);
      const out: Record<string, number | string | boolean | null> = {};
      let equal = 0;
      for (const algorithm of DETERMINISM_ALGORITHMS) {
        const p = await h.CreatePipeline(PsGateSpecs.W(h, `G0.10 W1 ${algorithm}`, w1, { Algorithm: algorithm }));
        const first = await DeterminismSteps.TrainAndScore(h, p, records, `${algorithm} training 1`);
        const second = await DeterminismSteps.TrainAndScore(h, p, records, `${algorithm} training 2`);
        const maxDiff = Math.max(...first.map((v, i) => Math.abs(v - (second[i] ?? Number.NaN))));
        out[`${algorithm}MaxDiff`] = maxDiff;
        if (maxDiff <= 1e-9) equal += 1;
      }
      PsGate.Assert({ Passed: equal === DETERMINISM_ALGORITHMS.length, Measured: out, Detail: `${equal} of ${DETERMINISM_ALGORITHMS.length} algorithms reproduce predictions within 1e-9` });
    },
  },
];

for (const c of PsGateW1S54Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s5-4', PsGate.Lifecycle);
