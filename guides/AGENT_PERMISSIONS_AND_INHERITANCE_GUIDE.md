# Agent Instances, Multi-Level Prototype Inheritance & Permissions Guide

MemberJunction supports **first-class personalized and team-scoped AI Agent instances** backed by **multi-level prototype inheritance** (`AIAgent.BaseAgentID`), **2×2 RBAC with SQL Row-Level Security (RLS)**, **strictest-wins policy/limit ceiling inheritance**, and **unified text + Realtime voice personas**.

Instead of cloning agent rows (which freezes copies and orphans them from platform or Open App upgrades), derived agents point to a prototype via `BaseAgentID` and inherit prompts, actions, sub-agents, Open App skills, rhythm templates, presets, and configuration **live** while customizing identity, voice, tone, standing instructions, and per-instance policies.

---

## 1. Schema & CodeGen Hierarchy Support

The `[__mj].[AIAgent]` table carries five columns powering prototype inheritance and personalization:

| Column | Type | Default | Purpose |
| --- | --- | --- | --- |
| `BaseAgentID` | `UNIQUEIDENTIFIER NULL` (FK → `AIAgent.ID`) | `NULL` | Prototype parent agent. `NULL` for root/catalog agents. Decorated with `Configuration.Hierarchy = { "IsHierarchy": true, "MaxDepth": 5 }`. |
| `InstantiationMode` | `NVARCHAR(20) NOT NULL` | `'None'` | `'None'` (not user-instantiable), `'Optional'` (usable directly OR instantiable, e.g. *Research Agent*, *Query Builder*), or `'Required'` (template only — users instantiate personal copies, e.g. *Chief of Staff*). |
| `AdditionalInstructions` | `NVARCHAR(MAX) NULL` | `NULL` | Layer-specific standing instructions stacked root → leaf onto prompt context. |
| `IsPrimaryInstance` | `BIT NOT NULL` | `0` | Designates a user's primary active instance per `(OwnerUserID, RootBaseAgentID)` for inbound wakes, colleague Agent Channels, and inter-agent requests. |
| `LogoURL` | `NVARCHAR(MAX) NULL` | `NULL` | Custom avatar image URL or data URI (widened from `NVARCHAR(255)`). |

Because `BaseAgentID` is configured as a CodeGen Hierarchy field (`MaxDepth = 5`), CodeGen automatically generates:
- SQL TVFs (`fnAIAgentBaseAgentID_Ancestors`, `fnAIAgentBaseAgentID_Descendants`, `fnAIAgentBaseAgentID_Root`)
- View columns on `vwAIAgents`: `RootBaseAgentID`, `BaseAgentIDDepth`, `BaseAgentIDPath`, `BaseAgentIDIsLeaf`, `BaseAgentIDChildCount`
- Strongly-typed entity methods on `MJAIAgentEntity`: `GetBaseAgentIDAncestors()`, `GetBaseAgentIDDescendants()`, `GetBaseAgentIDRoot()`

---

## 2. Multi-Level Prototype Inheritance (`L0 → L1 → L2 …`, Max Depth 5)

A derived agent can inherit through up to 5 prototype levels (for example: `L0: Chief of Staff` → `L1: Sales Chief of Staff (Sales Role)` → `L2: Alice's Pepper`).

`AIEngineBase` (and its server facade `AIEngine`) computes effective configuration across `GetAgentInheritanceChain(agentId)` (ordered root → leaf, cycle-safe, capped at `MAX_AGENT_INHERITANCE_DEPTH = 5`):

