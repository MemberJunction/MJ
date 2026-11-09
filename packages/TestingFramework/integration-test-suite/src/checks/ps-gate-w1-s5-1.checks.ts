/**
 * Gate G2.29 "W1 → S5.1": every W1-signal s42 training run references a protocol row created before it, and a training
 * with no protocol is refused (PROTOCOL_REQUIRED) with no run row.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';

export const PsGateW1S51Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s5-1.G2.29', Name: 'G2.29 W1 → S5.1: every run references a protocol created before it; a search with no protocol is refused', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await EvaluationProtocolGates.MeasureW1ProtocolPrecedesRuns(h));
    },
  },
];

for (const c of PsGateW1S51Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s5-1', PsGate.Lifecycle);
