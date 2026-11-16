/** Gate G1.9 "W1 → S7.5 #2": a string column bound as numeric stops the run naming the column, and 0 values are coerced. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { AsOfAssemblyGates } from './ps-gates/ps-gate-as-of-assembly';

export const PsGateW1S75No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s7-5-2.G1.9', Name: 'G1.9 W1 → S7.5 #2: a string column bound numeric stops the run naming the column; 0 values coerced', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await AsOfAssemblyGates.MeasureW1StringAsNumericRefused(h));
    },
  },
];

for (const c of PsGateW1S75No2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s7-5-2', PsGate.Lifecycle);
