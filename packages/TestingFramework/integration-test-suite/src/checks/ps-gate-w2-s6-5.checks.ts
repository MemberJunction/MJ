/**
 * Gate G2.3 "W2 → S6.5": over W2-noise s100–s499 the gate returns `model` in at most 28 of 400, and every winner's
 * reported holdout AUC carries a 95% interval. A statistical gate: the node trains one search per seed. The
 * stored outcome is the engine's decision over the same intervals plus guards that only demote `model`, and a run
 * whose sidecar decision differs is refused, so the sidecar's `model` count bounds the stored count. PS_SEED_LIMIT
 * runs the node on its first k seeds with the cap scaled to k; the full count runs once, on the final head.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW2S65Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w2-s6-5.G2.3', Name: 'G2.3 W2 → S6.5: over 400 W2-noise seeds at most 28 publications; every winner score has a 95% interval', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_seeds400.py::test_W2_S6_5_noise_publish'] as const;
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

for (const c of PsGateW2S65Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w2-s6-5', PsGate.Lifecycle);
