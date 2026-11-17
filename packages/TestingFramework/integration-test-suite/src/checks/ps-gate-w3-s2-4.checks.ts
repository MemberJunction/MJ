/**
 * Gate G2.10 "W3 → S2.4": on W3-leak-row s42 the row-level leak Status is flagged in 4 of 4 single-candidate runs and
 * kept out of what ships, and a candidate above the oracle on the same rows (paired DeLong, one-sided p < 0.001) is
 * treated as a leak. Two nodes, measured in one run: both must pass.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW3S24Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w3-s2-4.G2.10', Name: 'G2.10 W3 → S2.4: 4 of 4 candidates flagged; a candidate above the oracle is treated as a leak', RequiresMutation: true,
    Fn: async () => {
      const nodes = [
        'tests/gates/test_leakage_importance_gates.py::test_W3_S2_4_every_candidate_flagged',
        'tests/gates/test_leakage_importance_gates.py::test_W3_S2_4_above_oracle_is_a_leak',
      ] as const;
      const expectedCases = 5;   // the parametrized node contributes one case per candidate kind (4), the oracle node one
      const r = await PsGatePytest.Run(nodes);
      PsGate.Assert({
        Passed: r.Failed === 0 && r.Errors === 0 && r.NotCollected.length === 0 && r.Collected === expectedCases && r.Passed === expectedCases,
        Measured: { collected: r.Collected, passed: r.Passed, failed: r.Failed, errors: r.Errors, notCollected: r.NotCollected.join(' ') },
        Detail: `${r.Passed} of ${expectedCases} pytest case(s) passed; not collected: ${r.NotCollected.join(', ') || 'none'}`,
      });
    },
  },
];

for (const c of PsGateW3S24Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w3-s2-4', PsGate.Lifecycle);
