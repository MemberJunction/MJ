---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/task-graph": minor
"@memberjunction/ai-agents": minor
"@memberjunction/server": minor
"@memberjunction/testing-integration": minor
---

Add multi-step action loop bodies (`steps?: LoopBodyActionStep[]`) to `ForEach` and `While` operations across `@memberjunction/ai-core-plus`, `@memberjunction/task-graph`, `@memberjunction/ai-agents`, and `@memberjunction/server`, together with sanitized native tool-name resolution, structured JSON action-message projection in `Pipeline`, and an updated Loop Agent system prompt covering the full execution primitive hierarchy and single-channel native tool-calling JSON envelope bridge.

- **`@memberjunction/ai-core-plus`**: Extend `ForEachOperation` and `WhileOperation` with `steps?: LoopBodyActionStep[]` (`id`, `name`, `params`, optional `condition` over `steps.<id>.*` and loop bindings, optional `outputMapping`), add `ResolveLoopBodyParams` and shared `BuildActionOutputObject` / `LoopStepFold` in `payload-mapping.ts` (blocking prototype-chain lookups across all path resolvers), export `ValidateLoopOperationStructure` in `task-graph-validator.ts` (enforcing `steps.<prevId>` ordering across `step.condition` and `step.params`), and preserve multi-step loop bodies losslessly across `ConvertTaskGraphToAgentSpec` ↔ `CompileFlowToTaskGraph`.
- **`@memberjunction/task-graph`**: Pre-resolve per-step `ActionID`s into `TaskStepConfiguration.stepActionIds` in `TaskGraphService` via shared `ResolveRecordsByNameOrToolName` (using `EscapeSQLString` and `SanitizeToolName` fallback with surfaced `RunView` error handling), keep legacy `ResolveMappedInput` semantics on single-arm durable loops while using `ResolveLoopBodyParams` for `steps[]`, and execute multi-step `ForEach` and `While` loop bodies in `TaskGraphDispatcher` with deterministic ascending-index parallel output folding.
- **`@memberjunction/ai-agents`, `@memberjunction/server`, & `metadata/prompts`**: Support `steps[]` and single-arm `action.outputMapping` in in-turn `BaseAgent.executeForEachLoop` and `BaseAgent.executeWhileLoop` as well as `FlowAgentType` in-run execution, resolve sanitized native tool names (`calculate_expression` → `"Calculate Expression"`, `delegate_to_<slug>` → sub-agent name) without mutating caller inputs in validators, include `'Both'` parameters and unambiguous JSON container `ActionResult.Message` payloads in `StructureActionResult` and `TaskGraphActionRunner` via `BuildActionOutputObject`, and update `loop-agent-type-system-prompt.template.md` with comprehensive guidance on `Pipeline`, multi-step `ForEach`/`While`, all 7 runnable `TaskGraphSpec` node kinds, `inputMapping`/`outputMapping`, XOR `exclusiveGroup` forks, `failureSemantics`, `Execute Code` transform nodes, `continuation: 'reinvoke'` sleep/wake, and native tool-calling JSON bridging.
