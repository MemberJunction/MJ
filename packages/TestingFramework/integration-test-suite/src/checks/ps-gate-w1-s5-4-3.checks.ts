/** Gate G2.32 "W1 → S5.4 #3": lineage records library versions and the thread count; a lineage lacking either is refused. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';
import { SidecarGates } from './ps-gates/ps-gate-sidecar';

export const PsGateW1S54No3Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s5-4-3.G2.32', Name: 'G2.32 W1 → S5.4 #3: lineage records library versions and threads; a run lacking either is refused', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_trainer_contract_gates.py::test_W1_S5_4_3_versions_and_threads_logged'] as const;
      const expectedCases = 1;
      const r = await PsGatePytest.Run(nodes);
      const refusal = SidecarGates.MeasureCodeVersionRefusal();
      const pytestPassed = r.Failed === 0 && r.Errors === 0 && r.NotCollected.length === 0 && r.Collected === expectedCases && r.Passed === expectedCases;
      PsGate.Assert({
        Passed: pytestPassed && refusal.Passed,
        Measured: { collected: r.Collected, passed: r.Passed, failed: r.Failed, errors: r.Errors, notCollected: r.NotCollected.join(' '), ...refusal.Measured },
        Detail: `${r.Passed} of ${expectedCases} pytest case(s) passed; ${refusal.Detail}`,
      });
    },
  },
];

for (const c of PsGateW1S54No3Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s5-4-3', PsGate.Lifecycle);
