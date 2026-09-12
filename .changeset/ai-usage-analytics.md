---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agent-harness": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/ng-core-entity-forms": minor
---

AI Usage and Cost Analytics (Track D PRs 1-4)

- **Schema & Migrations**: Added direct attribution (`AgentRunID`), cost precision (`TotalCost` as `DECIMAL(18,6)`), processing type classification (`Realtime` vs `Batch`), token caching telemetry (`CachedPromptTokens`, `WriteCachedTokens`), and canonical analytical views (`vwAIUsageFacts`, `vwAIAgentRunSubtreeCost`).
- **Agents & Prompts Runtime**: Context-safe run cost recording via direct attribution and sub-agent propagation; extensible batch pricing seam (`ResolveProcessingType`); zero-limit guardrail enforcement.
- **Analytical Stored Queries & Materialization**: Added 8 core analytical queries in metadata with approval status and parameterized row-filter support; enabled scheduled sweep job for materialized results; added AST qualification tests and incremental refresh support.
- **Integration Test Suite**: Added comprehensive assertions across cost precision, parent-child attribution, RLS safety, poison run handling, and aggregate live/materialized parity (AC1-AC13).
