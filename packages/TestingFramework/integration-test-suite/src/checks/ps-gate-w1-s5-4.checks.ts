/**
 * Gate G0.10 "W1 → S5.4": two trainings each of logistic regression, xgboost, lightgbm and random forest on W1-signal
 * s42 reproduce, 4 of 4: the second training of each pipeline runs on the same snapshot, seed and code version as the
 * first, and EVERY candidate the run trains reproduces — each returned artifact (the algorithm's finalist and every
 * fitted simple baseline) by SHA-256, each inner-CV candidate by its inner score within 1e-9 (OF4-53,
 * `TrainingReproduction`). What this proves: the validation split is seeded (an unseeded split changes every
 * candidate's training rows) and the estimators are seeded (random forest bootstraps, so its finalist artifact moves
 * when the estimator seed is dropped). Comparing only the delivered model would not: when the gate ships a simple
 * baseline, every algorithm's run delivers the same baseline. Nothing is published, so the second training has no
 * incumbent. The trainings run on the sidecar the gate run points at; the truth-suite sidecar (`pnpm run
 * truth:sidecar`) pins OMP_NUM_THREADS=1, and the thread count the trainer reports is part of the compared code version.
 */
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJMLTrainingPipelineEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { TrainingRunResultsParser } from '@memberjunction/predictive-studio-core';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';
import { TrainingReproduction, type TrainingFingerprint } from './ps-gates/ps-gate-reproduction';

/** The algorithms G0.10 trains twice: the three without sampling, and random forest, the one default that bootstraps. */
const DETERMINISM_ALGORITHMS = ['logistic_regression', 'xgboost', 'lightgbm', 'random_forest'] as const;

/** The training-run columns one fingerprint reads. */
type ReproductionRun = Pick<MJMLTrainingRunEntity, 'ID' | 'TrainingSnapshotID' | 'Status' | 'ValidationResults' | 'Notes'>;

/** One training of a G0.10 pipeline, read back from its stored run. */
class DeterminismSteps {
  /** Train `p` once and fingerprint the run it stored: every returned artifact and inner-CV candidate. */
  public static async TrainAndFingerprint(h: TruthHarness, p: MJMLTrainingPipelineEntity, label: string): Promise<TrainingFingerprint> {
    const t = await h.Train(p); // every unit row: a unit pipeline refuses a row cap
    if (!t.Ok || !t.TrainingRunID) throw new Error(`${label} failed: ${t.ErrorMessage}`);
    const run = await DeterminismSteps.readRun(h, t.TrainingRunID, label);
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    if (!parsed.Ok) throw new Error(`${label}: run ${run.ID} results do not parse: ${parsed.Errors.join('; ')}`);
    if (parsed.Value.status !== 'completed' || parsed.Value.trainer === null) {
      throw new Error(`${label}: run ${run.ID} (${run.Status}) stored no trainer result: ${(run.Notes || '').slice(0, 400)}`);
    }
    return TrainingReproduction.FingerprintOf(run, parsed.Value.trainer);
  }

  private static async readRun(h: TruthHarness, runId: string, label: string): Promise<ReproductionRun> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<ReproductionRun>({
      EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`,
      Fields: ['ID', 'TrainingSnapshotID', 'Status', 'ValidationResults', 'Notes'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    if (!r.Success || !r.Results[0]) throw new Error(`${label}: training run ${runId} could not be read: ${r.ErrorMessage}`);
    return r.Results[0];
  }
}

export const PsGateW1S54Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s5-4.G0.10', Name: 'G0.10 W1 → S5.4: every candidate of two trainings reproduces (artifact SHA-256, inner score within 1e-9), 4 of 4 algorithms', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const out: Record<string, number | string | boolean | null> = {};
      let reproduced = 0;
      for (const algorithm of DETERMINISM_ALGORITHMS) {
        const p = await h.CreatePipeline(PsGateSpecs.W(h, `G0.10 W1 ${algorithm}`, w1, { Algorithm: algorithm }));
        const first = await DeterminismSteps.TrainAndFingerprint(h, p, `${algorithm} training 1`);
        const second = await DeterminismSteps.TrainAndFingerprint(h, p, `${algorithm} training 2`);
        const c = TrainingReproduction.Compare(first, second);
        out[`${algorithm}Candidates`] = c.CandidatesCompared;
        out[`${algorithm}Differing`] = c.Differing.join(', ') || 'none';
        out[`${algorithm}Detail`] = c.Detail;
        if (c.Reproduced) reproduced += 1;
      }
      PsGate.Assert({ Passed: reproduced === DETERMINISM_ALGORITHMS.length, Measured: out, Detail: `${reproduced} of ${DETERMINISM_ALGORITHMS.length} algorithms reproduce every candidate (artifact SHA-256, inner score within 1e-9)` });
    },
  },
];

for (const c of PsGateW1S54Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s5-4', PsGate.Lifecycle);