- **Scalar Properties (`ResolveEffectiveAgentProperties`)**: Nearest non-null descendant wins for `TypeID`, `DriverClass`, `ExecutionMode`, `ModelSelectionMode`, `PayloadDownstreamPaths`, `PayloadUpstreamPaths`, `AcceptsSkills`, `SkillActivationMode`, `DefaultArtifactTypeID`, `ArtifactCreationMode`, `MaxCostPerRun`, `MaxTokensPerRun`, `MaxIterationsPerRun`, `MaxTimePerRun`, etc.
- **Deep-Merged JSON Config**: `TypeConfiguration` and `AgentTypePromptParams` deep-merge root → leaf (`DeepMergeAgentConfigObjects`) so a child overrides individual keys without erasing sibling settings from its prototype.
- **Prompts (`GetEffectiveAgentPrompts`)**: Leaf overrides ancestor when the child defines active prompts; otherwise inherits nearest ancestor's active prompts.
- **Actions (`GetEffectiveAgentActions`)**: Union root → leaf by `ActionID`. A child row with `Status = 'Revoked'` (or `'Pending'`) **vetoes** an inherited ancestor action.
- **Sub-Agents (`GetSubAgents`)**: Unions active `ParentID` children and `AIAgentRelationship` rows across the chain (leaf-first precedence for relationship settings like `MessageMode` and `MaxMessages`).
- **Open App Skills (`GetSkillsForAgent`, `GetAutoActivatableSkillsForAgent`)**: Skills granted to an ancestor template (e.g., *Chief of Staff Tasks & To-dos* or *Strategic Plan & OKRs* granted to `Chief of Staff`) flow down live to every derived personal instance (*Pepper*, *Cato*) with zero copy-on-write.
- **Presets, Client Tools, Modalities, Personas & Rhythm Templates**: All walk the inheritance chain leaf-first; enabling an inherited `AIAgentRhythmTemplate` creates a `UserRoutine` whose `TargetID` is the concrete personal instance (`Pepper.ID`).
- **Stacked Standing Instructions (`GetStackedAdditionalInstructions`)**: Concatenates non-empty `AdditionalInstructions` root → leaf so organizational guardrails stay above personal preferences.

---

## 3. 2×2 RBAC Model, Ancestor `CanRun` Invariant & SQL RLS

`AIAgentPermissionHelper.ComputeEffectivePermissionsSync` evaluates permissions in two dimensions:

| Agent Kind | 0 `MJ: AI Agent Permissions` Rows | ≥ 1 `MJ: AI Agent Permissions` Rows |
| --- | --- | --- |
| **Root / Catalog** (`BaseAgentID == null`) | **Public** (`CanView = true`, `CanRun = true`) | `OwnerUserID` + matching `RoleID` / `UserID` grants |
| **Derived Instance** (`BaseAgentID != null`) | **Private to `OwnerUserID`** (hidden from all other users) | `OwnerUserID` + matching `RoleID` / `UserID` grants (enables team-shared derived agents) |

### Ancestor `CanRun` Invariant (Fail-Closed)
Running a derived agent **requires `CanRun` on every ancestor in its `BaseAgentID` chain**. If an administrator revokes a user's `Sales` role on `L1: Sales Chief of Staff`, the user's `CanRun` on `L2: Alice's Pepper` is revoked immediately—even though Alice owns `L2`. Missing, RLS-hidden, cyclic, or over-depth (> 5) ancestors fail closed.

### SQL Row-Level Security & Server Sandbox
- **`UserAccessibleAIAgents`** (`ReadRLSFilterID` on `UI` role for `MJ: AI Agents`): Mirrors the 2×2 matrix directly in SQL (`BaseAgentID IS NULL` with open/matching ACL, or `OwnerUserID = {{UserID}}`, or explicit `AIAgentPermission` grant).
- **`UserOwnedDerivedAIAgents`** (`UpdateRLSFilterID` / `DeleteRLSFilterID` on `UI` role): Restricts non-Owner writes strictly to rows where `BaseAgentID IS NOT NULL AND OwnerUserID = {{UserID}}`.
- **Server Entity Guards**:
  - `MJAIAgentEntityServer`: Blocks non-Owner creation of root agents (`BaseAgentID == null`), enforces `InstantiationMode != 'None'`, enforces `maxInstancesPerUser`, prevents cycles & depth > 5, auto-sets `OwnerUserID`, auto-promotes the first instance to `IsPrimaryInstance = true`, and atomically clears sibling `IsPrimaryInstance` flags per `(OwnerUserID, RootBaseAgentID)`.
  - `MJAIAgentPersonaEntityServer`: Confines non-Owner edits of `MJ: AI Agent Personas` strictly to derived agents owned by `ContextCurrentUser`.
  - `MJAIAgentUserPolicyEntityServer`: Allows an executing template agent during onboarding to create the initial policy on a newly minted derived child while enforcing non-widening (`DetectAgentPolicyWidening`) against every ancestor policy.

