/** Gate G1.11 "W1 → S3.2": 20 of 20 sampled scored W1 rows resolve every value to its source, source version and computed-at. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { TrainingSnapshotGates } from './ps-gates/ps-gate-training-snapshots';

export const PsGateW1S32Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s3-2.G1.11', Name: 'G1.11 W1 → S3.2: 20 of 20 sampled scored rows resolve every value to source, version and computed-at', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await TrainingSnapshotGates.MeasureW1Provenance(h));
    },
  },
];

for (const c of PsGateW1S32Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s3-2', PsGate.Lifecycle);
