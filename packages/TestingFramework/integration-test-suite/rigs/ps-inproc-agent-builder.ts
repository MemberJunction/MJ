/**
 * ps-inproc-agent-builder.ts — IN-PROCESS proof of the **Predictive Studio Agent's deterministic
 * builder**: `PredictiveStudioPipelineBuilder.build(ModelingPlanSpec)` — the code (no-LLM) step that
 * turns the agent's approved, strongly-typed modeling plan into real metadata: it creates the
 * `MJ: ML Training Pipelines` row, trains a model via the engine, and **publishes the model only if
 * the trust verdict clears the bar** (the same `deriveTrustVerdict` gate the business UI uses).
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
 * THROWAWAY: creates a driver-named ML Algorithm (if missing) + a pipeline + a trained model + run, then
 * deletes every row it created (child→parent) in `finally`.
 *
 * USAGE (from the repo root):
 *   PS_INTEGRATION=1 npx tsx packages/MJServer/integration-test-scripts/ps-inproc-agent-builder.ts
 *   npx tsx packages/MJServer/integration-test-scripts/ps-inproc-agent-builder.ts   # deterministic SKIP (no sidecar)
 *
 * Exit code: 0 = passed (or cleanly skipped), 1 = failures, 2 = bootstrap error.
 */
import { bootstrapAI } from './lib/ai-bootstrap';
import { RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import '@memberjunction/core-entities';
import { MJMLAlgorithmEntity, MJMLTrainingPipelineEntity, MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
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

/** Resolve (or create) the sidecar-driver-named ML Algorithm. */
async function ensureAlgorithm(md: IMetadataProvider, user: UserInfo): Promise<{ id: string; created: boolean }> {
  const existing = await new RunView().RunView<{ ID: string }>(
    { EntityName: 'MJ: ML Algorithms', ExtraFilter: `Name='${DRIVER_KEY}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
    user,
  );
  if (existing.Success && existing.Results.length > 0) return { id: existing.Results[0].ID, created: false };
  const algo = await md.GetEntityObject<MJMLAlgorithmEntity>('MJ: ML Algorithms', user);
  algo.NewRecord();
  algo.Name = DRIVER_KEY;
  algo.Description = TAG;
  algo.ProblemTypes = 'classification';
  algo.DriverClass = DRIVER_KEY;
  algo.SupportsFeatureImportance = true;
  algo.Status = 'Active';
  if (!(await algo.Save())) throw new Error(`Failed to create ML Algorithm: ${algo.LatestResult?.CompleteMessage}`);
  return { id: algo.ID, created: true };
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
    ],
    ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
    Approved: true,
  };
}

/** Delete every row the run created (child → parent). Best-effort; logs but never throws out. */
async function cleanup(md: IMetadataProvider, user: UserInfo, ids: { modelId?: string; pipelineId?: string; algorithmId?: string; algorithmCreated: boolean }): Promise<void> {
  banner('CLEANUP');
  try {
    if (ids.modelId) {
      const runs = await new RunView().RunView<MJMLTrainingRunEntity>(
        { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ResultingModelID='${ids.modelId}'`, ResultType: 'entity_object' }, user,
      );
      for (const r of runs.Results ?? []) await r.Delete();
      const model = await md.GetEntityObject<MJMLModelEntity>('MJ: ML Models', user);
      if (await model.Load(ids.modelId)) await model.Delete();
    }
    if (ids.pipelineId) {
      const p = await md.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
      if (await p.Load(ids.pipelineId)) await p.Delete();
    }
    if (ids.algorithmCreated && ids.algorithmId) {
      const a = await md.GetEntityObject<MJMLAlgorithmEntity>('MJ: ML Algorithms', user);
      if (await a.Load(ids.algorithmId)) await a.Delete();
    }
    console.log('  cleanup done.');
  } catch (e) {
    console.log(`  cleanup warning: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main(): Promise<void> {
  const { provider, user } = await bootstrapAI();
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

  const created = { algorithmCreated: false } as { modelId?: string; pipelineId?: string; algorithmId?: string; algorithmCreated: boolean };
  try {
    const algo = await ensureAlgorithm(provider, user);
    created.algorithmId = algo.id;
    created.algorithmCreated = algo.created;

    banner('BUILD: PredictiveStudioPipelineBuilder.build(plan) — create pipeline → train → publish-gated-on-trust');
    const t0 = Date.now();
    const result = await new PredictiveStudioPipelineBuilder().build({ spec: buildPlan(), provider, user, autoPublish: true, sidecarVersion: TAG });
    console.log(`  Built in ${Date.now() - t0}ms — success=${result.success} pipelineId=${result.pipelineId} modelId=${result.modelId}`);
    console.log(`  Trust: grade=${result.trust?.grade} canAct=${result.trust?.canAct} | published=${result.published} | leakageFlagged=${result.leakageFlagged} | held=${result.heldReason ?? '(n/a)'}`);
    created.pipelineId = result.pipelineId;
    created.modelId = result.modelId;

    check(result.success, 'builder reported success');
    check(!!result.pipelineId, 'a training pipeline was created');
    check(!!result.modelId, 'a model was trained');
    check(!!result.trust && ['Poor', 'Fair', 'Good', 'Excellent'].includes(result.trust.grade), 'a plain-language trust verdict was produced');

    // The core invariant: a model is published IFF the trust verdict clears the bar AND no leakage flag.
    const shouldPublish = !!result.trust?.canAct && !result.leakageFlagged;
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
    await cleanup(provider, user, created);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('BOOTSTRAP/RUN ERROR:', e instanceof Error ? e.stack : e);
  process.exit(2);
});
