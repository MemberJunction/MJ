/** Gate G0.8 "W4 → S2.1": an as-of setting that has no effect is refused before training, 2 of 2 variants. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ContainmentProbe, W_WORLD_FEATURES } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

export const PsGateW4S21Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w4-s2-1.G0.8', Name: 'G0.8 W4 → S2.1: no-effect as-of settings refused before training', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w4 = await h.EnsureLoaded({ Kind: 'world', ID: 'W4-pit', Seed: 42 });
      const features = [...W_WORLD_FEATURES, 'PersonStatusNow'];
      const a = await h.Train(await h.CreatePipeline(PsGateSpecs.W(h, 'G0.8 W4 column-mode', w4, { Features: features, AsOf: { Mode: 'column', Column: 'StartDate' } })));
      const b = await h.Train(await h.CreatePipeline(PsGateSpecs.W(h, 'G0.8 W4 asOf-input', w4, { Features: features })), { AsOf: { Mode: 'column', Column: 'StartDate' } });
      // The column-mode pipeline has no Prediction Unit (UNIT_REQUIRED); the asOf input is refused by name (AS_OF_NO_EFFECT).
      const refused = [ContainmentProbe.WasRefusedBeforeTraining(a, 'UNIT_REQUIRED'), ContainmentProbe.WasRefusedBeforeTraining(b, 'AS_OF_NO_EFFECT')].filter((x) => x).length;
      PsGate.Assert({
        Passed: refused === 2,
        Measured: { refused, columnModeCode: a.RefusalCode, asOfInputCode: b.RefusalCode, columnModeModel: a.ModelID, asOfInputModel: b.ModelID },
        Detail: `${refused} of 2 no-effect as-of variants refused before training`,
      });
    },
  },
];

for (const c of PsGateW4S21Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w4-s2-1', PsGate.Lifecycle);
