/**
 * Gate G2.26 "T2p → S-T.4": the blocked-time inner folds grouped by entity share 0 entity keys and train only on
 * periods at least the gap before validation (at gaps of 1 and 2 periods); the shipped RMSE equals the reference
 * pipeline's 1.5591 with its interval at [1.5123, 1.6082] (within 0.001), and the random-row contrast on the same
 * validation rows is reported beside the blocked score.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateT2pST4Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t2p-s-t-4.G2.26', Name: 'G2.26 T2p → S-T.4: blocked inner folds grouped by entity share 0 keys and keep a gap of 1 and 2 periods; shipped RMSE 1.5591 inside [1.5123, 1.6082]; random-row contrast beside it', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_temporal_evaluation_gates.py::test_T2p_S_T_4_blocked_grouped_folds'] as const;
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

for (const c of PsGateT2pST4Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t2p-s-t-4', PsGate.Lifecycle);
