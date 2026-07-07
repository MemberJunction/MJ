# Screens

Every route in `app/**`, built from the actual code. Routing is **Expo Router**
(file-based): a file's path *is* its route, and `[param]` segments are dynamic.
The URL scheme is `mjmobile://`.

Data reaches screens through the hook → service → MJ object model chain
(see [`ARCHITECTURE.md`](ARCHITECTURE.md)); rendering is covered in
[`RENDERING.md`](RENDERING.md). Mockups live in
[`plans/mobile-app-react-native/html/`](../../../plans/mobile-app-react-native/html/).

---

## Shell & boot

### `app/_layout.tsx` — Root layout *(not a screen)*
- **Route:** wraps every route.
- **Purpose:** establish the global context tree and shared native stack.
- **Structure:** `GestureHandlerRootView` › `SafeAreaProvider` › **`MJProviderRoot`**
  › `StatusBar` + `Stack` (headerless, `slide_from_right`). Imports `@/polyfills`
  as its **first** line (must precede any `@memberjunction/*` import).
- **Data:** none of its own; `MJProviderRoot` owns the MJ auth/connection lifecycle
  exposed via `useMJ()`.
- **Mockup:** none (navigation shell).

### `app/index.tsx` — Boot gate — `/`
- **Purpose:** route on launch by MJ `status`: `ready` → `/conversations`, else
  → `/login`. Shows a "Connecting…" spinner while `loading`, an inline error card
  on `error`, and a 6 s escape hatch to force `signOut` if boot hangs.
- **Data:** `useMJ()` (`status`, `error`, `signOut`).
- **Interactions:** "Clear tokens & sign in again"; otherwise automatic `<Redirect>`.
- **Mockup:** none (boot gate).

---

## Auth

### `app/login.tsx` — Login — `/login`
- **Purpose:** authenticate and hand tokens to the MJ provider; gates the app.
- **Data:** `useMJ()` (`bootWithAuth0Tokens`, `bootWithMsalTokens`, `setDevToken`,
  `status`, `error`), `useAuth0Auth()`, `useMsalAuth()`.
- **Key components:** `LoginScreen`, `DevTokenSheet` (paste-JWT modal → `setDevToken`,
  stored in the iOS Keychain via `expo-secure-store`).
- **Interactions:** Continue with Auth0 (primary), Continue with Microsoft
  (secondary), Developer options (tertiary); on `ready` redirects to
  `/conversations`.
- **Mockup:** `login.html`.

---

## Chat

### `app/conversations.tsx` — Conversation list (home) — `/conversations`
- **Purpose:** the post-login home / navigation root; lists conversations grouped
  by recency (Pinned / Today / Yesterday / Earlier) with multi-agent avatar stacks,
  snippet, live dot, and message count.
- **Data:** `useConversations()` → `loadConversations` (RunViews over `MJ:
  Conversations` + `Conversation Details`, agent names from `MJ: AI Agents`);
  `groupConversations()` buckets them.
- **Key components:** `Section`, `ConversationRow` (→ `/chat/[id]`), `FooterNav`
  (→ `/explorer`, `/profile`).
- **Interactions:** pull-to-refresh, New conversation → `/new-conversation`, row
  tap → thread.
- **Mockup:** `conversation-list.html`.

### `app/new-conversation.tsx` — New conversation — `/new-conversation`
- **Purpose:** compose the first message, create the MJ conversation, hand off to
  the thread.
- **Data:** `useAgents()` (agent rail from `MJ: AI Agents`); `createConversation`
  (title = first ~6 words of the message).
- **Key components:** `NewConversationScreen`, `SUGGESTIONS` starter prompts.
- **Interactions:** type + Send, tap a suggestion to prefill, an agent pill
  prepends `@AgentName`, mic → `/voice-mode`; on create, `router.replace` →
  `/chat/[id]?autosend=<text>`.
- **Mockup:** `new-conversation.html`.

### `app/chat/[id].tsx` — Chat thread — `/chat/:id`
- **Purpose:** render one conversation + composer and drive send → agent-run →
  reply. Accepts an optional `?autosend=<text>` deep-link param.
- **Data:** `useConversation(id)`, `useConversations()`, `adaptConversation` /
  `adaptConversationToSummary`; `sendMessage` triggers the agent run and
  `getConversationDetailStatus` polls the AI `Conversation Detail` status (up to
  ~24× / 2.5 s) because the push WebSocket may not deliver completion on RN.
