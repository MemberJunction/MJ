/** Gate G1.12 "C1 → S3.1": the training and scoring paths give identical feature vectors, 0 mismatches of 100. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { AsOfAssemblyGates } from './ps-gates/ps-gate-as-of-assembly';

export const PsGateC1S31Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s3-1.G1.12', Name: 'G1.12 C1 → S3.1: training and scoring paths give identical vectors, 0 mismatches of 100', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await AsOfAssemblyGates.MeasureC1TrainScoreParity(h));
    },
  },
];

for (const c of PsGateC1S31Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s3-1', PsGate.Lifecycle);
