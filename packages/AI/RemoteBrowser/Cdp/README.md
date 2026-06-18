# @memberjunction/remote-browser-cdp

The **shared CDP kit** for the MemberJunction Remote Browser channel — the DRY layer that wraps the
enriched [`@memberjunction/computer-use`](../../ComputerUse) Playwright adapter so the five backend
drivers (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser) become trivial.

## Why this package exists

All five Remote Browser backends drive the browser **identically over the Chrome DevTools Protocol**.
The only thing that differs between them is their *session lifecycle*:

- how they obtain a CDP endpoint (a self-hosted container vs. a browser-as-a-service SDK call),
- whether they expose a hosted, embeddable live-view URL,
- whether they have a first-party native AI-control harness, and
- how their session is torn down.

This package implements the shared CDP control path **once**. A driver subclasses
`BaseCdpRemoteBrowserProvider` and fills in just one hook (`AcquireSession`) plus a small
`ICdpSessionBackend` object — everything else (action translation, capability gating, screencast, human
takeover, teardown) is inherited.

## The DRY design

```
RemoteBrowserAction (Base vocabulary)
        │  mapRemoteBrowserAction()  ← lossless, exhaustive switch
        ▼
BrowserAction (computer-use vocabulary)
        │  PlaywrightBrowserAdapter.ExecuteAction()  ← all real CDP I/O lives here
        ▼
ActionExecutionResult → RemoteBrowserActionResult
```

- **`@memberjunction/computer-use`** does the I/O. Its enriched `PlaywrightBrowserAdapter` already
  supports selector-or-coordinate clicks, selector-or-delta scrolls, wait-for-selector vs. fixed sleep,
  CDP screencast, and perception (`GetVisibleText` / `GetAccessibilitySnapshot`).
- **This kit** maps the universal Base vocabulary onto computer-use and back, with no information loss —
  the mapping switches are exhaustive (a `never` default makes any new action kind a compile error).
- **The drivers** fill `AcquireSession` (get a CDP endpoint) and `ICdpSessionBackend` (live-view /
  native-AI / release).

## What's inside

| Export | Purpose |
| --- | --- |
| `mapRemoteBrowserAction(action)` | Lossless, exhaustive Base `RemoteBrowserAction` → computer-use `BrowserAction`. |
| `mapHumanInput(input)` | Base `RemoteBrowserHumanInput` (pointer-move / pointer-click / key) → computer-use `BrowserAction`. |
| `CdpRemoteBrowserSession` | The shared `IRemoteBrowserSession`: core CDP methods + capability-gated screencast / human-input / live-view / native-AI + the goal-driven `RunComputerUseGoal`. |
| `BaseCdpRemoteBrowserProvider` | Abstract base provider; implements `Connect`/`Disconnect`, leaves `AcquireSession` to the driver. |
| `AcquiredCdpSession` | `{ CdpEndpoint, Backend }` — what `AcquireSession` returns. |
| `ICdpSessionBackend` | Driver-supplied hooks: `GetLiveViewUrl()`, `InvokeNativeAIControl(intent)`, `Release()`. |
| `ComputerUseGoalRun` + `ComputerUseGoalEngineFactory` + `SetGoalEngineFactory` | The injectable goal-engine seam `RunComputerUseGoal` runs behind — default `ProgressComputerUseEngine` (base computer-use); production binds MJ's engine. |
| `buildProgressNote(step)` / `PROGRESS_MESSAGE_MAX_LENGTH` | Shared, model-safe per-step progress note (truncated controller reasoning) used by every goal engine. |
| `wrapAdapterWithContext` / `resolveActionTemplates` / `resolveTemplateString` / `getValueFromPath` | **Model-blind context injection** — resolve `{{label}}` tokens to real values at the CDP boundary (credentials never seen by any model). |

## Writing a driver

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
    BaseRemoteBrowserProvider,
    RemoteBrowserProviderContext,
    RemoteBrowserActionResult,
    RemoteBrowserCapabilityNotSupportedError,
} from '@memberjunction/remote-browser-base';
import {
    BaseCdpRemoteBrowserProvider,
    AcquiredCdpSession,
    ICdpSessionBackend,
} from '@memberjunction/remote-browser-cdp';

@RegisterClass(BaseRemoteBrowserProvider, 'BrowserbaseRemoteBrowser')
export class BrowserbaseRemoteBrowserProvider extends BaseCdpRemoteBrowserProvider {
    protected async AcquireSession(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        // 1. Call the backend's SDK / start a container to get a CDP endpoint.
        const session = await this.createServiceSession(ctx);

        // 2. Build the per-backend hooks.
        const backend: ICdpSessionBackend = {
            GetLiveViewUrl: async () => session.liveViewUrl,
            InvokeNativeAIControl: async (intent: string): Promise<RemoteBrowserActionResult> => {
                // delegate to the native harness, or throw if unsupported
                throw new RemoteBrowserCapabilityNotSupportedError('NativeAIControl', 'Browserbase');
            },
            Release: async () => { await session.end(); },
        };

        return { CdpEndpoint: session.cdpUrl, Backend: backend };
    }
}
```

The base class attaches a `PlaywrightBrowserAdapter` to `CdpEndpoint` (`ConnectType: 'cdp'`), wraps it
in a `CdpRemoteBrowserSession`, and the driver is done.

## Goal-driven control + model-blind credentials

`CdpRemoteBrowserSession.RunComputerUseGoal(goal, options)` runs MJ's **computer-use** loop against the
session's **own** already-attached `PlaywrightBrowserAdapter` — the same instance/CDP connection the human
watches, so the goal loop and the live view are the *same* page (no second browser). The engine sits behind
an injectable seam:

```typescript
import { CdpRemoteBrowserSession } from '@memberjunction/remote-browser-cdp';

// Production binds an MJ-aware engine (defaults to the stored Computer Use controller/judge prompts —
// which carry the model selection — with prompt-run logging; auto-selects a vision model only as a
// fallback). Tests bind a fake (no browser, no LLM). Default is ProgressComputerUseEngine (base
// computer-use, no metadata prompts, no model auto-selection).
CdpRemoteBrowserSession.SetGoalEngineFactory(() => new MyGoalEngine());
```

Progress flows out via `options.OnProgress` (a voice session narrates it); barge-in flows in via
`options.Signal` → the engine's cooperative `Stop()`.

**Model-blind credentials.** When `options.Context` is supplied, `RunComputerUseGoal` drives a **proxy
adapter** (`wrapAdapterWithContext`) that resolves `{{label}}` tokens — e.g. `{{creds.password}}` — to real
values **in a clone of the action** at the `ExecuteAction` boundary. The original action the engine recorded
(and everything in logs/transcripts) keeps the `{{label}}`, so **neither the realtime model nor the
computer-use controller ever sees the secret value**. Mirrors the MJ agents context-variable pattern,
re-implemented here so the kit needs no agents dependency.

## Capability gating

Capability-gated session methods (`StartScreencast` / `StopScreencast`, `RouteHumanInput`,
`GetLiveViewUrl`, `InvokeNativeAIControl`) check the backend's `IRemoteBrowserProviderFeatures` flag and
throw `RemoteBrowserCapabilityNotSupportedError` when the flag is off — the defense-in-depth layer that
mirrors the engine's own gate. A backend with no hosted live view / native harness should throw the same
error from its `ICdpSessionBackend` methods.

## Dependencies

`@memberjunction/remote-browser-base`, `@memberjunction/computer-use`, `@memberjunction/core`,
`@memberjunction/global`.
