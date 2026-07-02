# Agent Skills & Plan Mode Guide

Two `BaseAgent`-framework capabilities that ship together (they share one migration): **Skills** — reusable capability bundles an agent can activate mid-run — and **Plan Mode** — a per-request human-in-the-loop gate that makes an agent get its plan approved before it acts.

**Audience**: developers building/configuring agents, authoring skills, or wiring skills/plan-mode into a chat surface.

Both are **agent-framework** features, not chat-widget features. They work for any agent invocation — the conversations UI, headless/scheduled runs, the API — because the logic lives in `BaseAgent` / `AIEngineBase`, and the chat surface is just one caller.

---

## Part 1 — Skills

### 1.1 The mental model

A **Skill** (`MJ: AI Skills`) is a bundle of three things:

| Piece | Column / table | Effect when the skill activates |
|---|---|---|
| **Instructions** | `AISkill.Instructions` (NVARCHAR MAX) | Appended to the agent's context for the rest of the run |
| **Actions** | `MJ: AI Skill Actions` (junction → `Action`) | Added to the agent's available tool surface |
| **Sub-agents** | `MJ: AI Skill Sub Agents` (junction → `AIAgent`) | Added to the agent's available sub-agents |

The point is **write-once, grant-to-many**: instead of copy-pasting the same instruction block + action set into every agent's system prompt, you author it once as a Skill and grant it to any agent that should have it. Skills are also **shareable** and **portable** (see §1.6, §1.7).

Activation is **progressive-disclosure**: an agent only ever sees a skill's **name + description** in its prompt catalog. It sees the full `Instructions` only after it chooses to activate the skill — so a large library of skills costs very few prompt tokens until one is actually used.

Activation is **not** a nested agent run. It's an in-loop step that appends instructions and widens the tool surface, then continues the same run.

### 1.2 The three-layer gate

Whether a given agent may activate a given skill is resolved by `AIEngineBase.GetSkillsForAgent(agent)` ([`packages/AI/BaseAIEngine/src/BaseAIEngine.ts`](../packages/AI/BaseAIEngine/src/BaseAIEngine.ts)) through three independent gates — **all** must pass:

```
include skill  ⟺  AIAgent.AcceptsSkills ≠ 'None'    (per-agent gate)
              AND  AISkill.Status = 'Active'          (catalog gate)
              AND  (AcceptsSkills = 'All'  OR  an Active MJ: AI Agent Skills grant exists)   (grant gate)
```

- **`AIAgent.AcceptsSkills`** — `None` (default; opt-in, so existing agents are unaffected) · `All` (any Active skill) · `Limited` (only skills granted via `MJ: AI Agent Skills`).
- **`AISkill.Status`** — only `Active` skills are activatable. `Deprecated` retires a skill without deleting it (defaults to `Active` so a freshly authored skill works immediately for its owner).
- **`MJ: AI Agent Skills.Status`** — per-grant `Active`/`Pending`/`Revoked`, so a grant can be disabled without unlinking (only consulted when `AcceptsSkills = 'Limited'`).

At runtime a fourth, orthogonal gate also applies: an activated skill's bundled **Actions** are still subject to `Action.Status`, and bundled **sub-agents** to `AIAgent.Status` — a deprecated Action never flows through any skill.

`Action`/`Agent` bundle IDs are read via `GetSkillActionIDs(skillID)` / `GetSkillSubAgentIDs(skillID)`; the engine returns IDs only and lets callers resolve the full entities against their own `ActionEngineServer` / `AIEngine` caches (no cross-package dependency).

### 1.3 The runtime flow (Loop agent)

```
gatherPromptTemplateData()  ── injects skill CATALOG (name+description only) into the prompt
        │
        ▼
LLM emits  nextStep.type='Skill', skills:[{name}]
        │
        ▼
LoopAgentType.DetermineNextStep  ── → BaseAgentNextStep.step='Skill', skillActivations:[{name}]
        │
        ▼
validateSkillNextStep  ── fuzzy-matches names vs GetSkillsForAgent; unknown/disallowed → Retry
        │
        ▼
executeSkillStep  ── for each newly-activated skill:
        ├─ recordSkillActivationStep()   → AIAgentRunStep (StepType='Skill')
        ├─ buildSkillActivationMessage() → appends Instructions to conversationMessages
        └─ enableSkillCapabilities()     → pushes 'specific'-scoped add ActionChange/SubAgentChange
        │
        ▼
executePromptStep  ── loop continues; next turn's gatherPromptTemplateData picks up the widened tool surface
```

