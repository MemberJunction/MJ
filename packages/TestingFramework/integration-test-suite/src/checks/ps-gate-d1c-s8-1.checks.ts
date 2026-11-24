/**
 * Gate G6.1 "D1c → S8.1" (owner PR 4, phase 6): every D1c prediction whose label window closed has a joined outcome
 * row, 100%. A model trained on periods 0–2 is published, bound and scored as of each of periods 3–5 (a stored
 * prediction per record and period); monitoring runs each period and its row counts the closed-window predictions
 * (scored, less the training rows) and the ones joined to a realised outcome.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TaskType } from '@memberjunction/predictive-studio-core';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const BINARY: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 };
const YEARS: PeriodCalendar = { Kind: 'year', BaseYear: 2019 };

export const PsGateD1cS81Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-d1c-s8-1.G6.1', Name: 'G6.1 D1c → S8.1: every closed-window D1c prediction has a joined outcome, 100%', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const d1c = await h.EnsureLoaded({ Kind: 'scenario', ID: 'D1c', Seed: UnitFixtures.ScenarioBaseSeed('D1c') });
      const model = await MonitoringFixture.PublishOnPeriods(h, d1c, [0, 1, 2], { Scenario: 'D1c', Task: BINARY, Calendar: YEARS, ScorePeriods: [3, 4, 5] });
      const periods = await MonitoringFixture.RunPeriods(h, model, [3, 4, 5]);
      const closed = periods.reduce((s, p) => s + p.ClosedWindowPredictions, 0);
      const joined = periods.reduce((s, p) => s + p.JoinedRows, 0);
      // The prediction as of each period: a period joins exactly the predictions stored for its own rows (scored as of
      // its first day), never another period's — the latest row of a record would pull every period's rows into each.
      const scoredPerPeriod = await Promise.all([3, 4, 5].map((p) => MonitoringFixture.RowsDatedAt(h, d1c, MonitoringFixture.PeriodStart(YEARS, p))));
      const asOfEachPeriod = periods.every((p, i) => p.ScoredRows === scoredPerPeriod[i]);
      PsGate.Assert({
        Passed: closed > 0 && joined === closed && asOfEachPeriod && periods.every((p) => p.State === 'evaluated'),
        Measured: {
          closedWindowPredictions: closed, joined, scored: periods.map((p) => p.ScoredRows).join(' '), scoredForPeriod: scoredPerPeriod.join(' '),
          states: periods.map((p) => p.State).join(' '), firstError: periods.find((p) => p.ErrorMessage)?.ErrorMessage || null,
        },
        Detail: `${joined} of ${closed} closed-window predictions have a joined outcome`,
      });
    },
  },
];

for (const c of PsGateD1cS81Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-d1c-s8-1', PsGate.Lifecycle);
