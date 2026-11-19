/**
 * Gate G6.4 "T4 → S8.4": T4's trigger fires 0 times. A model trained on the first 228 months of the no-shift AR(1)
 * series (φ 0.9) is monitored over the 12 months after them; the protocol's serially aware interval keeps the reference
 * band honest, so no period's degradation lower bound clears the margin.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TaskType } from '@memberjunction/predictive-studio-core';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const CONTINUOUS: TaskType = { kind: 'continuous' };
const MONTHS: PeriodCalendar = { Kind: 'month', BaseYear: 2005 };

export const PsGateT4S84Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t4-s8-4.G6.4', Name: 'G6.4 T4 → S8.4: the outcome-degradation trigger fires 0 times over 12 no-shift months', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const t4 = await h.EnsureLoaded({ Kind: 'scenario', ID: 'T4', Seed: UnitFixtures.ScenarioBaseSeed('T4') });
      const model = await MonitoringFixture.PublishOnPeriods(h, t4, Array.from({ length: 228 }, (_, i) => i), { Scenario: 'T4', Task: CONTINUOUS, Calendar: MONTHS });
      const periods = await MonitoringFixture.RunPeriods(h, model, Array.from({ length: 12 }, (_, i) => 228 + i));
      const fires = periods.filter((p) => p.TriggersFired.length > 0).length;
      PsGate.Assert({
        Passed: fires === 0 && periods.every((p) => p.State === 'evaluated'),
        Measured: { fires, evaluated: periods.filter((p) => p.State === 'evaluated').length, periods: periods.length },
        Detail: `${fires} fires over ${periods.length} monitored months (expected 0)`,
      });
    },
  },
];

for (const c of PsGateT4S84Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t4-s8-4', PsGate.Lifecycle);
