# Remote Browser Channel Guide

The **Remote Browser** channel lets a realtime agent **drive a real, live browser while it talks** —
a sales agent running an interactive product demo, a support agent walking a user through a UI, a
research agent showing what it found, or a **trainer agent** that demonstrates a task in a real app,
then hands the user the wheel ("your turn — try X, Y, Z") and watches + coaches.

It is an **in-house MJ realtime channel** (a sibling concept to a Realtime *Bridge* — see
[REALTIME_BRIDGES_GUIDE.md](./REALTIME_BRIDGES_GUIDE.md)). Its viewport renders in an MJ console panel,
or screen-shares into a Zoom/Teams meeting through a bridge's `ScreenOut` track. **Read this before
touching anything under `packages/AI/RemoteBrowser/` or before adding a browser backend.**

Companion plan: [plans/realtime/realtime-bridges-architecture.md §4d / §4d-i](../plans/realtime/realtime-bridges-architecture.md).

---

## 1. The one design idea — push everything generic, keep backends thin

Every browser backend (self-hosted Chrome and every browser-as-a-service) exposes the **same
primitive: a Chrome DevTools Protocol (CDP) endpoint.** So the whole subsystem is built on one rule:
**do the browser work once, generically, in `@memberjunction/computer-use`; the Remote Browser layer
only maps vocabulary and manages session lifecycle.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ @memberjunction/computer-use            GENERIC browser I/O + perception      │
│   PlaywrightBrowserAdapter: connectOverCDP, ExecuteAction (selector OR coord),│
│   CaptureScreenshot, StartScreencast, GetAccessibilitySnapshot, QueryElement, │
│   GetVisibleText, GetTitle, WaitForLoadState, MouseMove …                     │
└───────────────▲─────────────────────────────────────────────────────────────┘
                │ wraps + maps (one lossless mapper)
┌───────────────┴───────────────────────────────────────────────────────────────┐
│ @memberjunction/remote-browser-cdp      SHARED CDP kit                          │
│   CdpRemoteBrowserSession (implements IRemoteBrowserSession over the adapter),  │
│   mapRemoteBrowserAction / mapHumanInput, BaseCdpRemoteBrowserProvider,         │
│   ICdpSessionBackend                                                            │
└───────────────▲────────────────────────────────────────────────▲──────────────┘
                │ extends (AcquireSession + 3 hooks)              │ contracts
┌───────────────┴──────────────────────┐  ┌──────────────────────┴──────────────┐
│ 5 backend drivers (thin)             │  │ @memberjunction/remote-browser-base  │
│  remote-browser-selfhost             │  │  BaseRemoteBrowserProvider,           │
│  remote-browser-browserbase          │  │  RemoteBrowserEngineBase (registry),  │
│  remote-browser-steel                │  │  IRemoteBrowserSession, action/input  │
│  remote-browser-browserless          │  │  types, control modes/strategies,     │
│  remote-browser-hyperbrowser         │  │  IRemoteBrowserProviderFeatures        │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
                │ resolved by ClassFactory (DriverClass)
