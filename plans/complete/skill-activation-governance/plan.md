# Skill Activation Governance & Observability

**Status:** ✅ COMPLETE — shipped in the 5.45 train (#3017 merged 2026-07-02); unified clean-DB verification passed; execution-resolution fix for skill-granted sub-agents landed in #3029
**Branch:** `ai-skill-activation-mode` → PR #3017 (draft, targets **5.45** — do not merge during 5.44)
**Related:** PR #3015 (core skill library phase 2 — carries the skill metadata seeds), #3013/#3014 (shipped)

## Motivation

Live testing of the core skill library surfaced two governance gaps:

1. **Autonomous skill expansion** (run `A782928E`): Query Builder — correctly, under
   `AcceptsSkills='All'` — self-activated the Web Research skill without any user request.
   Fine for research skills; unacceptable as an *uncontrollable* default for skills that
   send/mutate, and a security/governance concern ("skill leakage into an agent").
2. **Observability gaps**: skill activations appear as run steps, but nothing records
   *which* skills were in effect on a given prompt turn, *which* skill granted an action
   or sub-agent the agent used, *why* the agent chose to activate a skill, or whether a
   run executed under plan mode.

## Design

### 1. Double activation gate (safe by default)

Two new columns, both `NVARCHAR(20) NOT NULL DEFAULT 'RequestedOnly'`,
`CHECK IN ('Auto','RequestedOnly')`:

- **`AISkill.ActivationMode`** — may this skill ever be self-activated?
- **`AIAgent.SkillActivationMode`** — may this agent ever self-activate skills?

**Self-activation** (skill catalog injected into the prompt + agent-initiated `Skill`
step) requires **`Auto` on BOTH sides**, on top of all existing availability gates
(`AcceptsSkills` × `AISkill.Status` × `AIAgentSkill` assignment × user Run permission).
Auto×Auto is the deliberately-configured "super agent" posture — never accidental,
because both defaults are `RequestedOnly`.

**Requested path** (`/skill` mention → `ExecuteAgentParams.requestedSkillIDs`) works
under either mode; availability gates unchanged.

ActivationMode is orthogonal to availability: availability = *who may use the skill*,
ActivationMode = *who may pull the trigger*.

### 2. Plan mode hardening

- **`AIAgent.RequirePlanMode`** (`BIT NOT NULL DEFAULT 0`): forces plan mode on every
  root run of that agent regardless of the per-request toggle. When 1,
  `SupportsPlanMode` is irrelevant.
- **`AIAgentRun.PlanMode`** (`BIT NOT NULL DEFAULT 0`): records that the run executed
  under plan mode (drives the run-header UX chip and future plan-drift audits).
- **Plan mode × skills rule**: skill activations are only legal **before plan approval**
  (pre-activated `/skill` requests land before planning; pre-approval self-activations
  are visible in the plan the human reviews). A **post-approval** agent-initiated
  `Skill` step is rejected with Retry guidance directing the agent to propose an
  updated plan — the reviewer must see the widened tool surface.

### 3. Observability — `AIAgentRunStep.Skills` (JSONType)

`NVARCHAR(MAX) NULL`, JSON-typed as `Array<AgentSkillInvocation> | null`:

```typescript
interface AgentSkillInvocation {
    SkillID: string;
    SkillName: string;
    /** How the skill entered the run */
    ActivationType: 'requested' | 'auto';
    /** Provenance of authority — which gates admitted it */
    Provenance: {
        AgentAcceptsSkills: 'All' | 'Limited';
        SkillActivationMode: 'Auto' | 'RequestedOnly';
        AgentSkillActivationMode: 'Auto' | 'RequestedOnly';
        /** 'user-request' = /skill mention; 'agent-decision' = LLM Skill step */
        RequestedBy: 'user-request' | 'agent-decision';
    };
    /** LLM-provided rationale when self-activating (new optional field in LoopAgentResponse) */
    Reason?: string;
}
```

Population rules:
- **Skill steps**: the invocation(s) activated by that step (with `Reason` when
  agent-initiated).
- **Prompt steps**: the full set of skills in effect for that turn — makes prompt
  injection always visible, structurally.
- **Actions / Sub-Agent steps**: the invocation(s) through which the executed
  action/sub-agent became available; `null` = native grant.
- Verify both activation paths (`preActivateRequestedSkills`,
  `executeSkillStep`) unconditionally record their Skill step.

### 4. UX (MJ Explorer, agent-run form)

- **Run header**: "Plan Mode" chip when `AIAgentRun.PlanMode = 1`.
- **Step timeline/nodes**: skill badge on any step whose `Skills` is non-null; ensure
  the `Skill` StepType node has proper icon/styling.
- **Step drill-in panel**: a "Skills" section rendering the invocation array — name,
  activation type, provenance, reason.
- Investigate current run form components first; upgrade in place (no bespoke chrome).

### 5. Seeds (metadata)

- Six `AcceptsSkills='All'` agents → `SkillActivationMode='Auto'` (preserves current
  behavior under the new safe default). *This branch* (agents files exist on next).
- Skills → `ActivationMode='Auto'` for the 9 research/build skills,
  **`'RequestedOnly'` for Communications**. *On the #3015 branch* (skill files live there).

## Execution checklist

1. [x] Rewrite migration `V202607020230__v5.45.x__AISkill_ActivationMode.sql`
       (consolidated ALTERs, extended properties, all 5 columns across 4 tables)
2. [x] Apply to dev DB → `mj codegen` → append output to migration per repo convention
       → `mj sync push` (JSONType metadata on `AIAgentRunStep.Skills`) → `mj codegen`
3. [x] Runtime (packages/AI/BaseAIEngine, AI/Agents, AI/CorePlus):
       - `AgentSkillInvocation` type (CorePlus), `skillActivations[].reason` in loop response
       - AIEngineBase: auto-activatable set (double gate) vs full availability set
       - base-agent: catalog uses auto set; `validateSkillNextStep` rejects
         RequestedOnly self-activation + post-approval activations in plan mode;
         `resolvePlanModeGate` honors `RequirePlanMode`; `AIAgentRun.PlanMode` stamped;
         `Skills` JSON populated on Skill/Prompt/Actions/Sub-Agent steps
       - All field types derived from generated entities (`Entity['Field']`), never hand-copied
4. [x] UX: run header chip, step-node badges, drill-in Skills section
5. [x] Seeds (both branches as noted above)
6. [x] Tests: new coverage for every gate/branch + review-and-deepen existing suites in
       affected packages (edge cases: Limited agents, permission-filtered users,
       re-requests, plan-phase boundaries, malformed Skills JSON)
7. [x] Docs: JSDoc on all new/changed public surface; package READMEs;
       `/guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md` updated to cover the double gate,
       provenance model, RequirePlanMode, and the run-step observability contract
8. [x] Changesets; builds green; push; update PR #3017 + #3015. **No merging** (5.45).

Moved to `/plans/complete/` 2026-07-02. Post-ship addendum: live testing surfaced a skill-granted sub-agent EXECUTION resolution gap (Research Agent infinite loop) — fixed in #3029 (`resolveSubAgentByName` effective-set branch + bounded, self-correcting execution retries).
