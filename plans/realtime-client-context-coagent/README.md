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
| **3** | `ClientContextChannel` + `ContextTool` | Headless realtime channel streaming context + capability manifest; single stable proxy tool; **+ `MJ: AI Agent Channels` metadata extension** (`IsHeadless` column + `ChannelConfig` JSONType bag: DisplayName/GroupName/Color/Icon) | [03-move3-client-context-channel.md](03-move3-client-context-channel.md) |
| **4** | Many-agent co-agent | `invoke-target-agent` → `invoke_agent` over a static+dynamic union of allowed targets (loop or flow) | [04-move4-many-agent-coagent.md](04-move4-many-agent-coagent.md) |

**Fast-follow:** [06-phase-app-context-rollout.md](06-phase-app-context-rollout.md) — **Phase 5**, after Moves 1–4: make *every* app publish rich client context + register client tools onto the unified substrate, converging the existing `NavigationService.SetAgentContext/SetAgentClientTools` mechanism (no parallel API), plus governance (CLAUDE.md baseline + scaffold-skill + optional check) so new/updated apps stay rich automatically. Includes the prepopulated high-level app inventory.

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

Move 1 and Move 2 are parallelizable and have no interdependency. Move 3 depends on both. Move 4 depends on Move 1 (allowed-agent set lives in `AgentSettings`) and Move 3 (dynamic additions arrive over the channel). **Phase 5** (rollout + governance) runs after Moves 1–4 land.

## Guardrails

- **Zero back-compat debt** — realtime is unpublished; we *delete* the parallel tool paths rather than wrap them. No shims.
- **Push to the generic level** — the resolver, context types, and channel base live in shared/base layers (`ai-core-plus`, `@memberjunction/ai`, channel base classes). Studios/Explorer become thin consumers.
- **`ai-core-plus` stays client-safe** — the shared resolver imports no server engine; static-tier data is *injected*, never fetched inside the resolver.
- **CodeGen runs against `MJ_5_43_0_Predictive`** — the Move 1 migration + `IAgentSettings` interface fold into that branch's codegen run, not the shared DB.
- **No `any`, strong typing throughout** — `IAgentSettings` and the extended `RealtimeConfigSection` are fully typed; the resolver is generic.

## Validated against the repo (audit pass, 2026-06-27)

Three read-only audits confirmed the plan's structural assumptions and surfaced four corrections, now folded in:

1. **Reuse, don't fork the snapshot.** `AppContextSnapshot` + `BuildAppContextSnapshot` already exist in `ai-core-plus/src/app-context.ts` and are async-wired into `BaseAgent.buildAppContextSection()`. Move 3 **extends** that type (adds `View`/`Capabilities`); there is no `client-context.ts` to create.
2. **Realtime gets no app context today** — not even at mint. Move 3 now has two explicit parts: (a) session-start injection into `buildRealtimeSessionParams`, (b) streaming deltas over the channel.
3. **`ApplicationID` isn't threaded through realtime mint** — new shared prerequisite task (in [05](05-config-cascade-and-shared-types.md)) required by both the app config layer (Move 4) and app context (Move 3).
4. **`DefaultAgentResolver` has no cached `Application` metadata** — Move 1.5's "no extra query" must be verified, not assumed.

Confirmed genuinely-new (no duplication): the unified client-tool resolver, `ContextTool`, the headless `ClientContextChannel`, the 5 channel-metadata fields, and `disclosure`/`allowedAgents` on the realtime config. `IsHeadless` already works implicitly (null surface) — we keep it explicit by choice.

## Done-when

- The Form Studio / Component Studio / chat-overlay surfaces each register surface-specific client tools and publish live context, and the realtime co-agent on those surfaces can navigate, show records, and delegate to the right async agent — with the same tool definitions the typed (async) agent uses.
- A single resolver is the only client-tool resolution code path in the repo.
- `Application.AgentSettings` is the one place an app declares its default agent, relevant agents, app-scoped client tools, and realtime persona/disclosure overrides.
