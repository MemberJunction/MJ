/**
 * Gate G6.5 "W6 → S8.4": the model trained on the ≤ 2023 W6-drift s42 renewal rows flags retrain once the 2024+
 * outcomes arrive, 1 of 1: monitoring reads the world's realised renewals (not a row-count proxy) and the 2024 regime
 * shift degrades the primary score past the margin.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { RunFixtures, UnitFixtures, W_WORLD_FEATURES } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const MONTHS_2024: PeriodCalendar = { Kind: 'month', BaseYear: 2024 };

export const PsGateW6S84Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w6-s8-4.G6.5', Name: 'G6.5 W6 → S8.4: the ≤ 2023 model flags retrain once 2024+ outcomes arrive, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      await h.EnsureLoaded({ Kind: 'world', ID: 'W6-drift', Seed: 42 });
      const { Pipeline: pipeline } = await UnitFixtures.ProvisionMonitoredWorldPipeline(h, 'W6-drift', W_WORLD_FEATURES, '2024-01-01', [MonitoringFixture.DEGRADATION]);
      const trained = await h.Train(pipeline);
      if (!trained.ModelID) throw new Error(`G6.5: training failed (${trained.RefusalCode || 'no refusal code'}): ${trained.ErrorMessage || 'no model'}`);
      await RunFixtures.PublishModel(h, trained.ModelID, 'G6.5');
      const dataset = await h.EnsureLoaded({ Kind: 'world', ID: 'W6-drift', Seed: 42 });
      const periods = await MonitoringFixture.RunPeriods(h, { ModelID: trained.ModelID, PipelineID: pipeline.ID, BindingID: null, Dataset: dataset, Calendar: MONTHS_2024, Arriving: false }, Array.from({ length: 24 }, (_, i) => i));
      const flagged = periods.filter((p) => p.TriggersFired.includes('outcome-degradation'));
      PsGate.Assert({
        Passed: flagged.length > 0,
        Measured: { flaggedPeriods: flagged.map((p) => p.Start).join(' '), evaluated: periods.filter((p) => p.State === 'evaluated').length },
        Detail: flagged.length > 0 ? `retrain flagged at ${flagged[0].Start}` : 'no 2024+ period flagged a retrain (0 of 1)',
      });
    },
  },
];

for (const c of PsGateW6S84Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w6-s8-4', PsGate.Lifecycle);
