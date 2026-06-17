# @memberjunction/remote-browser-server

Server-tier **coordination + execution** for the MemberJunction **Remote Browser** channel — the
subsystem that gives a realtime voice co-agent a live, CDP-connected web browser.

This package is the sibling of `@memberjunction/ai-bridge-server`. Where the bridge server wires a
media-transport seam to an external meeting/call, this server opens and **arbitrates** a real browser
session the agent (and optionally a human) drives, and exposes it to the agent as a realtime channel.

```
@memberjunction/remote-browser-base   ← metadata + interfaces (client + server safe)
        ▲                  ▲
        │                  │
@memberjunction/remote-browser-cdp     @memberjunction/remote-browser-server   ← THIS PACKAGE
   (CDP-connected drivers)                (engine + control arbiter + channel)
```

## What's in the box

| Export | Role |
|---|---|
| `RemoteBrowserEngine` | Server-only `BaseSingleton`. **Composes** `RemoteBrowserEngineBase` (one metadata cache) and adds session lifecycle, the control arbiter, the viewport→screen-track seam, and goal-driven control (`AchieveGoal`). |
| `RemoteBrowserChannel` | `BaseRealtimeChannelServer` subclass. A **server-only** interactive channel contributing the `browser_*` tool vocabulary the agent drives the browser with. |
| `dispatchRemoteBrowserGoal(session, features, goal, opts)` | The **pure, testable** strategy switch behind `AchieveGoal` — `ComputerUse` → `RunComputerUseGoal`, `NativeAI` → `InvokeNativeAIControl`. |
| `StartRemoteBrowserSessionParams` / `AchieveGoalParams` / `RemoteBrowserSessionHandle` | The start params, the goal params, + the live in-memory session handle. |
| `RemoteBrowserChannelDeps` | Per-session injection for the channel (the live session + capability flags). |
| `LoadRemoteBrowserChannel()` | Tree-shaking-prevention no-op for the channel's `@RegisterClass`. |

## The engine — `RemoteBrowserEngine`

`RemoteBrowserEngine` composes `RemoteBrowserEngineBase.Instance` (it does **not** extend it) — exactly
mirroring `AIBridgeEngine` over `AIBridgeEngineBase`. Composition keeps the startup manager warming
exactly one `BaseEngine` cache; an inheriting subclass would make the manager instantiate two engines,
each loading its own copy of the provider registry.

### Session lifecycle

```ts
import { RemoteBrowserEngine } from '@memberjunction/remote-browser-server';

const engine = RemoteBrowserEngine.Instance;
await engine.Config(false, contextUser);   // warm the composed base cache (idempotent)

const handle = await engine.StartSession({
    ProviderName: 'Self-Hosted Chrome',     // OR DriverClass — supply exactly one
    ControlModeOverride: 'Collaborative',    // optional; validated against the backend's capabilities
    contextUser,
});

// ... agent drives the browser via the channel ...

await engine.EndSession(handle.SessionID);
```

`StartSession`:
1. Resolves the provider by **name** or **driver class** (exactly one selector).
2. Asserts the provider is `Active`.
3. Resolves the control mode (`override ?? provider.DefaultControlMode`) and **validates** it against
   the backend's capability flags via `isControlModeSupported` — an unsupported mode is rejected, not
   silently downgraded (`ViewOnly` needs `LiveView`; `Collaborative` needs `LiveView` + `HumanTakeover`).
4. Resolves the driver via `MJGlobal.ClassFactory.CreateInstance(BaseRemoteBrowserProvider, DriverClass)`
   (verifying a concrete registration exists first).
5. Builds the `RemoteBrowserProviderContext` (`Features` from `provider.SupportedFeaturesObject`,
   `ProviderType`, resolved `ControlMode`, `Configuration` parsed from `provider.Configuration`) and
   calls `driver.Connect(ctx)`.

`ReconcileOrphans(predicate?)` is the janitor seam: it force-closes live sessions (matching an optional
predicate). The **scheduling** is intentionally left to the host — this package carries no timer/IO.

### The control arbiter

The arbiter mediates the **input floor** per `RemoteBrowserControlMode`:

| Mode | `RequestControl` | `GrantControl('Human')` | `RouteHumanInput` |
|---|---|---|---|
| `AgentOnly` | denied | denied | dropped (agent only) |
| `ViewOnly` | denied | denied | dropped (watch only) |
| `Collaborative` | accepted | accepted **after** a request | routed **only while the human holds the floor** |

```ts
engine.RequestControl(sessionId);            // human asks for the wheel (Collaborative only)
engine.GrantControl(sessionId, 'Human');     // facilitator grants it
engine.RouteHumanInput(sessionId, { Kind: 'pointer-click', X, Y });  // routed while Human holds floor
engine.YieldControl(sessionId, 'Human');     // floor returns to the agent
```

`GrantControl(sessionId, 'Agent')` always succeeds (the agent reclaiming the wheel is unconditional).

### Goal-driven control — `AchieveGoal`

Beyond the per-action tool vocabulary, a caller can hand the session a **high-level goal** and let MJ's
computer-use loop plan + execute it:

```ts
const result = await engine.AchieveGoal(agentSessionID, 'log into the portal and open the latest invoice', {
    contextUser,
    StartUrl: 'https://portal.example.com',
    Context: { creds: { username: '{{...}}', password: '{{...}}' } }, // model-blind — referenced by label
    OnProgress: (p) => narrate(p.Message),                            // a voice session narrates progress
    Signal: abortController.signal,                                   // barge-in stops the loop cooperatively
});
// result: { Success, Strategy: 'ComputerUse' | 'NativeAI', Status, StepCount?, CurrentUrl?, Detail? }
```

