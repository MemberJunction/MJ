# Attaching to an External Browser

A guide for using `@memberjunction/computer-use` and `@memberjunction/computer-use-engine` with an **already-running** Chromium browser — instead of launching a fresh one every time.

---

## Why would I want this?

By default, ComputerUse launches its own headless Chromium for every run. That's perfect for CI, isolated regression tests, and most agent workflows. But there are situations where launching your own browser is the wrong tool:

| Scenario | Why default-launch falls short | What attach mode gives you |
|---|---|---|
| You want an agent to drive **your** open Chrome, signed into your corp SSO / cookies / extensions | Each run starts from a blank profile and has to log in again | Connect to the live Chrome you already have open and inherit its session |
| You're running a **pool of parallel test workers** | Every worker spawns its own Chromium → N × startup cost, N × memory | All workers connect to one shared Playwright server |
| You're using a **remote / containerized** browser (Browserless, Selenium Grid, an LLM evaluation harness, etc.) | The default path can only launch a local browser | Point at any `ws://` Playwright server or `http://` CDP endpoint anywhere |
| You want to **watch the agent work in real time** with all your DevTools panels | The launched browser is headless and short-lived | Attach to your visible debug Chrome and step through with full DevTools |

If none of those apply to you, you don't need this feature — the default `chromium.launch()` path is still the recommended one.

---

## How attach mode works (the two transports)

Playwright supports two ways to connect to a browser that's already running:

1. **Chrome DevTools Protocol (CDP)** — for any real Chrome / Chromium / Edge started with the `--remote-debugging-port=<N>` flag. The endpoint looks like `http://localhost:9222`.
2. **Playwright browser server** — a Chromium process launched specifically to accept Playwright clients, via `chromium.launchServer()`. The endpoint looks like `ws://localhost:55001/<token>`.

ComputerUse auto-detects which one you mean from the URL scheme:

| Endpoint scheme | Transport | Playwright call used |
|---|---|---|
| `http://` or `https://` | CDP | `chromium.connectOverCDP(...)` |
| `ws://` or `wss://` | Server | `chromium.connect(...)` |

