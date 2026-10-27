/** Gate G1.3 "W5 → S2.2": no censored row is trained on, and the newest cycle's mean prediction is within 0.05 of its mean TrueP. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PredictionUnitGates } from './ps-gates/ps-gate-prediction-units';

export const PsGateW5S22Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w5-s2-2.G1.3', Name: 'G1.3 W5 → S2.2: 0 censored rows trained on; newest-cycle mean prediction within 0.05 of TrueP', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await PredictionUnitGates.MeasureW5Censoring(h));
    },
  },
];

for (const c of PsGateW5S22Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w5-s2-2', PsGate.Lifecycle);
