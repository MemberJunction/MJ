---
"@memberjunction/ai-agent-harness": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-query-viewer": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/server": minor
---

**AI usage analytics: a trustworthy cost basis, and the dimensions to slice it by (#4396)**

Cost reporting was wrong in both directions and could not be sliced by the dimensions anyone
actually asks about. This settles the basis, gives runs the keys they were missing, and rebuilds
the reporting layer on top.

- **Cost doctrine.** `guides/AI_USAGE_AND_COST_ANALYTICS_GUIDE.md` states the rules every consumer
  now follows: the additive basis is own cost at the prompt-run grain, `Cost IS NULL` means
  unpriced and is never coalesced to zero, rollups are derived from the hierarchy at query time and
  never summed from stored inclusive columns, and coverage ships beside every cost figure.
- **Attribution keys.** `AIPromptRun` gains `AgentRunID` and `UserID` (backfilled), cost precision
  is aligned on `decimal(19,8)` across both run tables, and six analytics indexes are added.
  Sub-agent runs now inherit `CompanyID`.
- **Parallel execution accounting.** The consolidated parent is created before its arms run, so the
  arms persist as `ParallelChild` rows with their own cost and the parent carries none — previously
  the losing arms were never recorded at all.
- **Semantic layer.** `vwAIUsageFacts` gives one row per prompt run over the base tables, with
  time buckets, every dimension, and the flags that carry semantics no column expresses
  (`IsPriced`, `IsParallelParent`, `IsUnmeasured`, `SourceKind`).
- **Aggregates.** Eight saved queries in the `AI` category; the hourly and daily grains are
  materialized, with the refresh cadence declared on the Query itself.
- **Honest dashboards.** The seven analytics surfaces read the aggregates instead of pulling
  unbounded raw rows, unpriced cost renders as an em dash rather than `$0.00`, and coverage is
  shown beside every total.
- **`mj-query-pivot`.** A generic pivot over any saved Query in `@memberjunction/ng-query-viewer`;
  the AI Usage Explorer is a thin configuration of it.
- **Usage budgets.** A generic `UsageBudget` whose observed amount comes from a saved Query, with a
  scheduled evaluation driver and O(1) block enforcement in the agent guardrails. AI spend is its
  first configuration, not a hardcoded column.
