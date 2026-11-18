/**
 * Gate G2.12 "T1p → S-T.2": over at least 5 rolling origins at the declared horizon the shipped model's MASE is at most
 * 0.5401 (the reference pipeline's upper bound) and beats seasonal naive with a paired lower bound above 0; a row
 * manifest that disagrees with the rolling-origin design is refused; the Ljung–Box veto uses the protocol's alpha.
 * Three nodes, measured in one run: all must pass.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateT1pST2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t1p-s-t-2.G2.12', Name: 'G2.12 T1p → S-T.2: rolling-origin MASE at most 0.5401, beating seasonal naive with a paired lower bound above 0; a disagreeing manifest is refused; the veto uses the declared alpha, 3 of 3', RequiresMutation: true,
    Fn: async () => {
      const nodes = [
        'tests/gates/test_temporal_evaluation_gates.py::test_T1p_S_T_2_rolling_origin_mase',
        'tests/gates/test_temporal_evaluation_gates.py::test_T1p_S_T_2_manifest_disagreeing_with_the_design_is_refused',
        'tests/gates/test_temporal_evaluation_gates.py::test_T1p_S_T_2_the_veto_uses_the_protocols_ljung_box_alpha',
      ] as const;
      const expectedCases = 3;   // three unparametrized nodes: one case each
      const r = await PsGatePytest.Run(nodes);
      PsGate.Assert({
        Passed: r.Failed === 0 && r.Errors === 0 && r.NotCollected.length === 0 && r.Collected === expectedCases && r.Passed === expectedCases,
        Measured: { collected: r.Collected, passed: r.Passed, failed: r.Failed, errors: r.Errors, notCollected: r.NotCollected.join(' ') },
        Detail: `${r.Passed} of ${expectedCases} pytest case(s) passed; not collected: ${r.NotCollected.join(', ') || 'none'}`,
      });
    },
  },
];

for (const c of PsGateT1pST2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t1p-s-t-2', PsGate.Lifecycle);
