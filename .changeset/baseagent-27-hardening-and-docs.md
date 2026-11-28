---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/ai": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-agent-harness": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-anthropic": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/integration-test-suite": patch
---

Adversarial review hardening, documentation suite, and live integration coverage (`IT195`) for the BaseAgent refactor:

- Enforce monotonic narrow-only configuration resolution across all tiers (`AgentType` → parent/child `Category` → `BaseAgentID` chain), stricter-of-two JSON vs. legacy column semantics, prototype-pollution guards (`__proto__`/`constructor`/`prototype` rejected and stripped), full enum/range/seam validation, and bidirectional `Save()` sync (including explicit null/key-removal reset).
- Enforce multi-hop `BaseAgentID` ancestor ceilings (treating `null` on derived creates/edits as inherit while rejecting dirty null-clears of previously bounded limits), lock `CategoryID`/`TypeID` changes and `helperPlugins` edits/clears for non-admins, and expand code-only helper seams (`limits`, `actionPolicy`, `setup`, `steps`, `actions`, `subAgents`) across save-time and run-time checks.
- Wire `AgentLivenessWatchdog` across sub-agent delegation, long-running actions, realtime sessions, progress callbacks, and `HarnessAgentBase` / custom `executeAgentInternal` overrides; honor subclass `DefaultAgentTimeoutMS` overrides; disable streaming-heartbeat auto-promotion when `Liveness.Enabled === false`; and scope long-running `undici` `fetch` timeouts (`ConfigureLongRunningAIFetch`) to AI provider SDK calls (`OpenAILLM`, `AnthropicLLM`) without replacing the host's process-global dispatcher or crashing on `ProxyAgent`.
- Harden `AgentStuckDetector` to defer directives during native tool-calling turns, reset on changing poll results or intervening mutating calls/sub-agent delegations, age out injected directive fingerprints, exempt Flow agents, and incorporate action metadata (`Verb`, `DisallowWhenTainted`) alongside refined read-only token classification.
- Fail closed on custom `BaseAgentStepHandler` `AllowedInUnapprovedPlanMode` (`false` default, `row && handler` evaluation, `row || handler` budget), prevent disabling built-in step types, add Flow `Custom` step dispatch (rejecting built-in keys), preserve Plan Mode approval and caller-requested `planMode` across checkpointed resume (`ctx.AgentRun.LastRunID` / `AgentRun.PlanMode`), clamp `MaxIterationsPerRun` across the `BaseAgentID` ancestor chain at runtime, and wire `DefaultPromptEffortLevel`, `MaxExecutionsPerRun`, `MessageMode`/`MaxMessages`, `ScopeConfig`, `RecordingDefault`, `ConversationSummaryPromptID`, and `SkillActivationMode` through `SafeResolveEffectiveAgentProperties` / `ResolveEffectiveAgentProperties` (`payload.*`, `InlineStorageThresholdBytes`, `MinExecutionsPerRun`, `DefaultArtifactTypeID`, `ChatHandlingOption`, retention/archive keys, and `AgentRunner.ts`'s `ArtifactCreationMode` persist decision remain direct-column reads tracked for follow-up).
- **Behavioral & TypeScript notes:**
  - `BaseAgent.Execute<C = unknown, R = unknown>` default type arguments changed from `<C = any, R = any>` to `<C = unknown, R = unknown>` for strict typing; callers reading `.payload` untyped should provide explicit type parameters or narrow `result.payload`.
  - Default hard wall-clock ceiling moves from 2 h to 72 h when liveness supervision is active (paired with the 15-minute sliding inactivity timeout); subclass `DefaultAgentTimeoutMS` overrides continue to be honored, and setting `limits.Liveness.Enabled: false` restores fixed-wall-clock non-streaming behavior.
  - Derived agents now enforce narrow-only semantics across `SearchScopeAccess` (chain minimum), `AllowMemoryWrite` (monotonic `AND`), and nearest non-default for `InjectNotes`/`DeclareActionsAsNativeTools`. Existing derived non-instantiable rows with `SearchScopeAccess = 'None'` are backfilled with `{"scope":{"searchScopeAccess":"None"}}` in `V202611271804` to preserve pre-PR restriction on upgrade.
  - **Admin-only Category & Agent Type governance (`MJ: AI Agent Categories`, `MJ: AI Agent Types`):** Because these tables now carry org-wide narrow-only policies and `helperPlugins` (`DefaultConfiguration` / `DefaultAgentConfiguration`), `MJAIAgentCategoryEntityServer` and `MJAIAgentTypeEntityServer` restrict create, update, and delete to administrator roles (`Owner`, `System Administrator`, `Administrator`, `Admin`, `Administration`, `Agent Administrator`) and system contexts — `Developer` and `Integration` roles can no longer mutate agent categories or agent types directly. Stock `Agent Administrator` permissions in `metadata/entity-permissions/.agent-instance-permissions.json` now include `CanRead` on `MJ: AI Agent Permissions` and full CRUD (`CanRead`/`CanCreate`/`CanUpdate`/`CanDelete`) on `MJ: AI Agent Categories` and `MJ: AI Agent Types`.
- Deepen all per-helper unit test suites, narrow `@memberjunction/ai-agents` barrel exports to exclude `@internal` compat/sub-helper classes, add `IT195` live integration checks, upgrade `file-line-limit` to per-file ratchet caps, and publish the four canonical agent guides and README overhauls.
