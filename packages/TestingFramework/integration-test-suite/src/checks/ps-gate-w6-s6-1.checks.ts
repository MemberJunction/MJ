/**
 * Gate G2.41 "W6 → S6.1": a date-carved holdout on StartDate at 2024-01-01 holds out the 6,950 rows from 2024 on; the
 * holdout AUC is within 0.02 of 0.6447 and mean predicted minus observed is at least +0.14.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';

export const PsGateW6S61Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w6-s6-1.G2.41', Name: 'G2.41 W6 → S6.1: out_of_time on StartDate holds out 6,950 rows; AUC within 0.02 of 0.6447; bias at least +0.14', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await EvaluationProtocolGates.MeasureW6OutOfTime(h));
    },
  },
];

for (const c of PsGateW6S61Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w6-s6-1', PsGate.Lifecycle);
