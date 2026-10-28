/** Gate G2.27 "W8 → S3.4": the in-fold target encoding of a high-cardinality column scores chance on shuffled labels. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGatePytest } from './ps-gates/ps-gate-pytest';

export const PsGateW8S34Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w8-s3-4.G2.27', Name: 'G2.27 W8 → S3.4: shuffled labels give a target-encoded held-out AUC interval covering 0.5', RequiresMutation: true,
    Fn: async () => {
      const nodes = ['tests/gates/test_trainer_contract_gates.py::test_W8_S3_4_target_encoding_is_in_fold'] as const;
      const expectedCases = 1;   // a parametrized node contributes one case per parameter set
      const r = await PsGatePytest.Run(nodes);
      PsGate.Assert({
        Passed: r.Failed === 0 && r.Errors === 0 && r.NotCollected.length === 0 && r.Collected === expectedCases && r.Passed === expectedCases,
        Measured: { collected: r.Collected, passed: r.Passed, failed: r.Failed, errors: r.Errors, notCollected: r.NotCollected.join(' ') },
        Detail: `${r.Passed} of ${expectedCases} pytest case(s) passed; not collected: ${r.NotCollected.join(', ') || 'none'}`,
      });
    },
  },
];

for (const c of PsGateW8S34Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w8-s3-4', PsGate.Lifecycle);
