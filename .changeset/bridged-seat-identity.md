---
"@memberjunction/ai-agents": patch
---

A bridged realtime seat now runs its OWN agent class instead of silently falling back to plain BaseAgent (#4111)

`CreateBridgeRealtimeSession` picked the agent class with `agent.DriverClass || agentType?.DriverClass`.
`AIAgentType.DriverClass` names a **`BaseAgentType`** subclass — the three shipped values are
`LoopAgentType`, `FlowAgentType`, `RealtimeAgentType` — while the key this call needs is a
**`BaseAgent`** one. Separate ClassFactory registries, matched by exact key against the base class
name, so the fallback could never resolve: dead code that looked alive. It bit the common case,
because most agents declare no `DriverClass` of their own (that is what makes an agent data rather
than code).

With no registration and no `@RequiresSubclass` marker, `ClassFactory` returns an instance of the
base itself, so every such seat silently ran the plain `BaseAgent`, dropping the subclass behaviour it
was configured for — one generic assistant voice for every seat in a room meant to hold distinct
characters. Both guards below the call were unreachable: `if (!instance) throw` because an instance is
always produced, and `if (!driverClass) throw` because the wrong-registry lookup always produced a
truthy key. The only signal was a single `ClassFactory` `console.warn`, deduped per base+key and
capped at three per base — effectively invisible in a busy log.

The agent's own `DriverClass` is now used when it has one, resolved through `TryCreateInstance` so an
unregistered key raises instead of installing a base-class fallback that answers plausibly. An agent
with no `DriverClass` gets `new BaseAgent()` — constructed directly, deliberately not
`CreateInstance(BaseAgent, null)`, because a null key makes `GetAllRegistrations` skip the key filter
and return the highest-priority registered subclass, i.e. an arbitrary agent. The unreachable
`no DriverClass` throw is gone.

Dropping the agent-type fallback loses nothing: agent-type behaviour is resolved separately inside
`BaseAgent` via `BaseAgentType.GetAgentTypeInstance`, so a seat on the plain `BaseAgent` still gets
Loop/Realtime type semantics.
