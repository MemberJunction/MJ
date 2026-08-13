/**
 * agent-skills-live.checks.ts — the 'agent-skills-live' bundle (SL1–SL5), agents-extended-suite §9.1.
 *
 * LIVE-MODEL tier (ON by default; opt out with RUN_AGENT_TESTS=0). Covers the RUNTIME skill legs that
 * the data-layer ai-skills bundle (AS1–AS21) cannot reach:
 *   - requestedSkillIDs threading (RunAIAgentResolver → ExecuteAgentParams.requestedSkillIDs);
 *   - preActivateRequestedSkills (base-agent.ts:11449, root-only) → a real StepType='Skill' step whose
 *     AIAgentRunStep.Skills JSON records ActivationType='requested' provenance;
 *   - notifyDroppedSkillRequests (:11504) dropping an unentitled requested ID (run proceeds);
 *   - validateSkillNextStep (:4138) demoting a hallucinated OR a RequestedOnly self-activation to Retry;
 *   - the activated skill's Instructions appearing in the next turn's assembled prompt (AIPromptRun.Messages).
 *
 * SEEDED AGENT: 'IT: Skill Probe Agent' (AcceptsSkills='Limited', SkillActivationMode='RequestedOnly',
 * granted 'IT: Probe Skill' which is ActivationMode='RequestedOnly' and bundles Calculate Expression).
 * Its prompt (it-skill-probe.template.md) obeys the user message literally: "activate the skill named X"
 * → nextStep.type='Skill' naming X verbatim even if absent from the available list — exactly the
 * hallucinated/self-activation attempts SL3/SL4 need.
 *
 * TRANSPORT: server-in-process AgentRunner.RunAgent (synchronous run handle for step/prompt-run
 * correlation; client RunAIAgent is fire-and-forget — proposal Q8). DETERMINISM (§3): structural
 * observables only — Skill step presence + Skills provenance JSON, assembled-prompt content — never model
 * prose. Two-phase (§3.3): phase-P compliance (the model attempted the instructed skill path, proven
 * from persisted raw responses) is retried ≤3× then FAILS loudly; framework Assert is never retried.
 */
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import { MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, AgentSkillsLiveFixture } from '@memberjunction/testing-integration';

const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 4000);
/** A syntactically valid UUID that is guaranteed NOT to be a seeded skill (unentitled-drop probe). */
const UNENTITLED_SKILL_ID = '00000000-0000-4000-8000-0000000005ee';
const PROBE_SKILL_NAME = 'IT: Probe Skill';
/** Distinctive sentinel present ONLY in the skill's Instructions markdown (never in the agent's system prompt). */
const SKILL_INSTRUCTION_SENTINEL = 'harmless probe skill';

class ModelNonCompliance extends Error {}
function assertP(cond: boolean, message: string): void {
  if (!cond) {
    throw new ModelNonCompliance(message);
  }
}
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

function requireFixture(ctx: IntegrationCheckContext): AgentSkillsLiveFixture {
  if (!ctx.AgentSkillsLiveFixture) {
    throw new Error('AgentSkillsLiveFixture not initialized — the agent-skills-live lifecycle Setup must run first.');
  }
  return ctx.AgentSkillsLiveFixture;
}

async function resolveProbeAgent(ctx: IntegrationCheckContext): Promise<MJAIAgentEntityExtended> {
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => (a.Name ?? '').toLowerCase() === 'it: skill probe agent');
  Assert(!!agent, "seeded agent 'IT: Skill Probe Agent' not found — push metadata-optional/integration-test");
  Assert(agent!.Status === 'Active', 'IT: Skill Probe Agent must be Active');
  return agent!;
}

async function runProbe(
  ctx: IntegrationCheckContext,
  agent: MJAIAgentEntityExtended,
  message: string,
  requestedSkillIDs?: string[],
): Promise<MJAIAgentRunEntityExtended> {
  const result = await new AgentRunner(ctx.Provider).RunAgent({
    agent,
    conversationMessages: [{ role: 'user', content: message }],
    contextUser: ctx.User,
    provider: ctx.Provider,
    requestedSkillIDs,
  });
  Assert(!!result.agentRun?.ID, 'RunAgent returned no agentRun for IT: Skill Probe Agent');
  requireFixture(ctx).CreatedRunIds.push(result.agentRun.ID);
  await settle(SETTLE_MS);
  return result.agentRun;
}

