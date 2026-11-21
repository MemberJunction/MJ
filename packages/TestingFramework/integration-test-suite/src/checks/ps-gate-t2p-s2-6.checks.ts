/**
 * Gate G2.24 "T2p → S2.6": in new-entity mode the run stores hashes of its held-out and training group sets; the gate
 * rebuilds both sets of entities from the stored manifest, verifies the hashes (membership), measures 0 held groups
 * among the verified training groups, requires the report to agree (shared keys and counts), and runs the inner-fold
 * pytest nodes.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';

export const PsGateT2pS26Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t2p-s2-6.G2.24', Name: 'G2.24 T2p → S2.6: new-entity mode shares 0 entity keys with training and 0 across inner folds', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await EvaluationProtocolGates.MeasureT2pNewEntity(h));
    },
  },
];

for (const c of PsGateT2pS26Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t2p-s2-6', PsGate.Lifecycle);
