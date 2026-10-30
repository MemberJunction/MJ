/** Gate G2.40 "W8 → S9.4": noise columns carry at most 10% of held-out permutation importance on W8-highcard s42. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW8S94Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w8-s9-4.G2.40', Name: 'G2.40 W8 → S9.4: noise columns carry at most 10% of held-out permutation importance', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_leakage_importance_gates.py::test_W8_S9_4_noise_carries_at_most_ten_percent'] as const;
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

for (const c of PsGateW8S94Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w8-s9-4', PsGate.Lifecycle);
