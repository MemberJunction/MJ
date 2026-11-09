/** Gate G1.8 "R3 → S1.4": a Poisson count declared continuous is refused; declared count it trains. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PredictionUnitGates } from './ps-gates/ps-gate-prediction-units';

export const PsGateR3S14Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-r3-s1-4.G1.8', Name: 'G1.8 R3 → S1.4: a Poisson count declared continuous is refused; declared count it trains', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await PredictionUnitGates.MeasureR3CountTaskType(h));
    },
  },
];

for (const c of PsGateR3S14Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-r3-s1-4', PsGate.Lifecycle);
