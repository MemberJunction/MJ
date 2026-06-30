# Vision & Locked Decisions

## The vision in one paragraph

Today MemberJunction has **three tool systems** (the mature async client-tool substrate, the conversations-runtime `Tools` registry, and the realtime `RealtimeToolBroker`), **two context models** (async agents get continuously-updated client tools + per-invocation data; realtime gets context once at session start plus an opt-in text trickle), and **zero app-agent metadata** (app→default-agent is bolted on via a single `ApplicationSetting` row). The vision collapses that into **one client-tool substrate, one live-context substrate, and one piece of app metadata** that both the conversational and realtime agents read. The realtime co-agent stops being "the voice of one agent" and becomes "the voice of this *app*" — it always knows where the user is and what it can do, and it routes to whichever async agent (loop or flow) or client tool fits.

## Where we are (the asymmetry we're fixing)

- **Async agents are the crown jewel.** Client tools resolve through a three-tier, first-match-wins model: (1) **static** metadata via `MJ: AI Agent Client Tools` → `MJ: AI Client Tool Definitions`, (2) **dynamic** session-registered tools via `AgentClientSession.RegisterTool()`, (3) per-invocation `extraData.clientTools`. Execution round-trips via PubSub-request → server Promise-pause → client handler → GraphQL `RespondToClientToolRequest` → `ClientToolRequestManager.ReceiveResponse()` resumes. Explorer already registers `NavigateToRecord` / `NavigateToApp` this way.
- **Realtime is the weaker twin.** Tools are fixed at session start (providers like Gemini reject mid-session re-declaration). Context is set once (system-prompt framing + memory + transcript); the only mid-session injection is `SendContextNote()` — text-only, opt-in, channel-pushed. The co-agent fronts exactly one target agent via the single `invoke-target-agent` tool. It has its own `RealtimeToolBroker`, disjoint from the async substrate.
- **The config cascade already exists** and is production-grade: `AIAgentType.DefaultConfiguration` → `AIAgent.TypeConfiguration` → target agent's `TypeConfiguration` → runtime overrides, deep-merged by `ResolveEffectiveRealtimeConfig`/`DeepMergeConfigs` in `packages/AI/Agents/src/realtime/realtime-coagent-config.ts`. We **insert one new layer** (the app) and **extend one section** (persona/disclosure/allowed-agents).
- **`Application` has a proven JSONType column** (`DefaultNavItems` → `MJApplicationEntity_IDefaultNavItem`) that is our exact authoring template.

## Locked decisions

### Fork 1 — `AgentSettings` is JSON-only (no SQL junction)
**Locked.** Maximally flexible, no circular dep between agents and apps in SQL, no relational-integrity overhead we don't need at app-table scale. "Which apps reference agent X" is a trivial in-memory scan over cached app metadata. Modeled on `DefaultNavItems`.

### Fork 2 — One resolver, in `ai-core-plus`, tier- and side-agnostic
**Locked.** A pure function over the three tiers, callable client-side (resolve + execute locally, **no server round-trip** — the client owns its dynamic tools, the override tier is passed in, and the static tier is cached metadata it already has) or server-side (same function). Realtime's separate broker resolution and the conversations-runtime registry's parallel logic are **deleted**. Zero back-compat (realtime unpublished).
- **Purity constraint:** the resolver must not import the server engine. It takes injected data (`staticTools, sessionTools, overrideTools`) or a thin `IClientToolSource`. `ai-core-plus` already houses `ClientToolMetadata` — correct home, stays client-safe.

### Fork 3 — Live context rides a headless `ClientContextChannel`
**Locked.** A sibling to whiteboard/remote-browser/media in the channel registry, but **surfaceless** (never mounts a tab). One channel owns three responsibilities: **perception** (location, selection, visible entities), the **live capability manifest** (which tool/agent names are valid right now), and **action routing** (local execution of proxied tool calls). Structured payload typed in `ai-core-plus`, serialized to `SendContextNote` at the channel boundary. Name: **`ClientContextChannel`** (not "*Bridge*" — `BaseRealtimeBridge` is the media-transport seam; avoid collision).

### Fork 4 — Lead identity + delegation disclosure as data
**Locked.** Two concepts:
- **Lead identity** = "who the voice is" = the app's resolved default agent (reuses the default-agent chain; Sage is the natural concierge default, a focused surface overrides with its own lead).
- **Delegation disclosure** = how it narrates pulling in a colleague: `silent | mention | hand-voice`, default `mention`. Lives in agent config (`realtime` section, defaulted at type level), overridden by `Application.AgentSettings`, overridable at runtime. Per-target override carried on each allowed-agent entry.

### The provider re-declaration constraint → `ContextTool` proxy
**Locked.** Connect-bound providers reject mid-session tool re-declaration, so we never re-push the live tool list as native provider schemas. Instead: **one always-present stable tool, `ContextTool`**, declared at session start when the agent supports the channel. The live catalog of valid `toolName`s / `agentId`s / verbs arrives as **context** over `ClientContextChannel`. The model calls `ContextTool({ action, ...params })`; we resolve via the unified resolver and execute locally. This is the canonical pattern for "continuously changing capabilities" across all providers.

### Cascade insertion point
**Locked.** Effective realtime config precedence (low → high):
1. `AIAgentType.DefaultConfiguration`
2. co-agent `AIAgent.TypeConfiguration`
3. target agent's `AIAgent.TypeConfiguration`
4. **`Application.AgentSettings.realtime` (NEW — when app context is known)**
5. runtime override (authorization-gated)

Scalars (persona, disclosure default, model preference) follow per-key deep-merge override. **Allowed-agents accumulate as a union** across layers + dynamic additions, deduped, each entry carrying optional per-target settings.

## Logistics
- **Omnibus on the current branch.** All four moves land in the in-flight PR.
- **CodeGen against `MJ_5_43_0_Predictive`.** The Move 1 `Application.AgentSettings` column migration + `IAgentSettings` interface fold into that branch's codegen run.
- **Studios become thin consumers.** Once Moves 1–4 land, Form Studio / Component Studio / chat-overlay just register their surface tools + publish their context and inherit the full capability set.
