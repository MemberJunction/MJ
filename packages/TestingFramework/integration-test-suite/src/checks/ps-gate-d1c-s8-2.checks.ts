/**
 * Gate G6.7 "D1c → S8.2": D1c's period-3 tracked positive rate (from the realised labels, with its 95% bounds) lies above
 * the periods 0–2 upper bound (the Wilson bound of the periods 0–2 labels), 1 of 1. D1c moves labels only, so a rate
 * taken from the scores would not move.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TaskType } from '@memberjunction/predictive-studio-core';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { ConfidenceInterval, UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const BINARY: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 };
const YEARS: PeriodCalendar = { Kind: 'year', BaseYear: 2019 };

export const PsGateD1cS82Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-d1c-s8-2.G6.7', Name: 'G6.7 D1c → S8.2: the period-3 tracked positive rate lies above the periods 0–2 upper bound, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const d1c = await h.EnsureLoaded({ Kind: 'scenario', ID: 'D1c', Seed: UnitFixtures.ScenarioBaseSeed('D1c') });
      const model = await MonitoringFixture.PublishOnPeriods(h, d1c, [0, 1, 2], { Scenario: 'D1c', Task: BINARY, Calendar: YEARS });
      const [period3] = await MonitoringFixture.RunPeriods(h, model, [3]);
      const shiftStart = MonitoringFixture.PeriodStart(YEARS, 3);
      const labels = await RunView.FromMetadataProvider(h.Provider).RunView<{ T: string; Target: number }>({ EntityName: d1c.Entity.Name, ExtraFilter: `T < '${EscapeSQLString(shiftStart)}'`, Fields: ['T', 'Target'], ResultType: 'simple', IgnoreMaxRows: true }, h.User);
      if (!labels.Success) throw new Error(`reading the D1c labels before ${shiftStart} failed: ${labels.ErrorMessage}`);
      const positives = labels.Results.filter((r) => Number(r.Target) === 1).length;
      const preUpper = labels.Results.length === 0 ? null : ConfidenceInterval.Wilson(positives, labels.Results.length).Upper;
      const rate = period3.PositiveRate;
      PsGate.Assert({
        Passed: rate !== null && preUpper !== null && rate.Value > preUpper,
        Measured: { period3Rate: rate ? rate.Value : null, period3Lower: rate ? rate.Lower : null, period3Upper: rate ? rate.Upper : null, prePeriodsUpper: preUpper, preRows: labels.Results.length },
        Detail: `period-3 positive rate ${rate ? rate.Value : 'none'} against the periods 0–2 upper bound ${preUpper}`,
      });
    },
  },
];

for (const c of PsGateD1cS82Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-d1c-s8-2', PsGate.Lifecycle);
