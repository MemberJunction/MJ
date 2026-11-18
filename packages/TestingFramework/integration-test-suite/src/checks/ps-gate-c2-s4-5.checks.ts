/**
 * Gate G2.8 "C2 → S4.5": the dummy, one-feature and GLM baselines are scored on C2 with 95% intervals, 3 of 3; the
 * gate keeps the GLM (equal to the reference pipeline's), and with shuffled labels decides no-signal. A pytest node over
 * the trainer: the stored outcome equals the sidecar's here (guards only demote `model`, and a differing sidecar
 * decision is refused), and the shuffled-label variant exists only in-process.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateC2S45Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c2-s4-5.G2.8', Name: 'G2.8 C2 → S4.5: three baselines stored with 95% intervals; keep-simple-baseline, and no-signal on shuffled labels', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_evaluation_score_gates.py::test_C2_S4_5_baselines_with_intervals_and_outcomes'] as const;
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

for (const c of PsGateC2S45Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c2-s4-5', PsGate.Lifecycle);
