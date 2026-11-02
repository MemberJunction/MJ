---
"@memberjunction/core-entities": minor
"@memberjunction/actions-base": minor
"@memberjunction/actions": minor
"@memberjunction/core-actions": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/messaging-adapters": minor
---

PR 1 (6.2-safe fixes) for the Always-On Agent Harness & Core Primitives plan:

- **MessagingAdapters**: Messages on one Slack/Teams thread are handled one at a time, in arrival order (`inFlightThreadPromises`), so a rapid burst reuses the conversation the first message created instead of starting one conversation and one agent run per message.
- **Primitive 2 v1 (Metadata-Driven Trust & Taint Tracking)**:
  - Add `IActionConfiguration` (`JSONType` on `MJ: Actions.Config`, exposed as `MJActionEntity.Config_Object`) with `outputTrustLevel?: 'Trusted' | 'SemiTrusted' | 'Untrusted'`, and mark external-content ingestion actions (`Web Search`, `Web Page Content`, `Brave Search`, `Perplexity Search`, `Tavily Search`, `Google Custom Search`, `Manage My Email Inbox and Drafts`, `HTTP Request`, `URL Metadata Extractor`, `Read RSS Feed`, `Execute MCP Tool`) with `outputTrustLevel: "Untrusted"` in `/metadata/actions/`.
  - Add `ActionOutputTrustLevel` (`'Trusted' | 'SemiTrusted' | 'Untrusted'`) to `ActionResultSummary`, `ClientToolMetadata`, and `ClientToolResultSummary`, resolved in `BaseAgent.resolveActionTrustLevel` from `Action.Config_Object?.outputTrustLevel` with optional per-agent/per-run overrides in `LoopAgentTypePromptParams` (`actionTrustLevels`, `trustedActionNames`, `untrustedActionNames`).
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