┌───────────────┴───────────────────────────────────────────────────────────────┐
│ @memberjunction/remote-browser-server   RemoteBrowserEngine (composition over   │
│   RemoteBrowserEngineBase) + RemoteBrowserChannel (BaseRealtimeChannelServer):  │
│   tool vocabulary, perception, control arbiter, viewport→ScreenOut             │
└────────────────────────────────────────────────────────────────────────────────┘
```

Because the heavy lifting is generic, **each of the 5 backends is ~one method + a service seam.**
Adding the sixth is trivial.

---

## 2. The registry table & capability gating

A backend is a row in `AIRemoteBrowserProvider` (`MJ: AI Remote Browser Providers`, migration
`V202606161000`), mirroring `AIBridgeProvider`:

| Column | Meaning |
|---|---|
| `Name` | Display name (e.g. `Browserbase`) |
| `ProviderType` | `SelfHost` (MJ orchestrates a Chrome container) or `Service` (a BaaS CDP endpoint) |
| `DriverClass` | `ClassFactory` key → the `BaseRemoteBrowserProvider` subclass |
| `Status` | `Active` / `Disabled` |
| `SupportedFeatures` | **Strongly-typed JSON** (`IRemoteBrowserProviderFeatures`, bound via JSONType → the generated `SupportedFeaturesObject` accessor) |
| `DefaultControlMode` | `AgentOnly` / `ViewOnly` / `Collaborative` (channel default; runtime-overridable) |
| `ConfigSchema` / `Configuration` | optional JSON Schema + backend config (no inline secrets) |

`IRemoteBrowserProviderFeatures` (the capability matrix — omitted flag = unsupported):

- **Control substrate**: `RawCdpControl` (the universal CDP path), `NativeAIControl` (the backend's own
  AI harness, e.g. Browserbase **Stagehand**).
- **Viewing & collaboration**: `LiveView` (a hosted live-view URL), `HumanTakeover` (route human input),
  `ScreenStreaming` (continuous viewport frames → ScreenOut).
- **Operational**: `Stealth`, `ProxyEgress`, `SessionRecording`, `PersistentContext`, `MultiTab`,
  `FileDownloads`, `CaptchaSolving`.

**Two-layer gating (defense in depth)**, identical to bridges: the engine checks the flag before
calling a capability-gated session method; the session/driver *also* re-checks and throws
`RemoteBrowserCapabilityNotSupportedError` if a flag lied or a caller bypassed the gate.

---

## 3. Control **modes** vs control **strategies** (don't conflate them)

These are orthogonal:

- **Control MODE** — *who may drive* (a channel/runtime policy):
  - `AgentOnly` — only the agent drives (a sales demo that never hands over).
  - `ViewOnly` — the agent drives; humans watch the live view but cannot take over.
  - `Collaborative` — a human can **grab the wheel** (the trainer agent: demonstrate, then "your turn").
  - Lives as `DefaultControlMode` on the provider; the `RemoteBrowserChannel` overrides it per-channel
    and at runtime. A mode is only valid if the backend supports its prerequisites (`HumanTakeover`
    for Collaborative; `LiveView` for ViewOnly/Collaborative) — enforced by `isControlModeSupported`.
- **Control STRATEGY** — *how the agent decides what to click* (resolved by `resolveControlStrategy`):
  - `ComputerUse` (default, universal) — MJ's own perception→action loop over CDP. Right for a realtime
    co-agent that is already a powerful brain emitting tool calls while it talks.
  - `NativeAI` (capability-gated by `NativeAIControl`) — delegate a high-level intent to the backend's
    own harness (Stagehand `Act`, Hyperbrowser agent). An accelerator for heavy/robust automation; it
    runs its own model loop, so it's *offered*, not the default for the talking agent.

---

## 4. How to add a new browser backend

The whole driver is: subclass `BaseCdpRemoteBrowserProvider`, implement **one** method + **three**
hooks, register, and seed a row.

### Step 1 — Subclass & register
```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseRemoteBrowserProvider, RemoteBrowserProviderContext } from '@memberjunction/remote-browser-base';
import { BaseCdpRemoteBrowserProvider, AcquiredCdpSession } from '@memberjunction/remote-browser-cdp';

