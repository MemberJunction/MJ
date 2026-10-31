/**
 * Gate G2.22 "C1 → S1.3": C1's declared heuristic ("renewed last year") is scored on the same holdout as a named
 * comparator, and the stored decision agrees with the stored model-versus-rule comparison, on the year-cutoff holdout
 * and on the reference split. The model beats the rule on both, so the keep-the-rule branch is proven by Core's
 * `gate.test.ts` (`heuristic-carries-signal`), not at runtime.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { GateOutcomeMeasures } from './ps-gates/ps-gate-outcomes';

export const PsGateC1S13Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s1-3.G2.22', Name: 'G2.22 C1 → S1.3: the incumbent heuristic is scored as a named comparator; not beating it keeps the heuristic', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      PsGate.Assert(await GateOutcomeMeasures.MeasureC1IncumbentHeuristic(h));
    },
  },
];

for (const c of PsGateC1S13Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s1-3', PsGate.Lifecycle);
