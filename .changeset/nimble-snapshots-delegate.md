---
"@memberjunction/ai-agents": patch
"@memberjunction/ng-conversations": patch
---

Propagate `inputArtifacts` from a parent agent to its sub-agents so delegates inherit the artifact manifest and tools (e.g. a Codesmith delegate can read a Data Snapshot the parent references). Add `group_aggregate`, `compute` (safe arithmetic expression parser), `filter`, and `percentile` tools to the DataSnapshot artifact tool library. Improve client-side snapshot capture to wait for actual rows (not just registered tables) and bump the capture timeout to 15s so query-backed / server-paged components have time to load.