- **Key components:** `ChatHeader`, `RecentsStrip` (+ `RecentChip`),
  `MessageRenderer` (user bubbles with `@mention` parsing via `parseUserMessage`;
  agent blocks rendered with `MarkdownView`), `ArtifactDockHandle`
  (→ `/artifacts/[id]`), `Composer` (send, or mic → `/voice-mode`).
- **Interactions:** send with an optimistic pending bubble + live progress,
  pull-to-refresh, recents chips, deep-link autosend.
- **Mockup:** `chat-thread.html`.

### `app/voice-mode.tsx` — Voice mode — `/voice-mode`
- **Purpose:** Phase 1 **visual scaffold** — a fullscreen takeover with an animated
  orb, ripples, a static waveform, and a mock live transcript. Pushed from the chat
  and new-conversation mic buttons.
- **Data:** none yet — STT (record → Whisper → `Conversation Detail`) and TTS are
  Phase 2; the transcript is placeholder.
- **Interactions:** close/stop → `router.back()`; side controls are non-functional
  placeholders. (The dark background colors here are intentionally static, an
  allowed design-token exception for the immersive surface.)
- **Mockup:** `voice-mode.html`.

---

## Artifacts

### `app/artifacts/[id].tsx` — Artifact dock — `/artifacts/:id`
- **Route param:** `id` is the **conversation** id.
- **Purpose:** list all artifacts in a conversation, filterable.
- **Data:** `useConversationArtifacts(id)` → `loadConversationArtifacts` (RunView
  over `MJ: Conversation Artifacts`, joined with latest `Conversation Artifact
  Versions` for category/preview and `Conversation Details` for agent attribution).
- **Key components:** `ArtifactCard`, `FilterChip`, `AgentAvatarStack`.
- **Interactions:** filter row (All · per-agent · type: Tables/Charts/Documents);
  tap card → `/artifact/[id]`.
- **Mockup:** `artifacts-dock-open.html`.

### `app/artifact/[id].tsx` — Artifact detail — `/artifact/:id`
- **Route param:** `id` is the **artifact** id.
- **Purpose:** render one artifact by its classified `kind` (json-table / json /
  markdown / html / chart / code / text; interactive = Phase 2 "view on desktop").
- **Data:** `useArtifact(id)` → `loadArtifact` (`GetEntityObject('MJ: Conversation
  Artifacts')` + RunView over `MJ: Conversation Artifact Versions` for the latest
  `Content`, then `classify`).
- **Key components:** `ArtifactContent` (dispatcher), `CodeView`, `MarkdownView`,
  and the shared `HtmlRenderer`, `Chart`, `highlightCode`.
- **Interactions:** back → `router.back()`; mic → `/voice-mode`.
- **Mockup:** `artifact-detail.html`.

---

## Data Explorer (read-only)

> Distinction: **entity/query lists come from in-memory `Metadata`; records come
> from `RunView`; saved queries execute via `RunQuery`; single
> records/dashboards/artifacts use `GetEntityObject` + `Load`.**

### `app/explorer/index.tsx` — Explorer home — `/explorer`
- **Purpose:** hub with three nav tiles (Entities / Queries / Dashboards) + live
  counts.
- **Data:** `useExplorerCounts()` — entity/query counts from `Metadata`
  (`entityCount` / `queryCount`), dashboard count from a RunView over `MJ:
  Dashboards`.
- **Key components:** `Tile`.
- **Interactions:** tiles push to the three list routes.
- **Mockup:** `explorer-home.html`.

### `app/explorer/entities.tsx` — Entity picker — `/explorer/entities`
- **Purpose:** searchable entity picker.
- **Data:** `useEntities()` → `loadEntities()` reads `Metadata.Entities` (no
  network), filtered to user-browsable entities.
- **Interactions:** client-side filter; tap row → `/explorer/entity/[name]`.
- **Mockup:** `entity-records.html`.

### `app/explorer/entity/[name].tsx` — Entity records — `/explorer/entity/:name`
- **Purpose:** read-only card list of records for the chosen entity.
- **Data:** `useEntityRecords(name)` → `loadEntityRecords` resolves `EntityInfo`
  from `Metadata`, then `RunView`s the entity with a **narrowed field set**
  (`simple` result, title/subtitle projection). Pull-to-refresh re-runs the view.
