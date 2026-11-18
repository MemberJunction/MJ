/** Gate G1.2 "C1 → S2.2": the 1,756 censored person-years are excluded and the stored excluded count is 1,756. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PredictionUnitGates } from './ps-gates/ps-gate-prediction-units';

export const PsGateC1S22Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s2-2.G1.2', Name: 'G1.2 C1 → S2.2: 1,756 censored person-years excluded and stored as 1,756', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await PredictionUnitGates.MeasureC1CensoredExcluded(h));
    },
  },
];

for (const c of PsGateC1S22Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s2-2', PsGate.Lifecycle);
