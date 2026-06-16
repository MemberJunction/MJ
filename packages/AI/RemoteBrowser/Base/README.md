# @memberjunction/remote-browser-base

Universal (client **and** server), **metadata-only** base layer for the MemberJunction **Remote
Browser channel** — the in-house channel where an agent **spins up a real Chromium browser, drives it
over CDP while it talks, screen-shares it live, and can hand the wheel to a human** (a sales agent
running an interactive product demo, a support agent walking a user through a UI, a trainer agent that
demonstrates a task then watches you try).

This package holds everything the Remote Browser channel needs that carries **no execution** — the
backend-provider registry cache, the abstract `BaseRemoteBrowserProvider` driver contract, the live
CDP-backed `IRemoteBrowserSession` interface plus its self-contained action / input / frame types, the
control-mode/strategy helpers, and the capability-error type. It is the base half of the
`RemoteBrowserEngineBase` / `RemoteBrowserEngine` pair, exactly mirroring how
[`@memberjunction/ai-bridge-base`](../../RealtimeBridge/Base)'s `BaseRealtimeBridge` /
`AIBridgeEngineBase` underpin the bridge server tier. The server tier that actually *runs* a
remote-browser session (CDP-connect via `@memberjunction/computer-use`, the live sessions, control
arbitration, the viewport→screen-track encode) lives in the Server package; the five backend drivers
(Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser) live alongside it.

> See the architecture plan at `/plans/realtime/realtime-bridges-architecture.md` §4d (the Remote
> Browser channel) and §4d-i (the option-3 build decision: one CDP primitive, pluggable backends, the
> MJ way) for the full design.

## What's in the box

| Export | Purpose |
|---|---|
| `BaseRemoteBrowserProvider` | The abstract driver. A concrete backend (`BrowserbaseRemoteBrowser`, `SelfHostedChromeRemoteBrowser`, …) implements only the irreducibly backend-specific primitives (`Connect` → returns a live `IRemoteBrowserSession`, `Disconnect`). Drivers self-register via `@RegisterClass(BaseRemoteBrowserProvider, '<X>RemoteBrowser')`. |
| `RemoteBrowserEngineBase` | A `BaseEngine` singleton caching the backend registry (`MJ: AI Remote Browser Providers` + capability flags) with synchronous resolution helpers (`ProviderByName`, `ProviderByDriverClass`, `ActiveProviders`, `FeaturesFor`). No execution. |
| `IRemoteBrowserSession` | The live-session contract — core CDP methods (`GetCdpEndpoint`, `Navigate`, `ExecuteAction`, `CaptureScreenshot`, `GetCurrentUrl`, `Close`) plus capability-gated ones (`GetLiveViewUrl`, `StartScreencast`/`StopScreencast`, `RouteHumanInput`, `InvokeNativeAIControl`). |
| Action / input / frame types | `RemoteBrowserAction` (discriminated union: navigate / click / type / key / scroll / back / forward / wait), `RemoteBrowserActionResult`, `RemoteBrowserScreencastFrame`, `RemoteBrowserHumanInput` (pointer-move / pointer-click / key) — all strongly typed, **self-contained** (no Playwright / computer-use dependency). |
| `RemoteBrowserControlMode` + `RemoteBrowserControlStrategy` + helpers | `isControlModeSupported(mode, features)`, `resolveControlStrategy(features, preferred?)` — pure, capability-aware helpers. |
| `RemoteBrowserCapabilityNotSupportedError` | The defense-in-depth error thrown when a capability-gated method is called on a backend that doesn't support it (carries `FeatureName` + `ProviderName`). |
| `IRemoteBrowserProviderFeatures` + `featuresOf` + `KNOWN_REMOTE_BROWSER_FEATURE_KEYS` | Typed alias of the generated `MJ: AI Remote Browser Providers.SupportedFeatures` shape, a null-safe reader, and the full key list for validators/iteration. |

## Installation

```bash
npm install @memberjunction/remote-browser-base
```

## The universal CDP substrate

Every backend — self-hosted headless Chrome **and** every browser-as-a-service (Browserbase, Steel,
Browserless, Hyperbrowser) — exposes a **Chrome DevTools Protocol** endpoint. The Remote Browser
subsystem standardizes on **CDP-connect** as its one primitive: the server engine connects over CDP
(reusing `@memberjunction/computer-use`'s `PlaywrightBrowserAdapter`) and drives a clean
click/type/scroll/screenshot vocabulary — no hand-rolled raw CDP. This Base package itself stays
dependency-light and universal precisely because it only *declares* the `IRemoteBrowserSession`
contract both sides agree on; the Playwright/CDP machinery lives in the server tier.

## The driver contract

`BaseRemoteBrowserProvider` is intentionally tiny — two abstract methods:

- **`Connect(ctx)`** — open or attach a browser over CDP and return the live `IRemoteBrowserSession`.
  Call `this.applyContext(ctx)` first to capture the backend's capability flags + name.
- **`Disconnect()`** — release the driver's own backend resources (tear down the container, end the
  service session).

