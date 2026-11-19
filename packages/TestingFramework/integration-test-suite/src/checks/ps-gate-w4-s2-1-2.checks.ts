/** Gate G1.4 "W4 → S2.1 #2": PersonStatusNow is excluded or flagged for 4 of 4 catalog algorithms, and every as-of value equals the dated history. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { AsOfAssemblyGates } from './ps-gates/ps-gate-as-of-assembly';

export const PsGateW4S21No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w4-s2-1-2.G1.4', Name: 'G1.4 W4 → S2.1 #2: PersonStatusNow excluded or flagged for 4 of 4 algorithms; as-of values equal history, 100%', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await AsOfAssemblyGates.MeasureW4AsOfStatus(h));
    },
  },
];

for (const c of PsGateW4S21No2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w4-s2-1-2', PsGate.Lifecycle);
