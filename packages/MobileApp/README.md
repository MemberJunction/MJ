# @memberjunction/mobile-app

React Native (Expo) mobile app for MemberJunction. Phase 1 in progress.

## What this is

The mobile companion to MJ Explorer, optimized for on-the-go conversation with MJ agents and read-only browsing of entity / query / dashboard data. Full architecture, UX spec, and per-screen mockups live at:

- [`plans/mobile-app-react-native/README.md`](../../plans/mobile-app-react-native/README.md) — architecture + UX spec
- [`plans/mobile-app-react-native/index.html`](../../plans/mobile-app-react-native/index.html) — visual handoff with all 13 mockups

## Phase 1 status

- **Wave 1 — Foundation** ✅ in progress: Expo project, navigation shell, Apollo client, theme tokens, monorepo Metro config
- **Wave 2 — Shared-code refactor**: `IClientCacheStorage` in `graphql-dataprovider`, new `MobileCacheStorage` package
- **Wave 3 — Chat surface**: login, conversation-list drawer, chat thread, new conversation
- **Wave 4 — Artifacts**: dock handle, dock sheet, artifact detail
- **Wave 5 — Data Explorer**: hub, entity records, record detail, query run, dashboard view
- **Wave 6 — Profile**: settings shell

## Development

This package lives inside the MJ monorepo. All dependencies are installed from the workspace root:

```bash
# From the monorepo root
npm install
```

Once installed, from this package directory:

```bash
# Start the dev server (Expo Metro bundler)
npm run start

# Or directly target iOS Simulator (requires Xcode)
npm run ios

# TypeScript check
npm run typecheck
```

## Configuration

Dev configuration lives in [`src/config/env.ts`](src/config/env.ts):

- `graphqlUrl` — points at the local MJAPI at `http://localhost:4001/graphql` by default
- `devAuthToken` — Phase 1 auth bypass; paste a JWT minted from MJAPI for your dev user
- `graphqlWsUrl` — WebSocket subscription endpoint (Phase 3+)

Phase 2 will replace `devAuthToken` with a real auth flow (Expo MSAL or expo-auth-session) and store the token in `expo-secure-store`.

## Monorepo integration

- `metro.config.js` watches the workspace root so changes in any `@memberjunction/*` package trigger a reload.
- TypeScript paths use `@/*` → `./src/*` for clean imports inside the app.
- Workspace packages (`@memberjunction/core`, `core-entities`, `graphql-dataprovider`, `global`) resolve via npm workspace symlinks.

## Architectural notes

- **Pluggability preserved.** `@RegisterClass`, `MJGlobal.ClassFactory`, `BaseSingleton`, and decorator-based registrations all work unchanged in React Native (Hermes is spec-compliant for these features). See plan §6.
- **Cache abstraction (Wave 2).** `graphql-dataprovider` will be refactored behind an `IClientCacheStorage` interface so RN can plug in MMKV/SQLite while the web continues using IndexedDB. See plan §5.
- **Artifact rendering (per plan §4.3):**
  - Simple types (markdown / HTML / JSON / data tables / charts / code) get native RN renderers.
  - **Interactive Components** reuse [`@memberjunction/react-runtime`](../React/runtime/) directly — it's platform-agnostic by design. Phase 1 ships a "View on desktop" stub; Phase 2 wires the full runtime with an RN adapter for `ReactRootManager`.
  - **Markdown** needs a `@memberjunction/markdown-core` extraction to share parsing + extensions (Prism, Mermaid, code-copy, collapsible headings, SVG) with `@memberjunction/ng-markdown`. Phase 1 may ship a stripped-down RN renderer and fill parity from `markdown-core` as it lands.
