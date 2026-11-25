/** Gate G2.28 "R2-real → S4.4": ranking Tweedie and squared-error candidates by RMSE is refused, 1 of 1. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateR2RealS44Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-r2-real-s4-4.G2.28', Name: 'G2.28 R2-real → S4.4: ranking Tweedie and squared-error candidates by RMSE is refused, 1 of 1', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_evaluation_score_gates.py::test_R2_real_S4_4_rmse_across_families_is_refused'] as const;
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

for (const c of PsGateR2RealS44Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-r2-real-s4-4', PsGate.Lifecycle);
