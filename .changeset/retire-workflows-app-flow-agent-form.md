---
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-agents": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agent-manager": minor
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-bootstrap": patch
---

Retire the Workflows app; make the Flow agent form first-class.

The Workflows app owned no storage — a workflow's WHAT is a Flow agent and there is no `Workflow` table — so it was a second list of rows the AI app already listed, fronted by a canvas that duplicated the Flow agent editor and had no Save path at all. Removed, and replaced by making the agent record answer what the app was implicitly about.

**`@memberjunction/ng-core-entity-forms`** — the AI Agents form is now tabbed: the agent type's designer (any type declaring a `UIFormSectionKey`), Details (the existing accordion set, unchanged), and Invocations. The designer pane is hidden with CSS rather than removed from the DOM, so unsaved canvas edits and canvas viewport state survive a tab switch. The default tab is the first that exists, so a Flow agent opens on its diagram.

**`@memberjunction/ng-agents`** — new `<mj-agent-invocations>`: a read-only index of every automated pathway that invokes an agent (Scheduled Jobs, User Routines, Entity Action bindings, Record Processes, sub-agent steps and relationships, `ExposeAsAction`). Answers "what runs this when I'm not looking?", which no surface could previously answer from the agent's side.

**`@memberjunction/ai-core-plus`** — `AgentSpec.Status` and `AgentStep.StepType` now derive from their entity fields instead of restating them. Both had drifted: `Status` declared `'Inactive'`, which `AIAgent.Status` has never accepted, so any caller setting it wrote a value the CHECK constraint rejects; `StepType` omitted `ForEach` and `While`, making loops executable but unauthorable. `AgentStep` gains `LoopBodyType` and `Configuration`, and the action mapping fields now admit the object form that callers already pass.

**`@memberjunction/ai-agent-manager`** — `AgentSpecSync` round-trips loop fields; new pure `ValidateLoopStep` catches a loop that saves cleanly and then iterates zero times; the Architect's status validator accepts `Disabled` rather than the invalid `Inactive`, and `WorkflowAgentWriter` maps Draft/Paused workflows to `Disabled`.

**`@memberjunction/ai-mcp-server`** — the `List_Agents` status filter no longer offers `Inactive`, which could never match a row.

**`@memberjunction/ng-dashboards`** — the Workflows dashboard, its module, its resource component and its `ng-task-graph-editor` dependency are removed. `mj-task-graph-editor` itself is unchanged and keeps its read-only consumers.

The `Workflow.Draft` / `Workflow.Save` / `Workflow.Validate` Remote Operations are deliberately kept — they are the agent- and MCP-facing contract and matter more now that creation is conversational.

A migration removes the Workflows Application row from existing databases (idempotent; a no-op on a clean install). The Architect prompt template change requires `mj sync push` to take effect.
