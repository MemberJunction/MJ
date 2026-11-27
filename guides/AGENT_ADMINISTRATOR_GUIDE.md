# MemberJunction AI Agent Administrator Guide

This guide is the authoritative reference for **platform administrators, security architects, and operators** governing MemberJunction AI Agents. It covers security and sandbox boundaries, prototype inheritance (`BaseAgentID`), the 3-table `IAgentConfiguration` cascade, the `v6.x` → `v7.0` legacy column deprecation roadmap, sliding liveness watchdogs, `undici` long-running HTTP transport tuning, semantic stuck-run detection, and `MJ: AI Agent Step Types` administration.

> **Canonical Agent Documentation Suite**
> - **Administrators & Operators:** [Agent Administrator Guide](AGENT_ADMINISTRATOR_GUIDE.md) *(this guide)*
> - **Developers & Extension Authors:** [Agent Builder & Extension Guide](AGENT_BUILDER_EXTENSION_GUIDE.md)
> - **Everyday Users & Personal Instances:** [Agent End-User Guide](AGENT_END_USER_GUIDE.md)
> - **Subclass & PR Rebase Reference:** [BaseAgent Rebase Map](BASE_AGENT_REBASE_MAP.md)

---

## 1. Security Model, Sandboxing & Governance Invariants

MemberJunction enforces defense-in-depth across database Row-Level Security (RLS), server-side entity validation (`MJAIAgentEntityServer`), metadata resolution (`AIEngineBase.ResolveEffectiveAgentProperties`), and runtime execution (`BaseAgentLimitsHelper` & `BaseAgentActionPolicyHelper`).

### 1.1 `BaseAgentID` Prototype Inheritance & Narrow-Only Invariants

Instead of cloning agent rows, derived agents reference a prototype template through `AIAgent.BaseAgentID` (up to `MAX_AGENT_INHERITANCE_DEPTH = 5` hops, cycle-checked at save and resolution time). Capabilities flow down live; security bounds **never loosen** down a chain.

```mermaid
flowchart TD
    L0["L0: Platform Template\nBaseAgentID = NULL\nInstantiationMode = 'Required'\nIsolation = 'Worker', MaxCostPerRun = 5.00"]
    L1["L1: Department Template\nBaseAgentID = L0\nCan narrow Isolation -> 'Process'\nCan narrow MaxCostPerRun -> 2.50"]
    L2["L2: Personal User Instance\nBaseAgentID = L1, OwnerUserID = User\nInstantiationMode = 'None' (forced)\nCannot widen Isolation, Ceilings, or Capabilities"]

    L0 --> L1
    L1 --> L2
```

