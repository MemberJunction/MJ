/**
 * Gate G0.11 "T4 → S6.5": with MonthIndex declared as the time index, 0 of 12 rolling origins' lightgbm runs on T4 are
 * graded above Poor or cleared to act, and each stores the withheld verdict with its reason, 12 of 12.
 */
import { EvaluationLineage } from '@memberjunction/predictive-studio-core';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ContainmentProbe } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';

export const PsGateT4S65Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t4-s6-5.G0.11', Name: 'G0.11 T4 → S6.5: 12 of 12 time-indexed origins withheld as not evaluated as a forecast', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      let abovePoor = 0;
      let stored = 0;
      for (let origin = 1; origin <= 12; origin++) {
        const t4 = await h.EnsureLoaded({ Kind: 'series-origin', ID: 'T4', Seed: 2209, Origin: origin });
        const p = await h.CreatePipeline({
          Name: `PSTruth: G0.11 T4 origin ${origin} ${h.RunID}`, Dataset: t4, Target: 'Target', ProblemType: 'regression',
          Features: ['MonthIndex', 'Month'], Algorithm: 'lightgbm', AsOf: { Mode: 'none' },
          Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
          DenyFields: ['ID', 'EntityKey', 'T', 'TruthScore'], TimeIndexColumn: 'MonthIndex',
        });
        const t = await h.Train(p);
        if (!t.ModelID) continue; // refused: stores no withheld verdict, so it counts against the 12 of 12
        const m = await h.ReadModel(t.ModelID);
        if (ContainmentProbe.GradedAbovePoorOrActionable(m)) abovePoor += 1;
        const v = ContainmentProbe.ReadStoredWithheldVerdict(m);
        if (v && !v.CanAct && v.Reason === EvaluationLineage.NotEvaluatedAsForecast) stored += 1;
      }
      PsGate.Assert({
        Passed: abovePoor === 0 && stored === 12,
        Measured: { origins: 12, gradedAbovePoorOrActionable: abovePoor, withheldVerdictsStored: stored },
        Detail: `${abovePoor} of 12 origins above Poor or actionable; ${stored} of 12 store the withheld verdict`,
      });
    },
  },
];

for (const c of PsGateT4S65Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t4-s6-5', PsGate.Lifecycle);
