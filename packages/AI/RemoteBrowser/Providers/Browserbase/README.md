# @memberjunction/remote-browser-browserbase

The **Browserbase** backend driver for the MemberJunction Remote Browser channel.

[Browserbase](https://browserbase.com) is the richest Remote Browser backend: a browser-as-a-service
that exposes a CDP connect endpoint, a hosted live-view with human takeover, **and** a first-party
AI-control harness (**Stagehand** — act / extract / observe). This package contributes the
`BrowserbaseRemoteBrowser` driver that the channel resolves for the "Browserbase" provider metadata row.

## How trivial the driver is

All Remote Browser backends drive the page **identically over CDP** — the shared
[`@memberjunction/remote-browser-cdp`](../../Cdp) kit owns that entire control path (action translation,
capability gating, screencast, human takeover, `Connect`/`Disconnect`, teardown). A driver subclasses
`BaseCdpRemoteBrowserProvider` and fills in just **one hook**:

```ts
protected async AcquireSession(ctx): Promise<{ CdpEndpoint: string; Backend: ICdpSessionBackend }>
```

`BrowserbaseRemoteBrowser.AcquireSession` calls the client's `CreateSession` and returns its CDP endpoint
plus a small `ICdpSessionBackend`:

| Backend hook | Browserbase mapping |
| --- | --- |
| `GetLiveViewUrl()` | the hosted live-view URL from `CreateSession` |
| `InvokeNativeAIControl(intent)` | `client.Act(...)` → Stagehand act/extract/observe, mapped to `RemoteBrowserActionResult` |
| `Release()` | `client.EndSession(...)` |

## Capabilities

Mirrors the "Browserbase" seed row's `SupportedFeatures`: **NativeAIControl** (Stagehand), LiveView,
HumanTakeover, ScreenStreaming, Stealth, ProxyEgress, SessionRecording, PersistentContext, MultiTab,
FileDownloads, CaptchaSolving (plus `RawCdpControl`).

## The injectable client seam

All Browserbase I/O goes through `IBrowserbaseClient`, so this package builds and unit-tests with **no
network, no real SDK, and no API keys**:

```ts
export interface IBrowserbaseClient {
    CreateSession(opts): Promise<{ SessionId: string; CdpEndpoint: string; LiveViewUrl: string }>;
    EndSession(sessionId: string): Promise<void>;
    Act(sessionId: string, intent: string): Promise<{ Success: boolean; CurrentUrl?: string; Detail?: string }>;
}
```

The default factory throws until you bind a real one — production must opt in explicitly:

```ts
import { BrowserbaseRemoteBrowser } from '@memberjunction/remote-browser-browserbase';

BrowserbaseRemoteBrowser.SetClientFactory((config) => new MyBrowserbaseClientAdapter(config));
```

## Production binding

Bind `IBrowserbaseClient` to the official **[`@browserbasehq/sdk`](https://www.npmjs.com/package/@browserbasehq/sdk)**
plus **Stagehand**:

- `CreateSession` → `Browserbase.sessions.create(...)` (session id + `connectUrl` CDP endpoint +
  `debuggerFullscreenUrl` live-view).
- `EndSession` → `Browserbase.sessions.update(id, { status: 'REQUEST_RELEASE' })`.
- `Act` → a Stagehand `page.act(...)` / `page.extract(...)` / `page.observe(...)` invocation.

Declare `@browserbasehq/sdk` as an optional dependency wherever the production factory is bound — none of
the SDK types leak into this package.

## Install & build

```bash
npm install          # from the repo root
cd packages/AI/RemoteBrowser/Providers/Browserbase
npm run build
npm run test
```
