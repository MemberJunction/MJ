/**
 * Gate G0.11 "T4 → S6.5": with MonthIndex declared as the time index, none of the 12 rolling origins' lightgbm pipelines
 * is cleared to act, 12 of 12 contained. A time-indexed pipeline is held by the pipeline migration (no Prediction Unit;
 * the held line naming the reason in its Description), so training it is refused `UNIT_REQUIRED`; one bound to a unit
 * under a holdout that does not respect time is refused `time-index-needs-time-holdout` (code `TIME_HOLDOUT_REQUIRED`). Each origin must show one of
 * those two stored reasons and no model, so the gate cannot pass by absence.
 */
import { TIME_INDEX_HOLD_REASON } from '@memberjunction/predictive-studio-core';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import type { TrainAttempt } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';

/** The two stored ways a time-indexed origin is contained, or null when it was not. */
class TimeIndexContainment {
  public static ReasonOf(t: TrainAttempt, description: string | null): string | null {
    if (t.ModelID !== null) return null;
    const held = (description || '').split('\n').some((l) => l.startsWith('Held by the Prediction Unit migration on ') && l.endsWith(`: ${TIME_INDEX_HOLD_REASON}.`));
    if (held && t.RefusalCode === 'UNIT_REQUIRED') return 'held+unit-required';
    if (t.RefusalCode === 'TIME_HOLDOUT_REQUIRED' && (t.ErrorMessage || '').startsWith('Refused (time-index-needs-time-holdout)')) return 'time-index-needs-time-holdout';
    return null;
  }
}

export const PsGateT4S65Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t4-s6-5.G0.11', Name: 'G0.11 T4 → S6.5: 12 of 12 time-indexed origins held or refused with the stored reason, none cleared to act', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      let contained = 0;
      let models = 0;
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
        if (t.ModelID !== null) models += 1;
        const reason = TimeIndexContainment.ReasonOf(t, p.Description);
        outcomes.push(`${origin}:${reason || `not contained (${t.RefusalCode || 'no code'}: ${t.ErrorMessage || 'trained'})`}`);
        if (reason !== null) contained += 1;
      }
      PsGate.Assert({
        Passed: contained === 12 && models === 0,
        Measured: { origins: 12, contained, models, outcomes: outcomes.join(' ') },
        Detail: `${contained} of 12 time-indexed origins held or refused with the stored reason; ${models} models`,
      });
    },
  },
];

for (const c of PsGateT4S65Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t4-s6-5', PsGate.Lifecycle);
