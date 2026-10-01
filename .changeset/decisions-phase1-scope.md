---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/testing-engine": patch
---

Typed decisions ship as explicit steps that a flow, an action or client code asks for: the `Decision` model type and `BaseDecision`, `AIDecisionRunner` with the `Jev` (OpenRouter) and `LLM Decision` drivers and the `Default Decision` prompt, the `Run Decision` action and the `RunDecision` mutation, the Flow agent's Decision step and the task graph's Decision node, the feature pipeline's Decision type, duplicate detection's Decision modes, and the opt-in `DecisionReranker`. The agent framework asks no decision on its own: a Loop agent's system prompt, response type and prompt params are unchanged, and `BaseAgent` makes a decision call only for a `'Decision'` next step, which a Flow agent's Decision step emits. A `forEachItemIn` request on that step asks about at most 100 items. `AgentDecisionService` and the `AgentDecisionRequest` / `AgentDecisionResult` types in `@memberjunction/ai-core-plus` serve that step.

`@memberjunction/testing-engine` exports the statistics the duplicate-check measurement uses (`RocAuc`, `BrierScore`, `CalibrationBins`, `FitPlatt`, `OutOfFoldPlatt`, `ApplyPlatt`, `Quantile`, `CreateSeededRandom`) and the `AssertOutputOutsideRepo` guard. A test run whose driver ran nothing now saves a null `TargetLogID` instead of an empty string.
