---
"@memberjunction/core-entities": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/ai-agents": minor
---

Usage Budgets — generic Query-measured spend limits (#4396 Part 8).

Adds generic usage budgeting capabilities driven by saved Queries with automated threshold monitoring and enforcement:

- **Entities**: Adds `MJ: Usage Budgets` and `MJ: Usage Budget Events` in `core-entities` to define budget limits, periods (Day/Week/Month UTC), warning thresholds, and action policies (`Notify`, `Throttle`, `Block`), as well as log event history with deduplicated notification tracking.
- **Scheduled Job Driver**: Adds `UsageBudgetEvaluationScheduledJobDriver` in `@memberjunction/scheduling-engine` to periodically execute queries, evaluate actual usage against period limits and warning thresholds, fire notifications, and persist evaluation events.
- **Agent Guardrail Enforcement**: Integrates O(1) in-memory budget check against `LastObservedAmount` inside `BaseAgent.hasExceededAgentRunGuardrails` in `@memberjunction/ai-agents` to block execution when an active budget configured with `Action: 'Block'` exceeds its limit.
