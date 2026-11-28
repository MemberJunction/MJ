/**
 * Gate G2.23 "C2 → S2.5": the seeded-random holdout's positive rate lies inside the population rate's 95% interval,
 * resampling is fitted inside the training folds (pytest node), and 0 row ids are shared between training and holdout.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';

export const PsGateC2S25Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c2-s2-5.G2.23', Name: 'G2.23 C2 → S2.5: holdout positive rate inside the population interval; reweighting in-fold; 0 shared row ids', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await EvaluationProtocolGates.MeasureC2HoldoutRate(h));
    },
  },
];

for (const c of PsGateC2S25Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c2-s2-5', PsGate.Lifecycle);