Key implementation notes (all in [`base-agent.ts`](../packages/AI/Agents/src/base-agent.ts)):

- **`'Skill'` is a non-terminal step.** Like `'ClientTools'`, it is deliberately **not** part of the generated `AIAgentRun.FinalStep` union (that column is DB-CHECK-constrained to terminal outcomes). `BaseAgentNextStep.step` is typed off `FinalStep`, so the switch sites use an explicit `'Skill' as typeof …step` cast. It **is** in the `AIAgentRunStep.StepType` CHECK — that column records what executed, a different concern from a run's final outcome.
- **Tool-surface widening uses `scope: 'specific'` targeting the activating agent's own ID** (`agentIds: [agent.ID]`), pushed onto `params.actionChanges` / `params.subAgentChanges`. This applies to the activating agent **at any depth** (a sub-agent that activates a skill still gets its tools — a `'root'` scope would only apply at depth 0) and never cascades to that agent's own sub-agents (via `filterActionChangesForSubAgent`). Because `params` is the same object for the whole run, every later turn's `gatherPromptTemplateData()` re-applies it automatically.
- **Idempotent re-activation.** `_activatedSkillIDs` tracks what's already active; re-requesting an active skill is a harmless no-op (no duplicate instructions, no duplicate change entries).
- **`_effectiveSubAgents`** mirrors `_effectiveActions` so a runtime-added sub-agent (from a skill) validates correctly in `validateSubAgentNextStep`. (This closed a pre-existing gap in the `subAgentChanges` mechanism that affected any consumer, not just Skills.)

`executeSkillStep` is decomposed into `resolveSkillActivations` / `buildSkillActivationMessage` / `enableSkillCapabilities` / `recordSkillActivationStep`, all `protected` — override any one for fine-grained control (custom instruction formatting, a licensing check on activation, cascading grants via `'all-subagents'`, etc.) without re-implementing the step.

### 1.4 Realtime and proxy agents

- **Realtime** agents don't run the Loop; a skill's instructions are appended at session build (session-static), not activated in-loop.
- **Proxy** agents delegate their whole loop to a remote system; skills are the remote's concern.

### 1.5 Prompt template

The Loop system prompt template ([`metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md`](../metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md)) gates the entire Skills section on `{% if skillCount > 0 %}` — agents with no available skills see nothing about skills, keeping their prompt unchanged. `skillCount` / `skillsCatalog` come from `AgentContextData` (populated in `gatherPromptTemplateData`).

### 1.6 Permissions: full agent-parity, open-by-default

Skills use the **same dedicated-table permission model as AI Agents** — `MJ: AI Skill Permissions` (`AISkillPermission`) is the exact sibling of `AIAgentPermission`: a row grants a **User** (`UserID`) **or** a **Role** (`RoleID`) — never both, never neither (a server-side validator enforces this; see below) — one of `CanView` / `CanRun` / `CanEdit` / `CanDelete`. A skill's owner is its `CreatedByUserID`.

