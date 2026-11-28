---
"@memberjunction/ai-agents": patch
---

Extract sub-agent validation, consult rounds, single/parallel/related sub-agent execution, durable task-graph delegation, and handoff into pluggable `BaseAgentSubAgentHelper` (`SeamKey: 'subAgents'`, slice s10), replacing the last nested `UUIDsEqual` scans in `base-agent.ts` with O(1) `GroupByUUID` / `IndexByUUID` lookups.
