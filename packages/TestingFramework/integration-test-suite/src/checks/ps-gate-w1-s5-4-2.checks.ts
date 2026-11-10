/** Gate G2.31 "W1 → S5.4 #2": two single-threaded random-forest and MLP trainings repeat their predictions within 1e-9. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW1S54No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s5-4-2.G2.31', Name: 'G2.31 W1 → S5.4 #2: two single-threaded RF and MLP trainings repeat predictions within 1e-9, 2 of 2', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_trainer_contract_gates.py::test_W1_S5_4_2_rf_and_mlp_repeat_exactly'] as const;
      const expectedCases = 2;   // a parametrized node contributes one case per parameter set
      const r = await PsGatePytest.Run(nodes);
      PsGate.Assert({
        Passed: r.Failed === 0 && r.Errors === 0 && r.NotCollected.length === 0 && r.Collected === expectedCases && r.Passed === expectedCases,
        Measured: { collected: r.Collected, passed: r.Passed, failed: r.Failed, errors: r.Errors, notCollected: r.NotCollected.join(' ') },
        Detail: `${r.Passed} of ${expectedCases} pytest case(s) passed; not collected: ${r.NotCollected.join(', ') || 'none'}`,
      });
    },
  },
];

for (const c of PsGateW1S54No2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s5-4-2', PsGate.Lifecycle);
