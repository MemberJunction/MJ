# Architecture — MJ Mobile App

How the React Native app is put together, why it can reuse MemberJunction's
TypeScript core unchanged, and how a screen gets from "tap" to "data on glass".

Read alongside the repo-level plan
([`plans/mobile-app-react-native/README.md`](../../../plans/mobile-app-react-native/README.md)),
which covers the product-level "why RN" decision. This document is the
implementation-level companion for developers working inside
`packages/MobileApp/`.

---

## 1. One TypeScript brain, three UIs

MemberJunction's intellectual property lives in framework-agnostic TypeScript:
the entity object model, the AI/agent stack, and the GraphQL data provider. The
UI layer is deliberately thin. That lets MJ run **three** UIs over **one** brain:

| UI | Framework | Reuse of the TS brain |
|---|---|---|
| MJ Explorer | Angular (desktop/tablet) | full |
| (future) responsive web | — | full |
| **MJ Mobile** (this package) | **React Native / Expo** | full non-visual layer; **0%** UI reuse |

The mobile UI is a fresh codebase (RN has no Angular component reuse), but it
calls into the **same** `@memberjunction/*` classes. Nothing about the entity
model, agent runner, or provider is re-implemented here — this package is
presentation plus a thin service layer.

```
app/**  (Expo Router screens, React function components)
  │  useX() hooks — src/hooks/*
  ▼
src/data/services/*  (thin service functions)
  │  MJ object model
  ▼
Metadata · RunView/RunViews · RunQuery · GetEntityObject · GraphQLDataProvider.AI
  │  GraphQL over HTTP + WS
  ▼
MJAPI (:4001)  →  MemberJunction 5.x database
```

---

## 2. Provider / boot sequence

Everything hangs off **`MJProviderRoot`**
([`src/providers/mj-provider.tsx`](../src/providers/mj-provider.tsx)), mounted once
in the root layout ([`app/_layout.tsx`](../app/_layout.tsx)) inside the gesture and
safe-area providers.

`MJProviderRoot` exposes a React context consumed via `useMJ()`:

```ts
type MJState = {
  status: 'loading' | 'no-token' | 'ready' | 'error';
  error: Error | null;
  authMethod: 'auth0' | 'msal' | 'dev-token' | null;
  bootWithAuth0Tokens(tokens): Promise<void>;
  bootWithMsalTokens(tokens): Promise<void>;
  setDevToken(token): Promise<void>;
  signOut(): Promise<void>;
};
```

### Boot order

1. **Polyfills first.** `app/_layout.tsx`'s very first line is
   `import '@/polyfills'` — it must run before any `@memberjunction/*` import
   (see §5).
2. **Token discovery.** On mount, `MJProviderRoot` looks for a usable token in
   priority order:
   1. Auth0 tokens in `expo-secure-store` (refresh if expired via
      `getValidAuth0IdToken`).
   2. MSAL tokens in secure-store (refresh if expired).
   3. A stored dev JWT (`mj-dev-token` key).
   4. A compile-time `Env.devAuthToken`.
   5. Nothing → `status = 'no-token'` and the login screen takes over.
   (A dev-only step 0 seeds secure-store from `Env` when both an id_token and a
   refresh_token are supplied, so the normal Auth0 refresh path then owns it.)
3. **GraphQL client setup.** `bootWith(token, method)` builds a
   `GraphQLProviderConfigData(token, graphqlUrl, graphqlWsUrl, refreshCallback)`
   and calls `setupGraphQLClient(config)` from
   `@memberjunction/graphql-dataprovider`. The refresh callback returns a fresh
   id_token per request (Auth0/MSAL), so long sessions never send a stale token.
4. **Ready.** Only after `setupGraphQLClient` resolves does `status` flip to
   `'ready'`. A **15 s hard timeout** wraps setup so a hung MJAPI or bad token
   surfaces as `'error'` instead of an infinite spinner; `app/index.tsx` adds a
   6 s "force sign out" escape hatch on top.

### Why screens gate on `status === 'ready'`

