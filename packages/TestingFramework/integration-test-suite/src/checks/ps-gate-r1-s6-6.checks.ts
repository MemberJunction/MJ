/** Gate G2.17 "R1 → S6.6": 80% and 90% prediction intervals cover 0.769–0.831 and 0.877–0.923 of 1,500 rows. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateR1S66Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-r1-s6-6.G2.17', Name: 'G2.17 R1 → S6.6: 80% and 90% prediction intervals cover 0.769–0.831 and 0.877–0.923 of 1,500 rows', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_evaluation_score_gates.py::test_R1_S6_6_prediction_interval_coverage'] as const;
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

for (const c of PsGateR1S66Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-r1-s6-6', PsGate.Lifecycle);
