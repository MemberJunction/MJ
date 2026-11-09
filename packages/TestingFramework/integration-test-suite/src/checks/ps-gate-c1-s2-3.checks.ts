/** Gate G1.6 "C1 → S2.3": a label edit creates version 2 with LabelVersion 2; the trained model keeps version 1. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PredictionUnitGates } from './ps-gates/ps-gate-prediction-units';

export const PsGateC1S23Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s2-3.G1.6', Name: 'G1.6 C1 → S2.3: a label edit creates version 2; the trained model keeps version 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await PredictionUnitGates.MeasureC1LabelVersioning(h));
    },
  },
];

for (const c of PsGateC1S23Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s2-3', PsGate.Lifecycle);
