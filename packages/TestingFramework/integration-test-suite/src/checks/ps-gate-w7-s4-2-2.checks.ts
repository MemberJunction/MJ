/**
 * Gate G2.5 "W7 → S4.2 #2": on W7-small-imbalanced the stored gate decision is `model` for 0 of 3 seeds whose holdout
 * AUC interval contains 0.5 or whose minority class has fewer rows than the protocol minimum (20). Each seed trains
 * through MJAPI and the check reads the gate record stored on the run, guard inputs included.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { GateOutcomeMeasures } from './ps-gates/ps-gate-outcomes';

export const PsGateW7S42No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w7-s4-2-2.G2.5', Name: 'G2.5 W7 → S4.2 #2: model for 0 of 3 seeds whose AUC interval contains 0.5 or minority class has under 20 rows', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await GateOutcomeMeasures.MeasureW7GuardedOutcomes(h));
    },
  },
];

for (const c of PsGateW7S42No2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w7-s4-2-2', PsGate.Lifecycle);
