---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/task-graph": minor
"@memberjunction/ai-agent-manager": minor
---

Flow agents gain a Decision step: one typed decision call whose outgoing paths route on its answers through the `decisions` condition root (`decisions.<key>.<question>`), both when the flow is dispatched as a task graph and when it runs in-run. An answer that failed, fell below its question's `minConfidence`, or was never given holds every condition that reads it, so a flow never guesses a branch; saving a task graph as a workflow now keeps its Decision nodes as Decision steps. Saving a workflow through Agent Manager now resolves the actions and prompts its steps name, so a saved Action step keeps its action and a Decision step keeps its prompt.
