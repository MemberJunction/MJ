---
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ai-agents": minor
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Complete `IAgentConfiguration` cascade wiring and strict `BaseAgentID` narrowing with the admin-only `Configuration.allowWidenFromBase` rebase escape hatch:

- **Schema & Types:** Added `allowWidenFromBase?: boolean | null` to `IAgentConfiguration` (synced into `@memberjunction/ai-core-plus` and `MJCoreEntities` generated types) and validated it in `ValidateAgentConfigurationJson`.
- **Rebase-Aware Cascade Fold & All 12 `payload.*` Properties:** Shared `FoldRebaseAwareChain` and narrowing helpers (`IntersectPayloadPathSets`, `NarrowPayloadScope`, `NarrowAttachmentRootPath`, `NarrowScopeConfigObjects`) in `@memberjunction/ai-core-plus`; wired rebase-aware narrowing across `BaseAIEngine.ResolveEffectiveAgentProperties`, `ResolveAgentRunLimits`, `AgentTreeBudgetTracker.ResolveEffectiveMaxIterationsPerRun`, additive `StartingPayloadValidationSchemas` / `FinalPayloadValidationSchemas`, `ScopeConfig`, `ArtifactCreationMode`, `AttachmentRootPath`, `MessageMode`, memory/context ceilings, `AutoArchiveEnabled`, `AgentTypePromptParams` gates (`enableHandoff`, `enableTaskGraphs`), and all 5 relational grant resolvers (`Actions`, `Relationships`/`SubAgents`, `Skills`, `ClientTools`, `Modalities`).
- **Save-Time Alignment & Relational Join Guards:** Locked `allowWidenFromBase` to administrators, enforced non-widening for all users (including administrators) on derived agents unless `allowWidenFromBase: true`, kept `Isolation` minimums / transitive `CanRun` / `..` traversal rejection / `mj.config.cjs` ceilings unconditional, validated cross-cascade `MinExecutionsPerRun <= MaxExecutionsPerRun`, and added server entity validation hooks on `MJ: AI Agent Actions`, `Relationships`, `Skills`, `Client Tools`, and `Modalities`.
- **Runtime Call Sites & Source-Scan Ratchet:** Completed runtime wiring (`AgentPayloadHelper` multi-schema validation, `AgentSkillsHelper`, `AgentContextAssembler`, `sub-agent-consult.ts`) and added a structural source-scan ratchet test preventing future direct reads of deprecated `AIAgent` config columns outside `SafeResolveEffectiveAgentProperties`.
