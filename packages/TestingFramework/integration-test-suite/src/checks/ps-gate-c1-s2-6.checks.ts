/**
 * Gate G2.25 "C1 → S2.6": the same on C1's members: the stored manifest's PersonID group keys give 0 members shared
 * between training and the held-out newest members, the report counts equal that partition, and the inner folds share
 * 0 keys.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';

export const PsGateC1S26Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s2-6.G2.25', Name: 'G2.25 C1 → S2.6: new-entity mode shares 0 member keys with training and 0 across inner folds', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await EvaluationProtocolGates.MeasureC1NewEntity(h));
    },
  },
];

for (const c of PsGateC1S26Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s2-6', PsGate.Lifecycle);
