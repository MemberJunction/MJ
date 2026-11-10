/** Gate G2.33 "W7 → S6.2": every stored metric row carries both bounds, 3 of 3 seeds. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW7S62Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w7-s6-2.G2.33', Name: 'G2.33 W7 → S6.2: every stored metric row carries both bounds, 3 of 3 seeds', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_evaluation_score_gates.py::test_W7_S6_2_every_number_has_both_bounds'] as const;
      const expectedCases = 3;   // a parametrized node contributes one case per parameter set
      const r = await PsGatePytest.Run(nodes);
      PsGate.Assert({
        Passed: r.Failed === 0 && r.Errors === 0 && r.NotCollected.length === 0 && r.Collected === expectedCases && r.Passed === expectedCases,
        Measured: { collected: r.Collected, passed: r.Passed, failed: r.Failed, errors: r.Errors, notCollected: r.NotCollected.join(' ') },
        Detail: `${r.Passed} of ${expectedCases} pytest case(s) passed; not collected: ${r.NotCollected.join(', ') || 'none'}`,
      });
    },
  },
];

for (const c of PsGateW7S62Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w7-s6-2', PsGate.Lifecycle);
