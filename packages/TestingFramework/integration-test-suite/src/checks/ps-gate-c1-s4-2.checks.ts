/**
 * Gate G2.7 "C1 → S4.2": C1 trained through MJAPI on its reference split (date-carved at 2024-01-01, holdout end
 * 2025-01-01) stores the gate decision `keep-simple-baseline`, the reference pipeline's outcome (it keeps its GLM). The
 * stored record's slice coverage, interval bounds and precision at capacity are reported as additional coverage.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { GateOutcomeMeasures } from './ps-gates/ps-gate-outcomes';

export const PsGateC1S42Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s4-2.G2.7', Name: 'G2.7 C1 → S4.2: the gate decision on C1 is keep-simple-baseline, the reference-grade outcome', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await GateOutcomeMeasures.MeasureC1GateOutcome(h));
    },
  },
];

for (const c of PsGateC1S42Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s4-2', PsGate.Lifecycle);
