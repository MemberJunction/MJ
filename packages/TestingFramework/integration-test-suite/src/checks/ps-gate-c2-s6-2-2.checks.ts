/**
 * Gate G2.35 "C2 → S6.2 #2": the model-minus-dummy log-loss interval covers the planted difference in 372–388 of
 * 400 seeds. A statistical gate: the node trains one model per seed of C2's n400 set, and runs on all 400 only.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateC2S62No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c2-s6-2-2.G2.35', Name: 'G2.35 C2 → S6.2 #2: the model-minus-dummy log-loss interval covers the planted difference in 372–388 of 400 seeds', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_seeds400.py::test_C2_S6_2_2_difference_interval_coverage'] as const;
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

for (const c of PsGateC2S62No2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c2-s6-2-2', PsGate.Lifecycle);
