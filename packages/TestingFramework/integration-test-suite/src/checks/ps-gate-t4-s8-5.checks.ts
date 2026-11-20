/**
 * Gate G6.11 "T4 → S8.5" (re-built on D2, D4-238): a challenger that reaches the incumbent comparison but is no better
 * than the incumbent does not replace it, 0 of 1. D2's labels follow the same true model in every period (its shift
 * moves an input's mean only), so a challenger trained on the later periods carries no real improvement. The protocol's
 * retrain trigger is a calibration-drift band no calibration slope reaches ([10, 20]), so it fires every monitored
 * period and the challenger is certain to start; with the base rate as the only simple baseline its gate outcome is
 * `model` (D2 has signal), so the lifecycle gate's publish check reaches the paired comparison with the incumbent
 * (`PublishRules.ReverifyPublish`'s incumbent step) and withholds it there: on period 4 the paired improvement's point is
 * above 0 and its lower bound is not above the margin 0. A rule that compares the point improvement with 0 instead
 * replaces the incumbent on noise.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { RetrainTrigger, TaskType } from '@memberjunction/predictive-studio-core';
import { StoredRuns } from '@memberjunction/predictive-studio';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture, type PeriodCalendar } from './ps-gates/ps-gate-monitoring';

const TASK: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 };
const CALENDAR: PeriodCalendar = { Kind: 'year', BaseYear: 2019 };
const PUBLISH_PERIODS = [0, 1, 2];
/** Period 4: the challenger (trained through period 3) is a hair better on the point and not on the paired lower bound. */
const MONITOR_PERIODS = [4];
const SCENARIO = 'D2';
/** The base rate is the only simple baseline: D2's true model is logistic, so the default GLM baseline would tie the
 * model and its gate outcome would be keep-simple-baseline, refused before the incumbent step. Margin 0 (the default). */
const PROMOTION = { Margin: 0, DummyBaselineOnly: true };
/** Fires every period: a calibration slope (near 1 for a fitted model) always lies outside [10, 20]. */
const ALWAYS_FIRES: RetrainTrigger = { kind: 'calibration-drift', slopeOutside: [10, 20], consecutivePeriods: 1 };

export const PsGateT4S85Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t4-s8-5.G6.11', Name: 'G6.11 → S8.5: a challenger no better than the incumbent reaches the paired comparison and does not replace it, 0 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const dataset = await h.EnsureLoaded({ Kind: 'scenario', ID: SCENARIO, Seed: UnitFixtures.ScenarioBaseSeed(SCENARIO) });
      const model = await MonitoringFixture.PublishOnPeriods(h, dataset, PUBLISH_PERIODS, { Scenario: SCENARIO, Task: TASK, Calendar: CALENDAR, Challenger: true, Triggers: [ALWAYS_FIRES], Promotion: PROMOTION });
      const periods = await MonitoringFixture.RunPeriods(h, model, MONITOR_PERIODS);
      const started = periods.find((p) => p.ChallengerRunID !== null);
      const run = started && started.ChallengerRunID ? await StoredRuns.Read(started.ChallengerRunID, { ContextUser: h.User, Provider: h.Provider }) : null;
      const gate = run === null ? null : run.Gate;
      const diff = gate === null ? null : gate.incumbentDiff;
      const reachedComparison = gate !== null && gate.decision.outcome === 'model' && diff !== null && diff.incumbentModelId.toLowerCase() === model.ModelID.toLowerCase();
      const challenger = started && started.ChallengerRunID ? await MonitoringFixture.ChallengerModel(h, started.ChallengerRunID) : null;
      const replaced = challenger !== null && challenger.Status === 'Published' && (await MonitoringFixture.StatusOf(h, model.ModelID)) === 'Archived';
      PsGate.Assert({
        Passed: reachedComparison && !replaced && periods.every((p) => p.State === 'evaluated'),
        Measured: {
          challengerRunId: started ? started.ChallengerRunID : null, gateOutcome: gate ? gate.decision.outcome : null, reachedComparison,
          incumbentDiff: diff ? `${diff.value} [${diff.lower}, ${diff.upper}]` : null, margin: gate ? gate.margin : null, modelVsDummy: gate ? JSON.stringify(gate.intervals.modelVsDummy) : null,
          challengerStatus: challenger ? challenger.Status : null, replaced, outcome: started ? started.ChallengerOutcome : null,
        },
        Detail: `D2: challenger ${started ? started.ChallengerRunID : 'none'} (gate outcome ${gate ? gate.decision.outcome : 'none'}), reached the incumbent comparison ${reachedComparison}, replaced ${replaced}`,
      });
    },
  },
];

for (const c of PsGateT4S85Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t4-s8-5', PsGate.Lifecycle);