interface StepRow {
  StepType: string;
  Status: string;
  StepNumber: number;
  Skills: string | null;
  TargetLogID: string | null;
}
async function stepsFor(ctx: IntegrationCheckContext, runId: string): Promise<StepRow[]> {
  const r = await new RunView().RunView<StepRow>(
    {
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID='${runId}'`,
      OrderBy: 'StepNumber',
      Fields: ['StepType', 'Status', 'StepNumber', 'Skills', 'TargetLogID'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  return r.Success ? r.Results : [];
}

interface SkillInvocation {
  SkillID?: string;
  SkillName?: string;
  ActivationType?: string;
}
function parseSkills(step: StepRow): SkillInvocation[] {
  if (!step.Skills) {
    return [];
  }
  try {
    const parsed = JSON.parse(step.Skills) as SkillInvocation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Concatenate the raw model outputs (AIPromptRun.Result) of a run's Prompt steps — the §3.3 P-artifact. */
async function rawResponsesFor(ctx: IntegrationCheckContext, runId: string): Promise<string> {
  const steps = await stepsFor(ctx, runId);
  const parts: string[] = [];
  for (const s of steps.filter((x) => x.StepType === 'Prompt' && x.TargetLogID)) {
    const r = await new RunView().RunView<{ Result: string | null }>(
      {
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID='${s.TargetLogID}'`,
        Fields: ['Result'],
        ResultType: 'simple',
        BypassCache: true,
      },
      ctx.User,
    );
    if (r.Success && r.Results[0]?.Result) {
      parts.push(r.Results[0].Result);
    }
  }
  return parts.join('\n');
}

/** The assembled prompt text (all chat-message contents) of the FIRST Prompt step of a run. */
async function firstPromptMessages(ctx: IntegrationCheckContext, runId: string): Promise<string | null> {
  const steps = await stepsFor(ctx, runId);
  const firstPrompt = steps.find((s) => s.StepType === 'Prompt' && s.TargetLogID);
  if (!firstPrompt?.TargetLogID) {
    return null;
  }
  const run = await ctx.Provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', ctx.User);
  if (!(await run.Load(firstPrompt.TargetLogID))) {
    return null;
  }
  const { chatMessages } = run.ParseMessagesData();
  return chatMessages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
}

