/**
 * Gate G2.4 "W2 → S5.2": over W2-noise s100–s159 the mean of (winner's reported holdout AUC − fresh AUC) is below
 * +0.0104. A statistical gate: the node trains one search per seed and asserts that all 60 ran; PS_SEED_LIMIT lowers
 * the count for a reduced run and skips that assertion. The full count runs once, on the final head.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW2S52Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w2-s5-2.G2.4', Name: 'G2.4 W2 → S5.2: over W2-noise s100–s159 the mean winner optimism is below +0.0104', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_seeds400.py::test_W2_S5_2_winner_optimism'] as const;
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

for (const c of PsGateW2S52Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w2-s5-2', PsGate.Lifecycle);
