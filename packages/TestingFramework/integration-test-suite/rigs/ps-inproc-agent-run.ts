/**
 * ps-inproc-agent-run.ts — IN-PROCESS proof that the **elevated Model Development Agent actually builds
 * a new prediction through the agent framework**. Where ps-inproc-agent-builder.ts calls the builder
 * SERVICE directly, this runs the registered **Pipeline Builder** code sub-agent end-to-end via the real
 * `AgentRunner` with an approved `ModelingPlanSpec` payload — exercising the full metadata → DriverClass
 * → `executeAgentInternal` → build → bind the Prediction Unit and Evaluation Protocol → train one search →
 * publish-gated-on-trust path that the conversational flow hits once the user approves a plan. The builder binds the
 * pipeline's unit (the legacy mapping of the plan's target) and its default protocol, so the run stores a gate
 * decision: the build ships a model with a verdict, or ships none (`no-signal`) and is held with the stored reason; it
 * is published only under a "Ships" verdict. No LLM is involved (the builder is a code agent).
 *
 * Requires the `Pipeline Builder` sub-agent to be synced (DriverClass PredictiveStudioPipelineBuilderAgent).
 * Gated behind PS_INTEGRATION=1 + a reachable sidecar. Self-cleans through `lib/ps-rig-lifecycle.ts`: the build's
 * pipelines, models, training runs, Training Snapshots, Evaluation Protocols and Prediction Units, children first,
 * with every Delete() checked (a row it cannot delete fails the rig).
 *
 * USAGE: PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-agent-run.ts
 * Exit: 0 = passed/skipped, 1 = failures, 2 = bootstrap error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import { RigStorage } from './lib/rig-storage';
import type { FileStorageActivation } from '@memberjunction/predictive-studio-truth-suite';
import { DeleteRecordedRows, EnsureDriverAlgorithm, RecordPipelineBindings, ReportCleanup, type RigAlgorithm } from './lib/ps-rig-lifecycle';
import { RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import '@memberjunction/core-entities';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { GateOutcome, ModelingPlanSpec, OutcomeTitleText } from '@memberjunction/predictive-studio-core';
import { RunRecords } from '@memberjunction/predictive-studio-truth-suite';
import { LoadMLModelInferenceProcessor, type PredictiveStudioBuilderPayload } from '@memberjunction/predictive-studio';
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

/** The IDs of the pipelines this rig's agent runs created (the builder names them after the plan's goal, which carries the rig's tag). */
async function rigPipelineIds(user: UserInfo): Promise<string[]> {
  const pipes = await new RunView().RunView<Pick<MJMLTrainingPipelineEntity, 'ID'>>(
    { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `Name LIKE '%ps-inproc-agent-run%'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user);
  if (!pipes.Success) throw new Error(`Reading the rig's pipelines failed: ${pipes.ErrorMessage}`);
  return pipes.Results.map((p) => p.ID);
}

/** The verdict title the stored gate outcome of a shipped model renders as (a kept baseline without a stored interval is not evaluated). */
function expectedTitles(gate: GateOutcome | undefined): readonly OutcomeTitleText[] {
  if (gate === 'model') return ['Ships — the model beats the flat guess'];
  if (gate === 'keep-simple-baseline') return ['Ships — a simple baseline', 'Not evaluated yet'];
  return [];
}

/** Deletes every row the rig's agent runs created (pipelines with their units, protocols, snapshots, runs and models); each failure fails the rig. */
async function cleanup(md: IMetadataProvider, user: UserInfo, records: RunRecords, algorithm: RigAlgorithm | undefined): Promise<void> {
  banner('CLEANUP');
  await RecordPipelineBindings(md, user, records, await rigPipelineIds(user));
  failures += ReportCleanup(await DeleteRecordedRows(md, user, records, algorithm));
}

async function main(): Promise<void> {
  const { provider, user } = await BootstrapAI();
  banner('PREDICTIVE STUDIO AGENT — RUN BUILDER SUB-AGENT VIA AgentRunner (in-process)');
  if (!provider.EntityByName('Memberships')) { console.log('  SKIP: Memberships not found. (exit 0)'); process.exit(0); }
  if (!PS_LIVE) { console.log('\n  SKIP: set PS_INTEGRATION=1 (+ sidecar). (exit 0)'); process.exit(0); }

  await AIEngine.Instance.Config(false, user);
  const agent = AIEngine.Instance.Agents.find((a) => a.Name?.toLowerCase() === BUILDER_AGENT_NAME.toLowerCase());
  check(!!agent, `'${BUILDER_AGENT_NAME}' sub-agent found in metadata (mj sync landed)`);
  check(agent?.DriverClass === 'PredictiveStudioPipelineBuilderAgent', `it has DriverClass 'PredictiveStudioPipelineBuilderAgent' (got '${agent?.DriverClass}')`);
  if (!agent) process.exit(1);

  const records = new RunRecords();
  let algorithm: RigAlgorithm | undefined;
  let storage: FileStorageActivation | null = null;
  try {
    // Training stores its artifacts through an active File Storage Provider, made available as the gate harness does.
    storage = await RigStorage.Activate(provider, user);
    algorithm = await EnsureDriverAlgorithm(provider, user, DRIVER_KEY, TAG);
    banner('RUN: AgentRunner.RunAgent(Pipeline Builder, payload=approved ModelingPlanSpec)');
    const t0 = Date.now();
    const result = await new AgentRunner().RunAgent<ModelingPlanSpec, PredictiveStudioBuilderPayload>({
      agent,
      conversationMessages: [{ role: 'user', content: 'build it' }],
      contextUser: user,
      payload: approvedPlan(),
    });
    console.log(`  Ran in ${Date.now() - t0}ms — agentRun=${result.agentRun?.ID} success=${result.success}`);
    const br = result.payload?.BuildResult;
    console.log(`  BuildResult: ${br ? JSON.stringify({ success: br.success, trust: br.trustTitle, headline: br.headline, published: br.published, held: br.heldReason }) : '(missing)'}`);

    const gate = result.payload?.GateOutcome;
    console.log(`  Stored gate decision: ${gate ?? '(none)'} — ${result.payload?.GateReason ?? '(no reason)'}`);

    check(!!result.agentRun?.ID, 'AgentRunner created an AI Agent Run (the framework ran the sub-agent)');
    check(!!br, 'the sub-agent wrote BuildResult back to the payload');
    check(br?.success === true, `the build succeeded (pipeline created, bound, trained) through the agent${br?.errorMessage ? ` — ${br.errorMessage}` : ''}`);
    check(!!br?.pipelineId, 'BuildResult carries the created pipeline id');

    // The builder bound the pipeline to a Prediction Unit and an Evaluation Protocol, so the run stored a gate decision.
    if (br?.pipelineId) await RecordPipelineBindings(provider, user, records, [br.pipelineId]);
    check(records.PredictionUnitIDs.Size === 1 && records.EvaluationProtocolIDs.Size === 1, 'the built pipeline is bound to a Prediction Unit and an Evaluation Protocol');
    check(gate === 'model' || gate === 'keep-simple-baseline' || gate === 'no-signal', `the training run stored a gate decision (got '${gate ?? 'none'}')`);

    if (gate === 'no-signal') {
      // Nothing shipped: no model, no verdict, held with the stored reason.
      check(!br?.modelId && br?.trustTitle === undefined, 'a no-signal build names no model and renders no verdict');
    } else {
      check(!!br?.modelId, 'BuildResult carries the shipped model id');
      check(typeof br?.headline === 'string' && expectedTitles(gate).some((t) => t === br?.trustTitle),
        `the verdict renders the stored outcome (title '${br?.trustTitle}' for '${gate}')`);
    }
    // Only a stored decision that ships can publish; anything held says why.
    check(br?.published !== true || (br?.trustTitle || '').startsWith('Ships'), 'nothing is published without a shipping verdict');
    check(br?.published === true || !!br?.heldReason, 'a build that is not published carries its held reason');

    banner(failures === 0 ? 'AGENT-RUN PROOF COMPLETE — ALL CHECKS PASSED' : `AGENT-RUN PROOF — ${failures} CHECK(S) FAILED`);
  } finally {
    await cleanup(provider, user, records, algorithm);
    try {
      await RigStorage.Restore(provider, user, storage);
    } catch (e) {
      check(false, `the File Storage Provider is put back after the run (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('BOOTSTRAP/RUN ERROR:', e instanceof Error ? e.stack : e); process.exit(2); });
