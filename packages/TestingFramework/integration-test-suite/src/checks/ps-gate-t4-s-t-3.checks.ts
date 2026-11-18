/**
 * Gate G2.11 "T4 → S-T.3": over the rolling origins of T4, lightgbm on lag columns is not graded above naive unless
 * its paired MASE improvement over naive has a lower bound above 0, and the shipped MASE lies inside the reference
 * pipeline's 95% interval [0.4854, 0.7821].
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateT4ST3Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t4-s-t-3.G2.11', Name: 'G2.11 T4 → S-T.3: lightgbm is not graded above naive without a paired MASE lower bound above 0', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_temporal_evaluation_gates.py::test_T4_S_T_3_lightgbm_not_above_naive_without_evidence'] as const;
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

for (const c of PsGateT4ST3Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t4-s-t-3', PsGate.Lifecycle);
