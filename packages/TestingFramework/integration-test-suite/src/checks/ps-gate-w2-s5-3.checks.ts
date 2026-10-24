/**
 * Gate G0.9 "W2 → S5.3": on W2-noise s100, k-fold and holdout report a validation AUC whose 95% interval contains 0.5,
 * 2 of 2. No refusal code applies to noise data, so a failed training is an error, not a pass; only the interval decides.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ConfidenceInterval } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

export const PsGateW2S53Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w2-s5-3.G0.9', Name: 'G0.9 W2 → S5.3: k-fold and holdout AUC intervals contain 0.5 on noise', RequiresMutation: true,
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
        if (!t.Ok || !t.ModelID) throw new Error(`${label}: training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage}`);
        const m = await h.ReadModel(t.ModelID);
        // The sidecar's classification metrics (`auc`, and `n` / `n_positive`: the rows the validation metrics were
        // computed on, the pooled out-of-fold rows for k-fold and the held-out split for holdout). `??` on purpose: an
        // AUC or count of 0 is a legitimate value.
        const auc = m.Metrics['auc'] ?? null;
        const n = m.Metrics['n'] ?? null;
        const positives = m.Metrics['n_positive'] ?? null;
        if (auc === null || n === null || positives === null) {
          throw new Error(`${label}: trained but reported no validation auc / n / n_positive (${JSON.stringify(m.Metrics)})`);
        }
        const ci = ConfidenceInterval.HanleyMcNeil(auc, positives, n - positives);
        out[`${label}Auc`] = auc;
        out[`${label}Lower`] = ci.Lower;
        out[`${label}Upper`] = ci.Upper;
        out[`${label}ValidationRows`] = n;
        if (ci.Lower <= 0.5 && 0.5 <= ci.Upper) ok += 1;
      }
      PsGate.Assert({ Passed: ok === 2, Measured: out, Detail: `${ok} of 2 strategies honest on noise (interval contains 0.5)` });
    },
  },
];

for (const c of PsGateW2S53Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w2-s5-3', PsGate.Lifecycle);