export const AgentSkillsLiveChecks: NamedCheck[] = [
  {
    Id: 'agent-skills-live.SL1',
    Name: 'SL1: requestedSkillIDs=[Probe] → real StepType=Skill step with Skills provenance (ActivationType=requested)',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      const fx = requireFixture(ctx);
      const agent = await resolveProbeAgent(ctx);
      const run = await runProbe(ctx, agent, 'A skill is active. Please compute now.', [fx.ProbeSkillID]);
      // preActivateRequestedSkills records the Skill step at run start — reliable regardless of model output.
      const steps = await stepsFor(ctx, run.ID);
      const skillSteps = steps.filter((s) => s.StepType === 'Skill');
      Assert(skillSteps.length > 0, 'requesting an entitled skill must emit a StepType=Skill step');
      const provenance = skillSteps.flatMap(parseSkills);
      const requested = provenance.find((p) => p.SkillID && UUIDsEqual(p.SkillID, fx.ProbeSkillID));
      Assert(!!requested, 'the Skill step Skills provenance must record the requested probe skill');
      AssertEqual(requested!.ActivationType, 'requested', 'the activation must be attributed as requested (audit trail)');
      console.log(`      → run ${run.ID} activated the probe skill with requested provenance`);
    },
  },
  {
    Id: 'agent-skills-live.SL2',
    Name: 'SL2: an unentitled requested skill is DROPPED (not activated, run proceeds); the entitled one still activates',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      const fx = requireFixture(ctx);
      const agent = await resolveProbeAgent(ctx);
      const run = await runProbe(ctx, agent, 'A skill is active. Please compute now.', [fx.ProbeSkillID, UNENTITLED_SKILL_ID]);
      const steps = await stepsFor(ctx, run.ID);
      const provenance = steps.filter((s) => s.StepType === 'Skill').flatMap(parseSkills);
      // The entitled skill still activates (non-vacuous: SL1 proved requesting activates).
      Assert(
        provenance.some((p) => p.SkillID && UUIDsEqual(p.SkillID, fx.ProbeSkillID)),
        'the entitled skill must still activate alongside a dropped one',
      );
      // The unentitled ID is dropped — it must NOT appear as an activated skill.
      Assert(
        !provenance.some((p) => p.SkillID && UUIDsEqual(p.SkillID, UNENTITLED_SKILL_ID)),
        'an unentitled requested skill was activated — silent grant escalation',
      );
      // And the run must PROCEED (droppable, not a hard fail).
      Assert(run.Status !== 'Failed', `an unentitled requested skill hard-failed the run: ${run.ErrorMessage ?? ''}`);
      // Soft signal (logged, not asserted — wording is model/framework-owned): the refusal note injection.
      const firstMsgs = await firstPromptMessages(ctx, run.ID);
      if (firstMsgs && !/not.*(honored|activated)|skill/i.test(firstMsgs)) {
        console.warn('  ⚠ SL2 note — no visible dropped-skill notice in the first assembled prompt (informational only).');
      }
      console.log(`      → unentitled skill dropped; entitled skill activated; run ${run.Status}`);
    },
  },
  {
    Id: 'agent-skills-live.SL3',
    Name: 'SL3: instructed Skill naming a NONEXISTENT skill → demoted (no Skill step activates it), run still terminates',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('SL3', async () => {
        const agent = await resolveProbeAgent(ctx);
        const hallucinated = 'IT-Nonexistent-Skill-ZZZ';
        const run = await runProbe(ctx, agent, `Activate the skill named ${hallucinated}.`);
        // Phase-P: the model actually attempted the hallucinated activation (persisted raw response).
        const raw = await rawResponsesFor(ctx, run.ID);
        assertP(raw.includes(hallucinated), `the model never attempted the hallucinated skill '${hallucinated}'`);
        // Framework: it was demoted — no Skill step activated a skill by that name.
        const steps = await stepsFor(ctx, run.ID);
        const activatedNames = steps
          .filter((s) => s.StepType === 'Skill')
          .flatMap(parseSkills)
          .map((p) => (p.SkillName ?? '').toLowerCase());
        Assert(!activatedNames.includes(hallucinated.toLowerCase()), `a hallucinated skill '${hallucinated}' was activated`);
        Assert(run.Status !== 'Running', 'the run must still terminate after the demotion (retry loop resolves)');
        console.log(`      → hallucinated skill demoted (not activated); run ${run.Status}`);
      });
    },
  },
  {
    Id: 'agent-skills-live.SL4',
    Name: 'SL4: self-activating the RequestedOnly probe skill UN-requested → demoted (runtime leg of the double gate)',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('SL4', async () => {
        const agent = await resolveProbeAgent(ctx);
        // No requestedSkillIDs → the RequestedOnly skill is NOT auto-activatable; a nextStep='Skill'
        // self-activation must be demoted (GetAutoActivatableSkillsForAgent excludes it).
        const run = await runProbe(ctx, agent, `Activate the skill named ${PROBE_SKILL_NAME}.`);
        const raw = await rawResponsesFor(ctx, run.ID);
        assertP(
          new RegExp(PROBE_SKILL_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(raw),
          'the model never attempted the un-requested self-activation',
        );
        const steps = await stepsFor(ctx, run.ID);
        // With no requested activation, NO Skill step for the probe skill may exist (self-activation demoted).
        const activatedProbe = steps
          .filter((s) => s.StepType === 'Skill')
          .flatMap(parseSkills)
          .some((p) => (p.SkillName ?? '').toLowerCase() === PROBE_SKILL_NAME.toLowerCase());
        Assert(!activatedProbe, 'a RequestedOnly skill self-activated without being requested — ActivationMode enforced in metadata only');
        console.log(`      → un-requested RequestedOnly self-activation demoted; run ${run.Status}`);
      });
    },
  },
  {
    Id: 'agent-skills-live.SL5',
    Name: 'SL5: after a requested activation, the skill Instructions appear in the assembled prompt (activation applied, not just recorded)',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      const fx = requireFixture(ctx);
      const agent = await resolveProbeAgent(ctx);
      const run = await runProbe(ctx, agent, 'A skill is active. Please compute now.', [fx.ProbeSkillID]);
      const steps = await stepsFor(ctx, run.ID);
      Assert(
        steps.some((s) => s.StepType === 'Skill'),
        'SL5 precondition: the probe skill must have activated',
      );
      const msgs = await firstPromptMessages(ctx, run.ID);
      Assert(!!msgs, 'could not read the assembled prompt of the first Prompt step');
      // The sentinel lives ONLY in the skill's Instructions markdown, never in the agent's system prompt —
      // so its presence proves the skill Instructions were injected into the turn, not merely recorded.
      Assert(
        msgs!.toLowerCase().includes(SKILL_INSTRUCTION_SENTINEL),
        `the activated skill's Instructions ("${SKILL_INSTRUCTION_SENTINEL}") were not applied to the assembled prompt`,
      );
      console.log('      → activated skill Instructions present in the assembled prompt (widened surface applied)');
    },
  },
];

for (const check of AgentSkillsLiveChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-skills-live', {
  Setup: async (ctx: IntegrationCheckContext) => {
    await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
    const skill = AIEngine.Instance.Skills.find((s) => (s.Name ?? '').toLowerCase() === PROBE_SKILL_NAME.toLowerCase());
    Assert(!!skill, `seeded skill '${PROBE_SKILL_NAME}' not found — push metadata-optional/integration-test`);
    ctx.AgentSkillsLiveFixture = { ProbeSkillID: skill!.ID, CreatedRunIds: [] };
  },
  Teardown: async (ctx: IntegrationCheckContext) => {
    const fx = ctx.AgentSkillsLiveFixture;
    if (!fx) {
      return;
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
              console.error('skills step cleanup failed:', e);
            }
          }
        }
        const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ctx.User);
        if (await run.Load(runId)) {
          await run.Delete();
        }
      } catch (e) {
        console.error('skills run cleanup failed:', e);
      }
    }
    ctx.AgentSkillsLiveFixture = undefined;
  },
});
