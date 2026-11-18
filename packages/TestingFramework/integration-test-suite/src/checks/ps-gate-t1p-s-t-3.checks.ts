/**
 * Gate G2.20 "T1p → S-T.3": at every rolling origin the seasonal-naive MASE and the MASE scale equal the values
 * computed independently from that origin's training window, within 1e-9, 100% of origins.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateT1pST3Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t1p-s-t-3.G2.20', Name: 'G2.20 T1p → S-T.3: per-origin seasonal-naive MASE equals the independent value within 1e-9, 100% of origins', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_temporal_evaluation_gates.py::test_T1p_S_T_3_seasonal_naive_per_origin_is_exact'] as const;
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

for (const c of PsGateT1pST3Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t1p-s-t-3', PsGate.Lifecycle);
