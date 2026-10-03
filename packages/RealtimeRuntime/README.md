# @memberjunction/realtime-runtime

Framework-agnostic orchestration for MemberJunction **client-direct realtime co-agent sessions**: minting a session, resolving the provider's client driver, wiring transcripts and captions, relaying tool calls, pacing delegation narration, managing interactive channels, relaying usage, and tearing all of it down cleanly. The Angular `RealtimeSessionService` in `@memberjunction/ng-conversations` is a thin adapter over `RealtimeSessionRuntime`; a React Native or headless host supplies an `IRealtimeMediaHost` and gets the same session.

## Interactive channels

A channel is a `BaseRealtimeChannelClient` plugin: a self-describing unit (a whiteboard, a remote browser, a form, an app's own widget) the agent and the user both operate during a call.

### The v2 contract

| Member | Purpose |
|---|---|
| `GetDescriptor()` | The channel's `RealtimeChannelDescriptor` (`@memberjunction/ai-core-plus`): nouns, verbs, events, inputs/output, display policy, default availability, exposure ceiling. Default: synthesized from the v1 members, so an unmodified channel still works. |
| `GetState()` | A snapshot of the channel's nouns. Perception notes are deltas between snapshots. Default: the parsed `SerializeState()`. |
| `ApplyVerb(verb, args, actor, instance?)` | Run one verb. The runtime has already resolved it, enforced `InvokableBy` and validated `args` against its schema. Default: adapts the legacy `ApplyAgentTool`. |
| `Events$`, `Output$`, `Complete(output)` | Typed events, and the output a channel hands back when it finishes. |
| `Open(inputs)` / `OnOpen` | Mounts an `on-demand` channel and seeds it; validates `inputs` against the descriptor. |
| `RecordChange({Author, Perceive})` | Call on every state mutation: assigns a change id, emits `state_changed`, and (unless `Perceive: false`) coalesces a burst into ONE structured note, `[channel:<Key>#<instance>] state_changed {…}`, carrying a delta against what the model was last told (the first is a snapshot; oversized deltas degrade to changed paths). |
| `EnableVisualPerception(frameProvider)` | Opt into the change-driven frame pump (leading edge, trailing settle, dedupe, negotiated cadence, one do-not-narrate confirmation frame after an agent edit). The channel then only calls `NotifyVisualChange()` / `ConfirmVisualChange()`. Frames are tagged with the change id of the state they describe. |

**Back-compat is absolute.** `ToolNamePrefix`, `TabTitle`, `TabIcon`, `GetToolDefinitions`, `ApplyAgentTool` and `BindSurface` now have defaults, but a channel written against the original members compiles and behaves exactly as before; native tool names are unchanged. New private members on the base class are deliberately given distinctive names so existing subclasses (which declare their own privates) keep compiling.

### Scoping — which channels a session gets

```
code default  →  agent (type < co-agent < target < override)  →  app  →  host
```

* The channel's own descriptor says whether it is `'all-sessions'` (every pre-existing channel) or `'opt-in'`.
* The **agent** and **app** layers are the `channels` section of the realtime configuration cascade (`realtime.channels` in an agent's `TypeConfiguration`; `Application.AgentSettings.Realtime.Channels` for the app): `include`, `exclude`, per-channel `config`, per-channel `displayPolicy`. The most specific layer to mention a channel wins; within a layer `exclude` beats `include`.
* The **host** declares channels it brings — `StartRealtimeSession(…, options)` with `{ HostChannels: [{ ClientPluginClass | Create, Config?, DisplayPolicy? }] }` — including channels with **no registry row**, which is the only way a connect-only (anonymous embed) provider with no entity metadata gets channels. A host *adds* channels and supplies *defaults*; it cannot lift an agent/app `exclude`.
* A registry row with `IsActive = false` is a master kill switch nothing overrides.

### How the policy reaches the client

1. **Prepare** (before mint): plugins are constructed — *not* initialized — from the registry and the host's declarations; their descriptors are read.
2. **Mint**: the browser reports its candidates (`channelCandidatesJson`: key, defaults, native tools, host-declared?) and the server resolves them against *its own* registry and cascade, returning `ClientPolicyJson` (resolved channels with display/config, excluded channels with reasons, app/static client-tool tiers) and narrowing the declared tools to match.
3. **Activate** (after mint): exactly the policy's channels are initialized. `open-on-start` / `headless` channels mount now (published on `ActiveChannels$`, native tools declared at mint); `on-demand` channels are held (`AdvertisedChannels`) until the agent opens them through `ContextTool`. A policy can only *select* among plugins the host prepared.

No policy (a server that predates scoping, or a host that mints through its own proxy, like Caliber): the runtime resolves the same scope locally from code defaults and host declarations and uses it. Against an older server the extended mutation is rejected at validation, and the runtime retries with the original one (and remembers). Channel native tools still travel in `clientToolsJson`, so a proxy that gates tools from the mint variables keeps working.

Activation happens **before** the session id is adopted, deliberately: the sessions adapter treats an `ActiveChannels$` emission that arrives with no session id as the initial set (synthesizing the opens from `SessionStarted$`), so activating later would announce every channel twice.

### `ContextTool` addressing

`ContextTool` is one stable provider tool (connect-bound providers cannot re-declare tools mid-call). With `target: { channel, instance? }` the call goes to `ChannelActionDispatcher`, which validates in order — channel exists (`unknown_channel`), instance exists (`unknown_instance`), an unmounted `on-demand` channel is opened first (`channel_not_open`; `action: "open"` mounts and seeds it: `open_failed` / `invalid_params`), verb exists (`unknown_verb`), agent may invoke it (`not_invokable_by_agent`), parameters satisfy the verb's schema (`invalid_params`, one message per violation) — each failure phrased so the model can correct itself. A catalog note rendered from the descriptors tells the model which channels exist, sent once when the control channel is usable.

### Multi-instance channels

A channel with `MultiInstance: true` owns several live instances itself (two components, two documents), each with its own id. `OnOpen` may return `{ Success: true, Instance: '<id>' }` and `Open()` then names that instance in the `opened` event, the `[channel:<Key>#<instance>] opened` note and the open result; `Complete(output, instanceId)` and `EmitChannelEvent(name, payload, changeId, instanceId)` take an optional instance. Verbs reach the right one through `ApplyVerb(verb, args, actor, instanceId)` (the dispatcher passes `target.instance` through). A single-instance channel never sees any of this. The reference implementation is the Interactive Component channel in `@memberjunction/ng-conversations`, whose descriptor is derived from the component it hosts.

### Exposure — how much the model may perceive

A channel declares the most it can expose (`MaxExposure`: `'none' | 'state' | 'pixels'`); the exposure a session gets is `min(channel ceiling, agent cap, zero-data-retention ceiling, user choice)` (`ResolveChannelExposure` in `@memberjunction/ai-core-plus`). The **server** decides everything but the user's choice and returns it in the session policy; the browser applies it with `ApplyExposure({ Policy, User, Reasons })` and can only lower it.

* `'state'` gates structured notes (`opened` / `completed` payloads, `state_changed` deltas); `'pixels'` gates frames; `'none'` gates both. The channel keeps working at every level, and the agent is told (once, with the reasons) when exposure drops or returns.
* Exposure gates what is **volunteered**. A verb the agent itself invokes returns what the channel's contract says it returns, so exposure is not a redaction layer over verb results (a channel that must withhold something from a verb result should not declare the verb).
* The user's choice per channel is remembered through `IChannelExposurePreferences` (`SetExposurePreferences`): `UserSettingsExposurePreferences` persists to `MJ: User Settings` under `mj.realtime.visualPerception.v1` through `UserInfoEngine` when the user is signed in on a metadata-bearing provider; `InMemoryChannelExposurePreferences` otherwise (anonymous and connect-only sessions).
* `RealtimeSessionRuntime.VideoSources$` lists every inbound video source (channels, camera, shared screen) with whether it is on and whether its frames are reaching the model; `SetVideoSourceEnabled(sourceId, on)` turns one on or off (a channel-owned source through `SetUserChannelExposure`, so it is remembered per channel and the channel tells the model; anything else at the arbiter). `SetFocusedChannel(key)` tells the arbiter which surface the user is looking at.

### Delegated artifacts

When a delegated run (the agent asked Skip or Sage to build something) produces artifacts, the runtime asks each channel in the session, mounted or merely advertised, whether it wants them: `AcceptsDelegationArtifacts(artifacts, resolvedConfig)` (synchronous, answered before an advertised channel is initialized, so it reads its resolved config from the argument, not from `Context`). A channel that says yes is mounted if needed and handed them with `OnDelegationArtifacts(artifacts)`; its tab is revealed. Default: no. A channel that throws is logged and never disturbs the delegation or the other channels.

### App client tools

`RegisterAppClientTools(tools, owner?)` is **owner-keyed**: a registration replaces only that owner's set, a later-registered owner wins a name collision, and `UnregisterAppClientTools(owner)` / `ClearAppClientTools()` remove one or all. A host with two sources (Explorer's always-available globals and the active surface's tools) registers each under its own key, so refreshing the surface can neither drop the globals nor leave the previous surface's tools behind. The one-argument form registers under a default owner, so single-source hosts are unchanged. Execution resolves through the unified `ResolveClientTools` (`override → session → app → static`); a tool the app declares but the host has no handler for says so.

## Testing

`pnpm test` runs the suite (vitest, no browser, no database). `src/__tests__/channel-test-helpers.ts` provides a legacy (v1) and a v2 fake channel and a recording host context.
