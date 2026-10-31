/**
 * Gate G2.1 "N1c → S6.5": over the 400 seeds of N1c's n400 set (pure-noise binary) the gate returns `model` in at
 * most 28. A statistical gate: the node trains one run per seed through the trainer and counts the gate outcomes. The
 * stored outcome is the engine's decision over the same intervals plus guards that only demote `model`, and a run
 * whose sidecar decision differs is refused, so the sidecar's `model` count bounds the stored count. PS_SEED_LIMIT
 * runs the node on its first k seeds with the cap scaled to k; the full count runs once, on the final head.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateN1cS65Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-n1c-s6-5.G2.1', Name: 'G2.1 N1c → S6.5: over 400 N1c seeds the gate publishes a model in at most 28', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_seeds400.py::test_N1c_S6_5_noise_publish'] as const;
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

for (const c of PsGateN1cS65Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-n1c-s6-5', PsGate.Lifecycle);
