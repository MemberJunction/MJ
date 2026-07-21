/**
 * agent-plan-mode.checks.ts — the 'agent-plan-mode' bundle (PM1–PM6), agents-extended-suite §9.2.
 *
 * LIVE-MODEL tier (real model calls, ON by default; opt out with RUN_AGENT_TESTS=0). Proves the
 * per-request plan-mode HITL gate END TO END through the ENTITY-DRIVEN resume:
 *   resolvePlanModeGate (base-agent.ts:8074): active = depth===0 && (RequirePlanMode || (SupportsPlanMode && planMode));
 *   executePlanStep (:11762) emits a StepType='Plan' step + createFeedbackRequest (:11897) writes a
 *   'MJ: AI Agent Requests' row (Status='Requested', OriginatingAgentRunStepID=the Plan step) and the run
 *   lands Status='AwaitingFeedback'. RESUME IS ENTITY-DRIVEN: MJAIAgentRequestEntityServer.Save()
 *   (MJAIAgentRequestEntityServer.ts:28) on Requested→{Approved,Rejected,Responded} spawns resumeAgent()
 *   fire-and-forget, links ResumingAgentRunID (polled here), and re-injects planMode only for Plan-step
 *   resumes — so a Reject re-engages the gate (the agent must re-plan).
 *
 * TRANSPORT: server-in-process AgentRunner.RunAgent (the agent-runner.checks.ts precedent). The run
 * handle is returned synchronously (result.agentRun.ID), which the correlation-heavy assertions here
 * (find the request row by OriginatingAgentRunID, poll ResumingAgentRunID, read the resumed run's
 * steps) require. The client GraphQLAIClient.RunAIAgent path is forced fire-and-forget and returns no
 * synchronous run handle nor a conversationId arg, so the wire leg is a follow-up (proposal Q8).
 *
 * DETERMINISM (§3): every assertion is a STRUCTURAL framework observable — AIAgentRun.Status/PlanMode,
 * StepType ordering, MJ: AI Agent Requests rows, ResumingAgentRunID linkage. Plan CONTENT (model prose)
 * is never asserted. Two-phase (§3.3): a `phase-P` compliance precondition (did the model present a
 * plan?) throws a retryable ModelNonCompliance (≤3 attempts → loud model-noncompliance FAIL, never
 * skip-as-pass); framework assertions (`Assert`) are never retried.
 *
 * Fixtures: run products only (paused runs, resumed runs, request rows) — the plan agents are seeded
 * metadata referenced read-only. Teardown deletes requests → steps → runs (FK-safe), best-effort.
 */
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, AgentPlanModeFixture } from '@memberjunction/testing-integration';

const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 4000);
const RESUME_POLL_ATTEMPTS = Number(process.env.AGENT_RESUME_POLL ?? 30);

/** A phase-P (model-compliance) failure — retryable per §3.3, distinct from a framework-correctness failure. */
class ModelNonCompliance extends Error {}
/** Phase-P assertion: the model did the instructed thing. Throws a RETRYABLE error on failure. */
function assertP(cond: boolean, message: string): void {
  if (!cond) {
    throw new ModelNonCompliance(message);
  }
}
/** Run a live scenario with bounded retries (§3.3): ≤3 attempts, then a loud model-noncompliance FAIL. */
async function withBoundedRetry(label: string, fn: () => Promise<void>): Promise<void> {
  let last: ModelNonCompliance | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fn();
      return;
    } catch (e) {
      if (e instanceof ModelNonCompliance) {
        last = e;
        console.warn(`  ⚠ ${label} phase-P miss (attempt ${attempt}/3): ${e.message}`);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`model-noncompliance: ${label} — ${last?.message ?? 'unknown'} (after 3 attempts)`);
}

function requireFixture(ctx: IntegrationCheckContext): AgentPlanModeFixture {
  if (!ctx.AgentPlanModeFixture) {
    throw new Error('AgentPlanModeFixture not initialized — the agent-plan-mode lifecycle Setup must run before its checks.');
  }
  return ctx.AgentPlanModeFixture;
}

async function resolveAgent(ctx: IntegrationCheckContext, name: string): Promise<MJAIAgentEntityExtended> {
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => (a.Name ?? '').toLowerCase() === name.toLowerCase());
  Assert(!!agent, `seeded agent '${name}' not found — push metadata-optional/integration-test`);
  Assert(agent!.Status === 'Active', `seeded agent '${name}' must be Active (got ${agent!.Status})`);
  return agent!;
}

