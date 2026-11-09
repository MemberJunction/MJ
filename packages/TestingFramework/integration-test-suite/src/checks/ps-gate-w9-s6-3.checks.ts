/** Gate G2.38 "W9 → S6.3": per-class AUC within 0.03 of the oracle for 3 of 3 classes; top-label slope 0.8–1.2. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW9S63Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w9-s6-3.G2.38', Name: 'G2.38 W9 → S6.3: per-class AUC within 0.03 of the oracle for 3 of 3 classes; top-label slope 0.8–1.2', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_evaluation_score_gates.py::test_W9_S6_3_per_class_auc_and_top_label_slope'] as const;
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

for (const c of PsGateW9S63Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w9-s6-3', PsGate.Lifecycle);
