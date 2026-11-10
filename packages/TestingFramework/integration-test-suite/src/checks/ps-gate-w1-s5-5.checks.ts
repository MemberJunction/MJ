/** Gate G1.10 "W1 → S5.5": the W1 snapshot manifest holds 16,776 rows, its content hash recomputes, a retrain reproduces within 1e-9. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { TrainingSnapshotGates } from './ps-gates/ps-gate-training-snapshots';

export const PsGateW1S55Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s5-5.G1.10', Name: 'G1.10 W1 → S5.5: the snapshot manifest holds 16,776 rows, its hash matches, a retrain reproduces within 1e-9', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await TrainingSnapshotGates.MeasureW1SnapshotRetrain(h));
    },
  },
];

for (const c of PsGateW1S55Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s5-5', PsGate.Lifecycle);