/** Run a plan agent in-process, tracking the run for teardown. */
async function runPlanAgent(
  ctx: IntegrationCheckContext,
  agent: MJAIAgentEntityExtended,
  message: string,
  planMode: boolean,
): Promise<MJAIAgentRunEntityExtended> {
  const result = await new AgentRunner(ctx.Provider).RunAgent({
    agent,
    conversationMessages: [{ role: 'user', content: message }],
    contextUser: ctx.User,
    provider: ctx.Provider,
    planMode,
  });
  Assert(!!result.agentRun?.ID, `RunAgent returned no agentRun for '${agent.Name}'`);
  requireFixture(ctx).CreatedRunIds.push(result.agentRun.ID);
  await settle(SETTLE_MS);
  return result.agentRun;
}

interface StepRow {
  StepType: string;
  Status: string;
  StepNumber: number;
  TargetLogID: string | null;
}
async function stepsFor(ctx: IntegrationCheckContext, runId: string): Promise<StepRow[]> {
  const r = await new RunView().RunView<StepRow>(
    {
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID='${runId}'`,
      OrderBy: 'StepNumber',
      Fields: ['StepType', 'Status', 'StepNumber', 'TargetLogID'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  return r.Success ? r.Results : [];
}

async function runRow(ctx: IntegrationCheckContext, runId: string): Promise<{ Status: string; PlanMode: boolean } | undefined> {
  const r = await new RunView().RunView<{ Status: string; PlanMode: boolean }>(
    {
      EntityName: 'MJ: AI Agent Runs',
      ExtraFilter: `ID='${runId}'`,
      Fields: ['Status', 'PlanMode'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  return r.Success ? r.Results[0] : undefined;
}

/** The single Requested request row the plan gate created for a run (entity_object so Save() can drive the resume). */
async function findRequestedRow(ctx: IntegrationCheckContext, runId: string): Promise<MJAIAgentRequestEntity | undefined> {
  const r = await new RunView().RunView<MJAIAgentRequestEntity>(
    {
      EntityName: 'MJ: AI Agent Requests',
      ExtraFilter: `OriginatingAgentRunID='${runId}' AND Status='Requested'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object',
      BypassCache: true,
    },
    ctx.User,
  );
  return r.Success ? r.Results[0] : undefined;
}

/**
 * Respond to a Requested plan-approval row (Approve/Reject) via the ENTITY save — the server
 * subclass fires resumeAgent() fire-and-forget — then poll ResumingAgentRunID until it links.
 * Returns the resumed run ID (tracked for teardown) or null on timeout.
 */
async function respondAndAwaitResume(ctx: IntegrationCheckContext, request: MJAIAgentRequestEntity, status: 'Approved' | 'Rejected'): Promise<string | null> {
  const fx = requireFixture(ctx);
  request.Status = status;
  request.Response = `${status} by integration test`;
  Assert(await request.Save(), `request ${status} save: ${request.LatestResult?.CompleteMessage}`);
  fx.CreatedRequestIds.push(request.ID);
  for (let i = 0; i < RESUME_POLL_ATTEMPTS; i++) {
    await settle(1000);
    const reload = await new RunView().RunView<{ ResumingAgentRunID: string | null }>(
      {
        EntityName: 'MJ: AI Agent Requests',
        ExtraFilter: `ID='${request.ID}'`,
        Fields: ['ResumingAgentRunID'],
        ResultType: 'simple',
        BypassCache: true,
      },
      ctx.User,
    );
    const rid = reload.Success ? reload.Results[0]?.ResumingAgentRunID : null;
    if (rid) {
      fx.CreatedRunIds.push(rid);
      await settle(SETTLE_MS);
      return rid;
    }
  }
  return null;
}