- **Key components:** `RecordCard`.
- **Interactions:** tap card → `/explorer/record/[id]` (id + entity); FAB →
  `/new-conversation` ("Ask Skip").
- **Mockup:** `entity-records.html`.

### `app/explorer/record/[id].tsx` — Record detail — `/explorer/record/:id`
- **Route params:** `id` + `entity`.
- **Purpose:** read-only hero card + key/value FIELDS list.
- **Data:** `useRecordDetail(entity, id)` → `loadRecordDetail` uses
  `GetEntityObject(entity)` + `InnerLoad(CompositeKey.FromID(id))`, projecting
  displayable fields.
- **Interactions:** "Ask Skip" → `/new-conversation`.
- **Mockup:** `record-detail.html`.

### `app/explorer/queries.tsx` — Query picker — `/explorer/queries`
- **Purpose:** saved-query picker.
- **Data:** `useQueries()` → `loadQueries()` reads `Metadata.Queries` filtered to
  `Status === 'Approved'`.
- **Interactions:** client-side filter; tap row → `/explorer/query/[id]`.
- **Mockup:** `query-run.html`.

### `app/explorer/query/[id].tsx` — Query run — `/explorer/query/:id`
- **Purpose:** execute a saved query; render rows as key/value cards.
- **Data:** `useQueryRun(id)` → `runQuery` uses **`RunQuery`** (not RunView),
  returning `{ columns, rows, rowCount, success, errorMessage }`. Auto-runs on
  mount; re-runnable.
- **Interactions:** error state offers "Try again"; success offers "Ask Skip"
  → `/new-conversation`.
- **Mockup:** `query-run.html`.

### `app/explorer/dashboards.tsx` — Dashboard picker — `/explorer/dashboards`
- **Purpose:** dashboard picker with a desktop-oriented notice.
- **Data:** `useDashboards()` → `loadDashboards` (RunView over `MJ: Dashboards`).
- **Interactions:** tap row → `/explorer/dashboard/[id]`.
- **Mockup:** `dashboard-view.html`.

### `app/explorer/dashboard/[id].tsx` — Dashboard view — `/explorer/dashboard/:id`
- **Purpose:** best-effort mobile render of a dashboard's parts.
- **Data:** `useDashboard(id)` → `loadDashboard` uses `GetEntityObject('MJ:
  Dashboards')` + `Load`, parses the Golden-Layout `UIConfigDetails` JSON into
  typed parts, and resolves part-type names via RunView. Each `query` part runs
  through `useQueryRun` (`RunQuery`) and is auto-classified by `analyzeResult`.
- **Key components:** `PartCard` (dispatcher), `QueryPart`, `QueryResultView`,
  `ResultTable`, `ArtifactPart`, `DesktopOnlyPart`, `Panel`.
- **Interactions:** artifact part → `/artifact/[id]`; "Open on desktop" →
  `Linking.openURL`.
- **Mockup:** `dashboard-view.html`.

---

## Profile

### `app/profile.tsx` — Profile — `/profile`
- **Purpose:** identity, per-user preferences, and sign-out.
- **Data:** `Metadata().CurrentUser` (identity, gated on `status === 'ready'`);
  MMKV preferences via `react-native-mmkv` + `@/data/preferences`
  (`cycleAppearance`, `setDefaultAgent`); `useAgents()`; `useMJ()` (`signOut`,
  `authMethod`); workspace host from `Env.graphqlUrl`.
- **Key components:** `SettingRow`, `ToggleRow`, `AgentPickerModal`.
- **Interactions:** pick the default agent, cycle appearance, toggle
  voice/push/Face-ID (persisted but inert until Phase 2), sign out → `/login`.
- **Mockup:** `profile.html`.

---

## Dev harness *(not shipping screens)*

### `app/devchat.tsx` — `/devchat`
Deep-link-only QA harness: waits for `ready`, `createConversation('Markdown
demo')`, then `router.replace` → `/chat/[id]?autosend=<markdown-exercising
prompt>`. Exercises the full send/agent-run path end-to-end. No mockup.

### `app/markdown-preview.tsx` — `/markdown-preview`
Deep-link-only on-device render showcase (no auth/backend): renders sample content
through `MarkdownView` (markdown-core AST), `Chart` (pie/bar/line SVG), and
`HtmlRenderer` (HTML → RN, no WebView), fed by static fixtures. No mockup.
</content>
