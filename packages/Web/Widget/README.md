# @memberjunction/web-widget

A **droppable, embeddable public customer-support widget** (text today; voice in W4) for any
third-party website. A single `<script>` tag plus one mount element opens a support
conversation with a **pinned MJ agent** — **no MJ login required** — by minting a short-lived
**anonymous guest session** and reusing MemberJunction's unified agent pathway
(`ConversationsRuntime` + the GraphQL data provider). It does **not** reimplement chat or agent
dispatch.

Part of the [Agent Bridges & Public Widget program](../../../plans/realtime/bridges-and-widget/README.md)
(phases **W3+**). See [`public-web-widget.md`](../../../plans/realtime/bridges-and-widget/public-web-widget.md).

## Embedding (the entire integration)

```html
<div
  data-widget-key="pk_live_xxx"
  data-api-url="https://api.yourco.com"
  data-title="Acme Support"
  data-greeting="Hi! How can we help?"
></div>
<script type="module" src="https://cdn.yourco.com/mj-widget.js"></script>
```

The loader reads the `data-*` attributes, calls `POST /widget/session` to mint a guest JWT, and
mounts `<mj-support-widget>` **inside a shadow DOM** so host CSS cannot bleed in or out. See
[`examples/blank-host.html`](./examples/blank-host.html).

### Programmatic mount

```ts
import { mountWidget } from '@memberjunction/web-widget';
await mountWidget({ widgetKey: 'pk_live_xxx', apiUrl: 'https://api.yourco.com', mountTarget: '#support' });
```

## Architecture

```
host page → <mj-support-widget> (shadow DOM, design-token-scoped)
   ├─ WidgetSessionClient  →  POST /widget/session  (guest JWT, refreshed before expiry)
   └─ IWidgetTransport
        ├─ RuntimeWidgetTransport (prod): setupGraphQLClient(guest token) + ConversationsRuntime
        │     → AgentRunner.processMessage({ explicitAgentId: <pinned> })   ← D5
        └─ MockWidgetTransport (tests / offline demo)
```

- **Auth (D1, pluggable):** the guest session is an `anonymous-embed` magic-link token minted by
  MJServer's `WidgetSessionService`, validated by the same `AuthProviderFactory` path. Strategies:
  `Anonymous` (default), `MagicLinkUpgrade`, `HostIdentity` — selected per widget instance (W5).
- **Guardrails (D5):** the widget **always** passes the per-instance pinned `explicitAgentId`, and
  the synthesized guest principal carries the restricted **Widget Guest** role (read/create/update
  only on Conversations + Conversation Details). Pinning alone is not enough — see the
  [W0 findings](../../../plans/realtime/bridges-and-widget/spikes/W0-findings.md).
- **Isolation:** shadow DOM + `all: initial` on `:host`; `--mj-chat-*` tokens are injected into the
  **shadow root**, never `<head>`.

## Scripts

```bash
npm run build       # tsc → dist/ (ESM)
npm run bundle      # esbuild → dist/mj-widget.js (single-file browser ESM)
npm run bundle:min  # minified variant
npm run test        # vitest (jsdom): session client, element, loader
```

## Build & bundle status (overnight session)

- `npm run build` ✅ and `npm run test` ✅ (15 tests: mint, shadow-DOM isolation, send/receive,
  pinned-agent pass-through, refresh math, loader mount).
- `npm run bundle` ✅ produces a **self-contained** browser ESM (no unresolved node built-ins).
  It is currently large (~2.9 MB minified) because it bundles the full runtime + GraphQL provider;
  **tree-shaking / code-splitting the bundle is W6 packaging hardening**, tracked, not done here.
- **Live end-to-end** (`blank-host.html` against a running MJAPI completing a real turn) requires
  MJAPI booted with `widget.enabled=true` — **Auth0-gated** in the overnight sandbox. The code path
  is complete and ready; it was not faked.

## Not built here (anti-drift)

No new chat engine, no new realtime/voice driver, no new auth subsystem, no second agent-dispatch
path — all reused. Voice (W4), magic-link upgrade + host identity (W5), and bundle/abuse hardening
(W6) build on this package.