export const AgentPlanModeChecks: NamedCheck[] = [
  {
    Id: 'agent-plan-mode.PM1',
    Name: 'PM1: planMode=true → StepType=Plan step + Requested request row + AwaitingFeedback pause; run.PlanMode stamped',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('PM1', async () => {
        const agent = await resolveAgent(ctx, 'IT: Plan Agent');
        const run = await runPlanAgent(ctx, agent, 'Compute 2+2 and finish.', true);

        const steps = await stepsFor(ctx, run.ID);
        const planStep = steps.find((s) => s.StepType === 'Plan');
        assertP(!!planStep, 'IT: Plan Agent did not present a Plan step under planMode=true');

        // Framework correctness — never retried.
        const header = await runRow(ctx, run.ID);
        Assert(!!header, `run ${run.ID} row not found`);
        AssertEqual(header!.Status, 'AwaitingFeedback', 'plan-mode run must pause AwaitingFeedback');
        AssertEqual(header!.PlanMode, true, 'AIAgentRun.PlanMode must be stamped for a plan-mode run');
        Assert(planStep!.Status !== 'Running', `Plan step left non-terminal: ${planStep!.Status}`);

        const request = await findRequestedRow(ctx, run.ID);
        Assert(!!request, 'the plan gate must create a Requested MJ: AI Agent Requests row');
        requireFixture(ctx).CreatedRequestIds.push(request!.ID);
        AssertEqual(request!.Status, 'Requested', 'the request row must be Requested');
        Assert(
          !!request!.OriginatingAgentRunStepID && steps.some((s) => s.StepType === 'Plan'),
          'the request must link its OriginatingAgentRunStepID to a Plan step',
        );
        console.log(`      → run ${run.ID} paused with an auditable Plan step + Requested row ${request!.ID}`);
      });
    },
  },
  {
    Id: 'agent-plan-mode.PM2',
    Name: 'PM2: the gate blocks work before approval — the paused run has NO Actions/Sub-Agent/Tool step',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('PM2', async () => {
        const agent = await resolveAgent(ctx, 'IT: Plan Agent');
        const run = await runPlanAgent(ctx, agent, 'Compute 2+2 and finish.', true);
        const steps = await stepsFor(ctx, run.ID);
        assertP(
          steps.some((s) => s.StepType === 'Plan'),
          'no Plan step — cannot prove the gate blocked work',
        );
        // The whole point of plan mode: no work (Actions/Sub-Agent/Tool) executes before a human approves.
        // Non-vacuous because PM3 proves those SAME steps DO execute once approved (positive control).
        const workSteps = steps.filter((s) => s.StepType === 'Actions' || s.StepType === 'Sub-Agent' || s.StepType === 'Tool');
        AssertEqual(workSteps.length, 0, `work executed before approval (${workSteps.map((s) => s.StepType).join(',')}) — the plan gate is broken`);
        const request = await findRequestedRow(ctx, run.ID);
        if (request) {
          requireFixture(ctx).CreatedRequestIds.push(request.ID);
        }
        console.log(`      → ${steps.length} step(s) before approval, 0 work steps (gate holds)`);
      });
    },
  },
  {
    Id: 'agent-plan-mode.PM3',
    Name: 'PM3: Approve via entity save → resumed run (ResumingAgentRunID linked) executes Actions to completion',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('PM3', async () => {
        const agent = await resolveAgent(ctx, 'IT: Plan Agent');
        const run = await runPlanAgent(ctx, agent, 'Compute 2+2 and finish.', true);
        const request = await findRequestedRow(ctx, run.ID);
        assertP(!!request, 'no Requested row to approve — plan not presented');

        const resumedId = await respondAndAwaitResume(ctx, request!, 'Approved');
        Assert(!!resumedId, 'approval did not spawn a resuming run (ResumingAgentRunID never linked within the poll window)');
        Assert(!UUIDsEqual(resumedId!, run.ID), 'the resumed run must be a NEW run, not the paused one');

        const resumedSteps = await stepsFor(ctx, resumedId!);
        assertP(
          resumedSteps.some((s) => s.StepType === 'Actions'),
          'the approved/resumed run did not execute the instructed Actions step',
        );
        const resumedHeader = await runRow(ctx, resumedId!);
        Assert(!!resumedHeader, `resumed run ${resumedId} row not found`);
        Assert(
          resumedHeader!.Status === 'Completed' || resumedHeader!.Status === 'AwaitingFeedback',
          `resumed run must reach a settled status, got ${resumedHeader!.Status}`,
        );
        Assert(
          resumedSteps.every((s) => s.Status !== 'Running'),
          'resumed run left a non-terminal step',
        );
        console.log(`      → approval resumed run ${resumedId} which executed Actions to ${resumedHeader!.Status}`);
      });
    },
  },
  {
    Id: 'agent-plan-mode.PM4',
    Name: 'PM4: Reject re-engages the gate — the resumed run re-presents a Plan and does NOT execute Actions',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('PM4', async () => {
        const agent = await resolveAgent(ctx, 'IT: Plan Agent');
        const run = await runPlanAgent(ctx, agent, 'Compute 2+2 and finish.', true);
        const request = await findRequestedRow(ctx, run.ID);
        assertP(!!request, 'no Requested row to reject — plan not presented');

        const resumedId = await respondAndAwaitResume(ctx, request!, 'Rejected');
        Assert(!!resumedId, 'rejection did not spawn a resuming run (ResumingAgentRunID never linked)');
        const resumedSteps = await stepsFor(ctx, resumedId!);
        // Rejection re-injects planMode ONLY for Plan-step resumes → the gate re-engages: the agent
        // must re-plan, so the resumed run presents a Plan and executes NO Actions/Sub-Agent.
        assertP(
          resumedSteps.some((s) => s.StepType === 'Plan'),
          'the rejected/resumed run did not re-present a Plan',
        );
        const work = resumedSteps.filter((s) => s.StepType === 'Actions' || s.StepType === 'Sub-Agent');
        AssertEqual(work.length, 0, `rejection was treated as approval — work executed (${work.map((s) => s.StepType).join(',')})`);
        console.log(`      → rejection re-engaged the gate; resumed run ${resumedId} re-planned, 0 work steps`);
      });
    },
  },
  {
    Id: 'agent-plan-mode.PM5',
    Name: 'PM5: IT: Always-Plan Agent (RequirePlanMode) gates even with planMode=false',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('PM5', async () => {
        const agent = await resolveAgent(ctx, 'IT: Always-Plan Agent');
        Assert(agent.RequirePlanMode === true, 'IT: Always-Plan Agent must have RequirePlanMode=true');
        const run = await runPlanAgent(ctx, agent, 'Compute 3+3 and finish.', false); // per-request flag OFF

        const steps = await stepsFor(ctx, run.ID);
        assertP(
          steps.some((s) => s.StepType === 'Plan'),
          'RequirePlanMode did not force a Plan step with planMode=false',
        );
        const header = await runRow(ctx, run.ID);
        Assert(!!header && header.Status === 'AwaitingFeedback', `forced-plan run must pause AwaitingFeedback, got ${header?.Status}`);
        AssertEqual(header!.PlanMode, true, 'a RequirePlanMode run must stamp PlanMode=true even when the flag is off');
        const request = await findRequestedRow(ctx, run.ID);
        Assert(!!request, 'forced-plan run must create a Requested row');
        requireFixture(ctx).CreatedRequestIds.push(request!.ID);
        console.log(`      → RequirePlanMode forced the gate with planMode=false (run ${run.ID})`);
      });
    },
  },
  {
    // PM6 (post-approval Skill demotion) is DEFERRED: no seeded roster agent combines
    // SupportsPlanMode=true AND AcceptsSkills, so the "instructed Skill after approval → demoted"
    // path (base-agent.ts:4161) is not reachable without a new roster agent. Documented in the
    // deliverable; the runtime skill-demotion boundary is otherwise covered by agent-skills-live SL4.
    Id: 'agent-plan-mode.PM6',
    Name: 'PM6: (deferred) post-approval Skill demotion — needs a SupportsPlanMode+AcceptsSkills roster agent',
    RequiresLiveModel: true,
    Fn: async (): Promise<void> => {
      console.warn(
        '  ⚠ agent-plan-mode.PM6 DEFERRED — no seeded agent has SupportsPlanMode+AcceptsSkills; ' +
          'post-approval skill demotion is unreachable without a new roster agent (see deliverable).',
      );
    },
  },
];

