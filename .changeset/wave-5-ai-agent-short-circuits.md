---
"@memberjunction/core-entities": patch
"@memberjunction/ai-agents": patch
---

Add Wave 5 AI & Agent short-circuits:

- `GraphEngine.HasActiveCanonGraphs`: Lightweight unloaded probe cached per provider and invalidated on `MJ: Graphs` / `MJ: Graph Types` entity events so `CanonGraphEngine.ExplainEntity` and `FindConcepts` skip loading all 8 graph entities when no active Canon graph exists or the user lacks read access.
- `SearchEngineBase.HasActiveAgentScopes`: Lightweight unloaded probe over `MJ: AI Agent Search Scopes` cached per provider so `AgentPreExecutionRAG.Execute` skips loading all 7 Search entities when an agent has no active matching scopes.
- `BaseAgent.dropReasoningBehindChangedHistory` & `refreshRelocatedSpecialization`: Skip outgoing message fingerprinting on envelope runs (`_nativeToolBindings === undefined`) and Turn 2+ of non-prefix-bound native runs without reasoning blocks.
- `AgentContextInjector.queryExamplesWithScoping`: Early-return `[]` when zero scoped examples match before invoking `sortExamples`.
- `AgentDataPreloader.tryExecuteCachedMetadataView`: Extend unfiltered metadata caching alongside `MJ: Entities` to serve `MJ: Query Categories` directly from loaded `QueryEngine.Instance.Categories`.
