/**
 * ps-architect-decision-proof.ts — the last gap: an LLM-AUTHORED architecture decision, executed.
 *
 * Everything below the Architect is proven: a composed graph trains, its parts become reusable,
 * another model freezes one, and an `ArchitectureSpec` reaches a trained composed model. All of that
 * used a spec I wrote. This runs the **real Architect sub-agent** — its prompt, its newly-attached
 * data sources — on measured statistics, and pushes whatever it decides through the real gate and
 * the real builder.
 *
 * What it can and cannot prove: an LLM decides, so the DECISION varies between runs. The rig
 * therefore asserts the properties that must hold whatever it decides — the decision is well-formed,
 * every component type it names exists, the gate agrees, and it reaches a trained model that matches
 * the decision — and reports the decision itself as an observation rather than asserting one.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-architect-decision-proof.ts
 */
import sql from 'mssql';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import '@memberjunction/server-bootstrap-lite';
import { RunView, UserInfo } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import {
  MLComponentEngine, PredictiveStudioPipelineBuilder, gateArchitecture,
} from '@memberjunction/predictive-studio';
import { validateArchitectureSpec } from '@memberjunction/predictive-studio-core';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

const TAG = 'ps-architect-decision-proof';
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

/**
 * Measured statistics, as the Statistics Pass would produce them. Real shape, real numbers from the
 * demo population — the Architect's whole contract is that it decides from THIS, not from the goal
 * sentence, so handing it a plausible measurement is the honest way to run it standalone.
 */
const PLAN_BASE = {
  Goal: 'Predict which members will not renew, with an explanation an account manager can act on',
  TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
  CandidateSources: [{ Kind: 'Entity', Ref: 'Members', Why: 'the member records' }],
  CandidateFeatures: [
    { Name: 'MembershipTenureMonths', SourceRef: 'Members', Kind: 'numeric', Why: 'loyalty' },
    { Name: 'City', SourceRef: 'Members', Kind: 'categorical', Why: 'segment' },
  ],
  LeakageNotes: [],
  ProposedExperiments: [
    { Label: 'Forest', AlgorithmName: 'Random Forest', FeatureSet: ['MembershipTenureMonths', 'City'], Rationale: 'nonlinear baseline', Priority: 1 },
    { Label: 'Linear', AlgorithmName: 'Logistic Regression', FeatureSet: ['MembershipTenureMonths', 'City'], Rationale: 'interpretable', Priority: 2 },
  ],
  ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
  ProposedBudget: {},
  Statistics: {
    RowCount: 4000, FeatureCount: 2, RowsPerFeature: 2000,
    Target: { MinorityFraction: 0.44 },
    Features: [
      { Name: 'MembershipTenureMonths', Missingness: 0.02, DistinctCount: 180, AssociationWithTarget: 0.11, Hints: [] },
      { Name: 'City', Missingness: 0.0, DistinctCount: 12, AssociationWithTarget: 0.03, Hints: [] },
    ],
  },
  GateReports: [
    { CandidateRef: 'Random Forest', Admissible: true, Gates: [{ Name: 'min-rows-per-feature', Verdict: 'Passed', Observed: 2000, Threshold: 5, Message: '2000 rows per feature, well above the floor of 5.' }] },
    { CandidateRef: 'Logistic Regression', Admissible: true, Gates: [{ Name: 'min-rows-per-feature', Verdict: 'Passed', Observed: 2000, Threshold: 5, Message: '2000 rows per feature, well above the floor of 5.' }] },
  ],
};