Every narrow-only invariant enforced by `AIEngineBase.ResolveEffectiveAgentProperties` (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts`) and `ValidateAgentInheritanceAndSandbox` (`packages/MJCoreEntitiesServer/src/custom/MJAIAgentEntityServer.server.ts`):

| Control | Direction | Enforcement Rule |
| --- | --- | --- |
| **`Isolation`** | Strictest wins (`Container` > `Process` > `Worker` > `InProcess`) | Descendant cannot choose a less strict isolation level than any ancestor. |
| **`AcceptsSkills`** | Narrow-only (`All` → `Limited` → `None`) | Monotonic minimum rank down the `BaseAgentID` chain. |
| **`Configuration.skills.activationMode`** (`SkillActivationMode`) | Narrow-only (`Auto` → `RequestedOnly`) | Once `RequestedOnly` on a template, no descendant can re-enable `Auto`. |
| **`Configuration.scope.searchScopeAccess`** (`SearchScopeAccess`) | Narrow-only (`All` → `Assigned` → `None`) | Descendant cannot widen search scope access beyond its ancestor. |
| **`Configuration.execution.requirePlanMode`** (`RequirePlanMode`) | Monotonic `OR` | If an AgentType, Category, or ancestor requires Plan Mode (`true`), every descendant requires it. |
| **`Configuration.execution.supportsPlanMode`** (`SupportsPlanMode`) | Monotonic `AND` | If an AgentType, Category, or ancestor disables Plan Mode (`false`), descendants cannot re-enable it. |
| **`Configuration.clientTools.allowEphemeral`** (`AllowEphemeralClientTools`) | Monotonic `AND` | Once `false` on a Category, AgentType, or ancestor, descendants cannot enable ephemeral client tools. |
| **`Configuration.attachments.acceptUnregisteredFiles`** (`AcceptUnregisteredFiles`) | Monotonic `AND` | Once `false`, descendants cannot widen to `true`. |
| **Run Ceilings** (`MaxCostPerRun`, `MaxTokensPerRun`, `MaxTimePerRun`, `MaxIterationsPerRun`) | Monotonic `Math.min` | Clamped against every ancestor agent, every ancestor `AIAgentUserPolicy`, and `mj.config.cjs` ceilings. |
| **Sub-Agent Ceilings** (`subAgentExecution.maxExecutionsPerRun`, `subAgentExecution.maxConsultRounds`) | Monotonic `Math.min` | Clamped to the minimum finite positive value across defaults and the inheritance chain. |
| **Inherited Actions & Grants** | Descendant Veto | Any descendant `AIAgentAction` or `AIAgentSkill` row with `Status !== 'Active'` (`Revoked`, `Pending`) vetoes the inherited grant. |

### 1.2 Non-Admin (`UI` Role) Ownership & RLS Sandbox (`#6852`)

`MJAIAgentEntityServer` (`packages/MJCoreEntitiesServer/src/custom/MJAIAgentEntityServer.server.ts`) uses `IsAgentAdminOrOwnerUser(user)` — returning `true` only for `Owner`-type users or members of the `System Administrator`, `Administrator`, `Admin`, `Administration`, or `Agent Administrator` roles — and enforces the following sandbox for all non-admin users:

1. **Derived Instances Only:** Non-admin users can only create, update, or delete rows with `BaseAgentID != null`. Root catalog agents (`BaseAgentID == null`) are admin-only.
2. **Immutable Lineage & Ownership:**
   - `OwnerUserID` is auto-attributed on create to `ContextCurrentUser.ID` and verified against pre-save `OldValue` on update and delete so ownership cannot be hijacked or reassigned.
   - `BaseAgentID` cannot be re-parented on an existing saved instance.
   - Only one active `IsPrimaryInstance = true` row exists per `(OwnerUserID, RootBaseAgentID)`.
3. **Instantiation Gate & Quotas:**
   - Creating a derived instance requires `baseAgent.InstantiationMode !== 'None'` (`'Optional'` or `'Required'`) and effective `CanRun` permission on `BaseAgentID` (evaluated via `AIAgentPermissionHelper.ComputeEffectivePermissionsSync` with fail-closed ancestor `CanRun`).
   - Enforces `instantiation.maxInstancesPerUser` (read from `Configuration.instantiation` / `TypeConfiguration.instantiation`) against active instances owned by that user.
   - Personal instances must keep `InstantiationMode = 'None'` and `ExposeAsAction = false`.
4. **Admin-Only Extension Fields (`DriverClass` & `helperPlugins`):**
   - Non-admin users **cannot** set a custom `DriverClass` on a derived instance.
   - Non-admin users **cannot** configure **any** `Configuration.helperPlugins` (or `TypeConfiguration.helperPlugins`) entries.

See [Agent Permissions & Inheritance Guide](AGENT_PERMISSIONS_AND_INHERITANCE_GUIDE.md) for the full 2×2 RBAC matrix and SQL RLS view details.

### 1.3 Code-Only Security Seams (`BaseAgentLimitsHelper` & `BaseAgentActionPolicyHelper`)

`BaseAgent` delegates execution across 13 pluggable helper seams (`packages/AI/Agents/src/helpers/`). Eleven behavioral seams can be overridden per agent by administrators via `Configuration.helperPlugins`. **Two security-critical seams are strictly code-only** and can **never** be overridden from database metadata — not even by System Administrators:

| Code-Only Seam | Base Token Class | Why Metadata Override Is Forbidden |
| --- | --- | --- |
| **`limits`** | `BaseAgentLimitsHelper` | Owns 5-tier budget resolution, `AgentTreeBudgetTracker`, `BudgetEnforcementGuard`, runaway governance, cooperative pause, `AgentLivenessWatchdog`, and `AgentStuckDetector`. |
| **`actionPolicy`** | `BaseAgentActionPolicyHelper` | Owns taint tracking (`TaintedSources`), tainted-egress checks, bound/hidden action parameters, per-user action policies (`CheckUserActionPolicy`), audience enforcement, and run-scope validation. |

This invariant is enforced in **two independent layers**:
1. **Entity Save Time (`ValidateAgentInheritanceAndSandbox`):** Checks `IsForbiddenMetadataHelperSeam(plugin.seam)` from `@memberjunction/ai-core-plus` (rejecting `'limits'`, `'actionpolicy'`, `'policy'`, `'permissions'`, and `'permission'`, case- and punctuation-insensitive) for **all** users including administrators.
2. **Runtime Resolution (`AgentHelperCache.ResetForRun` & `ResolveAgentHelper` in `packages/AI/Agents/src/helpers/AgentHelperResolver.ts`):** Re-checks `CODE_ONLY_HELPER_SEAMS` and `IsForbiddenMetadataHelperSeam` before resolving any `DriverClass`, throwing a `Security violation` error if a tampered database row attempts to override either seam.

To customize limits or action policy logic organization-wide, deploy a server-side `@RegisterClass(BaseAgentLimitsHelper, 'Default', priority)` or `@RegisterClass(BaseAgentActionPolicyHelper, 'Default', priority)` subclass in audited TypeScript code (see [Agent Builder & Extension Guide](AGENT_BUILDER_EXTENSION_GUIDE.md)).

### 1.4 5-Tier Limits Hierarchy & `mj.config.cjs` Ceilings

`LimitsConfigResolver` (`packages/MJCore/src/generic/limitsConfig.ts`) merges execution budgets, liveness timers, stuck-detector thresholds, isolation ceilings, and resource guards across five tiers (lowest to highest priority, with org ceilings clamping downward):

1. **`CodeFallback`** (`CODE_FALLBACK_LIMITS` in `@memberjunction/core`)
2. **`MjConfig`** (`mj.config.cjs` `limits` block registered via `LimitsConfigResolver.RegisterMjConfigLimits`)
3. **`AgentOrWorkflowMetadata`** (`AIAgent.MaxCostPerRun`, `MaxTokensPerRun`, `MaxTimePerRun`, `MaxIterationsPerRun`)
4. **`UserAgentPolicy`** (`MJ: AI Agent User Policies` intersected strictest-wins across the `BaseAgentID` chain)
5. **`RunOverride`** (`ExecuteAgentParams` per-run limits)

Example `mj.config.cjs` `limits` section:

```javascript
// mj.config.cjs
module.exports = {
  // ...database & server config...
  limits: {
    AgentAbsoluteIterations: 250,
    Budgets: {
      PerRun: {
        MaxCostUsd: 10.0,
        MaxTokens: 2_000_000,
        MaxWallClockMs: null, // Defer to Liveness.OuterMaxWallClockMs unless a hard run cap is desired
      },
      PerUserPerDay: {
        MaxCostUsd: 50.0,
        MaxWallClockMs: null,
        DayBoundaryTimezone: 'UTC',
      },
      CountPausedTimeTowardsWallClock: false,
    },
    Liveness: {
      Enabled: true,
      InactivityTimeoutMs: 900_000,        // 15m sliding inactivity window
      OuterMaxWallClockMs: 259_200_000,    // 72h outer safety ceiling
      StreamChunkTouchThrottleMs: 5_000,   // 5s throttle on stream-chunk timer resets
      HttpHeadersTimeoutMs: 1_800_000,     // 30m undici headersTimeout (0 = disable, rely on AbortSignal)
      HttpBodyTimeoutMs: 0,                // 0 = disabled, rely on AbortSignal
    },
    StuckDetector: {
      Enabled: true,
      WindowSize: 10,                      // Sliding tool-call fingerprint window
      IdenticalToolCallThreshold: 3,       // Course-correct at 3 identical calls, pause if repeated again
      ReadOnlyStepThreshold: 30,           // Wrap-up directive after 30 consecutive read-only steps
      ReadOnlyPostDirectiveGraceSteps: 5,  // Pause if 5 more read-only steps occur after wrap-up
    },
  },
};
```

---

## 2. Three-Table `IAgentConfiguration` Cascade

Operational agent settings live in a single strongly-typed JSON contract — **`IAgentConfiguration`** (defined canonically in `metadata/entities/JSONType-interfaces/IAgentConfiguration.ts` and auto-copied into `packages/AI/CorePlus/src/JSONType-interfaces/IAgentConfiguration.ts` at build time via `sync:json-types`) — stored across three tables:

| Table (Entity Name) | JSON Column | Role in Cascade |
| --- | --- | --- |
| **`MJ: AI Agent Types`** (`AIAgentType`) | `DefaultAgentConfiguration` | Lowest metadata tier: defaults shared by every agent of that type (e.g., `Loop`, `Flow`, `Harness`). *(Distinct from `AIAgentType.DefaultConfiguration`, which holds per-type `TypeConfiguration` defaults.)* |
| **`MJ: AI Agent Categories`** (`AIAgentCategory`) | `DefaultConfiguration` | Middle metadata tier: inherited recursively along `AIAgentCategory.ParentID` (root category → child category) for operational grouping (e.g., *Executive Assistants*, *Research*). |
| **`MJ: AI Agents`** (`AIAgent`) | `Configuration` | Highest metadata tier: merged root template → intermediate templates → leaf instance along `BaseAgentID`. |

### 2.1 Resolution Order (`AIEngineBase.ResolveEffectiveAgentProperties`)

```mermaid
flowchart LR
    T["1. AIAgentType\nDefaultAgentConfiguration\n(+ 7 legacy columns)"]
    PC["2. Parent Categories\nDefaultConfiguration\n(Root -> Parent)"]
    C["3. Direct Category\nDefaultConfiguration"]
    B["4. BaseAgent Chain\nConfiguration\n(Root Template -> Parent)"]
    I["5. Leaf Agent / Instance\nConfiguration\n(+ dual-read legacy fallback)"]
    OUT["EffectiveAgentProperties\n+ Narrow-Only Clamps\n+ mj.config.cjs Ceilings"]

    T --> PC --> C --> B --> I --> OUT
```

Key merge semantics implemented in `DeepMergeAgentConfigurations` and `ResolveEffectiveAgentProperties`:
- **Deep object merge:** Nested section objects (`execution`, `contextWindow`, `memory`, `payload`, `subAgentExecution`, `attachments`, `artifacts`, `scope`, `skills`, `clientTools`, `recording`, `promptDefaults`) merge recursively by leaf key; higher-precedence tiers override only the keys they specify.
- **Arrays and `null` replace cleanly:** Setting an array or explicit `null` replaces the lower-tier value.
- **Stripping template-only UX hints:** `instantiation` (suggested names, icons, personality presets, `maxInstancesPerUser`) is stripped from resolved `Configuration` and `TypeConfiguration` on non-instantiable leaf instances (`BaseAgentID != null && InstantiationMode === 'None'`).
- **Cumulative `helperPlugins`:** Admin-authored `helperPlugins` entries are collected in order (`AgentType → Categories → BaseAgent Chain → Agent`) and resolved by ascending `priority` (highest `priority` wins per seam; ties favor the later entry).
- **Clean separation from `TypeConfiguration`:** `AIAgent.TypeConfiguration` remains strictly per-AgentType (validated against `AIAgentType.ConfigSchema`, preserving `"additionalProperties": false` on schemas such as `realtime-type-config.schema.json`). `AIAgent.AgentTypePromptParams` remains per-AgentType prompt options (layered over `Configuration.promptDefaults`).

### 2.2 `IAgentConfiguration` Section Reference

| Section | Keys | Governance Notes |
| --- | --- | --- |
| `execution` | `modelSelectionMode`, `defaultPromptEffortLevel`, `chatHandlingOption`, `supportsPlanMode`, `requirePlanMode`, `declareActionsAsNativeTools` | `requirePlanMode` is monotonic `OR`; `supportsPlanMode` is monotonic `AND`. |
| `contextWindow` | `enableCompression`, `compressionMessageThreshold`, `compressionPromptID`, `compressionMessageRetentionCount`, `maxTokens`, `compactionTriggerPercent`, `compactionTargetPercent`, `summaryPromptID` | Also populated from `AIAgentType.DefaultAgentConfiguration.contextWindow`. |
| `memory` | `injectNotes`, `maxNotesToInject`, `noteInjectionStrategy`, `injectExamples`, `maxExamplesToInject`, `exampleInjectionStrategy`, `noteRetentionDays`, `exampleRetentionDays`, `autoArchiveEnabled`, `allowMemoryWrite`, `reranker` | `reranker` is a parsed JSON object (replaces stringified `RerankerConfiguration`). |
| `payload` | `downstreamPaths`, `upstreamPaths`, `selfReadPaths`, `selfWritePaths`, `scope`, `startingValidationSchema`, `startingValidationMode`, `finalValidationSchema`, `finalValidationMode`, `finalValidationMaxRetries` | Path fields are typed `string[]` (replaces JSON-encoded strings). |
| `subAgentExecution` | `mode`, `minExecutionsPerRun`, `maxExecutionsPerRun`, `maxConsultRounds` | `maxExecutionsPerRun` and `maxConsultRounds` clamp via `Math.min`. |
| `attachments` | `messageMode`, `maxMessages`, `rootPath`, `inlineStorageThresholdBytes`, `acceptUnregisteredFiles` | `acceptUnregisteredFiles` is narrow-only (`AND`). |
| `artifacts` | `creationMode`, `defaultArtifactTypeID` | Controls output artifact lifecycle (`Always`, `Never`, `System Only`). |
| `scope` | `searchScopeAccess`, `secondaryScopeConfig` | `searchScopeAccess` is narrow-only (`All > Assigned > None`). |
| `skills` | `activationMode` | Narrow-only (`Auto > RequestedOnly`). |
| `clientTools` | `allowEphemeral` | Narrow-only (`AND`). |
| `recording` | `defaultMode` | Realtime session recording default (`Audio`, `AudioVideo`, `None`). |
| `helperPlugins` | `Array<{ seam: string; driverClass: string; priority?: number }>` | **Admin-only.** `limits` and `actionPolicy` are forbidden in metadata. |
| `instantiation` | `suggestedNames`, `suggestedIcons`, `suggestedPersonaNames`, `maxInstancesPerUser`, `onboardingGreeting`, `personalityPresets` | Canonical location (dual-read fallback to `TypeConfiguration.instantiation`). |
| `promptDefaults` | `Record<string, unknown>` | Category/type defaults merged beneath `AIAgent.AgentTypePromptParams`. |

---

## 3. `v6.x` Bidirectional Dirty-Field Sync & `v7.0` Removal Roadmap

In accordance with `packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md`, no physical columns are dropped during `v6.x`. Instead:

- **49 operational columns on `MJ: AI Agents`** and **7 context-window columns on `MJ: AI Agent Types`** are marked `Status = 'Deprecated'`, `IncludeInGeneratedForm = false`, and `AutoUpdateDescription = false` via `metadata/entities/.ai-agent-configuration-columns-deprecation.json`.
- **38 identity, structural FK, security, and ceiling columns STAY physical columns on `MJ: AI Agents`** permanently (including `ID`, `Name`, `Description`, `LogoURL`, `IconClass`, `Status`, `TypeID`, `CategoryID`, `BaseAgentID`, `ParentID`, `OwnerUserID`, `DefaultStorageAccountID`, `DefaultCoAgentID`, `DriverClass`, `Isolation`, `AcceptsSkills`, `InstantiationMode`, `ExposeAsAction`, `IsRestricted`, `InvocationMode`, `MaxCostPerRun`, `MaxTokensPerRun`, `MaxTimePerRun`, `MaxIterationsPerRun`, `AdditionalInstructions`, `IsPrimaryInstance`, `TypeConfiguration`, `AgentTypePromptParams`, and `Configuration`).

### 3.1 How Bidirectional Dirty-Field Sync Works (`v6.x`)

Both `MJAIAgentEntityServer.Save()` and `MJAIAgentTypeEntityServer.Save()` invoke pure sync functions in `@memberjunction/ai-core-plus` (`SyncAgentLegacyColumnsAndConfiguration` and `SyncAgentTypeLegacyColumnsAndConfiguration`):

1. **Direction 1 (`Configuration` JSON → Legacy Columns):** When a caller edits `Configuration` (or creates a new record with `Configuration`), every configured JSON value mirrors into the corresponding legacy column — **except** any legacy column that is itself dirty on the same save.
2. **Direction 2 (Dirty Legacy Columns → `Configuration` JSON):** When legacy code, SQL tools, or older metadata files modify any deprecated column (`field.Dirty === true`), only those dirty legacy columns are patched into `Configuration` via `DeepMergeAgentConfigurations`. Legacy writers are **never** silently shadowed by stale JSON values.
3. **Read-Path Dual-Read:** `AIEngineBase.ResolveEffectiveAgentProperties` always checks `Configuration.<section>.<key>` first and falls back to the legacy column if absent, protecting direct SQL or un-synced metadata imports.

### 3.2 Complete Legacy Column → `IAgentConfiguration` Deprecation Map

#### `MJ: AI Agents` (49 Deprecated Columns — Slated for Removal in `v7.0`)

| Legacy `AIAgent` Column | Replacement in `AIAgent.Configuration` |
| --- | --- |
| `ModelSelectionMode` | `execution.modelSelectionMode` |
| `DefaultPromptEffortLevel` | `execution.defaultPromptEffortLevel` |
| `ChatHandlingOption` | `execution.chatHandlingOption` |
| `SupportsPlanMode` | `execution.supportsPlanMode` |
| `RequirePlanMode` | `execution.requirePlanMode` |
| `DeclareActionsAsNativeTools` | `execution.declareActionsAsNativeTools` |
| `EnableContextCompression` | `contextWindow.enableCompression` |
| `ContextCompressionMessageThreshold` | `contextWindow.compressionMessageThreshold` |
| `ContextCompressionPromptID` | `contextWindow.compressionPromptID` |
| `ContextCompressionMessageRetentionCount` | `contextWindow.compressionMessageRetentionCount` |
| `ContextWindowMaxTokens` | `contextWindow.maxTokens` |
| `CompactionTriggerPercent` | `contextWindow.compactionTriggerPercent` |
| `CompactionTargetPercent` | `contextWindow.compactionTargetPercent` |
| `ConversationSummaryPromptID` | `contextWindow.summaryPromptID` *(also retained as FK mirror during v6.x)* |
| `InjectNotes` | `memory.injectNotes` |
| `MaxNotesToInject` | `memory.maxNotesToInject` |
| `NoteInjectionStrategy` | `memory.noteInjectionStrategy` |
| `InjectExamples` | `memory.injectExamples` |
| `MaxExamplesToInject` | `memory.maxExamplesToInject` |
| `ExampleInjectionStrategy` | `memory.exampleInjectionStrategy` |
| `NoteRetentionDays` | `memory.noteRetentionDays` |
| `ExampleRetentionDays` | `memory.exampleRetentionDays` |
| `AutoArchiveEnabled` | `memory.autoArchiveEnabled` |
| `AllowMemoryWrite` | `memory.allowMemoryWrite` |
| `RerankerConfiguration` | `memory.reranker` |
| `PayloadDownstreamPaths` | `payload.downstreamPaths` |
| `PayloadUpstreamPaths` | `payload.upstreamPaths` |
| `PayloadSelfReadPaths` | `payload.selfReadPaths` |
| `PayloadSelfWritePaths` | `payload.selfWritePaths` |
| `PayloadScope` | `payload.scope` |
| `StartingPayloadValidation` | `payload.startingValidationSchema` |
| `StartingPayloadValidationMode` | `payload.startingValidationMode` |
| `FinalPayloadValidation` | `payload.finalValidationSchema` |
| `FinalPayloadValidationMode` | `payload.finalValidationMode` |
| `FinalPayloadValidationMaxRetries` | `payload.finalValidationMaxRetries` |
| `ExecutionMode` | `subAgentExecution.mode` |
| `MinExecutionsPerRun` | `subAgentExecution.minExecutionsPerRun` |
| `MaxExecutionsPerRun` | `subAgentExecution.maxExecutionsPerRun` |
| `MaxSubAgentConsultRounds` | `subAgentExecution.maxConsultRounds` |
| `MessageMode` | `attachments.messageMode` |
| `MaxMessages` | `attachments.maxMessages` |
| `AttachmentRootPath` | `attachments.rootPath` |
| `InlineStorageThresholdBytes` | `attachments.inlineStorageThresholdBytes` |
| `AcceptUnregisteredFiles` | `attachments.acceptUnregisteredFiles` |
| `ArtifactCreationMode` | `artifacts.creationMode` |
| `DefaultArtifactTypeID` | `artifacts.defaultArtifactTypeID` *(also retained as FK mirror during v6.x)* |
| `SearchScopeAccess` | `scope.searchScopeAccess` |
| `ScopeConfig` | `scope.secondaryScopeConfig` |
| `SkillActivationMode` | `skills.activationMode` |
| `AllowEphemeralClientTools` | `clientTools.allowEphemeral` |
| `RecordingDefault` | `recording.defaultMode` |

*(Note: `ConversationSummaryPromptID` and `DefaultArtifactTypeID` are kept bidirectionally synchronized with `contextWindow.summaryPromptID` and `artifacts.defaultArtifactTypeID`; the 49 deprecated fields in `.ai-agent-configuration-columns-deprecation.json` cover all operational behavioral columns listed above.)*

#### `MJ: AI Agent Types` (7 Deprecated Columns — Slated for Removal in `v7.0`)

| Legacy `AIAgentType` Column | Replacement in `AIAgentType.DefaultAgentConfiguration` |
| --- | --- |
| `ContextCompressionMessageThreshold` | `contextWindow.compressionMessageThreshold` |
| `ContextCompressionPromptID` | `contextWindow.compressionPromptID` |
| `ContextCompressionMessageRetentionCount` | `contextWindow.compressionMessageRetentionCount` |
| `ContextWindowMaxTokens` | `contextWindow.maxTokens` |
| `CompactionTriggerPercent` | `contextWindow.compactionTriggerPercent` |
| `CompactionTargetPercent` | `contextWindow.compactionTargetPercent` |
| `ConversationSummaryPromptID` | `contextWindow.summaryPromptID` |

### 3.3 `v7.0` Upgrade Checklist for Administrators

Before upgrading to `v7.0`:
1. Migrate custom SQL queries, BI views, and metadata JSON files to read/write `AIAgent.Configuration` and `AIAgentType.DefaultAgentConfiguration` instead of the deprecated columns.
2. Confirm any direct-SQL updates are migrated so they don't bypass `MJAIAgentEntityServer.Save()`. (The `v7.0` migration will run a final idempotent reconcile before dropping the deprecated columns.)
3. Audit any custom `BaseAgent` subclasses for deprecated helper calls (see [BaseAgent Rebase Map](BASE_AGENT_REBASE_MAP.md)).

---

## 4. Long-Running Execution: Sliding Liveness Watchdog, `undici` Tuning & `StuckDetector`

Long-running autonomous agents (multi-hour research, code generation, or multi-day workflows with external waits) previously suffered from two artificial timeout cliffs: a blunt wall-clock `setTimeout` abort and Node `undici`'s 5-minute (`300s`) `headersTimeout` on non-streaming LLM requests. Slice `A7b` replaces both with a three-pillar liveness and stuck-detection architecture.

```mermaid
flowchart LR
    subgraph Signals["Forward-Progress Signals"]
        S1["LLM Stream Chunks\n(UI or Internal Liveness Sink)"]
        S2["Step Completed\n(AIAgentRunStep)"]
        S3["Action / Sub-Agent Progress"]
        S4["External Wait Pause/Resume\n(HITL / CI / Workflow)"]
    end

    subgraph Watchdog["AgentLivenessWatchdog"]
        W1["Sliding Inactivity Timer\nDefault: 15m (900,000ms)"]
        W2["Outer Safety Ceiling\nDefault: 72h (259,200,000ms)\n32-bit Timer Chaining"]
        W3["Run AbortController"]
    end

    subgraph HTTP["@memberjunction/ai httpDispatcher"]
        H1["Always-On Liveness Sink\n(Headless Streaming)"]
        H2["undici Agent Dispatcher\nheadersTimeout: 30m\nbodyTimeout: 30m (finite)"]
    end

    subgraph Stuck["AgentStuckDetector"]
        D1["Canonical Tool-Call Breaker\n(>= 3 identical in window of 10)"]
        D2["Read-Only Spiral Detector\n(>= 30 steps -> Wrap-Up -> +5 Grace)"]
    end

    S1 & S2 & S3 & S4 --> W1
    W1 & W2 --> W3
    H1 --> S1
    H2 -. "eliminates 300s cliff" .-> S1
    D1 & D2 --> PAUSE["Course-Correction Directive\nor Non-Destructive Checkpoint Pause"]
```

### 4.1 Sliding Forward-Progress Watchdog (`AgentLivenessWatchdog`)

Implemented in `packages/AI/Agents/src/helpers/limits/AgentLivenessWatchdog.ts`:

- **Sliding Inactivity Window (`Liveness.InactivityTimeoutMs`, default `900_000` ms = 15 min):** Resets whenever `RecordProgress(signal)` receives a `'run-start'`, `'llm-stream-chunk'`, `'step-complete'`, `'action-progress'`, `'sub-agent-heartbeat'`, or `'external-wait-resumed'` signal. High-frequency stream chunks update `LastProgressAtMs` immediately while throttling timer re-arming via `StreamChunkTouchThrottleMs` (default `5_000` ms).
- **Outer Safety Ceiling (`Liveness.OuterMaxWallClockMs`, default `259_200_000` ms = 72 hours):** Absolute wall-clock bound (clamped downward by any tighter `AIAgent.MaxTimePerRun`, `Budgets.PerRun.MaxWallClockMs`, user policy, or caller `maxExecutionTimeMs`). Chains delays at `MAX_SAFE_TIMER_DELAY_MS` (`2_147_483_647` ms ≈ 24.85 days) so multi-week runs never hit V8's 32-bit `TimeoutOverflowWarning`.
- **External Wait Suspension:** Calling `SuspendForExternalWait(waitId, reason)` pauses the sliding inactivity timer (while keeping the outer ceiling armed) during `AwaitingFeedback`, CI checks, or external workflow waits. `ResumeFromExternalWait(waitId)` restarts a fresh inactivity window when the last wait clears.
- **Abort Reason Mapping (`BaseAgent.CancellationReasonForAbort`):**
  - Sliding inactivity timeout aborts with `BaseAgent.AgentInactivityAbortReason` (`'Agent execution stalled with no progress signal'`).
  - Outer ceiling / explicit cap breach aborts with `BaseAgent.AgentTimeoutAbortReason` (`'Agent execution exceeded maxExecutionTimeMs'`).

### 4.2 Always-On Liveness Streaming & Node `undici` `headersTimeout` Tuning

1. **Always-On Liveness Sink:** When `LivenessWatchdog` is active, headless runs (`params.onStreaming === undefined`) automatically attach an internal `onStreaming` callback so streaming-capable LLM drivers stream tokens continuously and feed `'llm-stream-chunk'` heartbeats into the watchdog.
2. **Long-Running `undici` Dispatcher (`packages/AI/Core/src/generic/httpDispatcher.ts`):** For extended-thinking models or native tool-calling turns where streaming is suppressed, Node's default `undici` `headersTimeout` of `300_000` ms (5 minutes) would throw `UND_ERR_HEADERS_TIMEOUT`. `MJServer` automatically primes Node's built-in `undici` dispatcher at startup with finite 30-minute `headersTimeout` and `bodyTimeout` bounds (zero external `undici` dependency; stalled sockets still fail cleanly). Custom Node workers can call the same helper:

```typescript
import {
    DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS,
    InstallGlobalLongRunningFetchDispatcher,
    PrimeNodeBuiltinUndiciDispatcher,
} from '@memberjunction/ai';

await PrimeNodeBuiltinUndiciDispatcher();
const handle = InstallGlobalLongRunningFetchDispatcher({
    headersTimeoutMs: DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS, // Default: 1_800_000 (30m); pass 0 to disable
    bodyTimeoutMs: DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,       // Default: 1_800_000 (30m); pass 0 to defer to AbortSignal
});

// During graceful shutdown:
// await handle.Restore();
```

Default transport bounds in `@memberjunction/ai`:
- `DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS`: `1_800_000` ms (30 minutes; set `0` to rely solely on `AbortSignal`)
- `DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS`: `1_800_000` ms (30 minutes finite default so stalled sockets fail cleanly; set `0` explicitly for `AbortSignal`-only per-request wrappers)
- `DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS`: `30_000` ms (30 seconds so dead endpoints still fail fast)
- `DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS`: `60_000` ms / `DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS`: `600_000` ms

### 4.3 Semantic Stuck-Run Detection (`AgentStuckDetector`)

`AgentStuckDetector` (`packages/AI/Agents/src/helpers/limits/AgentStuckDetector.ts`) complements error-based circuit breakers and `DeterministicProgressDetector` by catching two subtle failure modes where actions *succeed* without making progress:

1. **Canonical Repeated Tool-Call Breaker:** Normalizes tool/action names and serializes arguments via `StableSortedJSON` (`ComputeCanonicalToolFingerprint`). If the exact same canonical call appears `>= IdenticalToolCallThreshold` (default `3`) times within the last `WindowSize` (default `10`) tool calls:
   - **First breach:** Injects a `[System Course-Correction]` user message directing the model to change approach or synthesize its answer.
   - **Second breach (directive ignored):** Escalates to a non-destructive checkpoint pause (`PauseReason: 'StuckToolCallLoop'`).
2. **Read-Without-Act Spiral Detector:** Classifies actions using `IsReadOnlyToolOrActionName` (fail-safe: any mutating token resets the streak, as do payload mutations, sub-agent delegations, `Tasks`, `Handoff`, `Plan`, or terminal steps).
   - At `>= ReadOnlyStepThreshold` (default `30`) consecutive read-only steps: injects a non-lethal Wrap-Up Directive instructing the agent to conclude or invoke its terminal action.
   - After `ReadOnlyPostDirectiveGraceSteps` (default `5`) additional read-only steps with no state mutation: escalates to a non-destructive checkpoint pause (`PauseReason: 'ReadOnlySpiral'`).

---

## 5. Administering `MJ: AI Agent Step Types`

The `MJ: AI Agent Step Types` (`AIAgentStepType`) entity governs which step types `BaseAgent` can validate and execute through `AgentStepTypeRegistry` (`packages/AI/Agents/src/helpers/steps/AgentStepTypeRegistry.ts`). All rows are cached in `AIEngineBase.Instance.AgentStepTypes`.

### 5.1 Built-In Seeded Step Types (`metadata/agent-step-types/.agent-step-types.json`)

Fourteen core step types ship active out of the box:

| `Name` (`StepKey`) | `DriverClass` | `AppliesTo` | `AllowedInUnapprovedPlanMode` | `CountsAgainstTreeBudget` |
| --- | --- | --- | :---: | :---: |
| `Actions` | `ActionsStepHandler` | `Both` | `false` | `true` |
| `Sub-Agent` | `SubAgentStepHandler` | `Both` | `false` | `true` |
| `Retry` | `RetryStepHandler` | `Loop` | `true` | `true` |
| `Success` | `SuccessStepHandler` | `All` | `true` | `true` |
| `Failed` | `FailedStepHandler` | `All` | `true` | `true` |
| `Chat` | `ChatStepHandler` | `Both` | `true` | `false` |
| `ForEach` | `ForEachStepHandler` | `Both` | `true` | `true` |
| `While` | `WhileStepHandler` | `Both` | `true` | `true` |
| `Skill` | `SkillStepHandler` | `Loop` | `true` | `true` |
| `Plan` | `PlanStepHandler` | `Loop` | `true` | `true` |
| `Tasks` | `TasksStepHandler` | `Loop` | `true` | `true` |
| `Handoff` | `HandoffStepHandler` | `Loop` | `true` | `true` |
| `ClientTools` | `ClientToolsStepHandler` | `Loop` | `true` | `true` |
| `Decision` | `DecisionStepHandler` | `Both` | `true` | `true` |

### 5.2 Governance Controls for Custom OpenApp Step Types

When reviewing or activating a custom `MJ: AI Agent Step Types` row from an OpenApp:
- **Kill Switch (`Status`):** Setting `Status` to anything other than `'Active'` immediately disables that step type across all agents (`AgentStepTypeRegistry.ResolveEffectivePolicy` returns `null`).
- **Plan Mode Safety (`AllowedInUnapprovedPlanMode`):** Set to `false` for **any** custom step that performs external writes, mutations, or side effects so Plan Mode automatically blocks it until human approval is granted.
- **Budget Accounting (`CountsAgainstTreeBudget`):** Keep `true` for any step that executes compute, actions, or LLM work; set `false` only for pure human-wait / conversational pause steps.
- **Prompt Visibility (`DefaultEnabledInPrompt` & `PromptDocsTemplate`):** Controls whether `AgentStepTypeRegistry.GetActiveCustomStepPolicies(scope)` automatically advertises the custom step's usage instructions in Loop/Flow prompts.
- **Run Observability:** Custom step executions are logged on `MJ: AI Agent Run Steps` with `StepType = 'Custom'` and `StepTypeID` linked to the `AIAgentStepType.ID` row.

---

## 6. Operational Troubleshooting Quick Reference

| Symptom | Where to Look | Action |
| --- | --- | --- |
| Non-admin user save rejected on `MJ: AI Agents` | `MJAIAgentEntityServer.ValidateAsync` (`ValidateAgentInheritanceAndSandbox`) | Confirm `BaseAgentID` is set, `baseAgent.InstantiationMode !== 'None'`, user has `CanRun` on `BaseAgentID`, `InstantiationMode === 'None'`, `ExposeAsAction === false`, and no `DriverClass` or `helperPlugins` are set. |
| `Security violation: helper seam 'limits' is code-only` | `AgentHelperResolver.ts` / `ValidateAgentInheritanceAndSandbox` | Remove `limits` / `actionPolicy` from `Configuration.helperPlugins` and register a server-side `@RegisterClass` subclass instead. |
| Agent aborted with `UND_ERR_HEADERS_TIMEOUT` | Host startup / `httpDispatcher.ts` | Ensure `InstallGlobalLongRunningFetchDispatcher` is called at server startup with `headersTimeoutMs >= 1_800_000` (or `0`). |
| Long-running agent aborted after 15 minutes | `AgentLivenessWatchdog` (`AgentInactivityAbortReason`) | Verify `Liveness.InactivityTimeoutMs` in `mj.config.cjs`, confirm external waits call `SuspendForExternalWait`, or verify streaming/progress heartbeats are emitted. |
| Agent paused with `StuckToolCallLoop` or `ReadOnlySpiral` | `AgentStuckDetector` (`mj.config.cjs` `limits.StuckDetector`) | Inspect the checkpoint summary; tune `ReadOnlyStepThreshold` or `IdenticalToolCallThreshold` for deep read-only investigator agents if needed. |
| Legacy column edit didn't appear in `Configuration` | Direct SQL write bypassed `MJAIAgentEntityServer.Save()` | Always mutate agents via `Metadata.GetEntityObject('MJ: AI Agents')` or `mj sync push` so bidirectional dirty-field sync runs. |
