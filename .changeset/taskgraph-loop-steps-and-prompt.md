---
"@memberjunction/ai-core-plus": minor
"@memberjunction/task-graph": minor
"@memberjunction/ai-agents": minor
---

Add multi-step action loop bodies (`steps?: LoopBodyActionStep[]`) to `ForEach` and `While` operations across `@memberjunction/ai-core-plus`, `@memberjunction/task-graph`, and `@memberjunction/ai-agents`, together with sanitized native tool-name normalization, structured JSON action-message projection in `Pipeline`, and an updated Loop Agent system prompt covering the full execution primitive hierarchy and single-channel native tool-calling JSON envelope bridge.

- **`@memberjunction/ai-core-plus`**: Extend `ForEachOperation` and `WhileOperation` with `steps?: LoopBodyActionStep[]` (`id`, `name`, `params`, optional `condition` over `steps.<id>.*` and loop bindings, optional `outputMapping`), add `ResolveLoopBodyParams` in `payload-mapping.ts`, validate `steps[]` in `ValidateTaskGraphSpec`, and preserve multi-step loop bodies losslessly across `ConvertTaskGraphToAgentSpec` ↔ `CompileFlowToTaskGraph`.
- **`@memberjunction/task-graph`**: Pre-resolve per-step `ActionID`s into `TaskStepConfiguration.stepActionIds` in `TaskGraphService` (including `SanitizeToolName` fallback for native tool identifiers) and execute multi-step `ForEach` and `While` loop bodies in `TaskGraphDispatcher` with thread-safe parallel array folding.
- **`@memberjunction/ai-agents` & `metadata/prompts`**: Support `steps[]` in in-turn `BaseAgent.executeForEachLoop` and `BaseAgent.executeWhileLoop`, normalize sanitized native tool names (`calculate_expression` → `"Calculate Expression"`, `delegate_to_<slug>` → sub-agent name) across `PipelineToolRegistry` and `BaseAgent`, parse structured JSON `ActionResult.Message` payloads consistently across `Pipeline` and loop steps, and update `loop-agent-type-system-prompt.template.md` with comprehensive guidance on `Pipeline`, multi-step `ForEach`/`While`, all 7 runnable `TaskGraphSpec` node kinds, `inputMapping`/`outputMapping`, XOR `exclusiveGroup` forks, `failureSemantics`, `Execute Code` transform nodes, `continuation: 'reinvoke'` sleep/wake, and native tool-calling JSON bridging.
