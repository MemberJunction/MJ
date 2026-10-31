/**
 * Gate G0.11 "T4 → S6.5": with MonthIndex declared as the time index, 0 of 12 rolling origins' lightgbm runs on T4 are
 * cleared to act, and each stores its gate decision, 12 of 12. Each origin's pipeline trains under the version-1
 * Prediction Unit and Evaluation Protocol the pipeline migration gives it; the verdict is the trust verdict of the
 * training run's stored gate decision with the model's lineage (as the UI renders it), and a run that ships no model is
 * judged on its stored decision alone.
 */
import { GateRecords, TrustVerdicts } from '@memberjunction/predictive-studio-core';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';

export const PsGateT4S65Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t4-s6-5.G0.11', Name: 'G0.11 T4 → S6.5: 12 of 12 time-indexed origins store a gate decision and none is cleared to act', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      let abovePoor = 0;
      let stored = 0;
      const outcomes: string[] = [];
      for (let origin = 1; origin <= 12; origin++) {
        const t4 = await h.EnsureLoaded({ Kind: 'series-origin', ID: 'T4', Seed: 2209, Origin: origin });
        const p = await h.CreatePipeline({
          Name: `PSTruth: G0.11 T4 origin ${origin} ${h.RunID}`, Dataset: t4, Target: 'Target', ProblemType: 'regression',
          Features: ['MonthIndex', 'Month'], Algorithm: 'lightgbm', AsOf: { Mode: 'none' },
          Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
          DenyFields: ['ID', 'EntityKey', 'T', 'TruthScore'], TimeIndexColumn: 'MonthIndex',
        });
        const t = await h.Train(p);
        const run = await UnitFixtures.LatestRun(h, p.ID);
        const gate = GateRecords.ParseStoredGateRecord(run.ValidationResults);
        if (gate === null) continue; // refused or failed: stores no decision, so it counts against the 12 of 12
        stored += 1;
        const lineage = t.ModelID ? (await h.ReadModel(t.ModelID)).LineageJSON : null;
        const verdict = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: run.ValidationResults, Lineage: lineage });
        outcomes.push(`${origin}:${gate.decision.outcome}/${verdict.CanAct ? 'act' : 'withheld'}`);
        if (verdict.CanAct) abovePoor += 1;
      }
      PsGate.Assert({
        Passed: abovePoor === 0 && stored === 12,
        Measured: { origins: 12, clearedToAct: abovePoor, gateDecisionsStored: stored, outcomes: outcomes.join(' ') },
        Detail: `${abovePoor} of 12 origins cleared to act; ${stored} of 12 store a gate decision`,
      });
    },
  },
];

for (const c of PsGateT4S65Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t4-s6-5', PsGate.Lifecycle);