/** Pull the Architecture slice out of whatever shape the agent returned. */
function readArchitecture(result: unknown): Record<string, unknown> | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): Record<string, unknown> | null => {
    if (depth > 6 || node === null || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    if (typeof obj.Decision === 'string' && Array.isArray(obj.Candidates)) return obj;
    const arch = obj.Architecture;
    if (arch && typeof arch === 'object') return walk(arch, depth + 1);
    for (const v of Object.values(obj)) {
      const found = walk(v, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(result, 0);
}

/** Every ComponentTypeRef the decision names, wherever it appears. */
function namedTypes(architecture: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const c of (architecture.Candidates as Array<{ ComponentTypeRef?: string }> ?? [])) {
    if (c?.ComponentTypeRef) out.push(c.ComponentTypeRef);
  }
  if (typeof architecture.ReifiedUnderComponentTypeRef === 'string') out.push(architecture.ReifiedUnderComponentTypeRef);
  const walkGraph = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const node = n as { ComponentTypeRef?: string; Children?: unknown[] };
    if (node.ComponentTypeRef) out.push(node.ComponentTypeRef);
    for (const c of node.Children ?? []) walkGraph(c);
  };
  walkGraph(architecture.ComposedGraph);
  return out;
}

/**
 * A second scenario where composing is the honest answer rather than a nudge.
 *
 * The prompt's own rule is that compose earns its complexity when a single family cannot express
 * what the problem needs — and especially when something already trained knows part of it. So this
 * plan has a high-variance signal, no interpretability requirement, and points at the reuse catalog.
 * The Architect is still free to disagree; the rig asserts invariants, never a particular verdict.
 */
function composeWorthyPlan(reusable: Array<{ ID: string; Name: string; ComponentType: string; Story: string | null }>) {
  return {
    ...PLAN_BASE,
    Goal:
      'Get the most accurate renewal prediction we can. Interpretability is not required — this feeds an ' +
      'automated outreach queue, not a person. The signal is noisy and a single estimator has been unstable ' +
      'across refits, and we already have trained components from earlier renewal models available to reuse.',
    Statistics: {
      ...PLAN_BASE.Statistics,
      // A weak, noisy per-feature association is exactly the case where averaging helps and a single
      // fit wobbles between refits.
      Features: PLAN_BASE.Statistics.Features.map(f => ({ ...f, AssociationWithTarget: 0.04 })),
    },
    ReusableComponents: reusable.map(r => ({ ID: r.ID, Name: r.Name, ComponentType: r.ComponentType, Story: r.Story })),
  };
}

async function main() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST!, port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 600000,
  }).connect();
  const provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, '__mj'));
  await UserCache.Instance.Refresh(provider);
  const user = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  await AIEngine.Instance.Config(false, user);
  const engine = MLComponentEngine.Instance;
  await engine.Config(false, user, provider);

  const architectAgent = AIEngine.Instance.Agents.find(a => a.Name === 'Architect') as MJAIAgentEntityExtended | undefined;
  check(!!architectAgent, 'found the Architect');
  if (!architectAgent) { await pool.close(); process.exit(1); }

  const reusable = await new RunView().RunView<{ ID: string; Name: string; ComponentType: string; Story: string | null }>(
    { EntityName: 'MJ: ML Components', ExtraFilter: "PromotionState='Approved' AND IsTrained=1 AND ArtifactFileID IS NOT NULL",
      Fields: ['ID','Name','ComponentType','Story'], ResultType: 'simple', BypassCache: true }, user);

  const SCENARIOS: Array<{ label: string; plan: Record<string, unknown> }> = [
    { label: 'interpretability is the requirement', plan: PLAN_BASE as unknown as Record<string, unknown> },
    { label: 'accuracy on a noisy signal, with parts available to reuse', plan: composeWorthyPlan(reusable.Results ?? []) },
  ];

  for (const scenario of SCENARIOS) {
  console.log(`▸ The real Architect decides — ${scenario.label}`);
  const run = await new AgentRunner(provider).RunAgent({
    agent: architectAgent,
    contextUser: user,
    payload: scenario.plan,
    conversationMessages: [{
      role: 'user',
      content: 'Decide the architecture for this plan. The statistics and gate reports are in the payload.',
    }],
  });
  check(run.success === true, `it ran (${run.success ? 'ok' : (run.errorMessage ?? 'failed')})`);

  const architecture = readArchitecture(run.payload ?? run.result);
  check(!!architecture, 'it produced an Architecture slice');
  if (!architecture) {
    console.log(`      result keys: ${Object.keys((run ?? {}) as object).join(', ')}`);
    console.log(`      payload keys: ${Object.keys((run.payload ?? {}) as object).join(', ')}`);
    const msg = (run as { agentRun?: { Message?: string }; message?: string }).message
      ?? (run as { agentRun?: { Message?: string } }).agentRun?.Message;
    console.log(`      message: ${String(msg ?? '(none)').slice(0, 300)}`);
    continue;
  }
  console.log(`      DECISION: ${architecture.Decision}`);
  console.log(`      why: ${String(architecture.Rationale ?? '(none)').slice(0, 160)}`);
  console.log(`      candidates: ${(architecture.Candidates as Array<{ ComponentTypeRef?: string }> ?? []).map(c => c.ComponentTypeRef).join(', ')}`);
  if (architecture.ComposedGraph) console.log(`      graph: ${JSON.stringify(architecture.ComposedGraph)}`);
  if (architecture.ReifiedUnderComponentTypeRef) console.log(`      reified under: ${architecture.ReifiedUnderComponentTypeRef}`);
  console.log();

  console.log('▸ Whatever it decided has to be well-formed and real');
  const parsed = validateArchitectureSpec(architecture);
  check(!('error' in parsed), `the spec validates${'error' in parsed ? `: ${parsed.error}` : ''}`);

  // The point of giving it COMPONENT_TREE: it must name types that exist rather than inventing them.
  const named = namedTypes(architecture);
  const unknown = named.filter(n => !engine.FindTypeByName(n));
  check(unknown.length === 0, `every component type it named exists${unknown.length ? ` (invented: ${unknown.join(', ')})` : ` (${named.length} named)`}`);
  console.log();

  console.log('▸ The gate and the builder execute the decision it made');
  const plan = { ...scenario.plan, Architecture: architecture } as unknown as ModelingPlanSpec;
  const gate = gateArchitecture(plan, engine);
  check(gate.Executable, `the gate accepts it${gate.Executable ? '' : `: ${gate.Reasons.join(' ')}`}`);
  if (!gate.Executable) { continue; }

  const built = await new PredictiveStudioPipelineBuilder().build({ spec: plan, provider, user, autoPublish: false, sidecarVersion: TAG });
  check(built.success, `it trained (${built.errorMessage ?? 'ok'})`);
  // A race-shaped decision built as one model has to SAY so, or the model reads as the decision's
  // outcome when it is only its first step.
  const raceShaped = architecture.Decision === 'defer' || architecture.Decision === 'reify';
  check(raceShaped === !!built.decisionNote,
    raceShaped
      ? `it states what a '${architecture.Decision}' left unbuilt`
      : `a '${architecture.Decision}' decision needs no such note`);
  if (built.decisionNote) console.log(`      note: ${built.decisionNote}`);

  if (built.pipelineId) {
    const pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
    await pipeline.Load(built.pipelineId);
    const composed = architecture.Decision === 'compose';
    // The model must MATCH the decision — this is exactly what was silently broken.
    check(composed === !!pipeline.ComponentGraph,
      composed
        ? 'a compose decision produced a pipeline carrying the composition'
        : `a '${architecture.Decision}' decision produced an ordinary pipeline, as it should`);
  }
  if (built.modelId) {
    const parts = await new RunView().RunView<{ SlotName: string; ComponentType: string }>(
      { EntityName: 'MJ: ML Components',
        ExtraFilter: `ParentComponentID IN (SELECT RootComponentID FROM __mj.MLModel WHERE ID='${built.modelId}')`,
        Fields: ['SlotName','ComponentType'], ResultType: 'simple', BypassCache: true }, user);
    const slotted = (parts.Results ?? []).filter(p => p.SlotName !== 'inputs');
    console.log(`      trained model has ${slotted.length} sub-component(s)${slotted.length ? ': ' + slotted.map(p => `${p.SlotName}→${p.ComponentType}`).join(', ') : ''}`);
  }
  console.log();
  }

  console.log(failures === 0
    ? '✅ PROVEN — an LLM-authored architecture decision is well-formed, names only real components, and reaches a model that matches it.'
    : `❌ ${failures} check(s) failed.`);
  await pool.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
