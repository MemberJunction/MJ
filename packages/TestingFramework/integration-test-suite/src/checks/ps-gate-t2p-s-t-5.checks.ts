/**
 * Gate G2.13 "T2p → S-T.5": the shipped RMSE's entity-cluster bootstrap 95% interval covers the planted RMSE in
 * 372–388 of 400 seeds. A statistical gate: the node trains one run per seed of T2p's n400 set, and runs on all 400 only.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateT2pST5Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t2p-s-t-5.G2.13', Name: 'G2.13 T2p → S-T.5: the entity-cluster bootstrap interval covers the planted value in 372–388 of 400 seeds', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_seeds400.py::test_T2p_S_T_5_cluster_bootstrap_coverage'] as const;
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

for (const c of PsGateT2pST5Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t2p-s-t-5', PsGate.Lifecycle);
