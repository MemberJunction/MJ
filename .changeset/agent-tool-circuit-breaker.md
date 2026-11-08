---
"@memberjunction/ai-agents": patch
---

Agent-local tools (`BaseAgent.GetAgentTools`) now have a run-scoped circuit breaker, like Actions. Before, the action breaker covered only the action dispatch path, so a driver tool that kept failing (an `edit_file` whose old text never matches) ran again on every turn until the run hit its iteration limit.

The tool breaker uses the same rules and thresholds as the action breaker:
- **Identical arguments.** A call whose arguments already failed `IDENTICAL_FAILURE_THRESHOLD` (2) times is refused without running.
- **Attempt budget.** After `ACTION_FAILURE_BUDGET` (5) consecutive failures with any arguments, the tool is refused for the rest of the run.

How it works:
- A failure is an error result, a thrown error, or a payload change that was refused.
- A success clears the tool's record.
- Arguments are compared after `normalizeActionParams`.
- A refused call is still logged as a failed `Tool` step, and the model gets an error result saying why.

Opting out:
- An agent type with `UsesActionCircuitBreaker === false` is exempt.
- A single tool can opt out with the new `AgentToolDefinition.UsesCircuitBreaker: false`, for a tool whose error result is an expected answer the model should be free to ask again.
