/** Gate G1.5 "T3 → S-T.1": SamePeriodTarget is refused naming the column and LagTarget is accepted, 1 of 1 each. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { AsOfAssemblyGates } from './ps-gates/ps-gate-as-of-assembly';

export const PsGateT3ST1Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t3-s-t-1.G1.5', Name: 'G1.5 T3 → S-T.1: SamePeriodTarget refused naming the column; LagTarget accepted, 1 of 1 each', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await AsOfAssemblyGates.MeasureT3SamePeriodRefused(h));
    },
  },
];

for (const c of PsGateT3ST1Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t3-s-t-1', PsGate.Lifecycle);
