/**
 * Gate G0.9 "W2 → S5.3": on W2-noise s100, k-fold and holdout report a validation AUC whose 95% interval contains 0.5,
 * 2 of 2. No refusal code applies to noise data, so a failed training is an error, not a pass; only the interval decides.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ConfidenceInterval, HarnessDatasets } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

export const PsGateW2S53Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w2-s5-3.G0.9', Name: 'G0.9 W2 → S5.3: k-fold and holdout AUC intervals contain 0.5 on noise', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w2 = await h.EnsureLoaded({ Kind: 'world', ID: 'W2-noise', Seed: 100 });
      const { Positives: positives, Negatives: negatives } = HarnessDatasets.LabelCounts(w2, 'Renewed');
      const out: Record<string, number | string | boolean | null> = {};
      let ok = 0;
      for (const [label, validation] of [
        ['kfold', { Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0 }],
        ['holdout', { Strategy: 'holdout', LockedHoldoutFraction: 0 }],
      ] as const) {
        const p = await h.CreatePipeline(PsGateSpecs.W(h, `G0.9 W2 s100 ${label}`, w2, { Algorithm: 'random_forest', Validation: validation }));
        const t = await h.Train(p);
        if (!t.Ok || !t.ModelID) throw new Error(`${label}: training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage}`);
        const m = await h.ReadModel(t.ModelID);
        const auc = m.Metrics['auc'] ?? m.Metrics['roc_auc'] ?? null; // `??` on purpose: an AUC of 0 is a legitimate value
        if (auc === null) throw new Error(`${label}: trained but reported no validation AUC`);
        const ci = ConfidenceInterval.HanleyMcNeil(auc, positives, negatives);
        out[`${label}Auc`] = auc;
        out[`${label}Lower`] = ci.Lower;
        out[`${label}Upper`] = ci.Upper;
        if (ci.Lower <= 0.5 && 0.5 <= ci.Upper) ok += 1;
      }
      PsGate.Assert({ Passed: ok === 2, Measured: out, Detail: `${ok} of 2 strategies honest on noise (interval contains 0.5)` });
    },
  },
];

for (const c of PsGateW2S53Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w2-s5-3', PsGate.Lifecycle);
