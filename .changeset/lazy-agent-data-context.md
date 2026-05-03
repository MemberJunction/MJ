---
"@memberjunction/ai-agents": patch
---

Add lazy-loading mode to `AgentDataPreloader`. Sources opted into a new `LoadingMode='Lazy'` column on `AIAgentDataSource` are no longer preloaded into prompt context every run — instead they're exposed as on-demand callable tool descriptors via `AgentDataPreloader.SynthesizeLazyToolset()` / `InvokeLazyTool()`. Empirically reclaims ~95% of input tokens for catalog-heavy agents (Query Builder, Research Agent, Database Research Agent) by skipping the eager dump for sources the agent doesn't actually use on a given turn. Default mode `'Eager'` preserves all existing behaviour; opt-in source-by-source. Pluggable `LazyDataSourceAdapter` interface allows extending beyond RunView/RunQuery (REST APIs, vector stores, etc.) in future.
