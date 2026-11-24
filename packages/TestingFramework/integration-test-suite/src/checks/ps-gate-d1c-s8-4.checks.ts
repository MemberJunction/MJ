/**
 * Gate G6.3 "D1c → S8.4": the outcome-degradation trigger fires within 1 period of the period-3 shift, is logged on the
 * period row, and starts a challenger training run, 1 of 1.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TaskType } from '@memberjunction/predictive-studio-core';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const BINARY: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 };
const YEARS: PeriodCalendar = { Kind: 'year', BaseYear: 2019 };

export const PsGateD1cS84Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-d1c-s8-4.G6.3', Name: 'G6.3 D1c → S8.4: the trigger fires within 1 period of the shift, is logged and starts a challenger, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const d1c = await h.EnsureLoaded({ Kind: 'scenario', ID: 'D1c', Seed: UnitFixtures.ScenarioBaseSeed('D1c') });
      const model = await MonitoringFixture.PublishOnPeriods(h, d1c, [0, 1, 2], { Scenario: 'D1c', Task: BINARY, Calendar: YEARS });
      const periods = await MonitoringFixture.RunPeriods(h, model, [3, 4]);
      const fired = periods.find((p) => p.TriggersFired.includes('outcome-degradation'));
      PsGate.Assert({
        Passed: fired !== undefined && fired.ChallengerRunID !== null,
        Measured: { firedAtPeriod: fired ? fired.Index : null, challengerRunId: fired ? fired.ChallengerRunID : null, challengerOutcome: fired ? fired.ChallengerOutcome : null },
        Detail: fired ? `fired at period ${fired.Index}, challenger ${fired.ChallengerRunID || 'not started'}` : 'the trigger did not fire within 1 period of the shift',
      });
    },
  },
];

for (const c of PsGateD1cS84Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-d1c-s8-4', PsGate.Lifecycle);
