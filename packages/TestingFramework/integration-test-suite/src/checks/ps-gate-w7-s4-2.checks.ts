/**
 * Gate G0.12 "W7 → S4.2": on W7-small-imbalanced s42–s44, every builder-agent run either produces no model or produces
 * one whose holdout accuracy is at or below the always-majority rate of its locked holdout (at least one such model, none without an
 * accuracy), and every such model's stored trust verdict is Poor, not actionable, and carries the enforced
 * majority-baseline finding. A model that beats the majority rate fails the gate: it would leave the rule unmeasured.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AgentPlans, ContainmentProbe, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type CandidateModel, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The majority-baseline read of G0.12. */
class MajorityBaselineSteps {
  /**
   * The always-majority accuracy on the model's locked holdout (the Python holdout_rebuild judge, from the class counts
   * the model's lineage records). The judge exits non-zero when the lineage has no class counts; `h.Judge` then throws
   * with its message, which fails the gate.
   */
  public static async MajorityRate(h: TruthHarness, m: CandidateModel, seed: number): Promise<number> {
    const holdout = await h.Judge<{ n: number; majorityCount: number; majorityRate: number; classCounts: Record<string, number> }>('holdout_rebuild', [
      '--model', await h.WriteArtifact(`g012-s${seed}-model`, m),
    ]);
    return holdout.majorityRate;
  }

  /**
   * The majority-baseline rule held for `m`: its verdict (Core's `TrustVerdicts.DeriveTrustVerdict` on the stored model
   * row, as the UI derives it) is Poor, not actionable, and carries the enforced majority-baseline finding.
   */
  public static Downgraded(m: CandidateModel): boolean {
    return !ContainmentProbe.GradedAbovePoorOrActionable(m) && m.Trust.MajorityBaseline?.Enforced === true;
  }
}

export const PsGateW7S42Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w7-s4-2.G0.12', Name: 'G0.12 W7 → S4.2: at-or-below-majority small-data models are never graded above Poor', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      let qualifying = 0;
      let violations = 0;
      let noModel = 0;
      let noAccuracy = 0;
      const out: Record<string, number | string | boolean | null> = {};
      for (const seed of [42, 43, 44]) {
        const w7 = await h.EnsureLoaded({ Kind: 'world', ID: 'W7-small-imbalanced', Seed: seed });
        const r = await h.RunBuilderAgent(AgentPlans.Build({
          Name: `PSTruth: G0.12 W7 s${seed} ${h.RunID}`, Entity: w7.Entity, Target: 'Renewed', Features: [...W_WORLD_FEATURES],
          Algorithms: [...PsGateSpecs.Algorithms], DenyFields: [...W_WORLD_DENY_FIELDS],
        }));
        if (!r.AgentSuccess) throw new Error(`G0.12 W7 s${seed}: builder agent run ${r.AgentRunID || '(none)'} failed: ${r.AgentErrorMessage || 'no error message'}`);
        if (!r.BuildModelID) {
          noModel += 1;
          out[`s${seed}`] = `no winner: ${r.BuildErrorMessage || 'the build produced no model'}`;
          continue;
        }
        const m = await h.ReadModel(r.BuildModelID);
        const majority = await MajorityBaselineSteps.MajorityRate(h, m, seed);
        const accuracy = m.HoldoutMetrics['accuracy'] ?? null; // `??` on purpose: an accuracy of 0 is a legitimate value
        Object.assign(out, {
          [`s${seed}Accuracy`]: accuracy, [`s${seed}Majority`]: majority, [`s${seed}Grade`]: m.Trust.grade,
          [`s${seed}CanAct`]: m.Trust.canAct, [`s${seed}MajorityEnforced`]: m.Trust.MajorityBaseline?.Enforced ?? null,
        });
        // A model without a holdout accuracy cannot be placed against the majority rate: a failure, not a skip.
        if (accuracy === null) noAccuracy += 1;
        else if (accuracy <= majority) {
          qualifying += 1;
          if (!MajorityBaselineSteps.Downgraded(m)) violations += 1;
        }
      }
      // Every seed must either produce no model or a qualifying one, and at least one must qualify: "0 of 0" measured nothing.
      const measured = qualifying > 0 && qualifying + noModel === 3 && noAccuracy === 0;
      PsGate.Assert({
        Passed: measured && violations === 0,
        Measured: { ...out, qualifying, violations, runsWithoutModel: noModel, modelsWithoutAccuracy: noAccuracy },
        Detail: measured
          ? `${violations} of ${qualifying} at-or-below-majority models lack the Poor, not-actionable verdict with the enforced majority-baseline finding`
          : `the rule was not fully measured: ${qualifying} qualifying, ${noModel} without a model, ${noAccuracy} without an accuracy, ${3 - qualifying - noModel - noAccuracy} above the majority rate (of 3 runs)`,
      });
    },
  },
];

for (const c of PsGateW7S42Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w7-s4-2', PsGate.Lifecycle);
