/**
 * Gate G2.30 "W1 → S5.3": every candidate's inner-CV score is a mean over repeated folds with a 95% interval, nothing
 * is pruned while its upper bound reaches the leader's lower bound, and the winner's inner score is labelled
 * optimistic. A pytest node over the trainer.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW1S53Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s5-3.G2.30', Name: 'G2.30 W1 → S5.3: inner-CV scores are repeated-fold means with intervals; no pruning above the leader bound', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_trainer_contract_gates.py::test_W1_S5_3_inner_cv_means_with_intervals'] as const;
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

for (const c of PsGateW1S53Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s5-3', PsGate.Lifecycle);
