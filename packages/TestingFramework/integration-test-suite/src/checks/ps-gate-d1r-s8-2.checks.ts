/**
 * Gate G6.2 "D1r → S8.2": a per-period RMSE row with 95% bounds for 100% of D1r's labelled periods, and every
 * post-shift RMSE above the pre-shift upper bound (the model's holdout RMSE upper bound, frozen in its publish record).
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TaskType } from '@memberjunction/predictive-studio-core';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const CONTINUOUS: TaskType = { kind: 'continuous' };
const YEARS: PeriodCalendar = { Kind: 'year', BaseYear: 2019 };

export const PsGateD1rS82Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-d1r-s8-2.G6.2', Name: 'G6.2 D1r → S8.2: per-period RMSE with 95% bounds for every labelled period; every post-shift RMSE above the pre-shift upper bound', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const d1r = await h.EnsureLoaded({ Kind: 'scenario', ID: 'D1r', Seed: UnitFixtures.ScenarioBaseSeed('D1r') });
      const model = await MonitoringFixture.PublishOnPeriods(h, d1r, [0, 1, 2], { Scenario: 'D1r', Task: CONTINUOUS, Calendar: YEARS, ScorePeriods: [3, 4, 5] });
      const periods = await MonitoringFixture.RunPeriods(h, model, [3, 4, 5]);
      const preUpper = await MonitoringFixture.ReferenceUpper(h, model.ModelID);
      const bounded = periods.filter((p) => p.PrimaryValue !== null && p.PrimaryLower !== null && p.PrimaryUpper !== null);
      const above = preUpper === null ? 0 : bounded.filter((p) => p.PrimaryValue !== null && p.PrimaryValue > preUpper).length;
      PsGate.Assert({
        Passed: periods.length === 3 && bounded.length === 3 && preUpper !== null && above === 3,
        Measured: { labelledPeriods: periods.length, withBounds: bounded.length, preShiftUpper: preUpper, aboveUpper: above, rmse: periods.map((p) => p.PrimaryValue).join(' ') },
        Detail: `${bounded.length} of ${periods.length} labelled periods carry RMSE with 95% bounds; ${above} post-shift RMSE above the pre-shift upper bound ${preUpper}`,
      });
    },
  },
];

for (const c of PsGateD1rS82Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-d1r-s8-2', PsGate.Lifecycle);
