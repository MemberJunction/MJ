/**
 * Gate G6.11 "T4 → S8.5": on the no-shift series no challenger replaces the incumbent (0 of 1): a point improvement
 * without the paired lower bound beating the margin never publishes. The model trains on `LagTarget`, the previous
 * month's value (D4-181).
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TaskType } from '@memberjunction/predictive-studio-core';
import { StoredRuns } from '@memberjunction/predictive-studio';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const TASK: TaskType = { kind: 'continuous' };
const CALENDAR: PeriodCalendar = { Kind: 'month', BaseYear: 2005 };
const PUBLISH_PERIODS = Array.from({ length: 228 }, (_, i) => i);
const MONITOR_PERIODS = Array.from({ length: 12 }, (_, i) => 228 + i);

export const PsGateT4S85Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t4-s8-5.G6.11', Name: 'G6.11 T4 → S8.5: no challenger replaces the incumbent on the no-shift series, 0 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const dataset = await h.EnsureLoaded({ Kind: 'scenario', ID: 'T4', Seed: UnitFixtures.ScenarioBaseSeed('T4') });
      const model = await MonitoringFixture.PublishOnPeriods(h, dataset, PUBLISH_PERIODS, { Scenario: 'T4', Task: TASK, Calendar: CALENDAR, Challenger: true });
      const periods = await MonitoringFixture.RunPeriods(h, model, MONITOR_PERIODS);
      const started = periods.find((p) => p.ChallengerRunID !== null);
      const run = started && started.ChallengerRunID ? await StoredRuns.Read(started.ChallengerRunID, { ContextUser: h.User, Provider: h.Provider }) : null;
      const diff = run === null || run.Gate === null ? null : run.Gate.incumbentDiff;
      const sameRows = diff !== null && diff.incumbentModelId.toLowerCase() === model.ModelID.toLowerCase();
      const challenger = started && started.ChallengerRunID ? await MonitoringFixture.ChallengerModel(h, started.ChallengerRunID) : null;
      const replaced = challenger !== null && challenger.Status === 'Published' && (await MonitoringFixture.StatusOf(h, model.ModelID)) === 'Archived';
      PsGate.Assert({
        Passed: !replaced && periods.every((p) => p.State === 'evaluated'),
        Measured: { challengerRunId: started ? started.ChallengerRunID : null, pairedOnIncumbentRows: sameRows, challengerStatus: challenger ? challenger.Status : null, replaced, outcome: started ? started.ChallengerOutcome : null },
        Detail: `T4: challenger ${started ? started.ChallengerRunID : 'none'}, paired on the incumbent's rows ${sameRows}, replaced ${replaced}`,
      });
    },
  },
];

for (const c of PsGateT4S85Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t4-s8-5', PsGate.Lifecycle);
