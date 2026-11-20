/**
 * Gate G6.4 "T4 → S8.4": on T4 (strong AR(1), φ 0.9, no shift) the outcome-degradation trigger fires 0 times (D4-237).
 * A model trained on the first 228 months of the series, on its one feature `LagTarget` (the previous month's value,
 * D4-181), is monitored over the 12 months after them twice: month by month, where each month holds one scored row,
 * fewer than the job's minimum (`minScoredRowsPerPeriod`, 10), so every month is recorded `insufficient-rows` and judged
 * by no trigger; and as one pooled 12-month window (the job's period set to `year`), which meets the minimum and is
 * judged against the reference band without firing. A trigger that judges a one-row month (no minimum) fires on the
 * no-shift series: a one-row period's interval has no width.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TaskType } from '@memberjunction/predictive-studio-core';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const CONTINUOUS: TaskType = { kind: 'continuous' };
const MONTHS: PeriodCalendar = { Kind: 'month', BaseYear: 2005 };
const YEARS: PeriodCalendar = { Kind: 'year', BaseYear: 2005 };
/** The 228 training months (2005–2023) and the 12 monitored months of 2024. */
const TRAIN_MONTHS = Array.from({ length: 228 }, (_, i) => i);
const MONITORED_MONTHS = Array.from({ length: 12 }, (_, i) => 228 + i);
/** 2024 as a year index from 2005. */
const MONITORED_YEAR = 19;

export const PsGateT4S84Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t4-s8-4.G6.4', Name: 'G6.4 T4 → S8.4: the outcome-degradation trigger fires 0 times on the no-shift series (one-row months unjudged; the pooled year judged)', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const t4 = await h.EnsureLoaded({ Kind: 'scenario', ID: 'T4', Seed: UnitFixtures.ScenarioBaseSeed('T4') });
      const model = await MonitoringFixture.PublishOnPeriods(h, t4, TRAIN_MONTHS, { Scenario: 'T4', Task: CONTINUOUS, Calendar: MONTHS });
      const months = await MonitoringFixture.RunPeriods(h, model, MONITORED_MONTHS);
      await MonitoringFixture.SetMonitoringPeriod(h, model.ModelID, 'year');
      const pooled = await MonitoringFixture.RunPeriods(h, { ...model, Calendar: YEARS }, [MONITORED_YEAR]);
      const fires = [...months, ...pooled].filter((p) => p.TriggersFired.length > 0).length;
      const unjudged = months.filter((p) => p.State === 'insufficient-rows').length;
      const judged = pooled.filter((p) => p.State === 'evaluated' && p.ScoredRows >= 10).length;
      PsGate.Assert({
        Passed: fires === 0 && unjudged === months.length && judged === pooled.length,
        Measured: {
          fires, months: months.length, insufficientRows: unjudged, monthStates: months.map((p) => p.State).join(' '),
          pooledWindows: pooled.length, pooledJudged: judged, pooledScoredRows: pooled.map((p) => p.ScoredRows).join(' '),
          pooledPrimary: pooled.map((p) => `${p.PrimaryValue} [${p.PrimaryLower}, ${p.PrimaryUpper}]`).join(' '),
        },
        Detail: `${fires} fires: ${unjudged} of ${months.length} one-row months insufficient-rows, ${judged} of ${pooled.length} pooled 12-month windows judged (expected 0 fires, 12, 1)`,
      });
    },
  },
];

for (const c of PsGateT4S84Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t4-s8-4', PsGate.Lifecycle);