### Discovery & Name Disambiguation
- Templates with `InstantiationMode === 'Required'` (such as `Chief of Staff`) are excluded from `GetUserRunnableAgentDirectory`, `@mention` autocomplete, and the default conversation agent picker; they are surfaced via `GetInstantiableAgents(user)`.
- `ResolveAgentForUser(nameOrId, user)` resolves user-owned instances first, then shared derived instances, then root catalog agents — so multiple users naming their Chief of Staff *"Pepper"* never collide.

---

## 4. Policy Ceiling Inheritance, Unified Persona & Memory Isolation

- **Strictest-Wins Policy & Limit Ceilings**: `AgentUserPolicyEngine.GetEffectivePolicyForAgentChain` intersects policies across `[root … leaf]` (most restrictive `CoordinationMode`, channel modes, approval flags, and `AutoApproveAmountThreshold`, unioning `EntityAccessRules` and `ActionPolicyRules`). `ResolveAgentRunLimits` likewise clamps run limits by ancestor ceilings.
- **Unified Text + Realtime Voice Persona (`BuildAgentPersonaAndInstructionsBlock`)**: `BaseAgent` resolves `AIEngine.ResolveAgentPersona(agent.ID)` (`Tone`, `SpeakingStyle`, `StyleOverrideObject`) and `GetStackedAdditionalInstructions(agent.ID)` into the text system prompt alongside an **Audience-Aware Tone Guardrail**: personal wit, sarcasm, or informality applies in 1:1 owner conversations, while external emails, calendar invites, and peer Agent Channels stay professional unless explicitly told otherwise.
- **Sibling Memory Isolation + Org-Note Inheritance**: In `AgentContextInjector` and `AIEngine.composeNoteFilters`, agent-wide org notes (`UserID == null`) on `BaseAgentID` ancestors flow down live to derived instances, while per-user notes (`UserID != null`) remain strictly isolated per concrete instance (*Pepper*'s private memories never leak into *Cato*).
- **Primary Instance Routing**: `AIEngine.ResolvePrimaryUserAgentInstance(baseAgentId, userId)` and `AgentWakeTriggerService.ResolvePrimaryUserAgentInstance` route colleague inter-agent requests, Agent Channels, inbound utility mailbox wakes, and workstreams to the recipient's primary active derived instance (falling back to oldest active instance, then base agent if un-onboarded).

---

## 5. UX & Conversational Onboarding

- **`Manage My Agent Instance` Action** (`@memberjunction/core-actions`): Supports `Create`, `Update`, `ListMine`, `SetPrimary`, and `Archive`, atomically creating `AIAgent`, `AIAgentPersona` (`StyleOverride`), and `AIAgentUserPolicy`, refreshing `AIEngine`, and re-pinning `Conversation.DefaultAgentID` so Grok-Bot-style conversational onboarding transitions into the new personal instance in the same chat thread.
- **My Agents Left Rail & Interactive Studio** (`@memberjunction/ng-conversations`): `MyAgentsSectionComponent` lists personal instances with custom icons/avatars, base-agent badges, primary stars, Tailor controls, and a `"Set up My Chief of Staff"` CTA. `AgentInstanceEditorModalComponent` provides both **"Chat to Onboard"** and a direct designer with live preview, name suggestions, icon grid, avatar URL, voice persona selector, personality presets, standing instructions, and autonomy mode.
- **Chief of Staff App Switcher** (`@memberjunction/ng-dashboards`): Surfaces all user instances (*Pepper*, *Cato*) in the Overview and Governance agent switcher (defaulting to `IsPrimaryInstance`) with per-instance policies, approvals, wakes, and inline Personalize / New Instance controls.

---

## Related Guides

- [Built-In Agents Guide](./BUILT_IN_AGENTS_GUIDE.md)
- [Chief of Staff Agent Guide](./CHIEF_OF_STAFF_AGENT_GUIDE.md)