If your endpoint scheme is ambiguous (e.g. a **raw CDP websocket** that uses `ws://`), you can override the auto-detection — see [`ConnectType`](#connecttype) below.

---

## The three new `BrowserConfig` fields

All ComputerUse attach functionality is driven by three optional fields on `BrowserConfig`. Set none of them and you get the existing launch-and-close behavior unchanged.

### `Connect: string`

The endpoint of the browser you want to attach to. `http(s)://…` → CDP, `ws(s)://…` → Playwright server.

```typescript
import { BrowserConfig } from '@memberjunction/computer-use';

const cfg = new BrowserConfig();
cfg.Connect = 'http://localhost:9222';   // attach to a real Chrome over CDP
// OR
cfg.Connect = 'ws://localhost:55001/abc'; // attach to a Playwright server
```

When `Connect` is set, the `Headless` field is ignored — the external browser already decided whether it's visible.

### `ConnectType: 'cdp' | 'server' | 'auto'`

Forces the transport instead of letting the URL scheme decide. Default: `'auto'`.

You only need this for the **raw CDP websocket** case — a real Chrome's full CDP endpoint is `ws://localhost:9222/devtools/browser/<id>`, which scheme-detection would treat as a Playwright server.

```typescript
cfg.Connect = 'ws://localhost:9222/devtools/browser/<id>';
cfg.ConnectType = 'cdp';   // override scheme detection
```

If you're using the simpler `http://localhost:9222` form (most common), leave `ConnectType` unset.

### `ReuseExistingContext: boolean`

What context does the agent run in?

- `false` (default) — Even when attached, ComputerUse creates a **fresh isolated `BrowserContext`** inside the external browser. Cookies/auth/localStorage from your other tabs are not visible to the agent.
- `true` — Reuse the running browser's **first existing context** (the default context). The agent shares cookies, localStorage, sessions, etc. with your other open tabs.

```typescript
cfg.Connect = 'http://localhost:9222';
cfg.ReuseExistingContext = true;   // drive YOUR open tabs/session
```

Use `true` when you specifically want to inherit a user's logged-in session. Leave it `false` for everything else — it preserves isolation between agent runs.

> ⚠️ When reusing an existing context, viewport / user agent / `InitialLocalStorage` settings are **ignored**. Those only apply to contexts that ComputerUse creates itself.

---

## Where to wire the fields — three entry points

ComputerUse exposes attach mode at three layers, depending on which API you're using. Pick the one that matches your call site.

### Layer 1: `PlaywrightBrowserAdapter` (direct, single-engine)

For one-off automation, scripts, agent actions, or any code path that builds its own `RunComputerUseParams` and runs it through `ComputerUseEngine` / `MJComputerUseEngine`. This is the most common entry point.

```typescript
import {
    ComputerUseEngine,
    RunComputerUseParams,
    BrowserConfig,
} from '@memberjunction/computer-use';

const browserConfig = new BrowserConfig();
browserConfig.Connect = 'http://localhost:9222';

const params = new RunComputerUseParams();
params.Goal = 'Read my latest unread email and summarize it';
params.StartUrl = 'https://mail.google.com';
params.BrowserConfig = browserConfig;
// ...controller / judge / tools as usual...

const engine = new ComputerUseEngine();
const result = await engine.Run(params);
```

Same shape works for `MJComputerUseEngine` and `ComputerUseAction` — they both accept `BrowserConfig` via `params.BrowserConfig` and route it down to `PlaywrightBrowserAdapter`.

### Layer 2: `HeadlessBrowserEngine` (singleton, parallel-worker pool)

For the parallel-test path used by the testing framework. The engine is a process-wide singleton that pools `BrowserContext` instances under a single shared browser.

```typescript
import { HeadlessBrowserEngine } from '@memberjunction/computer-use';

// Attach the singleton to an external browser. First call wins —
// subsequent Initialize() calls are no-ops, so it's safe to call from every worker.
await HeadlessBrowserEngine.Instance.Initialize(
    true,                            // headless (ignored in attach mode)
    'ws://localhost:55001/abc',      // connect endpoint
    'auto',                          // optional: 'cdp' | 'server' | 'auto'
);

// All subsequent context requests share the attached browser:
const a1 = await HeadlessBrowserEngine.Instance.GetNew();
const a2 = await HeadlessBrowserEngine.Instance.GetRecycled('worker-0');
const a3 = await HeadlessBrowserEngine.Instance.GetIsolated('worker-1');

// ...run tests...

await HeadlessBrowserEngine.Instance.Shutdown();  // closes contexts; leaves browser alive
```

This is the path ComputerUseTestDriver uses internally. You typically don't call `Initialize()` yourself when you're authoring a test — you let the test driver do it via the test config (Layer 3).

### Layer 3: `ComputerUseTestDriver` test config (JSON, declarative)

For regression tests run by `@memberjunction/testing-framework`. Add three fields to your test's Configuration JSON and the driver wires the rest.

```json
{
    "headless": true,
    "maxSteps": 30,
    "viewportWidth": 1280,
    "viewportHeight": 720,

    "connect": "ws://playwright-server:55001/abc",
    "connectType": "auto",
    "reuseExistingContext": false,

    "controllerPromptName": "MJ: Computer Use Controller",
    "judgePromptName": "MJ: Computer Use Judge"
}
```

When `connect` is set, the test driver:
1. Initializes `HeadlessBrowserEngine` in attach mode for the parallel path.
2. Sets `BrowserConfig.Connect` on the engine's run params for the sequential / `"new-clean"` path.

> ⚠️ `HeadlessBrowserEngine` is a process-wide singleton. In a parallel test run, **every worker must agree on the same `connect` endpoint** — the first worker to initialize wins, and later workers see the already-attached browser. Mixing attach and launch within the same suite has undefined behavior. The convention: set `connect` at the suite level so all tests in the run share it.

---

## End-to-end recipes

### Recipe A — Drive your own Chrome with your SSO session

**1. Start Chrome with the DevTools port open** (and a separate profile so it doesn't fight your everyday Chrome):

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-agent
```

Sign into whatever services you want the agent to use (corp SSO, GitHub, Notion, etc.).

**2. Run an agent against it:**

```typescript
import { MJComputerUseEngine, MJRunComputerUseParams, BrowserConfig } from '@memberjunction/computer-use-engine';

const browserConfig = new BrowserConfig();
browserConfig.Connect = 'http://localhost:9222';
browserConfig.ReuseExistingContext = true;   // inherit your logged-in session

const params = new MJRunComputerUseParams();
params.Goal = 'Find the most recent PR on MemberJunction/MJ that touched ComputerUse and post a one-line summary in #engineering on Slack';
params.BrowserConfig = browserConfig;
params.ContextUser = contextUser;
// ...add prompts/tools/etc...

const engine = new MJComputerUseEngine();
const result = await engine.Run(params);
```

The agent drives the Chrome you have open and uses your existing logins.

### Recipe B — Share one Playwright server across parallel test workers

**1. Start a Playwright server somewhere** (Docker host, a shared dev box, anywhere reachable from your workers):

```typescript
// In a separate long-running process:
import { chromium } from 'playwright';
const server = await chromium.launchServer({ headless: true, port: 55001 });
console.log('Server up at', server.wsEndpoint());
// keep this process running...
```

**2. Point every test at it via the test config:**

```json
{
    "connect": "ws://playwright-server:55001/abc",
    "browserSession": "new",
    "controllerPromptName": "...",
    "judgePromptName": "..."
}
```

All test workers in this suite reuse the single server. The server stays alive across the suite — no per-test browser-launch cost.

### Recipe C — Attach to a containerized browser (Browserless, etc.)

Browserless and similar managed-browser services expose a Playwright-compatible WebSocket endpoint. You don't change anything about how you use ComputerUse — just point `Connect` at the service:

```typescript
const cfg = new BrowserConfig();
cfg.Connect = process.env.BROWSERLESS_WS!; // e.g. 'wss://chrome.browserless.io?token=...'
```

Same code, same flow. If the endpoint hands you raw CDP over a websocket, set `ConnectType = 'cdp'`.

---

## Ownership and lifecycle — what gets closed?

This is the most important property to understand. The rule is simple:

> **ComputerUse only tears down browsers and contexts that ComputerUse created.**

Concretely, when you call `Close()` (on `PlaywrightBrowserAdapter`) or `Shutdown()` (on `HeadlessBrowserEngine`):

| Resource | Default-launch behavior | Attach-mode behavior |
|---|---|---|
| The page(s) the agent created | Always closed | Always closed |
| A context we created via `newContext()` | Closed | Closed |
| A reused existing context (when `ReuseExistingContext: true`) | n/a | **Never closed** — your tabs stay open |
| The browser process | Closed | **Never closed** — your Chrome / your server stay running |

This means a script like this is safe:

```typescript
// Real Chrome is running on http://localhost:9222
const cfg = new BrowserConfig();
cfg.Connect = 'http://localhost:9222';
cfg.ReuseExistingContext = true;

const adapter = new PlaywrightBrowserAdapter();
await adapter.Launch(cfg);
await adapter.Navigate('https://example.com');
await adapter.Close();
// ↑ Your Chrome is still running. Your tabs are still open.
// The agent's page is closed. Nothing of yours was touched.
```

Same applies to `HeadlessBrowserEngine.Shutdown()` and even the process-exit cleanup handlers (SIGTERM / SIGINT) — they all skip `browser.close()` when the browser was attached, not launched.

---

## CDP vs Playwright server — which should I use?

| Your situation | Use |
|---|---|
| You want to drive a **real, visible Chrome** with extensions, profiles, SSO sessions | **CDP** — `chrome --remote-debugging-port=9222` |
| You want a **shared headless pool** for parallel test workers | **Playwright server** — `chromium.launchServer()` |
| You're using a **managed cloud browser** (Browserless, etc.) | Whichever they expose — most are Playwright servers (`wss://`) |
| You're attaching to a **Selenium Grid** node or other CDP-only endpoint | **CDP** |
| You only have one of the two available | Whichever you have |

Functionally they're equivalent inside ComputerUse — the same `BrowserConfig.Connect` field works for both, and the auto-detection picks the right Playwright call. The only meaningful difference is the kind of browser they let you talk to.

---

## Troubleshooting

### `Unrecognized connect endpoint "<endpoint>"`

Your `Connect` URL doesn't start with `http://`, `https://`, `ws://`, or `wss://`. Either fix the URL or set `ConnectType` to `'cdp'` or `'server'` explicitly to bypass scheme detection.

### `connect ECONNREFUSED 127.0.0.1:9222`

Nothing is listening at that port. Common causes:

- Chrome didn't actually start — check Terminal A for crash logs.
- You used the wrong port (Chrome prints the chosen port on stderr).
- A firewall is blocking the port.

### `Error: browser has been closed` mid-run

The external browser/server died while the agent was using it. ComputerUse doesn't try to reattach — start the browser back up and rerun. Pre-check the connection in your code if you want to fail fast:

```typescript
const adapter = new PlaywrightBrowserAdapter();
try {
    await adapter.Launch(cfg);
} catch (err) {
    console.error('Could not attach — is the browser running at', cfg.Connect, '?');
    throw err;
}
```

### Two workers attached with different `connect` endpoints in parallel

`HeadlessBrowserEngine` is a process-wide singleton — the first worker's endpoint wins. Subsequent workers silently reuse the first attached browser. Make sure every worker passes the **same** endpoint, or restructure so only one place sets it.

### My viewport / user agent settings are being ignored

You set `ReuseExistingContext: true`. Those settings only apply to contexts ComputerUse creates itself; a reused context uses whatever settings the original browser established. Either drop `ReuseExistingContext` or accept the existing context's settings.

### `Close()` killed my Chrome

That shouldn't happen — `Close()` honors ownership. If it does, something is wrong with the ownership flags. File an issue with a reproduction. As a quick check: did you call `Launch(cfg)` with a fresh `BrowserConfig` that has `Connect` set? Reusing an adapter that was already launched in launch-mode would close that launched browser when you call `Close()`, even if you then changed the config.

---

## Reference

- [`BrowserConfig`](../src/types/browser.ts) — `Connect`, `ConnectType`, `ReuseExistingContext`
- [`PlaywrightBrowserAdapter.Launch()`](../src/browser/PlaywrightBrowserAdapter.ts) — single-adapter attach
- [`HeadlessBrowserEngine.Initialize()`](../src/browser/HeadlessBrowserEngine.ts) — singleton attach
- [`ComputerUseTestConfig.connect`](../../MJComputerUse/src/test-driver/types.ts) — declarative test-driver attach
- [`ClassifyConnectEndpoint()`](../src/browser/connect-endpoint.ts) — the scheme-detection helper, exported in case you want to validate endpoints in your own code

For the upstream reference implementation that this feature mirrors, see [`@memberjunction/react-test-harness`'s `BrowserManager`](../../../React/test-harness/src/lib/browser-context.ts).
