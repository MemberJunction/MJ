/** Gate G1.1 "C1 → S1.1": the renewal unit yields the reference's resolved keys, 4,873 of 4,873 matched and 0 extra. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PredictionUnitGates } from './ps-gates/ps-gate-prediction-units';

export const PsGateC1S11Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s1-1.G1.1', Name: 'G1.1 C1 → S1.1: the renewal unit yields 4,873 of 4,873 reference keys, 0 extra', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await PredictionUnitGates.MeasureC1UnitKeys(h));
    },
  },
];

for (const c of PsGateC1S11Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s1-1', PsGate.Lifecycle);
