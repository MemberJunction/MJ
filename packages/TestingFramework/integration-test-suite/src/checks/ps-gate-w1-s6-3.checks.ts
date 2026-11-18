/** Gate G2.39 "W1 → S6.3": every offered family is calibrated (slope 0.8–1.2) on 3 of 3 seeds or hidden. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW1S63Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s6-3.G2.39', Name: 'G2.39 W1 → S6.3: every offered family is calibrated (slope 0.8–1.2) on 3 of 3 seeds or hidden', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_evaluation_score_gates.py::test_W1_S6_3_every_family_calibrated_or_hidden'] as const;
      const expectedCases = 15;   // a parametrized node contributes one case per parameter set
      const r = await PsGatePytest.Run(nodes);
      PsGate.Assert({
        Passed: r.Failed === 0 && r.Errors === 0 && r.NotCollected.length === 0 && r.Collected === expectedCases && r.Passed === expectedCases,
        Measured: { collected: r.Collected, passed: r.Passed, failed: r.Failed, errors: r.Errors, notCollected: r.NotCollected.join(' ') },
        Detail: `${r.Passed} of ${expectedCases} pytest case(s) passed; not collected: ${r.NotCollected.join(', ') || 'none'}`,
      });
    },
  },
];

for (const c of PsGateW1S63Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s6-3', PsGate.Lifecycle);
