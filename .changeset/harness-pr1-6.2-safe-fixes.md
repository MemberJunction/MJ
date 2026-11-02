---
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/core-actions": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/messaging-adapters": patch
---

PR 1 (6.2-safe fixes) for the Always-On Agent Harness & Core Primitives plan:

- **MessagingAdapters**: Messages on one Slack/Teams thread are handled one at a time, in arrival order (`inFlightThreadPromises`), so a rapid burst reuses the conversation the first message created instead of starting one conversation and one agent run per message.
- **Primitive 2 v1 (DDL-free Trust & Taint Tracking)**:
  - Add `ActionOutputTrustLevel` (`'Trusted' | 'SemiTrusted' | 'Untrusted'`) to `ActionResultSimple`, `ActionResult`, `ActionResultSummary`, `ClientToolMetadata`, and `ClientToolResultSummary`.
  - Add a code-side default list of external-content actions on `BaseAgent` (web search and page content, the mail inbox action, HTTP requests, URL metadata, RSS feeds, MCP tool output), overridable via `LoopAgentTypePromptParams` (`actionTrustLevels`, then an action's own `TrustLevel`, then `trustedActionNames` / `untrustedActionNames`).
  - Escape closing `</untrusted_external_data>` tags and wrap `Untrusted`/`SemiTrusted` action and client-tool outputs in the `<untrusted_external_data source="..." trust="..." warning="...">` envelope in `BaseAgent.formatActionResultsAsMarkdown` and `FormatClientToolResults`.
  - Strip `AIDirectives` from `Untrusted` action outputs and track `_taintedSources` / `IsRunTainted` on `BaseAgent`; a parent run absorbs its sub-agents' sources (`ExecuteAgentResult.taintedSources`), and client-tool trust comes from the same `ResolveClientTools` list the prompt offered.
  - Land memory notes written during tainted runs with `Status = 'Pending'` and taint provenance in `Comments` (`MemoryWriteManager`).
- **Lesson 6 Remainder (Structured Error Recovery & Fuzzy Matching)**:
  - Add `ActionErrorRecovery` (`Retryable`, `RecoverySuggestion`, `SuggestedValues`, `InvalidParams`, `ValidParameterExample`, `SuggestedNextActions`) to `ActionResultSimple` and `ActionResult`, propagate to `ActionResultSummary`, and render in `BaseAgent.formatActionResultsAsMarkdown`.
  - Classify `PERMISSION_DENIED`, `RUN_SCOPE_UNSUPPORTED`, and `ErrorRecovery.Retryable === false` as `'non-retryable'` (`[CRITICAL/NON_RETRYABLE_FAILURE]`) in `BaseAgent.classifyActionFailure` and `formatActionFailureDirective`.
  - Add fuzzy entity and field suggestions (`SuggestedValues` and `ErrorRecovery`) to `BaseRecordMutationAction` on `ENTITY_NOT_FOUND`, `INVALID_FIELD_NAMES`, and `PERMISSION_DENIED`.
- **Lesson 1 Vectors 2 & 5 (Prompt Cache Stability)**:
  - Gate mid-loop `CompactAnsweredToolCallArguments` and `pruneAndCompactExpiredMessages` on the configured compaction trigger (`CompactionTriggerPercent`, resolved to `TriggerTokens`) instead of rewriting earlier turns, and the cached prompt prefix with them, on every step.
  - Stage Phase 2 parallel injections (`InjectContextMemory`, `InjectPreExecutionRAG`, `InjectDecisionDiscovery`) into isolated arrays and unshift into `conversationMessages` in a fixed deterministic order after `Promise.all` settles (the ordering half of vector 5; follow-up turns still place new retrieved context ahead of turn 1).