@RegisterClass(BaseRemoteBrowserProvider, 'AcmeRemoteBrowser')
export class AcmeRemoteBrowser extends BaseCdpRemoteBrowserProvider {
    protected async AcquireSession(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        const s = await this.client().CreateSession(/* … */);   // your service SDK (injectable seam)
        return {
            CdpEndpoint: s.CdpEndpoint,                          // attach point for computer-use
            Backend: {
                GetLiveViewUrl: async () => s.LiveViewUrl,       // or throw if no LiveView
                InvokeNativeAIControl: (intent) => this.client().Act(s.Id, intent), // or throw
                Release: async () => this.client().EndSession(s.Id),
            },
        };
    }
}
```
That's it. `Connect`/`Disconnect`, attaching `PlaywrightBrowserAdapter` over CDP, action mapping,
screencast, human-takeover input, perception, and capability gating are **all inherited** from
`CdpRemoteBrowserSession`.

### Step 2 — Injectable service seam + Fake (so tests need no network)
Mirror the existing backends: a `SetClientFactory(factory)` static + a default factory that throws
`"bind the real Acme client"` until production binds the real SDK. Tests inject a Fake client.

### Step 3 — Seed the registry row
Add a row to `metadata/ai-remote-browser-providers/.ai-remote-browser-providers.json` with `Name`,
`ProviderType`, `DriverClass` (`AcmeRemoteBrowser`), `DefaultControlMode`, and a `SupportedFeatures`
JSON string reflecting exactly what your `ICdpSessionBackend` actually supports (don't claim
`NativeAIControl` if `InvokeNativeAIControl` throws). Push via `mj sync`.

---

## 5. The five shipped backends

| Backend | Type | DriverClass | Distinctive capability |
|---|---|---|---|
| **Self-Hosted Chrome** | SelfHost | `SelfHostRemoteBrowser` | MJ-orchestrated Chrome container (`IChromeContainerRunner` seam); LiveView via an MJ-hosted viewer backed by the inherited screencast; no provider AI harness |
| **Browserbase** | Service | `BrowserbaseRemoteBrowser` | First-party **Stagehand** native-AI (`Act`); richest feature set |
| **Steel** | Service | `SteelRemoteBrowser` | Full session viewer + stealth/proxy/recording; no first-party AI harness |
| **Browserless** | Service | `BrowserlessRemoteBrowser` | Lean CDP-as-a-service, ViewOnly default; no takeover/native-AI |
| **Hyperbrowser** | Service | `HyperbrowserRemoteBrowser` | Agentic native-AI (`RunAgentTask`) |

All are `Active` in the seed; like the bridge drivers, each binds its real provider SDK / container
runner via a `SetClientFactory` / `SetContainerRunnerFactory` seam before production use.

---

## 6. What `@memberjunction/computer-use` provides (the generic engine)

The Remote Browser work deliberately **enriched computer-use** rather than hand-rolling browser
control per backend (the "push to the generic level" principle). Additive capabilities now available
to *every* computer-use consumer:

- **Selector-aware actions** — `Click`/`Type`/`Scroll`/`Wait` take an optional `Selector`; when set the
  adapter targets the matched element (robust DOM), else the existing coordinate/delta/duration path.
- **Screencast** — `StartScreencast(onFrame)/StopScreencast()` via CDP `Page.startScreencast`
  (monotonic frames + ack) — the source for the channel's `ScreenOut` track.
- **`MouseMove` action** — completes the input vocabulary for hover / human-takeover.
- **Perception** — `GetAccessibilitySnapshot()` (token-efficient ARIA tree), `QueryElement(selector)`
  (`{Exists,Visible,Text,BoundingBox}`), `GetVisibleText()`, `GetTitle()`, `WaitForLoadState()`.

The lossless `mapRemoteBrowserAction` (in the CDP kit) is the *single* place Base actions become
computer-use actions — propagating both selector and coordinate paths so none of the adapter's
robustness is lost.

---

## 7. The server layer — engine & channel

`@memberjunction/remote-browser-server`:

- **`RemoteBrowserEngine`** (server-only `BaseSingleton`, composes over `RemoteBrowserEngineBase.Instance`
  exactly as `AIBridgeEngine` composes over `AIBridgeEngineBase`): resolves the provider row + driver,
  builds the `RemoteBrowserProviderContext` (features from `SupportedFeaturesObject`, control mode =
  override ?? `DefaultControlMode`, validated), starts/tracks live sessions, runs the **control arbiter**
  (agent⇄human handoff honoring the mode) and a janitor, and exposes the `PipeScreencastToTrack` seam
  the bridge `ScreenOut` track consumes.
- **`RemoteBrowserChannel extends BaseRealtimeChannelServer`**: the agent's browser tool vocabulary
  (OpenUrl/Click/Type/Key/Scroll/Back/Forward/Wait/Screenshot/GetPageText), `ExecuteServerTool`
  mapping each to a `RemoteBrowserAction` over the live session (routing high-level intents to
  `InvokeNativeAIControl` when the strategy resolves to `NativeAI`), and the perception feed that lets
  the agent *see* the page it drives.

---

## 8. The realtime client surface — live view, agent perception, human takeover

The Remote Browser channel renders in the realtime overlay's Browser tab (`RemoteBrowserSurfaceComponent`).
Three layers sit on top of the action vocabulary, each capability-gated so a backend opts in purely by
advertising a flag — no per-provider client code.

### 8a. Live view — CDP screencast (push), screenshot poll (fallback)
The surface shows the live page two ways, picked by the `ScreenStreaming` capability:
- **Screencast (default for capable backends)** — on `BindSurface` the channel calls the
  `StartRemoteBrowserScreencast` mutation; the server runs `IRemoteBrowserSession.StartScreencast` and
  publishes each `RemoteBrowserScreencastFrame` on the existing `PUSH_STATUS_UPDATES_TOPIC` for the user's
  session (the same push channel as delegation progress — no new WS infra). The conversations service's
  push subscription routes those frames to the channel → the surface paints them on a `<canvas>` (one
  reused `Image` + `requestAnimationFrame`, drop-old coalescing, outside the Angular zone). Stopped on
  `UnbindSurface`/`Dispose`. (LiveKit/WebRTC video is the planned efficiency upgrade behind the same surface.)
- **Screenshot poll (fallback)** — the original `RemoteBrowserSnapshot` query every 700ms, used only when
  `StartRemoteBrowserScreencast` reports `Streaming: false` (backend lacks `ScreenStreaming`).

### 8b. Agent perception — the visual interpreter (for non-omnimodal realtime models)
Realtime voice models (GPT Realtime, Grok Voice) are **audio/text only — they cannot see the screenshot**.
So beyond the URL/`Detail` perception fed back after each action, the agent gets two **vision-query** tools
(distinct from the navigate/click action path) that let it *kinda see*:
- `browser_DescribePage` — a concise text description of what's currently visible.
- `browser_LocateElement(description)` — find a UI element by **visual** description (works on messy sites
  that lack good a11y/DOM structure) and get its approximate pixel centroid `(x, y)` so the agent can then
  `browser_Click` it.

Both relay to the `InterpretRemoteBrowserPage` server mutation, which `CaptureScreenshot`s the viewport and
runs the **"Remote Browser Visual Interpreter"** AI Prompt (pinned to a fast vision model, **Gemini 3.1
Flash-Lite**, via its `MJ: AI Prompt Models` association — tunable in metadata, not code) over the image,
returning strict JSON `{ description, elements: [{ label, x, y, confidence }] }`. This is the bridge to
visual sites until realtime models become omnimodal; it complements (doesn't replace) a11y/`GetVisibleText`
perception.

### 8c. Human takeover (Collaborative mode)
The session resolves a control **mode** (`AgentOnly` / `ViewOnly` / `Collaborative`) and the engine runs a
floor arbiter (agent⇄human). In `Collaborative`, the surface captures pointer/keyboard events on the live
view, maps display coordinates → viewport coordinates, and relays them as `RemoteBrowserHumanInput`
(`pointer-move` / `pointer-click` / `key`) → `IRemoteBrowserSession.RouteHumanInput` (capability-gated on
`HumanTakeover`). See `RelayRemoteBrowserHumanInput`.

---

## 9. Reference map

| Package | Role |
|---|---|
| `@memberjunction/computer-use` | Generic browser I/O + perception (CDP, selectors, screencast, a11y) |
| `@memberjunction/remote-browser-base` | Universal contracts + `RemoteBrowserEngineBase` registry cache |
| `@memberjunction/remote-browser-cdp` | Shared CDP session kit (the DRY heart) + lossless mapper |
| `@memberjunction/remote-browser-{selfhost,browserbase,steel,browserless,hyperbrowser}` | The 5 backends |
| `@memberjunction/remote-browser-server` | `RemoteBrowserEngine` + `RemoteBrowserChannel` |
| migration `V202606161000` | `AIRemoteBrowserProvider` registry table |
| `metadata/ai-remote-browser-providers/` | The 5 backend seed rows |

See also: [REALTIME_BRIDGES_GUIDE.md](./REALTIME_BRIDGES_GUIDE.md) (the sibling bridge subsystem — the
Remote Browser screen-shares into meetings through a bridge's `ScreenOut` track).
