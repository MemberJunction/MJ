---
"@memberjunction/ai-agents": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/unit-testing": minor
---

Agents: one master switch for decision-model use, the Loop prompt param `decisionsEnabled`, `false` by default. Unless it is `true`, an agent never asks a decision model on its own, whatever its other settings say. Inline `decisions` get no docs and no response field (even with `includeResponseTypeDefinition.decisions: true` set explicitly), and any request the model sends anyway is skipped. `finishIf` is treated as `finishIfMode: 'off'`. Decision discovery, the payload change check, catalog narrowing (which then describes the whole catalog) and the Memory Manager's note gate do not run. With `decisionsEnabled: true`, each of those works as before and keeps its own setting, each still off by default.

Set it in an agent's `AgentTypePromptParams`, or for one run in `data.__agentTypePromptParams`. `decisionsEnabled` is declared in the Loop agent type's `PromptParamsSchema` with a default of `false`, and each of the settings it governs now says it needs it. Explicit uses do not read it: a Flow or task-graph Decision step, the Run Decision action, and the other direct callers of `AgentDecisionService` and `AIDecisionRunner`.

Integration tests: a new deterministic bundle, `agent-decisions-switch` (IT97, nine checks), runs real agents with the switch off, on in an agent's params, and flipped for one run, on scripted chat replies and a stand-in decision driver, so no model is called. It covers the five loop uses, the Memory Manager's note gate, and a Flow agent's Decision step, which the switch leaves alone.

Prompt params: the alignment of `includeResponseTypeDefinition` now works on a copy, so it no longer writes into a run's `data.__agentTypePromptParams`. Sub-agents inherit that object, so before this a parent with the switch off could turn a sub-agent's `decisions` and `finishIf` fields off.

Test doubles: `RegisterTestLLM` and the decision stand-in now register above every existing registration for a name, so a registration made after an earlier restore still wins over the real driver that restore put back.
