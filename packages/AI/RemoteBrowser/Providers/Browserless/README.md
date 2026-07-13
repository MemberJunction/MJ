# @memberjunction/remote-browser-browserless

The **Browserless** backend driver for MemberJunction's Remote Browser channel. Browserless
([browserless.io](https://www.browserless.io)) is a **CDP-as-a-service**: it hands back a Chrome
DevTools Protocol connect endpoint and a hosted debug viewer URL, and the shared CDP control kit does
all the actual page driving. This driver therefore answers only one backend-specific question — *how do
I obtain a CDP endpoint (and its live-view / release hooks) for Browserless?* — behind an **injectable
service-client seam**, so it builds and unit-tests with **no network and no real Browserless account**.

See the [Realtime Bridges Guide](../../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
`/plans/realtime/realtime-bridges-architecture.md` (§4d-i, the Remote Browser channel) for the full
architecture.

## Install

```bash
npm install @memberjunction/remote-browser-browserless
```

## What it provides

- **`BrowserlessRemoteBrowser`** — `@RegisterClass(BaseRemoteBrowserProvider, 'BrowserlessRemoteBrowser')`.
  A `MJ: AI Remote Browser Providers` row with `DriverClass = 'BrowserlessRemoteBrowser'` resolves to
  this driver via the `ClassFactory`. It extends `BaseCdpRemoteBrowserProvider` and implements only
  `AcquireSession`; everything else (action mapping, capability gating, screencast, `Connect` /
  `Disconnect`) is inherited from `@memberjunction/remote-browser-cdp`.
- **`IBrowserlessClient`** — the **injectable seam** the driver depends on instead of the real service:
  `CreateSession(options)` → `{ SessionId, CdpEndpoint, DebugViewerUrl }` and `CloseSession(sessionId)`.
- **`BrowserlessSessionBackend`** — the `ICdpSessionBackend` for a live session: `GetLiveViewUrl()`
  returns the hosted debug viewer URL, `InvokeNativeAIControl()` throws (no native harness), and
  `Release()` ends the Browserless session (idempotently).

## Capability coverage (the Browserless seed row)

Seed row name **`Browserless`**, `DriverClass = 'BrowserlessRemoteBrowser'`,
`DefaultControlMode = 'ViewOnly'`.

| Capability | Status |
|---|---|
| `RawCdpControl` | ✅ universal CDP substrate |
| `LiveView` | ✅ hosted debug viewer URL |
| `ScreenStreaming` | ✅ |
| `SessionRecording` | ✅ |
| `ProxyEgress` | ✅ |
| `MultiTab` | ✅ |
| `FileDownloads` | ✅ |
| `HumanTakeover` | ➖ Browserless has no grab-the-wheel plane |
| `NativeAIControl` | ➖ no first-party AI-control harness — `InvokeNativeAIControl` throws `RemoteBrowserCapabilityNotSupportedError` |

Because Browserless has no `HumanTakeover`, the provider default control mode is **`ViewOnly`** (the
agent drives; humans watch the hosted live view).

## Binding the real Browserless client (production)

This package ships **without** the real browserless.io adapter — that is a deployment concern, so no
SDK / API key / connect URL is hard-wired here. At startup, bind a factory that builds an
`IBrowserlessClient` over the real browserless.io CDP-as-a-service connect URL
(`wss://chrome.browserless.io/chromium?token=…`):

```typescript
import { BrowserlessRemoteBrowser, IBrowserlessClient } from '@memberjunction/remote-browser-browserless';

BrowserlessRemoteBrowser.SetClientFactory((options) => {
    // Build a thin adapter over the real browserless.io connect URL / REST surface.
    // Credentials/region arrive already resolved in `options`; never inline secrets.
    const client: IBrowserlessClient = {
        async CreateSession(opts) {
            // …provision/connect a Browserless browser, return its CDP connect URL + debug viewer URL
            return { SessionId, CdpEndpoint, DebugViewerUrl };
        },
        async CloseSession(sessionId) {
            // …end the Browserless session
        },
    };
    return client;
});
```

Until a factory is bound, `AcquireSession` throws an explicit *"bind the real Browserless client"* error.

## Testing

Tests inject a `FakeBrowserlessClient` via `BrowserlessRemoteBrowser.SetClientFactory(...)` — no
network, no real Browserless account. Run them with:

```bash
npm run test
```
