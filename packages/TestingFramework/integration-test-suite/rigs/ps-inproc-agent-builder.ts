/**
 * ps-inproc-agent-builder.ts — IN-PROCESS proof of the **Predictive Studio Agent's deterministic
 * builder**: `PredictiveStudioPipelineBuilder.build(ModelingPlanSpec)` — the code (no-LLM) step that
 * turns the agent's approved, strongly-typed modeling plan into real metadata: it creates the
 * `MJ: ML Training Pipelines` row, binds its Prediction Unit and default Evaluation Protocol, trains one search over
 * the plan's experiments via the engine, and **publishes the model only if the trust verdict clears the bar** (the same
 * `TrustVerdicts.DeriveTrustVerdict` rendering of the training run's stored gate decision the business UI uses).
 *
 * This is what proves "the agent can BUILD NEW THINGS" without needing the full LLM loop — we feed the
 * builder a hand-authored plan (what the Goal Analyst / Data Scout / Experiment Designer sub-agents
 * would have accumulated) and assert the pipeline + model were created and the publish GATE behaved.
 *
 * The renewal model on AssociationDemo Memberships(Status) is intentionally near-chance, so the gate's
 * SAFETY path is exercised: a weak model is trained but NOT published (held with a plain reason), while
 * the publish-iff-trustworthy invariant is asserted either way.
 *
 * ## Why in-process (mirrors ps-inproc-operate-flow.ts)
 * Needs the real server-side training engine + the Python sidecar, so it uses `bootstrapAI()` (the real
 * SQLServerDataProvider in-process, no MJAPI) and gates the train leg behind `PS_INTEGRATION=1`.
 *
 * THROWAWAY: creates the driver's ML Algorithm (if missing) + a pipeline with its Prediction Unit and Evaluation
 * Protocol + a training run with its Training Snapshot + the shipped model, then deletes every row it created in
 * `finally`, children first, through `lib/ps-rig-lifecycle.ts` (a row it cannot delete fails the rig).
 *
 * USAGE (from the repo root; needs AssociationDemo's Memberships):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-agent-builder.ts
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-agent-builder.ts   # deterministic SKIP (no sidecar)
 *
 * Exit code: 0 = passed (or cleanly skipped), 1 = failures, 2 = bootstrap error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import { DeleteRecordedRows, EnsureDriverAlgorithm, RecordPipelineBindings, ReportCleanup, type RigAlgorithm } from './lib/ps-rig-lifecycle';
import { RunView } from '@memberjunction/core';
import '@memberjunction/core-entities';
import { TrustVerdicts, type ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { RunRecords } from '@memberjunction/predictive-studio-truth-suite';
import { PredictiveStudioPipelineBuilder, LoadMLModelInferenceProcessor } from '@memberjunction/predictive-studio';

// Anchor the side-effect registration so the transpiler/bundler can't drop the 'ML Model' work type.
LoadMLModelInferenceProcessor();

const PS_LIVE = process.env.PS_INTEGRATION === '1';
const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-inproc-agent-builder (safe to delete)';

function banner(title: string): void {
  console.log(`\n${'═'.repeat(78)}\n  ${title}\n${'═'.repeat(78)}`);
}
let failures = 0;
function check(condition: boolean, label: string): void {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures++;
}

/** The plan the Goal Analyst / Data Scout / Experiment Designer sub-agents would have accumulated. */
function buildPlan(): ModelingPlanSpec {
  return {
    Goal: `${TAG} — predict member renewal`,
    TargetDefinition: { EntityName: 'Memberships', TargetVariable: 'Status', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [{ Kind: 'Entity', Ref: 'Memberships', Why: 'the membership records being predicted' }],
    CandidateFeatures: [
      { Name: 'AutoRenew', SourceRef: 'Memberships', Kind: 'numeric', Why: 'a direct renewal-intent signal' },
      { Name: 'MembershipType', SourceRef: 'Memberships', Kind: 'categorical', Why: 'membership segment' },
    ],
    LeakageNotes: [{ Field: 'CancellationDate', Risk: 'reveals the outcome', Action: 'exclude' }],
    ProposedExperiments: [
      { Label: 'LR baseline', AlgorithmName: DRIVER_KEY, FeatureSet: ['AutoRenew', 'MembershipType'], Rationale: 'interpretable baseline', Priority: 1 },
      { Label: 'XGB challenger', AlgorithmName: 'xgboost', FeatureSet: ['AutoRenew', 'MembershipType'], Rationale: 'non-linear challenger', Priority: 2 },
    ],
    ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
    Approved: true,
  };
}

async function main(): Promise<void> {
  const { provider, user } = await BootstrapAI();
  banner('PREDICTIVE STUDIO AGENT — DETERMINISTIC BUILDER (in-process)');

  // Resolve scope sanity: Memberships must exist (AssociationDemo loaded).
  if (!provider.EntityByName('Memberships')) {
    console.log('  SKIP: entity "Memberships" not found — AssociationDemo not loaded. (exit 0)');
    process.exit(0);
  }
  if (!PS_LIVE) {
    console.log('\n  SKIP: set PS_INTEGRATION=1 (with the Python sidecar reachable) to train + build. (exit 0)');
    process.exit(0);
  }

  const records = new RunRecords();
  let algorithm: RigAlgorithm | undefined;
  try {
    algorithm = await EnsureDriverAlgorithm(provider, user, DRIVER_KEY, TAG);

    banner('BUILD: PredictiveStudioPipelineBuilder.build(plan) — create pipeline → train → publish-gated-on-trust');
    const t0 = Date.now();
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: buildPlan(), provider, user, autoPublish: true, sidecarVersion: TAG });
    console.log(`  Built in ${Date.now() - t0}ms — success=${result.success} pipelineId=${result.pipelineId} modelId=${result.modelId}`);
    console.log(`  Trust: outcome=${result.trust ? TrustVerdicts.OutcomeTitle(result.trust) : '(none)'} canAct=${result.trust?.CanAct} | published=${result.published} | leakageFlagged=${result.leakageFlagged} | held=${result.heldReason || '(n/a)'}`);
    console.log(`  Stored gate decision: ${result.Gate ? `${result.Gate.Outcome} — ${result.Gate.Reason}` : '(none)'}`);
    if (result.pipelineId) await RecordPipelineBindings(provider, user, records, [result.pipelineId]);
    if (result.modelId) records.RecordModel(result.modelId);

    check(result.success, `builder reported success${result.errorMessage ? ` — ${result.errorMessage}` : ''}`);
    check(!!result.pipelineId, 'a training pipeline was created');
    check(records.PredictionUnitIDs.Size === 1 && records.EvaluationProtocolIDs.Size === 1, 'the pipeline is bound to a Prediction Unit and an Evaluation Protocol');
    check(!!result.Gate, 'the training run stored a gate decision');
    // A model ships (with its verdict) unless the stored decision is no-signal.
    const shipsModel = !!result.Gate && result.Gate.Outcome !== 'no-signal';
    check(!!result.modelId === shipsModel, `a model ships exactly when the stored decision ships one (modelId=${result.modelId ?? 'none'}, outcome=${result.Gate?.Outcome ?? 'none'})`);
    check(!!result.trust === shipsModel, 'a shipped model carries the stored-gate trust verdict; no model, no verdict');
    const leaderboard = result.leaderboard || [];
    console.log(`  Leaderboard: ${JSON.stringify(leaderboard)}`);
    // One search over the plan's experiments: a row per scored candidate, each an optimistic inner-fold score, one finalist.
    check(leaderboard.length >= 1 && leaderboard.every((r) => r.optimistic === true), 'the search leaderboard has inner-fold rows, each marked optimistic');
    check(leaderboard.filter((r) => r.isWinner === true).length === 1, 'exactly one leaderboard row is the finalist');
    check(!JSON.stringify(leaderboard).includes('cvScore'), 'no leaderboard row carries a cvScore');

    // The core invariant: a model is published IFF the trust verdict clears the bar AND no leakage flag.
    const shouldPublish = !!result.trust?.CanAct && !result.leakageFlagged;
    check(result.published === shouldPublish, `publish gate honored (published=${result.published} === canAct&&!leakage=${shouldPublish})`);
    if (!result.published) check(!!result.heldReason, 'a held model carries a plain-language reason (the safety gate)');

    // Verify the persisted pipeline + model status match the gate decision.
    if (result.pipelineId) {
      const p = await new RunView().RunView<{ ID: string; TargetVariable: string }>(
        { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${result.pipelineId}'`, Fields: ['ID', 'TargetVariable'], ResultType: 'simple', MaxRows: 1, BypassCache: true }, user,
      );
      check(p.Results?.[0]?.TargetVariable === 'Status', 'the persisted pipeline targets the right variable (Status)');
    }
    if (result.modelId) {
      const m = await new RunView().RunView<{ ID: string; Status: string }>(
        { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${result.modelId}'`, Fields: ['ID', 'Status'], ResultType: 'simple', MaxRows: 1, BypassCache: true }, user,
      );
      const expected = result.published ? 'Published' : 'Draft';
      check(m.Results?.[0]?.Status === expected, `the persisted model Status is '${expected}' (matches the gate)`);
    }

    banner(failures === 0 ? 'AGENT-BUILDER PROOF COMPLETE — ALL CHECKS PASSED' : `AGENT-BUILDER PROOF — ${failures} CHECK(S) FAILED`);
  } finally {
    banner('CLEANUP');
    failures += ReportCleanup(await DeleteRecordedRows(provider, user, records, algorithm));
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('BOOTSTRAP/RUN ERROR:', e instanceof Error ? e.stack : e);
  process.exit(2);
});