Protected helpers for driver authors: `applyContext(ctx)` (capture features + provider name — call it
first in `Connect`), `RequireFeature(flag)` (re-assert a capability flag before gated work), and
`notSupported(name)` (build the standard error).

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
    BaseRemoteBrowserProvider,
    IRemoteBrowserSession,
    RemoteBrowserProviderContext,
} from '@memberjunction/remote-browser-base';

@RegisterClass(BaseRemoteBrowserProvider, 'BrowserbaseRemoteBrowser')
export class BrowserbaseRemoteBrowser extends BaseRemoteBrowserProvider {
    public async Connect(ctx: RemoteBrowserProviderContext): Promise<IRemoteBrowserSession> {
        this.applyContext(ctx);                       // capture features + provider name (do this first)
        // ...request a session from the backend, obtain its CDP endpoint, and return a session that
        // implements IRemoteBrowserSession (the actual CDP wiring lives in the server tier).
        throw new Error('implemented in the server / driver package');
    }

    public async Disconnect(): Promise<void> {
        // ...release the backend session.
    }
}
```

A provider row whose `DriverClass = 'BrowserbaseRemoteBrowser'` resolves to this driver through the
`ClassFactory`: `MJGlobal.ClassFactory.CreateInstance(BaseRemoteBrowserProvider, provider.DriverClass)`.

## Capability gating (two layers, defense-in-depth)

A backend's capabilities live in the `MJ: AI Remote Browser Providers.SupportedFeatures` JSON column,
strongly typed via `IRemoteBrowserProviderFeatures`. It holds **control/transport** concerns only:

- **Control substrate & strategies** — `RawCdpControl` (the universal substrate), `NativeAIControl` (a
  backend's own AI-control harness, e.g. Stagehand).
- **Viewing & collaboration** — `LiveView`, `HumanTakeover`, `ScreenStreaming`.
- **Operational** — `Stealth`, `ProxyEgress`, `SessionRecording`, `PersistentContext`, `MultiTab`,
  `FileDownloads`, `CaptchaSolving`.

The engine checks the matching flag **first** and never calls a capability-gated session method whose
feature is off; the capability-gated method's own throw is the **second**, defense-in-depth layer for
when a metadata flag lies or a caller bypasses the gate. New backend features need no schema migration
— extend the interface. Read flags via `provider.SupportedFeaturesObject` (or the null-safe
`featuresOf(provider)`), never `JSON.parse(provider.SupportedFeatures)`.

## Control modes vs. control strategies

These are **orthogonal** axes — keep them straight:

| Axis | Type | Meaning |
|---|---|---|
| **Control mode** | `RemoteBrowserControlMode` | *Who* drives: `AgentOnly` (no takeover) · `ViewOnly` (humans watch — needs `LiveView`) · `Collaborative` (a human can grab the wheel — needs `LiveView` + `HumanTakeover`). A per-provider `DefaultControlMode`, overridable per-channel and at runtime. |
| **Control strategy** | `RemoteBrowserControlStrategy` | *How* the agent decides what to do: `ComputerUse` (MJ's perception→action loop over CDP — the universal default) · `NativeAI` (delegate intents to the backend's own harness — needs `NativeAIControl`). |

```typescript
import {
    isControlModeSupported,
    resolveControlStrategy,
} from '@memberjunction/remote-browser-base';

const features = provider.SupportedFeaturesObject ?? {};

isControlModeSupported('Collaborative', features); // true only if LiveView && HumanTakeover
resolveControlStrategy(features);                  // 'NativeAI' iff features.NativeAIControl, else 'ComputerUse'
resolveControlStrategy(features, 'ComputerUse');   // always 'ComputerUse' — explicit ComputerUse pins the universal loop
```

## How it composes

| Layer | Package | Role |
|---|---|---|
| **Registry cache + abstract driver + session contract + control helpers** | **`@memberjunction/remote-browser-base`** (this) | provider cache, `BaseRemoteBrowserProvider`, `IRemoteBrowserSession`, action/input types, control mode/strategy, capability types |
| Coordination + execution (CDP-connect, control arbiter, screen-track encode) | server package | `RemoteBrowserEngine` (composes this base), live sessions, the `RemoteBrowserChannel` |
| Browser control vocabulary | [`@memberjunction/computer-use`](../../ComputerUse) | the `PlaywrightBrowserAdapter` the server tier uses to drive CDP — **not** a dependency of this base |

The server `RemoteBrowserEngine` **composes** (does not extend) `RemoteBrowserEngineBase`, so the
startup manager warms exactly one `BaseEngine` cache — the same composition-over-inheritance pattern
`AIBridgeEngine` uses over `AIBridgeEngineBase`.

## Further reading

- **Architecture plan:** `/plans/realtime/realtime-bridges-architecture.md` §4d / §4d-i.
- **Sibling subsystem:** [`@memberjunction/ai-bridge-base`](../../RealtimeBridge/Base/README.md) — the
  realtime media bridge this package mirrors in structure and style.

## License

ISC
