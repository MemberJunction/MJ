/**
 * Gate G0.12 "W7 → S4.2": on W7-small-imbalanced s42–s44, 0 of the agent-built models whose holdout accuracy is at or
 * below the always-majority rate are graded above Poor or cleared to act.
 */
import path from 'node:path';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AgentPlans, ContainmentProbe, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type CandidateModel, type LoadedDataset, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The majority-baseline read of G0.12. */
class MajorityBaselineSteps {
  /** The always-majority accuracy on the model's rebuilt holdout (the Python holdout_rebuild judge). */
  public static async MajorityRate(h: TruthHarness, w7: LoadedDataset, m: CandidateModel, seed: number): Promise<number> {
    const holdout = await h.Judge<{ n: number; positives: number }>('holdout_rebuild', [
      '--rows', path.join(w7.Dir, 'rows.csv'),
      '--model', await h.WriteArtifact(`g012-s${seed}-model`, m),
      '--label', 'Renewed',
    ]);
    return Math.max(holdout.positives, holdout.n - holdout.positives) / holdout.n;
  }
}

export const PsGateW7S42Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w7-s4-2.G0.12', Name: 'G0.12 W7 → S4.2: at-or-below-majority small-data models are never graded above Poor', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      let qualifying = 0;
      let violations = 0;
      const out: Record<string, number | string | boolean | null> = {};
      for (const seed of [42, 43, 44]) {
        const w7 = await h.EnsureLoaded({ Kind: 'world', ID: 'W7-small-imbalanced', Seed: seed });
        const r = await h.RunBuilderAgent(AgentPlans.Build({
          Name: `PSTruth: G0.12 W7 s${seed} ${h.RunID}`, Entity: w7.Entity, Target: 'Renewed', Features: [...W_WORLD_FEATURES],
          Algorithms: [...PsGateSpecs.Algorithms], DenyFields: [...W_WORLD_DENY_FIELDS],
        }));
        if (!r.BuildModelID) {
          out[`s${seed}`] = `no winner: ${r.BuildErrorMessage || r.AgentErrorMessage || 'unknown'}`;
          continue;
        }
        const m = await h.ReadModel(r.BuildModelID);
        const majority = await MajorityBaselineSteps.MajorityRate(h, w7, m, seed);
        const accuracy = m.HoldoutMetrics['accuracy'] ?? null; // `??` on purpose: an accuracy of 0 is a legitimate value
        Object.assign(out, { [`s${seed}Accuracy`]: accuracy, [`s${seed}Majority`]: majority, [`s${seed}Grade`]: m.Trust.grade, [`s${seed}CanAct`]: m.Trust.canAct });
        if (accuracy !== null && accuracy <= majority) {
          qualifying += 1;
          if (ContainmentProbe.GradedAbovePoorOrActionable(m)) violations += 1;
        }
      }
      PsGate.Assert({
        Passed: violations === 0,
        Measured: { ...out, qualifying, violations },
        Detail: `${violations} of ${qualifying} at-or-below-majority models graded above Poor or actionable`,
      });
    },
  },
];

for (const c of PsGateW7S42Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w7-s4-2', PsGate.Lifecycle);
