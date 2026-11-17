/**
 * Gate G2.14 "T2p → S-T.6": the selected model's residual autocorrelation on the T2p panel (pooled within entities,
 * Box–Pierce on 3 lags, as the reference pipeline) is flagged, and the T1p series model's final-origin residuals
 * (Ljung–Box) are not.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateT2pST6Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t2p-s-t-6.G2.14', Name: 'G2.14 T2p → S-T.6: residual autocorrelation is flagged on T2p (Box–Pierce pooled within entities) and not on T1p (Ljung–Box)', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_temporal_evaluation_gates.py::test_T2p_S_T_6_ljung_box_flags_panel_not_T1p'] as const;
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

for (const c of PsGateT2pST6Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t2p-s-t-6', PsGate.Lifecycle);
