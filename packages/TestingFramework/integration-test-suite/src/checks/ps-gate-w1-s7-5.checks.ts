/**
 * Gate G0.1 "W1 → S7.5": training with the UI default reads every labelled W1-signal s42 row or is refused with
 * READ_CAP_EXCEEDED, and a filter-scope scoring call scores every row or is refused with READ_CAP_EXCEEDED.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { RunFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

export const PsGateW1S75Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s7-5.G0.1', Name: 'G0.1 W1 → S7.5: training and filter scoring read every row or refuse naming the cap', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const p = await h.CreatePipeline(PsGateSpecs.W(h, 'G0.1 W1 s42', w1));
      const t = await h.Train(p); // the UI default: no MaxRows
      const m = t.ModelID ? await h.ReadModel(t.ModelID) : null;
      // `??` on purpose for the row counts here and in `Measured`: 0 is a legitimate count, and `|| null` would report it as null.
      const trainRead = m ? (m.TrainingRowCount ?? 0) + (m.HoldoutRowCount ?? 0) : null;
      const trainOk = m ? trainRead === w1.RowCount : t.RefusalCode === 'READ_CAP_EXCEEDED';
      const scoring = await RunFixtures.W1S42ValidatedModel(h); // full-row, Validated: scoring is tested even if training refused
      const s = await h.Score(scoring.ModelID, { scope: { filter: { entityName: w1.Entity.Name } } });
      const scoreOk = s.Ok ? s.Scored === w1.RowCount : s.RefusalCode === 'READ_CAP_EXCEEDED';
      PsGate.Assert({
        Passed: trainOk && scoreOk,
        Measured: {
          labelledRows: w1.RowCount,
          trainingRows: m?.TrainingRowCount ?? null,
          holdoutRows: m?.HoldoutRowCount ?? null,
          trainRefusalCode: t.RefusalCode,
          trainError: t.ErrorMessage,
          filterScored: s.Scored,
          scoreRefusalCode: s.RefusalCode,
          scoreError: s.ErrorMessage,
        },
        Detail: `training read ${trainRead === null ? `refused (${t.RefusalCode || 'no refusal code'})` : trainRead} of ${w1.RowCount}; filter scoring scored ${s.Scored}${s.ErrorMessage ? ` (${s.RefusalCode || 'no refusal code'}: ${s.ErrorMessage})` : ''}`,
      });
    },
  },
];

for (const c of PsGateW1S75Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s7-5', PsGate.Lifecycle);
