---
"@memberjunction/ai-agents": patch
---

A bridged realtime seat now runs its OWN agent instead of an arbitrary registered one (#3860)

`CreateBridgeRealtimeSession` picked the agent class with `agent.DriverClass || agentType?.DriverClass`.
`AIAgentType.DriverClass` names a **`BaseAgentType`** subclass, while the key this call needs is a
**`BaseAgent`** one — separate ClassFactory registries with no overlapping keys. So for any agent that
declares no `DriverClass` of its own (most of them, because that is what makes an agent data rather
than code) the type's key went to `CreateInstance(BaseAgent, …)`, matched nothing, and fell back.

`CreateInstance` has never returned null for an unmatched key, so both guards below it were dead: the
`if (!instance) throw` could not fire, and the `if (!driverClass) throw` only ever looked satisfied
because the wrong-registry lookup returned something. Nothing logged, warned, or failed. On a live
multi-party room a voice seat configured as an interviewer answered as `QueryBuilderAgent` — in the
interviewer's voice, with its persona nowhere in the conversation. From the outside that reads as a
bad prompt, so it costs debugging time in the wrong file.

The agent's own `DriverClass` is used when it has one, resolved through `TryCreateInstance` so an
unregistered key raises rather than installing a hollow anchor-base object that answers plausibly.
An agent with no `DriverClass` runs on the plain `BaseAgent`, which is the behaviour those agents were
always meant to get, so the unreachable `no DriverClass` throw is gone.
