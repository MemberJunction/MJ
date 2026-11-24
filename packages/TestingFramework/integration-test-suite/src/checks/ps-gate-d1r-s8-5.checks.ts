/**
 * Gate G6.10 "D1r → S8.5": the regression twin of G6.9 — the challenger's paired squared-error comparison on the
 * incumbent's rows publishes the better challenger after the shift, 1 of 1.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TaskType } from '@memberjunction/predictive-studio-core';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const TASK: TaskType = { kind: 'continuous' };
const CALENDAR: PeriodCalendar = { Kind: 'year', BaseYear: 2019 };
const PUBLISH_PERIODS = [0, 1, 2];
const MONITOR_PERIODS = [3, 4];

export const PsGateD1rS85Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-d1r-s8-5.G6.10', Name: 'G6.10 D1r → S8.5: the regression challenger is paired on the incumbent\'s rows and replaces it after the shift, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const dataset = await h.EnsureLoaded({ Kind: 'scenario', ID: 'D1r', Seed: UnitFixtures.ScenarioBaseSeed('D1r') });
      const model = await MonitoringFixture.PublishOnPeriods(h, dataset, PUBLISH_PERIODS, { Scenario: 'D1r', Task: TASK, Calendar: CALENDAR, Challenger: true });
      const periods = await MonitoringFixture.RunPeriods(h, model, MONITOR_PERIODS);
      const { Started: started, SameRows: sameRows, Challenger: challenger, Replaced: replaced } = await MonitoringFixture.ChallengerOutcome(h, model, periods);
      PsGate.Assert({
        Passed: sameRows && replaced,
        Measured: { challengerRunId: started ? started.ChallengerRunID : null, pairedOnIncumbentRows: sameRows, challengerStatus: challenger ? challenger.Status : null, replaced, outcome: started ? started.ChallengerOutcome : null },
        Detail: `D1r: challenger ${started ? started.ChallengerRunID : 'none'}, paired on the incumbent's rows ${sameRows}, replaced ${replaced}`,
      });
    },
  },
];

for (const c of PsGateD1rS85Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-d1r-s8-5', PsGate.Lifecycle);
