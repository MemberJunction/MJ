# @memberjunction/remote-browser-hyperbrowser

The **Hyperbrowser** backend driver for MemberJunction's Remote Browser channel. Hyperbrowser exposes a
Chrome DevTools Protocol connect endpoint (driven by the shared CDP control kit) plus a hosted live-view
URL and — unlike a pure CDP-as-a-service — a **first-party agentic harness** that runs its own model
loop. This driver answers the backend-specific concerns behind an **injectable service-client seam**, so
it builds and unit-tests with **no network and no real `@hyperbrowser/sdk`**.

See the [Realtime Bridges Guide](../../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
`/plans/realtime/realtime-bridges-architecture.md` (§4d-i, the Remote Browser channel) for the full
architecture.

## Install

```bash
npm install @memberjunction/remote-browser-hyperbrowser
```

## What it provides

- **`HyperbrowserRemoteBrowser`** —
  `@RegisterClass(BaseRemoteBrowserProvider, 'HyperbrowserRemoteBrowser')`. A
  `MJ: AI Remote Browser Providers` row with `DriverClass = 'HyperbrowserRemoteBrowser'` resolves to
  this driver via the `ClassFactory`. It extends `BaseCdpRemoteBrowserProvider` and implements only
  `AcquireSession`; everything else (action mapping, capability gating, screencast, `Connect` /
  `Disconnect`) is inherited from `@memberjunction/remote-browser-cdp`.
- **`IHyperbrowserClient`** — the **injectable seam** the driver depends on instead of the real SDK:
  `CreateSession(options)` → `{ SessionId, CdpEndpoint, LiveViewUrl }`, `StopSession(sessionId)`, and
  `RunAgentTask(sessionId, intent)` → `{ Success, CurrentUrl?, Detail? }`.
- **`HyperbrowserSessionBackend`** — the `ICdpSessionBackend` for a live session: `GetLiveViewUrl()`
  returns the hosted live-view URL, `InvokeNativeAIControl(intent)` delegates to the native agentic
  harness via `RunAgentTask` and maps the result onto a `RemoteBrowserActionResult`, and `Release()`
  stops the session (idempotently).

## Capability coverage (the Hyperbrowser seed row)

Seed row name **`Hyperbrowser`**, `DriverClass = 'HyperbrowserRemoteBrowser'`.

| Capability | Status |
|---|---|
| `RawCdpControl` | ✅ universal CDP substrate |
| `NativeAIControl` | ✅ first-party agentic browse — `InvokeNativeAIControl` → `RunAgentTask` |
| `LiveView` | ✅ hosted live-view URL |
| `HumanTakeover` | ✅ grab-the-wheel via the hosted live view |
| `ScreenStreaming` | ✅ |
| `Stealth` | ✅ |
| `ProxyEgress` | ✅ |
| `SessionRecording` | ✅ |
| `PersistentContext` | ✅ |
| `MultiTab` | ✅ |
| `FileDownloads` | ✅ |
| `CaptchaSolving` | ✅ |

Because Hyperbrowser supports both `LiveView` and `HumanTakeover`, it can run in any control mode —
`AgentOnly`, `ViewOnly`, or `Collaborative`.

## Binding the real Hyperbrowser SDK (production)

This package ships **without** the real `@hyperbrowser/sdk` adapter — that is a deployment concern, so
no SDK / API key is hard-wired here. The SDK is declared as an **optional peer dependency**. At startup,
bind a factory that builds an `IHyperbrowserClient` over the real `@hyperbrowser/sdk`:

```typescript
import { HyperbrowserRemoteBrowser, IHyperbrowserClient } from '@memberjunction/remote-browser-hyperbrowser';
// import { Hyperbrowser } from '@hyperbrowser/sdk'; // the optional peer dependency

HyperbrowserRemoteBrowser.SetClientFactory((options) => {
    // Build a thin adapter over the real @hyperbrowser/sdk.
    // Credentials/stealth/proxy arrive already resolved in `options`; never inline secrets.
    const client: IHyperbrowserClient = {
        async CreateSession(opts) {
            // …sessions.create(...), return its CDP connect URL + live-view URL
            return { SessionId, CdpEndpoint, LiveViewUrl };
        },
        async StopSession(sessionId) {
            // …sessions.stop(sessionId)
        },
        async RunAgentTask(sessionId, intent) {
            // …run the agentic harness, return { Success, CurrentUrl?, Detail? }
            return { Success: true };
        },
    };
    return client;
});
```

Until a factory is bound, `AcquireSession` throws an explicit *"bind the real Hyperbrowser client"*
error.

## Testing

Tests inject a `FakeHyperbrowserClient` via `HyperbrowserRemoteBrowser.SetClientFactory(...)` — no
network, no real `@hyperbrowser/sdk`. Run them with:

```bash
npm run test
```
