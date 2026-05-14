---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
---

fix(ai-agents): preserve context class identity through action and data preload pipelines

`ExecuteSingleAction` was spreading `params.context` into a plain object to stamp `AgentID`, which destroyed class instances (getters, methods, prototype chain). This broke downstream consumers like Skip's `SkipAgentContext` whose `skipAPIRequest` getter became `undefined` after spreading. Similarly, `preloadAgentData` was spreading `params.context` when merging preloaded data.

Fixed by mutating properties directly onto the original context object instead of spreading. Also changed `InjectContextMemory` to use `agent.RerankerConfiguration` property instead of `agent.Get('RerankerConfiguration')`. Added JSDoc to `ExecuteAgentParams.context` documenting that `TContext` may be a class instance and must never be spread. Added 20 unit tests covering context identity preservation.