There are **two access paths over the same table**, with different defaults and purposes (the general pattern is documented in the **[Unified Permissions Guide](UNIFIED_PERMISSIONS_GUIDE.md#3-the-two-access-paths-dont-confuse-them)**):

| Path | Class | Default (no rows) | Used for |
|---|---|---|---|
| **Runtime helper** | `AISkillPermissionHelper` (`@memberjunction/ai-engine-base`) | **Open** — anyone can View + Run; only owner Edits/Deletes | The hot path: the `/skill` picker filter and the server-side run-time guard |
| **Unified provider** | `AISkillPermissionProvider` (`@memberjunction/core-entities`, `@RegisterClass(PermissionProviderBase, 'MJAISkillPermissionProvider')`, domain `AI Skill Permissions`) | **Closed** — explicit grants only | Sharing Center / audit via the `PermissionEngine` |

Action mapping (both paths): `CanView → Read`, `CanRun → Execute`, `CanEdit → Update`, `CanDelete → Delete`. The helper applies the hierarchy `Delete → Edit → Run → View` and is a **synchronous cache hit** because `AIEngineBase` caches `SkillPermissions` alongside `Skills`.

- **Grantee-exclusivity validator**: `MJAISkillPermissionEntityServer` (`@memberjunction/core-entities-server`) overrides `Validate()` to reject a row with both or neither grantee — the deterministic, version-controlled equivalent of the LLM-generated `ValidateRoleIDAndUserIDExclusive` on `AIAgentPermission`. It fires on every server save path, so the sharing UI, Remote Operations, and scripts are all covered.
- **The permission filter**: `AIEngineBase.GetSkillsForAgent(agent, user?)` takes an **optional** user. Without it, you get pure agent-gating (§1.2). With it, the result is additionally intersected with the user's Run permission — so the same call is the single source of truth for "what may this agent activate *for this user*". `BaseAgent` passes `params.contextUser`, so the skills **catalog the model sees is already permission-filtered** — an agent is never even offered a skill the acting user can't run.

**Sharing** is gated behind the dedicated **`Can Share Skills`** authorization (`MJ: Authorizations`); authoring/using your own skills never requires it. In the UI, the generated `MJ: AI Skills` form gets a **Manage Permissions** grid + Export/Import SKILL.md from the `AISkillSharingPanel` (a `BaseFormPanel` slot component), and the permission grid itself is a skill-scoped mirror of the agent permissions grid (`SkillPermissionsPanel`/`SkillPermissionsDialog` in `@memberjunction/ng-agents`). The generated form's related-entity grid also edits `MJ: AI Skill Permissions` directly. (The earlier `AI Skills` *Resource Type* / `MJ: Resource Permissions` sharing was retired — skills now own their permission table, exactly like agents.)

### 1.6a `/skill` invocation — user-requested pre-activation

A user can activate a skill for a message by typing **`/skill-name`** in the conversation composer — the exact sibling of `@agent` and `#entity` mentions (the mention system's `MENTION_TRIGGERS` now includes `/`). The picker (`MentionAutocompleteService`) lists **only Active skills the user has Run permission for** (filtered through `AISkillPermissionHelper`, open-by-default), and each chip renders with the skill's own `IconClass` + `Color` UX metadata. Selected skill IDs are collected from the composer and threaded as **`ExecuteAgentParams.requestedSkillIDs`** (a `string[]`) down the same client→resolver→runtime chain as `planMode`:

```
/skill chips → message-input.component (collectRequestedSkillIDs)
  → conversation-agent.service.invokeSubAgent(requestedSkillIDs)   [or ConversationAgentRunner.ProcessMessage]
  → RunAgentFromConversationDetailParams.RequestedSkillIDs
  → GraphQL $requestedSkillIDs:[String!] → RunAIAgentResolver
  → ExecuteAgentParams.requestedSkillIDs
  → BaseAgent.preActivateRequestedSkills()   ← guarded pre-activation at run start
```

`preActivateRequestedSkills` runs once at run start (**root agent only**), and activates each requested skill **only if it survives the guard**: it must be in `GetSkillsForAgent(agent, contextUser)` — i.e. the agent accepts it **and** the user may run it. Anything else is silently dropped, so a client can never smuggle in a skill the user or agent isn't entitled to. Surviving skills are activated through the same `recordSkillActivationStep` / `enableSkillCapabilities` / `buildSkillActivationMessage` machinery as a model-initiated `Skill` step, so their Instructions + bundled tools take effect from turn 1. Plan Mode is unaffected — pre-activation widens the tool surface, but the plan-approval gate still blocks *executing* those tools until approved.

### 1.7 SKILL.md — portable import/export

A skill can be exported to / imported from a portable **SKILL.md** file, so skills move across MJ instances:

```markdown
---
name: Report Builder
description: Generates formatted business reports from query results
category: Reporting
actions:
  - Run Query
  - Generate PDF
subAgents:
  - Report Formatter Agent
---

Instructions body — plain markdown, appended to an accepting agent's system
prompt when the skill is activated.
```

**Why names, not IDs**: Action/sub-agent references in the frontmatter are **names**, because names are the only stable cross-instance reference. On import, names are resolved against the target instance's catalog; anything that doesn't resolve becomes a **non-fatal warning** (the skill still imports with whatever did resolve) — a skill authored elsewhere may reference actions this instance doesn't have.

Two layers, in `@memberjunction/ai-agents`:

- **`SkillMarkdownConverter`** — pure, dependency-free `Parse` / `Serialize`. Fully unit-tested in isolation. Hand-rolled parser (the frontmatter shape is small and fixed) rather than a YAML dependency.
- **`SkillImportExportService`** — orchestrates against the DB: `Config()`s the AI + Action engines (idempotent) for name↔ID resolution, creates/updates the `MJ: AI Skills` row, and resyncs the two junction sets.

Both are exposed as typed, provider-routed **Remote Operations** — `AISkill.ExportMarkdown` / `AISkill.ImportMarkdown` (see [REMOTE_OPERATIONS_GUIDE](REMOTE_OPERATIONS_GUIDE.md)) — so the browser calls `new AISkillExportMarkdownOperation().Execute(input, { provider })` with no bespoke resolver/GraphQL client.

---

## Part 2 — Plan Mode

### 2.1 The mental model

Plan Mode makes an agent **present a plan and get human approval before it executes any Actions or Sub-Agents**. It's a per-request opt-in built on the **existing** `MJ: AI Agent Requests` human-in-the-loop (HITL) pause/resume infrastructure — it adds no new persistence mechanism.

Two independent switches, resolved once per run in `BaseAgent.resolvePlanModeGate`:

| Switch | Column / param | Default | Meaning |
|---|---|---|---|
| **Capability** | `AIAgent.SupportsPlanMode` (BIT) | `1` (ON, opt-out) | Whether this agent *can* use plan mode at all |
| **Per-request** | `ExecuteAgentParams.planMode` | `undefined` (OFF) | Whether *this run* should be gated |

Plan Mode is **active** only when: `SupportsPlanMode` **AND** `planMode === true` **AND** the agent is the **root** (depth 0). Because the per-request toggle defaults OFF, **default runtime behavior is unchanged** — nothing is gated unless a caller explicitly opts in. Realtime agents are seeded `SupportsPlanMode = 0` (they skip plan mode structurally); Remote Proxy agents will be too when that type ships.

### 2.2 The gate

While Plan Mode is **active and not yet approved**, `validateNextStep` demotes any `Actions` or `Sub-Agent` next step to `Retry` with an explanatory message — the agent literally cannot execute until it presents a plan. **Everything else stays allowed**: `Chat` (ask a clarifying question first), `Skill` (load a skill's instructions before planning), `ForEach`/`While`, `ClientTools`, `Retry`.

The prompt template surfaces a "Plan Mode — REQUIRED before you may act" section, gated on `{% if planModeActive and not planApproved %}`.

### 2.3 The HITL flow

```
Plan Mode active, unapproved
        │
        ▼
LLM emits  nextStep.type='Plan', plan:'…'
        │
        ▼
executePlanStep:
   ├─ records an AIAgentRunStep (StepType='Plan')      ← the UI reads this to render a plan-approval card
   ├─ createFeedbackRequest(...) with an editable       ← reuses the EXISTING MJ: AI Agent Requests flow
   │    plan-approval AgentResponseForm (textarea + Approve/Reject buttongroup)
   └─ terminates the run (returns a 'Chat'-shaped terminal step)   ← awaits the human
        │
        ▼
human Approves / edits / Rejects  → MJAIAgentRequestEntityServer.Save() auto-resumes (lastRunId set)
        │
        ▼
resolvePlanModeGate on the RESUMED run:
   ├─ re-enables planMode (because the request originated from a 'Plan' step)
   └─ reads the request's status:  Approved/Responded → approved (proceed)   ·   Rejected → unapproved (re-plan)
```

Two subtleties worth calling out (both are load-bearing correctness points):

- **The step returned to the framework is `'Chat'`, not `'Plan'`.** `'Plan'` is only an intermediate classification and the `AIAgentRunStep.StepType` audit value the UI keys on. The *terminal* step must stay within `AIAgentRun.FinalStep`'s DB-CHECK-constrained vocabulary, which deliberately excludes `Plan`/`Skill`/`ClientTools` (same reason as §1.3). So a plan-approval pause is represented with the same terminal shape `executeChatStep` uses.
- **Rejection forces a re-plan** because `resumeAgent` re-enables `planMode` **only** when the resume originated from a `Plan` run-step. Without that, the gate would be off on the resumed run and a rejected plan would silently execute anyway. Regular Chat-clarification resumes are unaffected — they leave `planMode` off.

`resolvePlanModeGate`, `validatePlanNextStep`, `executePlanStep`, and `buildPlanApprovalForm` are all `protected` — override to change eligibility rules, plan-quality validation, or the approval card's layout.

---

## 3. Schema at a glance

Migration [`V202606301200__v5.44.x__Agent_Skills_And_Plan_Mode.sql`](../migrations/v5). New tables: `AISkill`, `AISkillAction`, `AISkillSubAgent`, `AIAgentSkill`, `AISkillPermission` (User **xor** Role grantee + `CanView`/`CanRun`/`CanEdit`/`CanDelete`). Additive columns: `AIAgent.SupportsPlanMode` (default 1), `AIAgent.AcceptsSkills` (default `'None'`), `AISkill.IconClass` + `AISkill.Color` (UX metadata for the `/skill` picker). `AIAgentRunStep.StepType` CHECK extended with `'Plan'` and `'Skill'`. Composition junctions (`AISkillAction`/`AISkillSubAgent`) are intentionally **status-less** — member lifecycle is governed by `Action.Status`/`AIAgent.Status`; `Status` lives only on the grant (`AIAgentSkill`) and the catalog (`AISkill`). The `MJ: Permission Domains` catalog row for `AI Skill Permissions → MJAISkillPermissionProvider` is seeded via metadata sync (`metadata/permission-domains/`), not the migration.

---

## 4. Where to look

| Concern | File |
|---|---|
| Skill resolution + gate + user filter | `packages/AI/BaseAIEngine/src/BaseAIEngine.ts` (`GetSkillsForAgent(agent, user?)`, `SkillPermissions`, `GetSkillActionIDs`/`…SubAgentIDs`) |
| Skill permission runtime helper | `packages/AI/BaseAIEngine/src/AISkillPermissionHelper.ts` (open-by-default, cached) |
| Skill permission unified provider | `packages/MJCoreEntities/src/custom/PermissionProviders/AISkillPermissionProvider.ts` (+ `index.ts` `LoadPermissionProviders`) |
| Grantee-exclusivity validator | `packages/MJCoreEntitiesServer/src/custom/MJAISkillPermissionEntityServer.server.ts` |
| Skill step + Plan Mode runtime + pre-activation | `packages/AI/Agents/src/base-agent.ts` (`executeSkillStep` family, `preActivateRequestedSkills`, `resolvePlanModeGate`, `executePlanStep`) |
| Skill/Plan next-step parsing | `packages/AI/Agents/src/agent-types/loop-agent-type.ts`, `loop-agent-response-type.ts` |
| Step-type union + params | `packages/AI/CorePlus/src/agent-types.ts` (`BaseAgentNextStep`, `AgentSkillActivationRequest`, `ExecuteAgentParams.planMode` / `.requestedSkillIDs`) |
| `/skill` composer UX | `packages/Angular/Generic/conversations/src/lib/services/mention-autocomplete.service.ts`, `components/mention/mention-editor.component.ts`, `components/message/message-input.component.ts` |
| `requestedSkillIDs` transport | `AgentsClient/src/generic/AgentClientTypes.ts` + `AgentClientSession.ts`, `GraphQLDataProvider/src/graphQLAIClient.ts`, `MJServer/src/resolvers/RunAIAgentResolver.ts`, `ConversationsRuntime/src/agent-runner/ConversationAgentRunner.ts` |
| SKILL.md | `packages/AI/Agents/src/SkillMarkdownConverter.ts`, `SkillImportExportService.ts`, `operations/AISkillMarkdownOperations.ts` |
| Plan-approval resume | `packages/AI/Agents/src/MJAIAgentRequestEntityServer.ts` |
| Sharing / permission grid / import UI | `packages/Angular/Explorer/core-entity-forms/src/lib/panels/ai-skill-sharing/`, `packages/Angular/Generic/agents/src/lib/{services/skill-permissions.service,components/skill-permissions-*}` |
| Governance metadata | `metadata/authorizations/` (`Can Share Skills`), `metadata/permission-domains/` (`AI Skill Permissions`) |
| Tests | unit: `packages/AI/Agents/src/__tests__/{skill-step,plan-mode-gate,loop-agent-type,SkillMarkdownConverter}.test.ts`, `packages/AI/BaseAIEngine/src/__tests__/AISkillPermissionHelper.test.ts`, `packages/MJCoreEntities/src/__tests__/PermissionProviders/AISkillPermissionProvider.test.ts`, `packages/MJCoreEntitiesServer/src/__tests__/MJAISkillPermissionEntityServer.test.ts`; integration: `packages/MJServer/integration-test-scripts/ai-skills-tests.ts` |
