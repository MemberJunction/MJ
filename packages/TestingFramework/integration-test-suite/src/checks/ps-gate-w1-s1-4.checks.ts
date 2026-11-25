/** Gate G1.7 "W1 → S1.4": the one-class target is refused before training, 1 of 1. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PredictionUnitGates } from './ps-gates/ps-gate-prediction-units';

export const PsGateW1S14Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s1-4.G1.7', Name: 'G1.7 W1 → S1.4: the one-class target is refused before training, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await PredictionUnitGates.MeasureW1OneClassRefused(h));
    },
  },
];

for (const c of PsGateW1S14Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s1-4', PsGate.Lifecycle);
