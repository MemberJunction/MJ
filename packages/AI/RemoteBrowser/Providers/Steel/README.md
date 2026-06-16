# @memberjunction/remote-browser-steel

The **Steel** ([steel.dev](https://steel.dev)) backend driver for the MemberJunction Remote Browser
channel.

Steel is a browser-as-a-service: a CDP connect endpoint plus a hosted session viewer (with human
takeover), stealth, proxy egress, session recording, persistent contexts, multi-tab, downloads, and
CAPTCHA solving — but **no first-party AI-control harness**. Steel sessions are driven by MJ's own
computer-use control (or OSS Stagehand-over-CDP). This package contributes the `SteelRemoteBrowser`
driver that the channel resolves for the "Steel" provider metadata row.

## How trivial the driver is

All Remote Browser backends drive the page **identically over CDP** — the shared
[`@memberjunction/remote-browser-cdp`](../../Cdp) kit owns that entire control path (action translation,
capability gating, screencast, human takeover, `Connect`/`Disconnect`, teardown). A driver subclasses
`BaseCdpRemoteBrowserProvider` and fills in just **one hook**:

```ts
protected async AcquireSession(ctx): Promise<{ CdpEndpoint: string; Backend: ICdpSessionBackend }>
```

`SteelRemoteBrowser.AcquireSession` calls the client's `CreateSession` and returns its CDP endpoint plus
a small `ICdpSessionBackend`:

| Backend hook | Steel mapping |
| --- | --- |
| `GetLiveViewUrl()` | the hosted session-viewer URL from `CreateSession` |
| `InvokeNativeAIControl(intent)` | **throws** `RemoteBrowserCapabilityNotSupportedError('NativeAIControl', 'Steel')` — no first-party AI harness |
| `Release()` | `client.ReleaseSession(...)` |

## Capabilities

Mirrors the "Steel" seed row's `SupportedFeatures`: LiveView, HumanTakeover, ScreenStreaming, Stealth,
ProxyEgress, SessionRecording, PersistentContext, MultiTab, FileDownloads, CaptchaSolving (plus
`RawCdpControl`). **`NativeAIControl` is intentionally absent** — and the driver enforces that by throwing
when it is invoked.

## The injectable client seam

All Steel I/O goes through `ISteelClient`, so this package builds and unit-tests with **no network, no
real SDK, and no API keys**:

```ts
export interface ISteelClient {
    CreateSession(opts): Promise<{ SessionId: string; CdpEndpoint: string; SessionViewerUrl: string }>;
    ReleaseSession(sessionId: string): Promise<void>;
}
```

The default factory throws until you bind a real one — production must opt in explicitly:

```ts
import { SteelRemoteBrowser } from '@memberjunction/remote-browser-steel';

SteelRemoteBrowser.SetClientFactory((config) => new MySteelClientAdapter(config));
```

## Production binding

Bind `ISteelClient` to the official **[`steel-sdk`](https://www.npmjs.com/package/steel-sdk)**:

- `CreateSession` → `Steel.sessions.create(...)` (session id + CDP `websocketUrl` + `sessionViewerUrl`).
- `ReleaseSession` → `Steel.sessions.release(id)`.

Declare `steel-sdk` as an optional dependency wherever the production factory is bound — none of the SDK
types leak into this package.

## Install & build

```bash
npm install          # from the repo root
cd packages/AI/RemoteBrowser/Providers/Steel
npm run build
npm run test
```
