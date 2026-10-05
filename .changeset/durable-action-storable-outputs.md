---
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
---

Durable Execute Agent steps complete: the action's `AgentResult` output carries the field values of the agent run and of any injected memory notes and examples instead of the live entities, which could not be serialized onto the Task row ("Converting circular structure to JSON"). The task-graph action runner now refuses any unstorable output param with a message naming the action and the param.
