/** Gate G2.36 "C1 → S6.4": per-region and per-tenure slices report the primary score with a 95% interval, 100%. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateC1S64Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s6-4.G2.36', Name: 'G2.36 C1 → S6.4: per-region and per-tenure slices report the primary score with a 95% interval, 100%', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_evaluation_score_gates.py::test_C1_S6_4_region_and_tenure_slices'] as const;
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

for (const c of PsGateC1S64Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s6-4', PsGate.Lifecycle);
