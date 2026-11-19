/**
 * Gate G6.9 "D1c → S8.5": after the period-3 shift the fired trigger's challenger is compared with the incumbent on the
 * incumbent's own holdout rows (its stored gate record pairs on the incumbent, 100% of the rows shared) and replaces it
 * through the lifecycle gate, 1 of 1.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TaskType } from '@memberjunction/predictive-studio-core';
import { StoredRuns } from '@memberjunction/predictive-studio';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const TASK: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 };
const CALENDAR: PeriodCalendar = { Kind: 'year', BaseYear: 2019 };
const PUBLISH_PERIODS = [0, 1, 2];
const MONITOR_PERIODS = [3, 4];

export const PsGateD1cS85Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-d1c-s8-5.G6.9', Name: 'G6.9 D1c → S8.5: the challenger is scored on the incumbent\'s rows and replaces it after the shift, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const dataset = await h.EnsureLoaded({ Kind: 'scenario', ID: 'D1c', Seed: UnitFixtures.ScenarioBaseSeed('D1c') });
      const model = await MonitoringFixture.PublishOnPeriods(h, dataset, PUBLISH_PERIODS, { Scenario: 'D1c', Task: TASK, Calendar: CALENDAR });
      const periods = await MonitoringFixture.RunPeriods(h, model, MONITOR_PERIODS);
      const started = periods.find((p) => p.ChallengerRunID !== null);
      const run = started && started.ChallengerRunID ? await StoredRuns.Read(started.ChallengerRunID, { ContextUser: h.User, Provider: h.Provider }) : null;
      const diff = run === null || run.Gate === null ? null : run.Gate.incumbentDiff;
      const sameRows = diff !== null && diff.incumbentModelId.toLowerCase() === model.ModelID.toLowerCase();
      const challenger = started && started.ChallengerRunID ? await MonitoringFixture.ChallengerModel(h, started.ChallengerRunID) : null;
      const replaced = challenger !== null && challenger.Status === 'Published' && (await MonitoringFixture.StatusOf(h, model.ModelID)) === 'Archived';
      PsGate.Assert({
        Passed: sameRows && replaced,
        Measured: { challengerRunId: started ? started.ChallengerRunID : null, pairedOnIncumbentRows: sameRows, challengerStatus: challenger ? challenger.Status : null, replaced, outcome: started ? started.ChallengerOutcome : null },
        Detail: `D1c: challenger ${started ? started.ChallengerRunID : 'none'}, paired on the incumbent's rows ${sameRows}, replaced ${replaced}`,
      });
    },
  },
];

for (const c of PsGateD1cS85Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-d1c-s8-5', PsGate.Lifecycle);
