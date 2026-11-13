---
"@memberjunction/ai-agents": patch
---

Agent run guards: a run whose model re-issues the same failing step (a Failed step, or an action call the circuit breaker blocks) ends `Failed` after 3 repeats instead of running to the iteration limit (#4832); every place that starts an agent resolves its class through the new `CreateAgentInstance`, which uses only the agent's own `DriverClass`, runs the plain `BaseAgent` when there is none, and throws for an unregistered key (#4112); and a run the watchdog force-fails while it is still running in this process is now aborted and finalized `Failed` with the watchdog's message, instead of continuing to work behind a Failed row (#4883).