for (const check of AgentPlanModeChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-plan-mode', {
  Setup: async (ctx: IntegrationCheckContext) => {
    ctx.AgentPlanModeFixture = { CreatedRunIds: [], CreatedRequestIds: [] };
  },
  Teardown: async (ctx: IntegrationCheckContext) => {
    const fx = ctx.AgentPlanModeFixture;
    if (!fx) {
      return;
    }
    // FK-safe order: request rows (link runs) → run steps → runs. Best-effort per record.
    for (const reqId of fx.CreatedRequestIds) {
      try {
        const r = await ctx.Provider.GetEntityObject<MJAIAgentRequestEntity>('MJ: AI Agent Requests', ctx.User);
        if (await r.Load(reqId)) {
          await r.Delete();
        }
      } catch (e) {
        console.error('plan-mode request cleanup failed:', e);
      }
    }
    for (const runId of Array.from(new Set(fx.CreatedRunIds))) {
      try {
        const steps = await new RunView().RunView<{ ID: string }>(
          {
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${runId}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
          },
          ctx.User,
        );
        if (steps.Success) {
          for (const s of steps.Results) {
            try {
              const step = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', ctx.User);
              if (await step.Load(s.ID)) {
                await step.Delete();
              }
            } catch (e) {
              console.error('plan-mode step cleanup failed:', e);
            }
          }
        }
        const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ctx.User);
        if (await run.Load(runId)) {
          await run.Delete();
        }
      } catch (e) {
        console.error('plan-mode run cleanup failed:', e);
      }
    }
    ctx.AgentPlanModeFixture = undefined;
  },
});
