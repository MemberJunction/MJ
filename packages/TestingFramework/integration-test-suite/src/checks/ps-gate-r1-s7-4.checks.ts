/**
 * Gate G5.3 "R1 → S7.4" (owner PR 4, phase 5): over 20 Score Record Set calls with a `BindingID` on the published R1
 * model, 20 of 20 create an `MJ: ML Scoring Runs` row, and 100% of the written scores carry model ID, artifact hash,
 * scoring-run ID and as-of date (FM-16; §4.1's single-join reading: every `Model` row of the 20 runs joins to its run and
 * model, the run's artifact hash equals the model's registered SHA-256, and `EffectiveAsOf` is the run's `AsOfDate`).
 * The calls score 20 disjoint slices of 25 seeded R1 rows through one test binding, one call after another.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { HarnessScoring, UnitFixtures, type ScoreAttempt } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateRegistry } from './ps-gates/ps-gate-registry';
import { ScoringGateSteps } from './ps-gates/ps-gate-scoring';
import { ScoringLineage } from './ps-gates/ps-gate-scoring-lineage';

/** Score Record Set calls the gate makes. */
const CALLS = 20;
/** R1 rows each call scores. */
const ROWS_PER_CALL = 25;

export const PsGateR1S74Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-r1-s7-4.G5.3', Name: 'G5.3 R1 → S7.4: 20 of 20 bound Score Record Set calls leave a scoring-run row, and 100% of the written scores join to their run and model with the artifact hash and as-of date', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const r1 = await h.EnsureLoaded({ Kind: 'scenario', ID: 'R1', Seed: UnitFixtures.ScenarioBaseSeed('R1') });
      const model = await PsGateRegistry.PublishedR1Model(h, 'G5.3', 0.25);
      const binding = await HarnessScoring.Binding(h, model, ScoringGateSteps.FeatureName(h, 'G5.3 delivery minutes'));
      const ids = await h.SampleRowIds(r1, CALLS * ROWS_PER_CALL, 42);
      const calls: ScoreAttempt[] = [];
      for (let i = 0; i < CALLS; i++) {
        calls.push(await h.Score(model, { bindingId: binding, scope: { records: ids.slice(i * ROWS_PER_CALL, (i + 1) * ROWS_PER_CALL) } }));
      }
      const runIds = calls.flatMap((c) => (c.ScoringRunID === null ? [] : [c.ScoringRunID]));
      const lineage = await ScoringLineage.Read(h, runIds);
      const complete = lineage.Rows.filter((r) => ScoringLineage.Complete(r)).length;
      const written = calls.reduce((sum, c) => sum + c.Written, 0);
      const firstGap = lineage.Rows.find((r) => !ScoringLineage.Complete(r));
      PsGate.Assert({
        Passed: calls.every((c) => c.Ok && c.ScoringRunID !== null) && lineage.Runs.length === CALLS && lineage.Rows.length === written && lineage.Rows.length > 0 && complete === lineage.Rows.length,
        Measured: {
          calls: CALLS, ok: calls.filter((c) => c.Ok).length, runRows: lineage.Runs.length, written, rows: lineage.Rows.length, complete,
          firstRefusal: calls.find((c) => !c.Ok)?.ErrorMessage?.slice(0, 200) || null, firstGap: firstGap === undefined ? null : ScoringLineage.Lacks(firstGap),
        },
        Detail: `${lineage.Runs.length} of ${CALLS} calls left an ML Scoring Runs row; ${complete} of ${lineage.Rows.length} written scores (calls report ${written}) join to their run and model with the artifact hash and as-of date`,
      });
    },
  },
];

for (const c of PsGateR1S74Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-r1-s7-4', PsGate.Lifecycle);
