/**
 * Gate G6.12 "R1 → S7.6": parity on scored R1 rows raises 1 alert with one planted 1e-6 skew and 0 without. The R1
 * model is published, bound and scores 200 rows as of its decision date; monitoring's parity recomputes a sample of the
 * stored rows at tolerance 1e-9 (re-sampled once). Then every stored score is moved by 1e-6 and the period is re-run.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { RunView } from '@memberjunction/core';
import type { MJFeatureValueEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { HarnessScoring, UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGateRegistry } from './ps-gates/ps-gate-registry';
import { ScoringGateSteps } from './ps-gates/ps-gate-scoring';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type MonitoredGateModel, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

/** R1's fixed decision date (its unit decides every row on 2020-01-01). */
const DECISION = '2020-01-01T00:00:00.000Z';
const R1_MONTH: PeriodCalendar = { Kind: 'month', BaseYear: 2020 };

export const PsGateR1S76Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-r1-s7-6.G6.12', Name: 'G6.12 R1 → S7.6: parity raises 1 alert with a planted 1e-6 skew and 0 without', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const r1 = await h.EnsureLoaded({ Kind: 'scenario', ID: 'R1', Seed: UnitFixtures.ScenarioBaseSeed('R1') });
      const model = await PsGateRegistry.PublishedR1Model(h, 'G6.12', 0.25);
      const binding = await HarnessScoring.Binding(h, model, ScoringGateSteps.FeatureName(h, 'G6.12 parity'));
      const ids = await h.SampleRowIds(r1, 200, 42);
      const scored = await h.Score(model, { bindingId: binding, scope: { records: ids }, asOfDate: DECISION });
      if (!scored.Ok) throw new Error(`G6.12: scoring failed: ${scored.ErrorMessage || 'no message'}`);
      const monitored: MonitoredGateModel = { ModelID: model, PipelineID: await MonitoringFixture.PipelineOf(h, model), BindingID: binding, Dataset: r1, Calendar: R1_MONTH, Arriving: false };
      const [clean] = await MonitoringFixture.RunPeriods(h, monitored, [0]);
      const rows = await RunView.FromMetadataProvider(h.Provider).RunView<MJFeatureValueEntity>({ EntityName: 'MJ: Feature Values', ExtraFilter: `MLModelScoringBindingID='${EscapeSQLString(binding)}' AND Source='Model'`, ResultType: 'entity_object', IgnoreMaxRows: true, BypassCache: true }, h.User);
      if (!rows.Success) throw new Error(`G6.12: reading the binding's stored scores failed: ${rows.ErrorMessage}`);
      let planted = 0;
      for (const row of rows.Results) {
        if (row.ValueNumeric === null) throw new Error(`G6.12: stored score ${row.ID} has no ValueNumeric to skew`);
        row.ValueNumeric = row.ValueNumeric + 1e-6;
        if (!(await row.Save())) throw new Error(`G6.12: planting the skew on stored score ${row.ID} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
        planted++;
      }
      const [skewed] = await MonitoringFixture.RunPeriods(h, monitored, [0]);
      const alerts = [clean, skewed].map((p) => (p.ParityPassed === false ? 1 : 0));
      PsGate.Assert({
        Passed: alerts[0] === 0 && alerts[1] === 1 && planted > 0 && planted === rows.Results.length,
        Measured: { alertsWithout: alerts[0], alertsWith: alerts[1], planted, cleanMax: clean.ParityMaxAbsDifference, skewedMax: skewed.ParityMaxAbsDifference },
        Detail: `${alerts[0]} alert without the skew, ${alerts[1]} with a planted 1e-6 skew on ${planted} stored scores`,
      });
    },
  },
];

for (const c of PsGateR1S76Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-r1-s7-6', PsGate.Lifecycle);
