/**
 * Gate G0.12 "W7 → S4.2": on W7-small-imbalanced s42–s44, every builder-agent run either produces a model whose holdout
 * accuracy is at or below the always-majority rate of its locked holdout, is not actionable (its trust verdict, the
 * training run's stored gate decision, does not clear it) and carries the enforced majority-baseline finding — or ships
 * no model, and then its training run stores a no-signal gate decision together with the minority-guard inputs (the
 * holdout class counts and the protocol's minimum minority rows), so a run that ships nothing is measured, never passed
 * by absence. A model that beats the majority rate, or one without a holdout accuracy, fails the gate.
 */
import { GateRecords, TrustVerdicts } from '@memberjunction/predictive-studio-core';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AgentPlans, ContainmentProbe, UnitFixtures, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type CandidateModel, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
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
   * The majority-baseline rule held for `m`: its trust verdict (Core's `TrustVerdicts.DeriveTrustVerdict` on its
   * training run, as the UI derives it) does not let a user act on it, and the stored model carries the enforced
   * majority-baseline finding.
   */
  public static Downgraded(m: CandidateModel): boolean {
    return !m.Trust.CanAct && ContainmentProbe.ReadMajorityBaselineFinding(m)?.Enforced === true;
  }

  /**
   * What the training run of a build that shipped no model stored: a no-signal decision with the minority-guard inputs
   * (holdout class counts and the minimum), and the smallest holdout class against that minimum.
   */
  public static async NoSignalStored(h: TruthHarness, pipelineIds: readonly string[]): Promise<{ readonly Stored: boolean; readonly Text: string }> {
    const pipelineId = pipelineIds[0];
    if (pipelineId === undefined) return { Stored: false, Text: 'the run created no pipeline' };
    const gate = GateRecords.ParseStoredGateRecord((await UnitFixtures.LatestRun(h, pipelineId)).ValidationResults);
    if (gate === null) return { Stored: false, Text: 'no stored gate decision' };
    const counts = gate.guards.holdoutClassCounts;
    const minority = counts === null ? null : Math.min(...Object.values(counts));
    const stored = gate.decision.outcome === 'no-signal' && counts !== null && Number.isFinite(gate.guards.minMinorityClassRows);
    return { Stored: stored, Text: `${gate.decision.outcome}; holdout minority ${minority === null ? 'unrecorded' : minority} of minimum ${gate.guards.minMinorityClassRows}` };
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
          const stored = await MajorityBaselineSteps.NoSignalStored(h, r.PipelineIDs);
          if (stored.Stored) noModel += 1;
          out[`s${seed}`] = `no model: ${stored.Text}${r.BuildErrorMessage ? ` (${r.BuildErrorMessage})` : ''}`;
          continue;
        }
        const m = await h.ReadModel(r.BuildModelID);
        const majority = await MajorityBaselineSteps.MajorityRate(h, m, seed);
        const accuracy = m.HoldoutMetrics['accuracy'] ?? null; // `??` on purpose: an accuracy of 0 is a legitimate value
        // `?? null` on the finding: an Enforced of false is a real value.
        Object.assign(out, {
          [`s${seed}Accuracy`]: accuracy, [`s${seed}Majority`]: majority, [`s${seed}Outcome`]: TrustVerdicts.OutcomeTitle(m.Trust),
          [`s${seed}CanAct`]: m.Trust.CanAct, [`s${seed}MajorityEnforced`]: ContainmentProbe.ReadMajorityBaselineFinding(m)?.Enforced ?? null,
        });
        // A model without a holdout accuracy cannot be placed against the majority rate: a failure, not a skip.
        if (accuracy === null) noAccuracy += 1;
        else if (accuracy <= majority) {
          qualifying += 1;
          if (!MajorityBaselineSteps.Downgraded(m)) violations += 1;
        }
      }
      // Every seed must produce a qualifying model or no model with a stored no-signal decision and its guard inputs.
      const measured = qualifying + noModel === 3 && noAccuracy === 0;
      PsGate.Assert({
        Passed: measured && violations === 0,
        Measured: { ...out, qualifying, violations, runsWithoutModelStoringNoSignal: noModel, modelsWithoutAccuracy: noAccuracy },
        Detail: measured
          ? `${violations} of ${qualifying} at-or-below-majority models lack the not-actionable verdict with the enforced majority-baseline finding; ${noModel} runs shipped no model and store a no-signal decision with the minority-guard inputs`
          : `the rule was not fully measured: ${qualifying} qualifying, ${noModel} without a model storing no-signal with its guard inputs, ${noAccuracy} without an accuracy, ${3 - qualifying - noModel - noAccuracy} above the majority rate or without a stored decision (of 3 runs)`,
      });
    },
  },
];

for (const c of PsGateW7S42Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w7-s4-2', PsGate.Lifecycle);
