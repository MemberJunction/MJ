# @memberjunction/remote-browser-selfhost

The **Self-Hosted Chrome** backend driver for MemberJunction's Remote Browser channel. Instead of a
browser-as-a-service, this backend has MJ orchestrate a **lightweight headless-Chrome container** (just
Chrome started with a `--remote-debugging-port`) and connect to it over the Chrome DevTools Protocol.
The shared CDP control kit does all the actual page driving, so this driver answers only one
backend-specific question — *how do I obtain a CDP endpoint (and its live-view / release hooks) for a
self-hosted Chrome container?* — behind an **injectable container-runner seam**, so it builds and
unit-tests with **no container, no network, and no real browser**.

See the [Realtime Bridges Guide](../../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
`/plans/realtime/realtime-bridges-architecture.md` (§4d-i, the Remote Browser channel) for the full
architecture.

## Install

```bash
npm install @memberjunction/remote-browser-selfhost
```

## What it provides

- **`SelfHostRemoteBrowser`** — `@RegisterClass(BaseRemoteBrowserProvider, 'SelfHostRemoteBrowser')`.
  A `MJ: AI Remote Browser Providers` row with `DriverClass = 'SelfHostRemoteBrowser'` resolves to this
  driver via the `ClassFactory`. It extends `BaseCdpRemoteBrowserProvider` and implements only
  `AcquireSession`; everything else (action mapping, capability gating, screencast, human takeover,
  `Connect` / `Disconnect`) is inherited from `@memberjunction/remote-browser-cdp`.
- **`IChromeContainerRunner`** — the **injectable orchestration seam** the driver depends on instead of a
  real container orchestrator: `Acquire(opts)` → `{ CdpEndpoint, ViewerUrl, Release() }`.
- **`SelfHostSessionBackend`** — the `ICdpSessionBackend` for a live session: `GetLiveViewUrl()` returns
  the MJ-hosted viewer URL (backed by the inherited screencast), `InvokeNativeAIControl()` throws (no
  native harness), and `Release()` tears down the container (idempotently).

## Capability coverage (the Self-Hosted Chrome seed row)

Seed row name **`Self-Hosted Chrome`**, `DriverClass = 'SelfHostRemoteBrowser'`.

| Capability | Status |
|---|---|
| `RawCdpControl` | ✅ universal CDP substrate |
| `LiveView` | ✅ MJ-hosted viewer URL backed by the inherited CDP screencast |
| `HumanTakeover` | ✅ inherited grab-the-wheel input routing |
| `ScreenStreaming` | ✅ |
| `PersistentContext` | ✅ |
| `MultiTab` | ✅ |
| `FileDownloads` | ✅ |
| `NativeAIControl` | ➖ self-host has no first-party AI-control harness — `InvokeNativeAIControl` throws `RemoteBrowserCapabilityNotSupportedError`; MJ's own computer-use loop drives the page |

Unlike a browser-as-a-service, Self-Hosted Chrome has **no provider-hosted live view of its own**.
`LiveView` is still supported because `GetLiveViewUrl()` returns an **MJ-hosted** viewer URL whose page
renders the inherited CDP screencast frames — so it returns a URL rather than throwing.

## Binding the real Chrome container runner (production)

This package ships **without** a real container orchestrator — that is a deployment concern, so no Docker
/ Kubernetes / Chrome-image wiring is hard-coded here. At startup, bind a factory that builds an
`IChromeContainerRunner` which spins up a headless-Chrome container and returns its CDP endpoint plus an
MJ-hosted viewer URL backed by the screencast:

```typescript
import { SelfHostRemoteBrowser, IChromeContainerRunner } from '@memberjunction/remote-browser-selfhost';

SelfHostRemoteBrowser.SetContainerRunnerFactory(() => {
    // Build a thin adapter over your real container orchestrator (Docker/K8s/…).
    // Region/image/proxy arrive already resolved in the acquire options; never inline secrets.
    const runner: IChromeContainerRunner = {
        async Acquire(opts) {
            // …start a headless-Chrome container with --remote-debugging-port,
            //   stand up the MJ viewer page backed by the screencast,
            //   and return the handle:
            return {
                CdpEndpoint, // ws://…/devtools/browser/…
                ViewerUrl,   // MJ-hosted viewer backed by the inherited screencast
                async Release() {
                    // …stop + tear down the container
                },
            };
        },
    };
    return runner;
});
```

Until a factory is bound, `AcquireSession` throws an explicit *"bind a real Chrome container runner via
SetContainerRunnerFactory"* error.

## Testing

Tests inject a `FakeChromeContainerRunner` via `SelfHostRemoteBrowser.SetContainerRunnerFactory(...)` —
no container, no network, no real browser. Run them with:

```bash
npm run test
```
