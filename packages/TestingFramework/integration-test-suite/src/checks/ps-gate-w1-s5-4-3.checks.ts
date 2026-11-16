/**
 * Gate G2.32 "W1 → S5.4 #3": a W1-signal s42 training run stores the trainer's library versions and thread count in its
 * `MJ: ML Training Runs.CodeVersion`, the sidecar's CodeVersion names both, and a result lacking either is refused.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';
import { SidecarGates } from './ps-gates/ps-gate-sidecar';

export const PsGateW1S54No3Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s5-4-3.G2.32', Name: 'G2.32 W1 → S5.4 #3: a W1 training run stores library versions and threads; a run lacking either is refused', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const stored = await SidecarGates.MeasureW1StoredCodeVersion(h);
      const nodes = ['tests/gates/test_trainer_contract_gates.py::test_W1_S5_4_3_versions_and_threads_logged'] as const;
      const expectedCases = 1;
      const r = await PsGatePytest.Run(nodes);
      const refusal = SidecarGates.MeasureCodeVersionRefusal();
      const pytestPassed = r.Failed === 0 && r.Errors === 0 && r.NotCollected.length === 0 && r.Collected === expectedCases && r.Passed === expectedCases;
      PsGate.Assert({
        Passed: stored.Passed && pytestPassed && refusal.Passed,
        Measured: { ...stored.Measured, collected: r.Collected, passed: r.Passed, failed: r.Failed, errors: r.Errors, notCollected: r.NotCollected.join(' '), ...refusal.Measured },
        Detail: `${stored.Detail}; ${r.Passed} of ${expectedCases} pytest case(s) passed; ${refusal.Detail}`,
      });
    },
  },
];

for (const c of PsGateW1S54No3Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s5-4-3', PsGate.Lifecycle);