The GraphQL client is a process-global singleton (`GraphQLDataProvider.Instance`).
Calling `RunView`/`RunQuery`/`GetEntityObject` before `setupGraphQLClient`
completes would fail. Every data hook therefore returns `null`/idle until
`status === 'ready'`, so screens can render a skeleton/placeholder and light up
the moment the provider is live.

---

## 3. Data flow (hook → service → object model → MJAPI)

The app has three thin layers between a screen and MJAPI. None of them contain
business logic — that lives server-side and in the shared MJ packages.

### Services (`src/data/services/*`)

Plain async functions over the MJ object model. They pick the right primitive:

- **`RunView` / `RunViews`** — dynamic set reads (conversation lists, entity
  records, artifact versions). `RunViews` (plural) batches independent reads into
  one round trip. Read-only card lists use `ResultType: 'simple'` with a narrowed
  `Fields` set for performance; anything that will be inspected/mutated uses
  `ResultType: 'entity_object'`.
- **`Metadata`** — in-memory entity/query definitions (the Explorer entity and
  query pickers read `Metadata.Entities` / `Metadata.Queries`; no network).
- **`GetEntityObject` + `Load`/`InnerLoad`** — a single strongly-typed record
  (conversation thread, record detail, dashboard, artifact).
- **`RunQuery`** — executes a saved, approved query by id (Explorer query runner
  and dashboard "query" parts).
- **`GraphQLDataProvider.Instance.AI.RunAIAgentFromConversationDetail`** — the
  agent runner. `agents.ts#sendMessage` writes a `Role='User'`
  `Conversation Detail`, pre-creates a `Role='AI' Status='In-Progress'`
  placeholder detail, then triggers the run; the **server owns** filling the AI
  detail. Because the push WebSocket is unreliable on RN, a failed WS wait is
  **not** a hard error — the UI polls the detail's `Status` for completion.

Entities touched (all via the strongly-typed generated classes): `MJ:
Conversations`, `MJ: Conversation Details`, `MJ: Conversation Artifacts`, `MJ:
Conversation Artifact Versions`, `MJ: AI Agents`, `MJ: Dashboards`, `MJ: Dashboard
Part Types`, `Dashboards`, plus arbitrary user-selected entities in the Explorer.

### Adapters (`src/data/adapt.ts` → `src/data/types.ts`)

Convert strongly-typed MJ entities into UI-shaped view models: agent avatar
colors/initials (`colorForAgent`), compact relative timestamps, a discriminated
`AdaptedMessage` union (`user` vs `agent`), and Pinned/Today/Yesterday/Earlier
recency buckets. Centralizing this keeps swapping/extending a data source a
one-call concern and keeps components free of entity-shape knowledge.

### Hooks (`src/hooks/*`)

Wrap a service in a small `{ data, loading, error, refresh }` state object, gated
on `useMJ().status === 'ready'`, with cancellation guards so a late fetch can't
set state after the id changes or the component unmounts. Examples:
`useConversations`, `useConversation`, `useArtifact`, `useConversationArtifacts`
(chat); `useAgents` (agent roster); `useEntities`, `useEntityRecords`,
`useRecordDetail`, `useQueries`, `useQueryRun`, `useDashboards`, `useDashboard`
(explorer).

---

## 4. Navigation shape (drawer-first)

Routing is **Expo Router** (file-based). `app/_layout.tsx` establishes a headerless
native **Stack** (`slide_from_right`) wrapped in `GestureHandlerRootView` +
`SafeAreaProvider` + `MJProviderRoot`.

The **design** is drawer-first, not tab-first: the **conversation list**
(`/conversations`) is the home surface, and Explorer / Profile are reached from it
(and from an edge-swipe drawer per the mockups) — there are **no bottom tabs**.
`app/index.tsx` is a boot gate: `ready → /conversations`, otherwise `→ /login`.

Route map (file path → route):

