# @memberjunction/mobile-app

React Native (Expo) mobile companion to MemberJunction — optimized for on-the-go
**conversation with MJ agents** and **read-only browsing** of entity / query /
dashboard data.

This package is the third UI in MemberJunction's **"one TypeScript brain, three
UIs"** model. It contains **no mock data**: every screen talks to a live MJAPI
through the exact same MJ object model (`Metadata`, `RunView`, `RunQuery`,
`GetEntityObject`, `GraphQLDataProvider`) that MJ Explorer uses on the desktop.
Only the presentation layer is new.

- Architecture, UX spec, and all 13 mockups:
  [`plans/mobile-app-react-native/README.md`](../../plans/mobile-app-react-native/README.md)
- Visual handoff (open in a browser):
  [`plans/mobile-app-react-native/index.html`](../../plans/mobile-app-react-native/index.html)
- Package-local deep dives: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
  [`docs/SCREENS.md`](docs/SCREENS.md) · [`docs/RENDERING.md`](docs/RENDERING.md) ·
  [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)

---

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────┐
│  UI (this package)  —  React Native + Expo Router, Hermes     │
│  app/** screens  →  src/hooks/*  →  src/data/services/*        │
└───────────────────────────────┬──────────────────────────────┘
                                 │  MJ object model (unchanged)
                    Metadata · RunView · RunQuery · GetEntityObject
                    GraphQLDataProvider.AI (agent runs)
                                 │  GraphQL over HTTP/WS
┌───────────────────────────────▼──────────────────────────────┐
│  MJAPI  (localhost:4001)  →  MemberJunction 5.x database       │
└──────────────────────────────────────────────────────────────┘
```

The RN app runs JavaScript on **Hermes**. The `@memberjunction/*` shared packages
(`core`, `core-entities`, `global`, `graphql-dataprovider`, `markdown-core`) run
**unchanged** in that runtime — the pluggability machinery (`@RegisterClass`,
`MJGlobal.ClassFactory`, `BaseSingleton`) survives intact. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full boot sequence,
RN-compat notes, and the class-registration story.

**Key dependencies:** Expo `~54`, React Native `0.81.5`, React `19.1.0`,
`expo-router ~6`, `expo-auth-session ~7` (Auth0 PKCE), `expo-secure-store` (tokens),
`react-native-mmkv` (cache + prefs), `react-native-svg` (charts),
`prismjs` + `marked` + `@memberjunction/markdown-core` (rendering).

---

## Prerequisites & setup

| Requirement | Notes |
|---|---|
| **Node 18+** | Installed at the monorepo root; this package is an npm workspace. |
| **Xcode** (26.x) + iOS Simulator | Required for `expo run:ios`. |
| **CocoaPods** | Native pods are installed under `ios/` (`pod install`). |
| **MJAPI on `:4001`** | Point it at a **MemberJunction 5.x** database. The mobile app expects `http://localhost:4001/graphql`. |
| **Auth0 dev tenant** | The `mjmobile://auth` callback URL must be registered (the BlueCypress dev tenant already is). |

Dependencies are installed from the **monorepo root**, never inside this package:

```bash
# from the MJ repo root
npm install
```

Start MJAPI separately (from `packages/MJAPI/`) with `GRAPHQL_PORT=4001` in its
`.env`, targeting a migrated 5.x DB.

### Configuration

Runtime config lives in [`src/config/env.ts`](src/config/env.ts):

- `graphqlUrl` — MJAPI GraphQL endpoint (default `http://localhost:4001/graphql`;
  the iOS Simulator can reach `localhost` directly).
- `graphqlWsUrl` — WebSocket subscription endpoint (`ws://localhost:4001/graphql`).
- `auth0Domain` / `auth0ClientId` / `auth0Scopes` — Auth0 native app (primary path).
- `msalTenantId` / `msalClientId` / `msalScopes` — Azure AD (ready, off the boot
  path until its RN redirect URI is registered).
- `devAuthToken` (+ optional `devAuth0RefreshToken` / `devAuth0AccessToken` /
  `devAuth0ExpiresAtMs`) — dev-only JWT fallback for ad-hoc API testing. **Leave
  empty in committed code**; paste a token only in your local working copy.

---

## Running the app

```bash
# from packages/MobileApp/

npm run start        # Expo Metro bundler (choose a target from the CLI)
npm run ios          # build + run on the iOS Simulator (needs Xcode)
npm run android      # build + run on Android (Phase 3 verification)
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint
```

Metro (`metro.config.js`) watches the workspace root so edits to any
`@memberjunction/*` package hot-reload the app. TypeScript paths map `@/*` →
`./src/*` for clean imports.

### Dev harness routes

Two routes exist purely for component development and are **not shipping screens**:

- **`/devchat`** — a scratch chat surface for exercising the send/agent-run path.
- **`/markdown-preview`** — renders sample markdown/artifact content through the
  native renderers (`MarkdownView`, charts, HTML) without a live conversation.

Deep-link to them in the simulator, e.g. `mjmobile://markdown-preview`.

---

## Project structure

```
packages/MobileApp/
├── app/                         # Expo Router screens (file-based routing)
│   ├── _layout.tsx              # Root shell: polyfills + gestures + safe-area + MJProviderRoot + Stack
│   ├── index.tsx                # Boot gate: routes to /conversations or /login by provider status
│   ├── login.tsx                # Auth0 / Microsoft / dev-JWT sign-in
│   ├── conversations.tsx        # Conversation list (home surface)
│   ├── new-conversation.tsx     # Compose + agent rail → creates a conversation
│   ├── chat/[id].tsx            # Chat thread (messages + composer + artifact dock)
│   ├── voice-mode.tsx           # Realtime voice call surface over @memberjunction/realtime-runtime
│   ├── profile.tsx              # Identity + preference toggles
│   ├── artifact/[id].tsx        # Single artifact detail (classified renderer)
│   ├── artifacts/[id].tsx       # Per-conversation artifact dock
│   ├── explorer/                # Data Explorer (read-only)
│   │   ├── index.tsx            #   hub (entity/query/dashboard counts + recents)
│   │   ├── entities.tsx         #   entity picker
│   │   ├── entity/[name].tsx    #   records for an entity (RunView)
│   │   ├── record/[id].tsx      #   record detail (GetEntityObject/InnerLoad)
│   │   ├── queries.tsx          #   saved-query picker
│   │   ├── query/[id].tsx       #   query results (RunQuery)
│   │   ├── dashboards.tsx       #   dashboard picker
│   │   └── dashboard/[id].tsx   #   dashboard viewer (parses UIConfigDetails)
│   ├── devchat.tsx              # DEV harness
│   └── markdown-preview.tsx     # DEV harness
└── src/
    ├── auth/                    # auth0.ts, msal.ts + their hooks (PKCE / MSAL, token refresh)
    ├── config/env.ts            # endpoints + auth config (do not commit tokens)
    ├── providers/
    │   ├── mj-provider.tsx       # MJProviderRoot: auth boot → GraphQL client → `useMJ()` context
    │   └── mmkv-storage-provider.ts  # MMKV-backed ILocalStorageProvider for MJ's cache
    ├── data/
    │   ├── services/            # agents.ts, conversations.ts, artifacts.ts, explorer.ts
    │   ├── adapt.ts             # MJ entities → UI-shaped view models
    │   ├── types.ts             # UI-shaped types
    │   └── preferences.ts       # MMKV-backed app preferences
    ├── hooks/                   # useConversations, useAgents, useExplorer (gate on provider ready)
    ├── components/
    │   ├── markdown/            # MarkdownView (markdown-core AST) + highlight.ts (prismjs)
    │   ├── charts/              # Chart dispatcher + Bar/Line/Pie (react-native-svg)
    │   ├── artifacts/html-renderer.tsx  # dependency-free HTML→RN subset renderer
    │   ├── AgentAvatarStack.tsx, Icon.tsx, MJStatusBanner.tsx
    ├── theme/tokens.ts          # design tokens (Colors/Spacing/Radius/Type/Shadow)
    ├── polyfills.ts             # URL + crypto.getRandomValues for Hermes (import first!)
    └── types/                   # ambient module declarations
```

---

## Auth model

Three auth paths, tried in priority order at boot (see
[`src/providers/mj-provider.tsx`](src/providers/mj-provider.tsx)):

1. **Auth0 OAuth + PKCE** (primary) — via `expo-auth-session`, redirect URI
   `mjmobile://auth`, scopes `openid profile email offline_access`. Tokens are
   stored in **`expo-secure-store`** and silently refreshed (rotating refresh
   tokens) by [`src/auth/auth0.ts`](src/auth/auth0.ts).
2. **MSAL (Azure AD)** — same library, different tenant; ready once the RN
   redirect URI is registered. See [`src/auth/msal.ts`](src/auth/msal.ts).
3. **Dev-JWT paste** (fallback) — a manually pasted JWT (`Env.devAuthToken` or the
   `mj-dev-token` secure-store key) for ad-hoc API testing without OAuth.

`MJProviderRoot` loads stored tokens (Auth0 → MSAL → dev), refreshes on expiry,
then calls `setupGraphQLClient(...)` with a token-getter callback so every GraphQL
request carries a fresh id_token. Only once the client is configured does the
provider report `status === 'ready'`; a 15 s hard timeout and a boot escape hatch
(`app/index.tsx`) prevent a hung MJAPI or bad token from locking the app.

---

## Data layer

Screens never write GraphQL by hand. The flow is **hook → service → MJ object
model → MJAPI**:

- **Services** (`src/data/services/*`) call the object model directly:
  - `conversations.ts` — `RunViews` over `MJ: Conversations` / `Conversation
    Details` / `Conversation Artifacts`; `GetEntityObject` + `Load` for a thread.
  - `agents.ts` — `RunView` over `MJ: AI Agents`; **writes** a user
    `Conversation Detail` and triggers an agent via
    `GraphQLDataProvider.AI.RunAIAgentFromConversationDetail` (the server owns the
    AI response row; the client polls/reloads when the push WebSocket is absent).
  - `artifacts.ts` — loads `MJ: Conversation Artifact Versions` content and
    **classifies** it (json-table / json / chart / html / code / markdown / text).
  - `explorer.ts` — `Metadata.Entities` / `Metadata.Queries` for pickers,
    `RunView` (simple + narrowed `Fields`) for records, `GetEntityObject` +
    `InnerLoad` for a record, `RunQuery` for saved queries, and a
    `UIConfigDetails` parser for dashboards.
- **Adapters** (`src/data/adapt.ts`) convert strongly-typed MJ entities into the
  UI-shaped view models in `src/data/types.ts` (agent colors, relative timestamps,
  message unions, recency buckets).
- **Hooks** (`src/hooks/*`) wrap services in a small `{ data, loading, error,
  refresh }` contract and are **gated on `status === 'ready'`** — before the
  provider is ready they return `null` so screens can render placeholders.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data-flow diagram.

---

## Artifact & markdown rendering

All rendering is **native** — no WebView, no `dangerouslySetInnerHTML`:

- **Markdown** — [`src/components/markdown/MarkdownView.tsx`](src/components/markdown/MarkdownView.tsx)
  parses to a token AST with `@memberjunction/markdown-core` (the same engine that
  drives the web `ng-markdown`) and renders it to `<View>`/`<Text>` primitives.
- **Code highlighting** — [`src/components/markdown/highlight.ts`](src/components/markdown/highlight.ts)
  uses `prismjs`'s tokenizer (no DOM) to emit colored `<Text>` runs.
- **Charts** — [`src/components/charts/`](src/components/charts) render Bar/Line/Pie
  with `react-native-svg`, driven by a tolerant `ChartSpec` parser
  ([`chart-spec.ts`](src/components/charts/chart-spec.ts)).
- **HTML** — [`src/components/artifacts/html-renderer.tsx`](src/components/artifacts/html-renderer.tsx)
  parses a flat HTML subset into RN views (covers agent "report HTML", not the web).
- **Artifact classification** — [`src/data/services/artifacts.ts`](src/data/services/artifacts.ts)
  sniffs content to pick a renderer.
- **Dashboards** — [`src/data/services/explorer.ts`](src/data/services/explorer.ts)
  walks the Golden-Layout `UIConfigDetails` tree into typed parts (view / query /
  artifact / weburl); parts that can't render natively degrade to a
  "desktop-optimized" placeholder.

Full details in [`docs/RENDERING.md`](docs/RENDERING.md).

---

## Preferences (MMKV)

Two separate `react-native-mmkv` instances (see
[`src/data/preferences.ts`](src/data/preferences.ts) and
[`src/providers/mmkv-storage-provider.ts`](src/providers/mmkv-storage-provider.ts)):

- **`mj-mobile-prefs`** — small, long-lived UI settings (appearance mode,
  default agent, voice/push/Face-ID toggles). Read/written reactively via MMKV's
  `useMMKVString`/`useMMKVBoolean` hooks. This is device-local app state,
  deliberately distinct from MJ's server-side `User Settings`.
- **`mj-mobile-cache`** — backs `MMKVStorageProvider`, MJ's
  `ILocalStorageProvider` for the data cache (kept separate so clearing the cache
  never wipes preferences).

---

## Testing

Unit tests use **Vitest**; the suite (and any E2E harness) lives under this
package.

```bash
npm test              # run the package unit tests
```

Test files are owned separately from documentation work — do not edit them here.

---

## Building (EAS)

`eas.json` defines three profiles:

- **development** — internal distribution, dev client, iOS Simulator build.
- **preview** — internal distribution on the `preview` channel.
- **production** — `production` channel with auto-incremented build numbers.

---

## What this app is, and what it reuses

The mobile app is a **host**, not a fixed set of screens. It reads the same
`MJ: Applications` metadata MJ Explorer reads and resolves each nav item's `DriverClass`
through the same `MJGlobal.ClassFactory` — against `BaseMobileResource` instead of
`BaseResourceComponent`. An application already running on the web appears here without a
parallel mobile definition. See
[`guides/MOBILE_APP_HOSTING_GUIDE.md`](../../guides/MOBILE_APP_HOSTING_GUIDE.md) and the worked
example in [`src/sample-app/`](src/sample-app/).

Orchestration is shared, not reimplemented:

| Concern | Shared package | What mobile supplies |
|---|---|---|
| Chat with agents | `@memberjunction/conversations-runtime` | The two `Conversation Detail` rows that frame a turn |
| Realtime voice | `@memberjunction/realtime-runtime` | A media host (microphone) and a WebRTC driver |
| Attachment policy | `@memberjunction/ai-core-plus` (`ConversationUtility`) | Reading bytes off the device |
| Data, permissions, agents, actions | `core` / `core-entities` / `graphql-dataprovider` | Nothing — used unchanged |

## Capability status

Verified means run and observed on a simulator or emulator against a live MJAPI — not merely
compiled.

| Capability | Status |
|---|---|
| Chat with agents (markdown, code, tables, artifacts) | **Verified** |
| Live agent progress | **Verified** — completion arrives over the push WebSocket; the former 2.5 s polling loop is gone |
| Application hosting + sample hosted app | **Verified**, incl. the "opens on desktop" fallback for unregistered nav items |
| Explorer surfaces (entities, records, queries, dashboards) | **Verified** |
| Record editing, biometric lock, offline queue | **Verified** |
| Attachments | **Verified** — small files inline per `ConversationUtility.ShouldStoreInline`; larger ones need a storage-capable host |
| Push token storage | **Verified** (per-device map, live) |
| Push delivery end-to-end | **Not verified** — needs a physical device; a simulator has no APNs |
| Realtime voice session lifecycle | **Verified** — mints, resolves a provider, declines cleanly when this build cannot carry it |
| Realtime voice audio | **Not verified** — needs a WebRTC-capable provider key (OpenAI Realtime or GPT-Live) and a physical device |
| Android | **Verified** — builds and runs on an Android 15 emulator |

### Realtime voice, precisely

The client transport is **WebRTC**. On GPT-Live, PCM on the data channel is forbidden — media
rides the tracks — so there is no PCM audio plane to implement, and the platform's WebRTC stack
supplies echo cancellation, noise suppression and a jitter buffer.

`react-native-webrtc` provides the peer connection, so the RN driver is a subclass overriding two
methods; the ~800 lines of wire protocol per provider are reused unchanged.

Providers this build can carry audio for: **OpenAI Realtime and GPT-Live** — the two WebRTC
providers. The WebSocket + PCM16 providers (Gemini Live, Grok Voice, ElevenLabs Agents, AssemblyAI)
need a Web Audio plane
that does not exist under Hermes; the app declines those with a message naming the provider rather
than opening a session that would be silent in both directions.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Auth (Auth0/MSAL/dev-JWT), chat read+write with agent runs, artifacts (classified renderers), Data Explorer (entities/records/queries/dashboards, read-only), Profile shell, MMKV cache + prefs | **Code-complete**; pending full on-device verification |
| **Phase 2** | Push notifications (per-device tokens), biometric lock, record editing | **Shipped** |
| **Phase 3** | Photo/file capture with real upload, offline mutation queue, Android | **Shipped** |
| **Phase 4** | App hosting, `conversations-runtime` adoption, realtime voice over WebRTC | **Shipped** — see below |

Live tracking: [`PLAN_CHECKLIST.md`](PLAN_CHECKLIST.md).
</content>
