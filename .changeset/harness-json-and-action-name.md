---
"@memberjunction/ai-agents": patch
---

Add balanced top-level JSON decision-envelope extraction fallback in `BaseAgentType.parseJSONResponse` (handling trailing text and multi-JSON output from CLI harnesses such as `HarnessAgentType`) and guard non-string/undefined `action.name` values in `BaseAgent.resolveActionEntityForAgent` and `validateActionsNextStep` so malformed action entries return a clean `Retry` validation message instead of throwing `TypeError`.