| File | Route |
|---|---|
| `app/index.tsx` | `/` (boot gate) |
| `app/login.tsx` | `/login` |
| `app/conversations.tsx` | `/conversations` (home) |
| `app/new-conversation.tsx` | `/new-conversation` |
| `app/chat/[id].tsx` | `/chat/:id` |
| `app/voice-mode.tsx` | `/voice-mode` |
| `app/profile.tsx` | `/profile` |
| `app/artifact/[id].tsx` | `/artifact/:id` (artifact id) |
| `app/artifacts/[id].tsx` | `/artifacts/:id` (conversation id) |
| `app/explorer/index.tsx` | `/explorer` |
| `app/explorer/entities.tsx` | `/explorer/entities` |
| `app/explorer/entity/[name].tsx` | `/explorer/entity/:name` |
| `app/explorer/record/[id].tsx` | `/explorer/record/:id` |
| `app/explorer/queries.tsx` | `/explorer/queries` |
| `app/explorer/query/[id].tsx` | `/explorer/query/:id` |
| `app/explorer/dashboards.tsx` | `/explorer/dashboards` |
| `app/explorer/dashboard/[id].tsx` | `/explorer/dashboard/:id` |
| `app/devchat.tsx`, `app/markdown-preview.tsx` | dev harness only |

`typedRoutes` is enabled (`app.json`), and the URL scheme is `mjmobile://`.
See [`SCREENS.md`](SCREENS.md) for the per-screen breakdown.

---

## 5. React Native compatibility notes

The shared MJ packages assume some Web/Node globals that Hermes doesn't provide.
[`src/polyfills.ts`](../src/polyfills.ts) fills the gaps and **must be imported
first**:

- **`URL` / `URLSearchParams`** — RN's built-ins are incomplete and throw on
  inputs the GraphQL/subscription clients pass; `react-native-url-polyfill/auto`
  installs WHATWG-complete versions.
- **`crypto.getRandomValues`** — `uuid` (used throughout the MJ layer for session
  ids) needs Web Crypto; it's backed by `expo-crypto`'s native CSPRNG (already
  linked, so no extra native module).
- **LogBox suppression** — the push-status WebSocket errors are expected on the
  simulator (agent runs fall back to polling), so those specific warnings are
  silenced to avoid looking like real failures.

Other RN-compat decisions:

- **Storage.** MJ's `ILocalStorageProvider` is implemented with MMKV in
  [`src/providers/mmkv-storage-provider.ts`](../src/providers/mmkv-storage-provider.ts).
  MMKV is a synchronous native key-value store; the provider folds categories into
  the key (`category:key`) and keeps a per-category key index so `ClearCategory` /
  `GetCategoryKeys` stay O(category size). Values are JSON-serialized — same
  contract as the web localStorage provider (Date/Map/Set do **not** survive the
  round trip; store plain data).
- **Hermes.** The engine is spec-compliant for the language features MJ's
  pluggability relies on (decorators via Babel, class fields, `Reflect`-free
  registration). No transpilation surprises for `@RegisterClass` / `BaseSingleton`.
- **New Architecture** (`newArchEnabled: true` in `app.json`) — Fabric/TurboModules.
- **Monorepo Metro.** `metro.config.js` watches the workspace root and resolves
  `@memberjunction/*` from workspace symlinks so shared-package edits hot-reload.

---

## 6. Class registration & pluggability

MemberJunction's extension model is pure TypeScript and works **unchanged** on RN:

- **`@RegisterClass` + `MJGlobal.ClassFactory`** — dynamic class resolution
  (entity subclasses, providers). Entity objects are always created through
  `Metadata.GetEntityObject<T>('Entity Name')`, never `new`, so the ClassFactory
  can hand back the registered subclass.
- **`BaseSingleton`** — process-global singletons via the Global Object Store
  (`GraphQLDataProvider.Instance` is the one this app leans on most).
- **Tree-shaking.** RN/Metro doesn't strip these the way ESBuild can, but the same
  discipline applies: registrations are reached through the imported package
  surface, and the app imports the provider/entity packages eagerly at boot.

The practical consequence: to talk to a new entity or use a new query, you write a
**service function** and a **hook** — you never touch the object model or add a
GraphQL document. The brain already knows how.

---

## 7. Where to go next

- [`SCREENS.md`](SCREENS.md) — every route: purpose, data sources, interactions,
  mockup reference.
- [`RENDERING.md`](RENDERING.md) — how markdown, code, charts, HTML, and
  dashboards render natively.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — conventions and how to add a
  screen/hook/service.
</content>
