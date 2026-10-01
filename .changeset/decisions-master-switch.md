---
"@memberjunction/ai-agents": minor
---

Agents: one master switch for decision-model use, the Loop prompt param `decisionsEnabled`, `false` by default. Unless it is `true`, an agent never asks a decision model on its own, whatever its other settings say. Inline `decisions` get no docs and no response field (even with `includeResponseTypeDefinition.decisions: true` set explicitly), and any request the model sends anyway is skipped. `finishIf` is treated as `finishIfMode: 'off'`. Decision discovery, the payload change check, catalog narrowing (which then describes the whole catalog) and the Memory Manager's note gate do not run. With `decisionsEnabled: true`, each of those works as before and keeps its own setting, each still off by default.

Set it in an agent's `AgentTypePromptParams`, or for one run in `data.__agentTypePromptParams`. `decisionsEnabled` is declared in the Loop agent type's `PromptParamsSchema` with a default of `false`, and each of the settings it governs now says it needs it. Explicit uses do not read it: a Flow or task-graph Decision step, the Run Decision action, and the other direct callers of `AgentDecisionService` and `AIDecisionRunner`.
