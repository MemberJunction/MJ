/**
 * ps-inproc-agent-run.ts — IN-PROCESS proof that the **elevated Model Development Agent actually builds
 * a new prediction through the agent framework**. Where ps-inproc-agent-builder.ts calls the builder
 * SERVICE directly, this runs the registered **Pipeline Builder** code sub-agent end-to-end via the real
 * `AgentRunner` with an approved `ModelingPlanSpec` payload — exercising the full metadata → DriverClass
 * → `executeAgentInternal` → build → train → publish-gated-on-trust path that the conversational flow hits
 * once the user approves a plan. No LLM is involved (the builder is a code agent), so it's deterministic.
 *
 * Requires the `Pipeline Builder` sub-agent to be synced (DriverClass PredictiveStudioPipelineBuilderAgent).
 * Gated behind PS_INTEGRATION=1 + a reachable sidecar; self-cleans (run → model → pipeline).
 *
 * USAGE: PS_INTEGRATION=1 npx tsx packages/MJServer/integration-test-scripts/ps-inproc-agent-run.ts
 * Exit: 0 = passed/skipped, 1 = failures, 2 = bootstrap error.
 */
import { bootstrapAI } from './lib/ai-bootstrap';
import { RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import '@memberjunction/core-entities';
import { MJMLAlgorithmEntity, MJMLTrainingPipelineEntity, MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { LoadMLModelInferenceProcessor } from '@memberjunction/predictive-studio';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';

LoadMLModelInferenceProcessor();

const PS_LIVE = process.env.PS_INTEGRATION === '1';
const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-inproc-agent-run (safe to delete)';
const BUILDER_AGENT_NAME = 'Pipeline Builder';

function banner(t: string): void { console.log(`\n${'═'.repeat(78)}\n  ${t}\n${'═'.repeat(78)}`); }
let failures = 0;
function check(c: boolean, label: string): void { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${label}`); if (!c) failures++; }

async function ensureAlgorithm(md: IMetadataProvider, user: UserInfo): Promise<string> {
  const existing = await new RunView().RunView<{ ID: string }>(
    { EntityName: 'MJ: ML Algorithms', ExtraFilter: `Name='${DRIVER_KEY}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, user);
  if (existing.Success && existing.Results.length > 0) return existing.Results[0].ID;
  const algo = await md.GetEntityObject<MJMLAlgorithmEntity>('MJ: ML Algorithms', user);
  algo.NewRecord();
  algo.Name = DRIVER_KEY; algo.Description = TAG; algo.ProblemTypes = 'classification';
  algo.DriverClass = DRIVER_KEY; algo.SupportsFeatureImportance = true; algo.Status = 'Active';
  if (!(await algo.Save())) throw new Error(`algo save failed: ${algo.LatestResult?.CompleteMessage}`);
  return algo.ID;
}

function approvedPlan(): ModelingPlanSpec {
  return {
    Goal: `${TAG} — predict member renewal`,
    TargetDefinition: { EntityName: 'Memberships', TargetVariable: 'Status', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [{ Kind: 'Entity', Ref: 'Memberships', Why: 'membership records' }],
    CandidateFeatures: [
      { Name: 'AutoRenew', SourceRef: 'Memberships', Kind: 'numeric', Why: 'renewal intent' },
      { Name: 'MembershipType', SourceRef: 'Memberships', Kind: 'categorical', Why: 'segment' },
    ],
    LeakageNotes: [{ Field: 'CancellationDate', Risk: 'leaks outcome', Action: 'exclude' }],
    ProposedExperiments: [{ Label: 'LR', AlgorithmName: DRIVER_KEY, FeatureSet: ['AutoRenew', 'MembershipType'], Rationale: 'baseline', Priority: 1 }],
    ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
    Approved: true,
  };
}

async function cleanup(md: IMetadataProvider, user: UserInfo): Promise<void> {
  banner('CLEANUP');
  try {
    const pipes = await new RunView().RunView<{ ID: string }>(
      { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `Name LIKE '%ps-inproc-agent-run%'`, Fields: ['ID'], ResultType: 'simple' }, user);
    for (const p of pipes.Results ?? []) {
      const runs = await new RunView().RunView<MJMLTrainingRunEntity>(
        { EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID='${p.ID}'`, ResultType: 'entity_object' }, user);
      for (const r of runs.Results ?? []) await r.Delete();
      const models = await new RunView().RunView<MJMLModelEntity>(
        { EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID='${p.ID}'`, ResultType: 'entity_object' }, user);
      for (const m of models.Results ?? []) await m.Delete();
      const pe = await md.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
      if (await pe.Load(p.ID)) await pe.Delete();
    }
    console.log('  cleanup done.');
  } catch (e) { console.log(`  cleanup warning: ${e instanceof Error ? e.message : String(e)}`); }
}

async function main(): Promise<void> {
  const { provider, user } = await bootstrapAI();
  banner('PREDICTIVE STUDIO AGENT — RUN BUILDER SUB-AGENT VIA AgentRunner (in-process)');
  if (!provider.EntityByName('Memberships')) { console.log('  SKIP: Memberships not found. (exit 0)'); process.exit(0); }
  if (!PS_LIVE) { console.log('\n  SKIP: set PS_INTEGRATION=1 (+ sidecar). (exit 0)'); process.exit(0); }

  await AIEngine.Instance.Config(false, user);
  const agent = AIEngine.Instance.Agents.find((a) => a.Name?.toLowerCase() === BUILDER_AGENT_NAME.toLowerCase());
  check(!!agent, `'${BUILDER_AGENT_NAME}' sub-agent found in metadata (mj sync landed)`);
  check(agent?.DriverClass === 'PredictiveStudioPipelineBuilderAgent', `it has DriverClass 'PredictiveStudioPipelineBuilderAgent' (got '${agent?.DriverClass}')`);
  if (!agent) { await cleanup(provider, user); process.exit(1); }

  try {
    await ensureAlgorithm(provider, user);
    banner('RUN: AgentRunner.RunAgent(Pipeline Builder, payload=approved ModelingPlanSpec)');
    const t0 = Date.now();
    const result = await new AgentRunner().RunAgent({
      agent,
      conversationMessages: [{ role: 'user', content: 'build it' }],
      contextUser: user,
      payload: approvedPlan(),
    });
    console.log(`  Ran in ${Date.now() - t0}ms — agentRun=${result.agentRun?.ID} success=${result.success}`);
    const built = (result.payload ?? {}) as { BuildResult?: { success?: boolean; pipelineId?: string; modelId?: string; trustGrade?: string; published?: boolean; heldReason?: string | null } };
    const br = built.BuildResult;
    console.log(`  BuildResult: ${br ? JSON.stringify({ success: br.success, grade: br.trustGrade, published: br.published }) : '(missing)'}`);

    check(!!result.agentRun?.ID, 'AgentRunner created an AI Agent Run (the framework ran the sub-agent)');
    check(!!br, 'the sub-agent wrote BuildResult back to the payload');
    check(br?.success === true, 'the build succeeded (pipeline created + model trained) through the agent');
    check(!!br?.pipelineId && !!br?.modelId, 'BuildResult carries the created pipeline + model ids');
    check(typeof br?.trustGrade === 'string', 'a plain-language trust grade was produced');
    // The near-chance renewal model is held, not published — the publish gate fires through the agent too.
    check(br?.published === (br?.trustGrade !== 'Poor'), 'the publish gate fired through the agent (Poor → held)');

    // Confirm a real pipeline actually landed in the DB.
    const pipes = await new RunView().RunView<{ ID: string }>(
      { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `Name LIKE '%ps-inproc-agent-run%'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user);
    check((pipes.Results?.length ?? 0) >= 1, 'a real MJ: ML Training Pipeline was created in the database by the agent run');

    banner(failures === 0 ? 'AGENT-RUN PROOF COMPLETE — ALL CHECKS PASSED' : `AGENT-RUN PROOF — ${failures} CHECK(S) FAILED`);
  } finally {
    await cleanup(provider, user);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('BOOTSTRAP/RUN ERROR:', e instanceof Error ? e.stack : e); process.exit(2); });
