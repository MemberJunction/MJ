---
"@memberjunction/task-graph": patch
---

Dispatched workflow steps resolve `data.*` and `context.*` input mappings against the invocation that submitted the graph, for one-shot steps and loop bodies alike, as the in-run walker and branch conditions already did. Previously such references reached the action as literal text (e.g. `RecordID` = `"data.ID"`). A parent task that cannot be read is now logged instead of silently blanking the invocation.
