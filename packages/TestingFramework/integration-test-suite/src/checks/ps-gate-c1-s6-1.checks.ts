/**
 * Gate G2.6 "C1 → S6.1": the C1 holdout is carved by decision date from 2024-01-01 to 2025-01-01; every stored holdout
 * key falls after the cutoff, none is in training, and they equal the reference pipeline's 1,205 test keys.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';

export const PsGateC1S61Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s6-1.G2.6', Name: 'G2.6 C1 → S6.1: the holdout is carved by date after the cutoff, 0 keys in training, 1,205 reference keys', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await EvaluationProtocolGates.MeasureC1DateCarvedHoldout(h));
    },
  },
];

for (const c of PsGateC1S61Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s6-1', PsGate.Lifecycle);
