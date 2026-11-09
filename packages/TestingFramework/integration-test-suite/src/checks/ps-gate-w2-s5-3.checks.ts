/**
 * Gate G0.9 "W2 → S5.3": on W2-noise s100, the k-fold and holdout pipelines (each trained under the version-1 Prediction
 * Unit and Evaluation Protocol the pipeline migration gives it) store a gate record whose holdout AUC interval contains
 * 0.5, 2 of 2. The interval is the one the stored gate decision was taken on (`gate.guards.modelAucInterval`); when the
 * trainer reported no AUC, the model-vs-flat-guess interval must contain 0. No refusal code applies to noise data, so a
 * run that stores no gate record is an error, not a pass; a run that ships no model is a measured, honest outcome.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { GateRecords } from '@memberjunction/predictive-studio-core';
import { UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

export const PsGateW2S53Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w2-s5-3.G0.9', Name: 'G0.9 W2 → S5.3: the stored holdout AUC intervals of k-fold and holdout contain 0.5 on noise', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w2 = await h.EnsureLoaded({ Kind: 'world', ID: 'W2-noise', Seed: 100 });
      const out: Record<string, number | string | boolean | null> = {};
      let ok = 0;
      for (const [label, validation] of [
        ['kfold', { Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0 }],
        ['holdout', { Strategy: 'holdout', LockedHoldoutFraction: 0 }],
      ] as const) {
        const p = await h.CreatePipeline(PsGateSpecs.W(h, `G0.9 W2 s100 ${label}`, w2, { Algorithm: 'random_forest', Validation: validation }));
        const t = await h.Train(p);
        const gate = GateRecords.ParseStoredGateRecord((await UnitFixtures.LatestRun(h, p.ID)).ValidationResults);
        if (gate === null) throw new Error(`${label}: the run stored no gate record (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage}`);
        const auc = gate.guards.modelAucInterval;
        const dummy = gate.intervals.modelVsDummy;
        const [lower, upper, centre] = auc === null ? [dummy.lower, dummy.upper, 0] : [auc.lower, auc.upper, 0.5];
        Object.assign(out, {
          [`${label}Interval`]: auc === null ? 'modelVsDummy' : 'auc', [`${label}ModelVsDummy`]: dummy.value,
          [`${label}Lower`]: lower, [`${label}Upper`]: upper, [`${label}Outcome`]: gate.decision.outcome, [`${label}HoldoutRows`]: gate.holdoutRows,
        });
        if (lower <= centre && centre <= upper) ok += 1;
      }
      PsGate.Assert({ Passed: ok === 2, Measured: out, Detail: `${ok} of 2 strategies honest on noise (the stored interval contains chance)` });
    },
  },
];

for (const c of PsGateW2S53Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w2-s5-3', PsGate.Lifecycle);
