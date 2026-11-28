/**
 * Gate G2.9 "C4 → S2.4": the leakage audit flags ProxyOfTarget, NextPeriodFlag and TicketCode, 3 of 3, the reference
 * pipeline's audit flags the same three with the same per-shift scores, and no flagged column reaches the shipped model.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateC4S24Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c4-s2-4.G2.9', Name: 'G2.9 C4 → S2.4: ProxyOfTarget, NextPeriodFlag and TicketCode flagged, 3 of 3, and absent from the shipped model', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_leakage_importance_gates.py::test_C4_S2_4_planted_leaks_flagged_by_name_and_absent'] as const;
      const expectedCases = 1;   // one unparametrized node: one case
      const r = await PsGatePytest.Run(nodes);
      PsGate.Assert({
        Passed: r.Failed === 0 && r.Errors === 0 && r.NotCollected.length === 0 && r.Collected === expectedCases && r.Passed === expectedCases,
        Measured: { collected: r.Collected, passed: r.Passed, failed: r.Failed, errors: r.Errors, notCollected: r.NotCollected.join(' ') },
        Detail: `${r.Passed} of ${expectedCases} pytest case(s) passed; not collected: ${r.NotCollected.join(', ') || 'none'}`,
      });
    },
  },
];

for (const c of PsGateC4S24Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c4-s2-4', PsGate.Lifecycle);
