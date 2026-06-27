# Realtime Client-Context Co-Agent — Plan Index

**Status:** Draft for review · **Created:** 2026-06-27 · **Branch:** current (omnibus PR) · **CodeGen DB:** `MJ_5_43_0_Predictive` (dedicated)

## What this is

A four-move program that gives the **Realtime co-agent the same power the async agent already has**: a continuously-updated stream of *where the user is, what they see, and which tools/agents are available*, plus the ability to *navigate, show, and act* in the app on the user's behalf — and to route to **any number of async agents (loop or flow), statically or dynamically linked**.

It does this by **collapsing three parallel tool systems into one**, inserting a new **`Application.AgentSettings`** metadata layer that both the conversational and realtime stacks read, and adding a headless **`ClientContextChannel`** that is the live wire between an app surface and its agent.

## The four moves (each independently shippable)

| Move | Title | Core deliverable | Doc |
|---|---|---|---|
| **1** | `Application.AgentSettings` metadata | New JSONType column + `IAgentSettings` interface + CodeGen; folded into default-agent resolution | [01-move1-application-agentsettings.md](01-move1-application-agentsettings.md) |
| **2** | Unified client-tool resolver | One tier-agnostic resolver in `ai-core-plus`, run client-side (no server hop) or server-side; delete the two parallel paths | [02-move2-unified-client-tool-resolver.md](02-move2-unified-client-tool-resolver.md) |
| **3** | `ClientContextChannel` + `ContextTool` | Headless realtime channel streaming context + capability manifest; single stable proxy tool | [03-move3-client-context-channel.md](03-move3-client-context-channel.md) |
| **4** | Many-agent co-agent | `invoke-target-agent` → `invoke_agent` over a static+dynamic union of allowed targets (loop or flow) | [04-move4-many-agent-coagent.md](04-move4-many-agent-coagent.md) |

Cross-cutting: [05-config-cascade-and-shared-types.md](05-config-cascade-and-shared-types.md) — the config cascade (where the app layer inserts), the shared `ai-core-plus` types, and the disclosure/persona model.

Foundation/context: [00-vision-and-locked-decisions.md](00-vision-and-locked-decisions.md) — the vision narrative and every locked decision with rationale.

## Dependency order

```
Move 1 (AgentSettings metadata) ──┬─► Move 3 (ClientContextChannel reads app capabilities)
                                  │
Move 2 (unified resolver) ────────┴─► Move 3 (channel resolves tools via shared resolver)
                                  │
                                  └─► Move 4 (invoke_agent resolves allowed set via same machinery)
```

Move 1 and Move 2 are parallelizable and have no interdependency. Move 3 depends on both. Move 4 depends on Move 1 (allowed-agent set lives in `AgentSettings`) and Move 3 (dynamic additions arrive over the channel).

## Guardrails

- **Zero back-compat debt** — realtime is unpublished; we *delete* the parallel tool paths rather than wrap them. No shims.
- **Push to the generic level** — the resolver, context types, and channel base live in shared/base layers (`ai-core-plus`, `@memberjunction/ai`, channel base classes). Studios/Explorer become thin consumers.
- **`ai-core-plus` stays client-safe** — the shared resolver imports no server engine; static-tier data is *injected*, never fetched inside the resolver.
- **CodeGen runs against `MJ_5_43_0_Predictive`** — the Move 1 migration + `IAgentSettings` interface fold into that branch's codegen run, not the shared DB.
- **No `any`, strong typing throughout** — `IAgentSettings` and the extended `RealtimeConfigSection` are fully typed; the resolver is generic.

## Done-when

- The Form Studio / Component Studio / chat-overlay surfaces each register surface-specific client tools and publish live context, and the realtime co-agent on those surfaces can navigate, show records, and delegate to the right async agent — with the same tool definitions the typed (async) agent uses.
- A single resolver is the only client-tool resolution code path in the repo.
- `Application.AgentSettings` is the one place an app declares its default agent, relevant agents, app-scoped client tools, and realtime persona/disclosure overrides.
