---
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
---

Durable Execute Agent steps complete: the action's `AgentResult` output carries the agent run's field values instead of the live entity, which could not be serialized onto the Task row ("Converting circular structure to JSON"). The task-graph action runner now refuses any unstorable output param with a message naming the action and the param.