`AchieveGoal` lazily starts the browser for the agent session, then calls the pure
`dispatchRemoteBrowserGoal(session, features, goal, opts)` — which `resolveControlStrategy` routes to the
universal `ComputerUse` loop (`RunComputerUseGoal`) or the backend's `NativeAI` harness
(`InvokeNativeAIControl`). The strategy switch is a standalone exported function so it is unit-tested with
a fake session, with no engine/DB state.

**Collaborative pause-on-takeover.** While a goal runs, its `AbortController` is registered per session
(chained to the caller's `Signal`). A granted human takeover — `GrantControl(sessionId, 'Human')` — and
`EndSession` abort it, so the computer-use loop **pauses cooperatively** rather than racing the human on the
shared browser. An `Agent` grant never pauses the agent's own goal.

> The MJ-aware goal **engine** (vision-model auto-selection, prompt-run logging, progress narration) is
> bound to the CDP seam at startup by `@memberjunction/server` (`BindRemoteBrowserGoalEngine` →
> `MJProgressComputerUseEngine`); this package stays free of any computer-use SDK dependency.

### The viewport → screen-track seam

```ts
// Gated on the backend's ScreenStreaming capability (throws RemoteBrowserCapabilityNotSupportedError
// when off — layer 1 of the two-layer gate; the driver's RequireFeature is layer 2).
await engine.PipeScreencastToTrack(sessionId, frame => screenOutTrack.write(frame));
// ...
await engine.StopScreencast(sessionId);
```

The sink is whatever consumes encoded frames — the bridge ScreenOut media track (screen-sharing the
browser into a meeting) or a console panel.

## The channel — `RemoteBrowserChannel`

A **server-only** `BaseRealtimeChannelServer` (no Angular client surface — a bot has no browser of its
own; the live view, when shown, is the engine's screencast track). It contributes a `browser_*` tool
vocabulary the agent invokes server-side and feeds the **current URL** back as channel perception after
each action.

| Tool | Action |
|---|---|
| `browser_OpenUrl` | `navigate` |
| `browser_Click` | `click` (selector or x/y) |
| `browser_Type` | `type` |
| `browser_Key` | `key` |
| `browser_Scroll` | `scroll` (delta or selector) |
| `browser_Back` / `browser_Forward` | `back` / `forward` |
| `browser_Wait` | `wait` (ms or selector) |
| `browser_Screenshot` | `CaptureScreenshot()` → base64 + URL |
| `browser_GetPageText` | current-URL read-back |
| `browser_DoTask` | **only when** the resolved strategy is `NativeAI` → `InvokeNativeAIControl(intent)` |

The control **strategy** (`ComputerUse` vs `NativeAI`) is orthogonal to the control **mode** and is
resolved from the backend's `NativeAIControl` flag (and an optional `PreferredStrategy` override) via
`resolveControlStrategy`. The granular tools are always contributed; `browser_DoTask` is added only when
`NativeAI` is in effect, delegating heavy autonomous automation to the backend's own AI-control harness.

The channel is constructed **per session** with the engine's live session injected (like Meeting
Controls, unlike the registry-resolved whiteboard):

```ts
import { RemoteBrowserChannel } from '@memberjunction/remote-browser-server';

const channel = new RemoteBrowserChannel({ Session: handle.Session, Features: handle.Features });
// hand to RealtimeChannelServerHost's per-session plugin set
```

Every hook is invoked inside the host's try/catch and the channel never throws — bad args, a missing
session, or an unknown tool resolve to a structured `{ Success: false, Output }`.

## No channel-registry row (engine-constructed)

`RemoteBrowserChannel` is a **server-only** channel with no client surface, so — exactly like the
bridge `MeetingControlsChannelServer` — it gets **no `MJ: AI Agent Channels` registry row** (that
table's `ClientPluginClass` is NOT NULL, and a sentinel there would be a hack). `RemoteBrowserEngine`
constructs one channel instance per session directly, injecting the live `IRemoteBrowserSession` and
the resolved capability flags. The `@RegisterClass(BaseRealtimeChannelServer, 'RemoteBrowserChannelServer')`
registration + the `LoadRemoteBrowserChannel()` tree-shaking guard are all that's needed for the
ClassFactory to resolve it.

## Manifest / bootstrap note

`RemoteBrowserChannel` is a `@RegisterClass(BaseRealtimeChannelServer, 'RemoteBrowserChannelServer')`
server channel, so the universal class-registration manifest must include it for ClassFactory
resolution in bundled hosts. Because this is a `@memberjunction/*` package, it is picked up
**automatically** by the pre-built **server-bootstrap** manifest when it is regenerated:

```bash
npm run mj:manifest:server-bootstrap
```

**No manifest file was hand-edited** by this package (per repo policy). Regenerating the server-bootstrap
manifest after adding this package to the dependency tree of `@memberjunction/server-bootstrap` will
include `RemoteBrowserChannel` along with the rest of the realtime channel registrations. Ship a static
call to `LoadRemoteBrowserChannel()` from the host's startup path as the additional tree-shaking guard.

## Type safety

No `any`, no `.Get()`/`.Set()` — the engine reads provider metadata exclusively through the generated
typed accessors (`DriverClass`, `ProviderType`, `DefaultControlMode`, `Status`, `SupportedFeaturesObject`,
`Configuration`). The full action / human-input / screencast vocabulary is the strongly-typed
discriminated-union surface from `@memberjunction/remote-browser-base`.

## Testing

```bash
cd packages/AI/RemoteBrowser/Server
npm run build
npm run test
```

Tests use a fake `IRemoteBrowserSession` and a fake `BaseRemoteBrowserProvider` (registered under their
own `DriverClass`) — no network, no real browser.
