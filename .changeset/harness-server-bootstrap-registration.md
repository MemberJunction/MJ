---
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Register the external agent harness adapters in the server bootstraps

Without this, an agent of type `Harness` **silently runs as an ordinary prompt agent** in MJAPI.

`@memberjunction/ai-agent-harness` was not a dependency of either server bootstrap, so its
`@RegisterClass` decorators never executed in the server process. `AgentRunner` resolves the agent
type's `DriverClass` against the `BaseAgent` registry and falls back to plain `BaseAgent` when it
finds nothing — which does not error. The agent runs, reports success, and has no harness, no
sandbox and no credentials.

Adds the dependency to both bootstraps and regenerates the manifests, so `HarnessAgentType`,
`HarnessAgentBase` and all six adapters are registered where the server actually runs.
