# MemberJunction Mobile App — React Native Architecture & Phase 1 Plan

**Status:** Phase 1 feature-complete (code) — pending on-device verification
**Date:** 2026-05-18 (proposal) · 2026-05-19 (kickoff) · 2026-05-20 (Phase 1 code complete)
**Branch:** `an-mobile-app-dev`
**Supersedes:** The earlier PWA-based proposal that lived at `packages/Mobile/ARCHITECTURE.md` (removed via PR #1734)

> **Implementation status (2026-05-20):** Phase 1 is **code-complete** in `packages/MobileApp/`. The app boots on the iOS Simulator and renders the conversation list. Remaining before sign-off is **on-device verification of the full data path**, which is gated on adding the `mjmobile://auth` callback URL to the Auth0 dev tenant.
>
> **What's built (all wired to MJAPI via the MJ object model — no mocks):**
> - **Auth** — Auth0 OAuth + PKCE (primary, via `expo-auth-session`), MSAL (Azure AD, ready pending its redirect-URI registration), dev-JWT paste (fallback). Login screen gates the app; silent token refresh; sign-out. Tokens in `expo-secure-store`.
> - **Chat (read)** — conversation list grouped by recency with multi-agent avatar stacks; chat thread with per-message agent attribution, markdown, `@mention` highlighting, pull-to-refresh.
> - **Chat (write)** — composer creates a user `Conversation Detail` and triggers an agent via `GraphQLDataProvider.AI.RunAIAgentFromConversationDetail` with live progress; new-conversation flow creates the conversation + first message. Server owns the AI response row.
> - **Artifacts** — per-conversation artifact list + single-artifact detail rendering by classified kind (json-table / json / markdown / code / text), reading `Conversation Artifact Version` content.
> - **Data Explorer** — entity picker → records (RunView) → read-only record detail (`GetEntityObject`/`InnerLoad`); query picker → results (`RunQuery`); dashboard picker (best-effort viewer). "Ask Skip about this" bridge on every surface.
> - **Profile** — identity from `Metadata.CurrentUser`; preference toggles present (Phase 2 wires them).
>
> **Notable build/runtime fixes captured along the way:** monorepo hoisting of `expo-router` (babel-preset-expo gating), workspace-wide `react@19.1.0` override (RN renderer mismatch), MMKV `ILocalStorageProvider`, boot timeout + escape hatch.
>
> **Deferred to Phase 2** (designed-for, not yet wired): voice STT/TTS pipeline (the voice-mode screen is a visual scaffold), push notifications, biometric lock, record editing, interactive-component artifact rendering via `@memberjunction/react-runtime`, the shared `@memberjunction/markdown-core` extraction (a lightweight inline renderer stands in for now), and real dashboard part rendering.
>
> Original kickoff note follows for history. Open `index.html` in this folder for the visual handoff; open questions are in Part 11.

---

## Why This Document Exists

We previously explored a PWA-only path for MJ mobile. After working through the trade-offs (see "Decision Trail" at the end of this doc), we've landed on **React Native** as the right approach. This document captures:

1. Why RN over PWA, Capacitor, and Flutter
2. The architectural model — **one TypeScript brain, three UIs**
3. The Phase 1 scope (deliberately small: Data Explorer subset + Chat)
4. The one real refactor required in shared code (cache abstraction)
5. The pluggability story (`@RegisterClass`, ClassFactory, BaseSingleton — all preserved)

The PWA doc had the right instinct about reuse but oversold the user experience. RN gives us **native-quality UX** while still letting us share **~70% of the stack** — specifically, the entire non-visual TypeScript layer that contains the real intellectual property of MemberJunction.

---

## Part 1: Decision Summary — Why React Native

### The four options, scored against what matters for MJ

| Option | TS reuse | UI reuse | Native feel | Distribution | Team fit |
|---|---|---|---|---|---|
| **PWA (Angular as-is)** | ~95% | ~95% | **6/10** (WebView feel; iOS limits) | Browser only | Day-one |
| **Capacitor (Angular wrapped)** | ~95% | ~95% | **7/10** (WebView in native shell) | App Store ✅ | Day-one |
| **React Native** | **~70%** (cache refactor) | 0% (fresh mobile UI) | **9.5/10** (real native views) | App Store ✅ | Day-one (TS) |
| **Flutter** | **0%** (Dart ≠ TS) | 0% | 9.5/10 (Skia-rendered) | App Store ✅ | Weeks (new language) |

### Why RN wins for MJ

**Why not PWA / Capacitor:** Both render in a WebView. The "feel" gap vs. native is real and persistent — list scroll, keyboard handling, animations, gesture handling, cold start time all suffer. iOS adds specific pain: 7-day Safari eviction of unused PWAs, ~50 MB storage cap, no background sync, push only after the "Add to Home Screen" funnel completes. Enterprise B2B users compare mobile apps to Salesforce Mobile and Workday — both native. The "100% codebase reuse" sales pitch obscures that the *UI layer* would still be largely rewritten for mobile breakpoints regardless of which option we pick.

**Why not Flutter:** TS reuse is **zero**. Flutter is Dart, with no realistic bridge to our TS core. The options are (a) embed a JS engine and run TS via `flutter_js` (slow, ugly, debugging-hostile), (b) regenerate the entire MJ entity layer + AI packages + agent framework in Dart and maintain two parallel non-visual stacks forever, or (c) make the mobile app a thin RPC client over MJAPI with no local intelligence. None of those preserve MemberJunction's architectural advantages.

**Why RN works:** RN runs JavaScript (via Hermes). Our `@memberjunction/core`, `core-entities`, `ai`, `ai-prompts`, `ai-agents`, `graphql-dataprovider` (with one refactor — see Part 4), and `global` packages run **unchanged** in that runtime. The pluggability machinery (`@RegisterClass`, `MJGlobal.ClassFactory`, `BaseSingleton`, decorators, inheritance chains) is pure TypeScript and survives intact. Function components and hooks call into our OOP classes idiomatically — this is the dominant pattern in modern React, not a workaround.

### What we explicitly accept

- **The mobile UI is a fresh codebase.** No reuse of Angular components, templates, or styles. That's fine: we're building a deliberately smaller mobile product, not porting MJExplorer.
- **AI writes ~99% of the UI code.** With Claude/AI assistance, the cost of authoring RN components is low. The architectural overhead (two stacks to keep in sync) is the part AI doesn't eliminate — which is why Flutter's "AI can write Dart fast" argument doesn't save it.
- **App Store review is a fact of life.** We trade instant web deploys for native distribution. For enterprise mobile, this is a feature, not a bug — IT departments prefer App Store / MDM distribution.

---

## Part 2: Architectural Model — One TS Brain, Three UIs

```
┌────────────────────────────────────────────────────────────────────┐
│                          UI LAYER                                   │
│                                                                     │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────┐ │
│  │  MJExplorer        │  │  (Future) Mobile   │  │   Mobile     │ │
│  │  (Angular, desktop │  │  responsive web    │  │   (React     │ │
│  │   + tablet)        │  │  if useful         │  │   Native)    │ │
│  │                    │  │                    │  │              │ │
│  │  ✓ Today           │  │  ✓ Optional later  │  │  ✓ New       │ │
│  └────────────────────┘  └────────────────────┘  └──────────────┘ │
│           │                       │                       │        │
└───────────┼───────────────────────┼───────────────────────┼────────┘
            │                       │                       │
            └───────────────┬───────┴───────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────────┐
│              SHARED TYPESCRIPT BRAIN (unchanged)                    │
│                                                                     │
│  @memberjunction/global         — utilities, ClassFactory          │
│  @memberjunction/core           — BaseEntity, Metadata, RunView    │
│  @memberjunction/core-entities  — generated entity classes         │
│  @memberjunction/ai             — LLM abstraction                  │
│  @memberjunction/ai-prompts     — prompt runner                    │
│  @memberjunction/ai-agents      — BaseAgent framework              │
│  @memberjunction/graphql-       — Apollo client + pluggable cache  │
│    dataprovider                  (refactored — see Part 4)         │
│  @memberjunction/credentials    — auth management                  │
└────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                       MJAPI Server
                  (GraphQL + WebSockets,
                   unchanged)
```

### What this means concretely

- A `Metadata().GetEntityObject<ContactEntity>('Contacts')` call in an RN component runs the **exact same code path** as in MJExplorer.
- `@RegisterClass` registrations resolve through the same `ClassFactory` instance — no special "mobile registry."
- `BaseAgent` subclasses execute the same way. Skip agent runs from a phone work identically to runs from a desktop browser.
- New entities generated by CodeGen automatically flow to the mobile app via the shared `core-entities` package — no parallel generation, no porting.
- The only place mobile-specific work happens is the **RN UI layer** (screens, navigation, gestures, native modules).

This is the architectural payoff that makes RN worth the fresh-UI cost.

---

## Part 3: Phase 1 Scope — Deliberately Minimal

The earlier proposal tried to mirror Explorer on mobile. That's the wrong move. Mobile is **not a port** — it's a focused product for the workflows that actually make sense on a phone.

### Phase 1 features (full list)

#### 1. Chat with Agents
The conversational AI surface. This is the single highest-value mobile workflow.

- Open a conversation, send messages, receive agent responses
- Talk to existing agents (Skip, custom agents) via the existing agent framework
- View artifacts that agents produce inline (text, structured data, simple visualizations)
- Stream responses (server-sent events / WebSocket — same path Explorer uses)
- Voice input (defer to Phase 2 unless trivial — see "Phase 1 non-goals")

**Why this fits mobile:** Chat is the canonical mobile UX. Users already expect to text things on their phone. Voice and push extend it naturally in later phases.

**What we reuse:** All of `@memberjunction/ai-agents`, `ai-prompts`, the conversation entities (`MJ: Conversation`, `MJ: Conversation Detail`, artifacts entities), and the GraphQL conversation subscriptions. Zero new server work.

#### 2. Data Explorer (subset)
Three top-nav surfaces from Explorer, mobile-adapted:

**a. Entity Browser**
- List of entities the user has access to (filtered by permissions)
- Tap an entity → list of records (card-based, swipe actions)
- Tap a record → mobile record view (single-column, key fields prominent)
- Read-first. Edit is a Phase 2 question.
- **No grids.** Cards only on mobile.

**b. Queries**
- List of saved queries the user can run
- Tap a query → parameter form (if any) → results
- Results render as cards or simple tabular view depending on shape
- Save / share results out-of-scope for Phase 1

**c. Dashboards**
- List of dashboards
- Tap a dashboard → renders the dashboard component
- **Honest caveat:** most existing dashboards are built for desktop and **won't render well on mobile by default.** That's a known limitation we accept for Phase 1. We don't fix individual dashboards in this phase — we just provide the surface, and dashboard authors will eventually add mobile-aware layouts (a separate initiative).

### Phase 1 non-goals (explicit)

To prevent scope creep, these are **not** in Phase 1:

- ❌ Voice input/output (Phase 2 — Web Speech API doesn't exist in RN; would use a Whisper round-trip)
- ❌ Push notifications (Phase 2 — APNs/FCM wiring is non-trivial, server-side endpoint required)
- ❌ Offline mutations / queue (Phase 3 — read-only caching is fine for Phase 1)
- ❌ Biometric login (Phase 2 — `expo-local-authentication`, simple but not first-week work)
- ❌ Record editing / creation (Phase 2 — keeps Phase 1 read-only, eliminates a huge surface of bugs)
- ❌ Dashboard authoring or mobile-specific dashboard layouts (separate initiative)
- ❌ Photo capture, file upload, attachments (Phase 3)
- ❌ Settings/admin/configuration UIs (desktop-only)
- ❌ Anything from the rest of Explorer's nav (reports, AI Admin, etc.)

### Phase 1 navigation shape

```
┌────────── App root (after auth) ──────────┐
│                                            │
│   Chat thread (default screen)             │
│      ↑                                     │
│      │ tap hamburger / swipe edge          │
│      ↓                                     │
│   Conversation list (drawer)               │
│      │                                     │
│      ├─ Conversation rows → chat thread    │
│      ├─ Data Explorer link → explorer-home │
│      └─ Profile link → profile             │
│                                            │
└────────────────────────────────────────────┘
```

**No bottom tab bar.** Chat is the persistent default; the conversation-list drawer is the global nav root and contains links down to the Data Explorer and Profile surfaces. This pattern (drawer-only, following ChatGPT/Claude iOS conventions) keeps the chat thread visually uncluttered, which is essential because chat is the primary product. Data Explorer and Profile, being secondary, are reached via the drawer rather than competing for permanent screen real estate.

This choice is reflected throughout the mockups in Part 4.

---

## Part 4: Phase 1 UX Specification — Screen by Screen

This section is the implementation handoff. Each screen has a full-resolution mockup at `html/<screen>.html`, opened side-by-side in `html/index.html` (or the top-level `index.html` in this folder). The visuals are not suggestions — they are the design contract. Deviations should be discussed and reflected back into the mockups so this document stays the single source of truth.

### 4.1 Design system (cross-cutting)

| Token | Value | Use |
|---|---|---|
| Background | `#fafaf7` (warm off-white) | Page surface |
| Surface | `#ffffff` | Cards, sheets, composer, dock |
| Surface-2 | `#f6f5ef` | Inset panels, hover/pressed states |
| Ink | `#0d0d10` | Primary text |
| Ink-2 | `#4a4a52` | Secondary text |
| Ink-3 | `#8a8a93` | Tertiary text, labels |
| Line | `rgba(13,13,16,0.06)` | Hairline borders |
| Brand | `#264FAF` (MJ blue) | Mic button, primary brand, Skip identity |
| Positive | `#1a8a5f` | Wins, healthy state |
| Warn | `#b87a1f` | Caution, negotiation stage |
| Danger | `#c84a39` | High risk |

**Agent accent colors** (each agent gets a stable identity color):
- Skip → `#264FAF` (MJ blue)
- Research → `#7c5cd6` (purple)
- Account Analyst → `#d97757` (terracotta)
- Forecaster → `#1a8a5f` (green)
- Email Drafter → `#b87a1f` (amber)
- Fallback → `#4a4f5a` (slate)

**Type:** SF Pro (system). Body 15–16pt, agent attribution 11–12pt with PascalCase semantic spacing.

**Corner radii:** 14px (cards), 18–22px (sheets), 24px (composer), 50% (avatars, mic).

**Phone frame:** mockups assume iPhone 15-class viewport (393 × 852 logical pixels, Dynamic Island, home indicator).

### 4.2 Screens

#### A. Authentication

| File | Purpose |
|---|---|
| [`html/login.html`](html/login.html) | Single-screen sign-in with email + SSO options (passkey, Google, Apple). |

- **Data:** Existing MJ OAuth flow via `expo-auth-session`; passkey via WebAuthn through `expo-secure-store` for credential storage.
- **Interaction:** Email + Continue (magic link or password depending on tenant). SSO buttons launch in-app browser auth, return token to `expo-secure-store`.
- **Notes:** Logo block uses an "M" mark in MJ-blue gradient. Bottom legal note links to Terms/Privacy as in-app webviews.

#### B. Conversation surface (primary)

| File | Purpose |
|---|---|
| [`html/conversation-list.html`](html/conversation-list.html) | Drawer / global nav. Lists conversations grouped by Pinned / Today / Yesterday / Earlier. Footer rows link to Data Explorer and Profile. |
| [`html/new-conversation.html`](html/new-conversation.html) | Start screen when user taps "+ New conversation." Composer + suggested prompts + agent-pick rail. |
| [`html/chat-thread.html`](html/chat-thread.html) | The hero screen. Active conversation with multi-agent thread, step indicators, inline artifact card, action chips, collapsed artifact dock handle, and composer. |
| [`html/voice-mode.html`](html/voice-mode.html) | Fullscreen voice capture (Phase 2 design, designed-for in Phase 1). Animated orb, waveform, live transcript, controls. |
| [`html/artifacts-dock-open.html`](html/artifacts-dock-open.html) | The artifact dock pulled up. Shows all artifacts in the conversation, agent-filterable. |
| [`html/artifact-detail.html`](html/artifact-detail.html) | Single artifact zoomed to full screen. Tabs for Data / Chart / JSON, version selector, summary stats, sticky "Back to conversation" + "Ask Skip" bar. |

**Conversation list (drawer):**
- **Data sources:** `MJ: Conversation` for the list, `MJ: Conversation Detail` for the most-recent-message snippet, `MJ: Conversation Artifacts` count for badge. Sort by `__mj_UpdatedAt DESC`. Group rows client-side by relative recency.
- **Multi-agent visual:** Avatar stack on the left of each row. Distinct agents are derived from the `AIAgentID` referenced in the conversation's `Conversation Detail` rows (LEFT JOIN, distinct).
- **Interactions:** Tap row → enter chat thread for that conversation. Tap "New conversation" → `new-conversation.html`. Tap "Data Explorer" footer → `explorer-home.html`. Tap profile footer → `profile.html`. Long-press a row → action sheet (pin, rename, archive, delete) — Phase 1 minimum is pin + delete.
- **Live state:** Green dot on rows where an agent task is still in flight (`Status='In-Progress'` in the latest message).

**New conversation:**
- **Data sources:** Suggested prompts come from a static config or a `MJ: Conversation` template entity if one exists; agent rail comes from `MJ: AI Agents` filtered by `Status='Active'` and user-permission view.
- **Behavior:** Composer is the first focus. Pressing send creates a new `MJ: Conversation` + a `MJ: Conversation Detail` (user message) → routes to a fresh chat thread which then streams the agent response. Voice mic enters `voice-mode.html`.
- **Tapping a suggested prompt:** writes the prompt into the composer (or sends immediately, per the suggestion's `autoSend` flag).
- **Tapping an agent pill:** prefixes the composer with `@agent-name `.

**Chat thread (hero):**
- **Data sources:** `MJ: Conversation` (the open one), `MJ: Conversation Detail` (messages, ordered by sequence). Streaming via the existing `ConversationStreamingService` pattern (WebSocket). `MJ: Conversation Artifacts` + `MJ: Conversation Artifact Versions` for inline rendering and the dock.
- **Top nav:**
  - Left: hamburger → opens conversation-list drawer.
  - Center: conversation title (from `MJ: Conversation.Name` or auto-derived) + a stacked avatar row showing every distinct agent that has participated (`SELECT DISTINCT AgentID FROM ConversationDetail WHERE ConversationID=...`) and message count. **No agent picker chip** — the conversation is multi-agent.
  - Right: `+` opens `new-conversation.html`.
- **Recent conversations strip (under top nav):** horizontally scrollable. First chip is the active conversation (dark, with live-pulse dot), then 3–5 most recent. Each chip shows a tiny avatar stack representing participating agents. Tap → switch to that conversation without leaving the chat surface.
- **Messages:**
  - User messages: right-aligned, `--user-bg` background bubble, top-right and bottom-left rounded corners.
  - Agent messages: full-width, no bubble. Top row shows agent avatar + name + duration. Below that, step indicators (checkmarks for "Queried X · 12 rows", etc.) rendered as small dim text. Then the message body. Then any inline artifact card. Then action chips (suggested follow-ups).
  - `@mention` parsing: `@research`, `@skip`, etc. are highlighted in user message bodies (semibold, no special color needed — matches existing Explorer parsing).
- **Inline artifact card:** small framed card with brand-color icon, type label, title, meta line, 2–3 row preview, and a "View" footer link. Tap → `artifact-detail.html`.
- **Action chips:** rendered from the agent's `SuggestedResponses` (existing MJ pattern). Tap a chip → append text to composer; for `autoSend` chips, send immediately.
- **Collapsed artifact dock handle (~32px):** above the composer. Shows artifact count + tiny agent-color dot stack + chevron. Tap or swipe up → `artifacts-dock-open.html`. Auto-pulses briefly when a new artifact is produced, then returns to resting state.
- **Composer:** placeholder text `"Reply or @mention an agent…"`. Mic button (brand color) on the right — tap → `voice-mode.html`. No attachment button in Phase 1 (phase 3).

**Voice mode (Phase 2 design, Phase 1 visual scaffold):**
- **Phase 1:** Tapping the mic from any thread navigates here and shows the visual mockup. The actual STT pipeline is stubbed. The screen is functional as a placeholder for the "voice-soon" experience but does not record.
- **Phase 2 wiring:** `expo-av` `Audio.Recording` → upload `audio/webm` blob to MJAPI → Whisper transcription → submit transcribed text as a new `Conversation Detail` to the active conversation. Live transcript is rendered from streaming partial results (if available); otherwise final-only.
- **Visual:** Status bar / Listening pill (top-left), conversation title (center), close (top-right). Center stage: animated breathing orb with double ripple. Below: waveform from `MediaRecorder` amplitude data. Below that: glass-effect transcript card showing live (or interim) text. Bottom: keyboard mode | stop (red) | menu, with hint "Tap to stop · swipe right for keyboard."

**Artifacts dock open (bottom sheet):**
- **Snap points:** half-screen and full-screen. Drag handle + chevron-down at top to dismiss.
- **Filter row:** All (count) · Agent chips (each with avatar dot) · Type chips (Tables / Charts / Documents).
- **Card list:** each card shows agent attribution (via tiny avatar), type, title, meta, and a content preview snippet (rows for tables, bullets for documents, summary line for charts).
- **Tap a card:** opens `artifact-detail.html`.

**Artifact detail:**
- **Tabs:** Data (default) · Chart · JSON. Per artifact type, irrelevant tabs are hidden.
- **Version selector:** top-right "v2 of 2 ⌄" → action sheet to switch versions (`MJ: Conversation Artifact Versions`).
- **Summary stats:** 3 inline KPIs (computed from the artifact payload — total, weighted, count for a data table).
- **Body:** type-specific renderer. Data tables → card list. Charts → SVG. JSON → syntax-highlighted readonly view.
- **Sticky bottom bar:** "Back to conversation" (primary) + "Ask Skip" mic button (secondary). The mic button opens voice mode with the artifact attached as context (sent as a system note in the new message).

#### C. Data Explorer (secondary)

| File | Purpose |
|---|---|
| [`html/explorer-home.html`](html/explorer-home.html) | Hub. Tile grid (Entities / Queries / Dashboards) + recently-viewed list + search. |
| [`html/entity-records.html`](html/entity-records.html) | Records inside a chosen entity (default opens with the user's default view). Card layout, never a grid. |
| [`html/record-detail.html`](html/record-detail.html) | Read-only single-record detail. Key field hero + sections (Key details / Owner / Related) + "Ask Skip about this" CTA. |
| [`html/query-run.html`](html/query-run.html) | Query results. Compact parameter chip card at top + ranked card results + "Ask Skip" CTA. |
| [`html/dashboard-view.html`](html/dashboard-view.html) | Mobile-best-effort dashboard render. Mobile notice banner at top, panel cards, desktop-stub for parts that don't fit. |

**Explorer home:**
- **Data sources:** `Metadata.Entities` count (entities filtered by user's permission), `MJ Queries` count (filtered to ones user can run), `Dashboards` count (filtered to shared-with-user). Recently-viewed comes from a local store of last-viewed IDs (in MMKV).
- **Interaction:** Tap a tile → entity/query/dashboard list (entity list is implied — uses the same card pattern as record list but listing entity names; not shown as a separate mockup because it's a trivial variation). Tap a recent → directly to that resource.

**Entity records:**
- **Data sources:** `RunView` against the chosen entity. Default filter from the user's last-used view (`MJ: User View`) if present, else the entity's default view. `ResultType: 'simple'` with `Fields` narrowed to display columns for performance — see CLAUDE.md note on RunView Fields optimization.
- **Card content:** title (primary display field), secondary (amount or status), tertiary line (related entity + close date + stage). Stage pills use the same color palette as artifact records.
- **Filters bar:** Persisted to local store. "All open / Closing this month / My team / >$50K / At risk" are illustrative — should be derived from the entity's saved views in the actual implementation.
- **FAB:** "Ask Skip about these" — opens a new conversation pre-filled with context describing the current filter set. Implementation: serialize the active `RunViewParams` and inject as a system note in the new `Conversation Detail`.

**Record detail:**
- **Data sources:** `Metadata.GetEntityObject<EntityType>(entityName, contextUser)` + `.Load(id)`. Display all fields with `IncludeInUserSearchAPI=true` (or a similar mobile-readiness flag if we add one) plus the relationship counts.
- **Hero card:** Most important field at the top (amount for opportunities, name for contacts, etc.) followed by name, then tag row with stage and meta, then progress bar (if applicable).
- **Sections:** Key details (label/value pairs), Owner (avatar + name + last-update timestamp), Related (counts of related entities with arrow to drill in — Phase 1 navigates to those related lists).
- **Read-only.** No edit. Phase 2 enables edit.
- **Sticky "Ask Skip about this" bar.** Opens a new conversation with the record reference as context.

**Query run:**
- **Data sources:** `RunQuery` engine. Parameters come from the query's `MJQueryParameter` definitions; their values default from last-run (stored in MMKV per query ID).
- **Top params card:** Each param as a chip (`key: value`). "Edit params" opens a sheet to modify; "Re-run" re-executes.
- **Results bar:** count + total + sort indicator.
- **Result cards:** generic card with title + risk/status pill + meta row. Risk meter at bottom if applicable.
- **Sticky "Ask Skip about these accounts" bar.** Opens a new conversation pre-filled with the query name + result set as context.

**Dashboard view:**
- **Data sources:** existing `<mj-dashboard-viewer>` rendering pipeline, adapted to render its parts in a stacked single-column layout.
- **Mobile notice:** persistent warning banner explaining that dashboards may be desktop-optimized.
- **Panel cards:** each `DashboardPart` renders into a card. Common types (KPI grid, line chart, list) get native mobile renderers. Complex/desktop-only types render as a "Desktop-optimized" placeholder card with "Open on desktop" CTA.
- **Sticky "Ask Skip about this dashboard" bar.** Opens a new conversation with the dashboard reference as context.

#### D. Profile

| File | Purpose |
|---|---|
| [`html/profile.html`](html/profile.html) | User identity, preferences, account settings, sign-out. |

- **Data sources:** Current user from auth context. Preferences stored in MMKV + a "MJ: User Preference" entity (or use existing `UserInfoEngine` settings — TBD during implementation).
- **Sections:**
  - Hero: avatar, name, email, org pill
  - Preferences: Default agent (link, opens a picker), Appearance (System / Light / Dark — Phase 1 may ship Light only with this as a stub), Voice responses (toggle, Phase 2 wires this), Push notifications (toggle, Phase 2 wires this)
  - Account: Face ID app lock (toggle, Phase 2), Connected workspace (informational), Help & feedback (link)
  - Sign out
- **Phase 1 wired:** Default agent picker, sign-out, workspace info, help link. Toggles are visible but inert (Phase 2).

### 4.3 Artifact rendering — types and the interactive-component path

Artifacts come in several flavors, and the rendering story is **different per type**. This is a load-bearing piece of the chat experience because artifacts are how agent output graduates from prose to something you can actually use.

#### Type-by-type plan

| Artifact type | Mobile renderer | Effort |
|---|---|---|
| **Markdown / text** | Native RN — see "Markdown — share the engine, not the view" below. **Not** a simple drop-in `react-native-markdown-display`. | Medium |
| **HTML** | Native RN — render via `react-native-render-html` (stable, well-maintained). For untrusted HTML, sanitize on the server before render. | Low–Medium |
| **JSON** | Native RN — collapsible tree view. Either roll our own or use `react-native-collapsible` with a custom recursive renderer. | Low |
| **Data table / "Data Snapshot"** | Native RN — card list (as shown in `artifact-detail.html`). Avoid actual tables on phone width. | Low |
| **Chart** | Native RN — `victory-native` or `react-native-svg-charts` for line/bar/area; matches the mockup style in `dashboard-view.html`. Skia (`@shopify/react-native-skia`) is the higher-fidelity option if we need it later. | Medium |
| **Code** | Native RN — `react-native-syntax-highlighter` with Prism, monospace font. Read-only. | Low |
| **Interactive Component** (agent-authored React component) | **Reuse [`@memberjunction/react-runtime`](../../packages/React/runtime/) directly** — see below. | Medium–High (one-time integration; per-component cost zero after that) |
| **Custom (partner `MJArtifactType`)** | Plugin via the existing `MJArtifactType` registry — partners ship an RN-compatible renderer alongside their type. | Per-partner |

#### Interactive components — reusing `@memberjunction/react-runtime`

MJ has two relevant packages today:

- **[`@memberjunction/react-runtime`](../../packages/React/runtime/README.md)** — described in its own README as "Platform-agnostic React component runtime for MemberJunction." Provides Babel-standalone JSX compilation, component registry (LRU-cached, namespace-aware, ~1000 components), dependency resolution, library management, error boundaries, prop building, and a managed React root. **This is the heavy lift, and the user has confirmed we want to reuse it as-is on mobile.**
- **`@memberjunction/ng-react`** — the Angular bridge that hosts React components inside Angular's view system. **We do NOT use this in RN.** We're already in React land; no bridge is needed. The Angular package is for the desktop Explorer only.

**What's compatible out of the box (pure JS, no DOM):**
- `ComponentCompiler` (Babel standalone — runs in any JS engine including Hermes)
- `ComponentRegistry` (in-memory Map with LRU eviction)
- `ComponentResolver` and `ComponentManager` (resolution + load+compile+register orchestration)
- `LibraryLoader`, `LibraryRegistry`, `CacheManager`, `ResourceManager`, `PropBuilder`
- Error boundary creation logic (the *boundary class itself* is just `React.Component`)

**What needs adapting:**
- `ReactRootManager` — assumes `react-dom`'s `createRoot` for mounting. **In RN we don't mount roots that way** — we render React elements into the RN view tree directly. The right pattern is for the mobile artifact renderer to call `ComponentManager.LoadComponent(spec)` to get a compiled React component class, then render `<CompiledComponent {...props} />` inside an RN container. The "root manager" abstraction becomes a no-op (or thin shim) in RN because RN owns the root.
- **DOM-element JSX**: Components authored for desktop may use `<div>`, `<span>`, `<button>`, etc. These don't exist in RN. Two ways to handle this:
  1. **Shim layer** — translate web primitives to RN equivalents (`<div>` → `<View>`, `<span>` → `<Text>`, `<button>` → `<Pressable>`, with style normalization). A library exists for this pattern (`react-native-web` does the inverse; we'd need the forward direction) but a small custom shim covering the top 10 primitives is realistic.
  2. **Constrain authoring** — require interactive components targeting mobile to use RN primitives directly (or a small MJ-provided component library that abstracts both). This is cleaner long-term and probably the right Phase 1 default; the shim is a Phase 2 enhancement if we need broad backward compatibility.
- **Library loading on mobile**: `LibraryLoader` fetches third-party libs at runtime. In RN this is more constrained (no CDN by default; bundle size matters; some libs assume DOM). For Phase 1, **limit to MJ-curated libraries** that are known RN-safe.

#### Markdown — share the engine, not the view

MJ's existing markdown rendering is **not stock markdown**. `@memberjunction/ng-markdown` ships:

- **Prism.js syntax highlighting** for code blocks
- **Mermaid diagram** rendering
- **Custom extensions** in [`packages/Angular/Generic/markdown/src/lib/extensions/`](../../packages/Angular/Generic/markdown/src/lib/extensions/):
  - `code-copy.extension.ts` — copy-to-clipboard affordance on code blocks
  - `collapsible-headings.extension.ts` — headers that toggle sections
  - `svg-renderer.extension.ts` — inline SVG rendering
- A `MarkdownService` that orchestrates these

If we just install `react-native-markdown-display` on mobile, **we lose all of that** and immediately have two divergent markdown experiences across desktop and mobile. Worse, every new extension authored for one will silently miss the other.

**The right move is the same pattern as `react-runtime`: extract the platform-agnostic engine and let each UI provide the renderer.**

A new package — call it `@memberjunction/markdown-core` (or `@memberjunction/markdown-engine`) — should own:

- The `marked` (or replacement) parser configuration
- All custom extension logic (`code-copy`, `collapsible-headings`, `svg-renderer`, and future ones)
- An AST output (or a tokenized intermediate) rather than HTML
- Prism syntax-highlighting orchestration (returning tokens, not HTML spans)

Then:

- `@memberjunction/ng-markdown` becomes a thin Angular renderer that consumes the AST → DOM. Existing behavior preserved.
- A new `@memberjunction/rn-markdown` (Phase 1, in `packages/MobileApp/` initially; promote to its own package once stable) consumes the same AST → RN `<View>`/`<Text>`/`<Pressable>` tree. Code blocks render with `react-native-syntax-highlighter` using Prism tokens. Mermaid renders via SVG (RN supports SVG natively via `react-native-svg`). Code-copy uses `expo-clipboard`. Collapsible headings are a small RN-specific component.

**Effort:** the extraction is one-time and modest — the extensions are already separated cleanly. The payoff is permanent: any new markdown feature (footnotes, callouts, math, etc.) lands in `markdown-core` once and flows to both UIs.

**Phase 1 carve-out:** if the extraction lands too late to be the foundation, ship a stripped-down RN markdown renderer initially (Prism via `react-native-syntax-highlighter`, no collapsible headings, no code-copy, Mermaid as a "View on desktop" stub). Track parity items as a list and close them as `markdown-core` lands. Do **not** ship a parallel RN-only extension implementation — that's the divergence trap we're explicitly avoiding.

#### Phase 1 vs. Phase 2 split

- **Phase 1 ships:** Markdown, HTML, JSON, Data table/snapshot, Chart, Code renderers — all native RN. Plus a stub for "Interactive Component" artifacts that displays a "View on desktop" card with a deep link (similar to the dashboard's desktop-stub pattern). This is the honest answer for Phase 1: we don't ship interactive components without integrating the runtime, and rushing the runtime integration would risk the chat experience.
- **Phase 2 ships:** Full `@memberjunction/react-runtime` integration with the RN adapter described above. At that point the "View on desktop" fallback goes away for components authored against the mobile-safe primitive set.

#### Investigation tasks for the implementing agent

Before committing to the full runtime integration, verify:

1. **Babel standalone in Hermes:** confirm `@babel/standalone` (or whatever specific build `react-runtime` uses) parses and emits valid JS that Hermes can execute. (Hermes is mostly ES spec-compliant but has some quirks.)
2. **Bundle impact:** Babel standalone is ~2 MB minified. Validate that lazy-loading the runtime (only when an interactive artifact arrives) keeps app startup fast.
3. **JSX runtime selection:** confirm the runtime's emitted code can be configured to use the `react/jsx-runtime` automatic JSX transform, which RN supports.
4. **Shim feasibility:** prototype a minimal `<div>`/`<span>`/`<button>` shim mapping to `<View>`/`<Text>`/`<Pressable>` and run it against 2–3 representative desktop-authored interactive components. Decide whether we ship the shim (Phase 2) or require RN-native authoring (cleaner, less back-compat).

The decision tree above stays in this document and gets updated as those investigations close.

---

### 4.4 Cross-cutting interactions

- **"Ask Skip" pattern (Data Explorer → Chat bridge):** every Explorer surface has a CTA that creates a new conversation with the current context attached. Implementation: a `ConversationContext` payload (record ID + entity name, or query ID + params, or dashboard ID) is added as a system-role `Conversation Detail` when the new conversation is created. Skip is the default agent for these bridges; users can reroute with `@mention`.
- **Edge gestures:** swipe right from the left edge of the chat thread → opens conversation-list drawer (same as tapping hamburger). Swipe down on the dock handle → opens dock sheet. Swipe down on dock sheet → dismiss.
- **Long-press on a message:** action sheet (Copy / Pin / Retry [error only] / Delete [user-only]). Phase 1 minimum: Copy + Pin.
- **Pull-to-refresh:** on conversation list and entity records, refresh the underlying RunView.
- **Empty states:** every list surface has an empty state — Phase 1 ships a single illustration-free, copy-driven empty state per list ("No conversations yet — start one →").
- **Error states:** generic "Couldn't load · Try again" card with retry button, used uniformly across all data-fetching screens.

### 4.5 Animation notes

- Dock handle pulse: 600ms ease-out scale 1 → 1.05 → 1, runs once when a new artifact arrives.
- Sheet snap: rubber-band at half-screen and full-screen, react-native-reanimated v3 spring.
- Voice orb: 1.6s breathing scale 1 → 1.04 (idle); 1.4s pulse 1 → 1.05 (active); ripple borders fading out at 2.2s.
- Conversation transitions: standard `expo-router` push (slide-from-right on iOS, fade-up on Android).

---

## Part 5: The One Refactor Required — Cache Abstraction

> **Implementation update (2026-05-19):** This work turned out to be ~90% already done. `ILocalStorageProvider` is defined in [`@memberjunction/core/src/generic/interfaces.ts`](../../packages/MJCore/src/generic/interfaces.ts) and [`@memberjunction/graphql-dataprovider`](../../packages/GraphQLDataProvider/src/storage-providers.ts) already ships `BrowserStorageProviderBase` (in-memory), `BrowserLocalStorageProvider`, and `BrowserIndexedDBStorageProvider`. The "refactor" is just **adding a new MMKV-backed implementation for RN** — done in [`packages/MobileApp/src/providers/mmkv-storage-provider.ts`](../../packages/MobileApp/src/providers/mmkv-storage-provider.ts). No changes needed in `core` or `graphql-dataprovider`. The original phrasing below describes what would have been required had the abstraction not already existed; preserved for context.

---

`@memberjunction/graphql-dataprovider` currently uses **IndexedDB** for its client-side cache. IndexedDB doesn't exist in React Native (no DOM). This is the one piece of shared code that needs to change.

### What to do

Abstract the cache storage behind an interface. The web keeps IndexedDB. RN gets a mobile-appropriate backend (likely **MMKV** for hot data, **expo-sqlite** for larger structured data).

```typescript
// New interface — sketch
export interface IClientCacheStorage {
  Get<T>(key: string): Promise<T | null>;
  Set<T>(key: string, value: T, ttl?: number): Promise<void>;
  Delete(key: string): Promise<void>;
  Clear(): Promise<void>;
  Has(key: string): Promise<boolean>;
}

// Web implementation (existing, refactored)
export class IndexedDBCacheStorage implements IClientCacheStorage { ... }

// RN implementation (new, in a separate package)
export class MMKVCacheStorage implements IClientCacheStorage { ... }
```

The provider takes an `IClientCacheStorage` in its constructor (or via DI/factory). Existing web code keeps working — the default for a browser environment is the IndexedDB implementation. RN code passes the MMKV implementation at startup.

### Side benefit

This refactor improves the web codebase too: it makes the cache layer **testable** (in-memory implementation for unit tests, replacing flaky IndexedDB mocking) and **future-proof** for any Node.js-side client scenarios (server-to-server calls, scheduled jobs, MCP clients).

### Effort estimate

1–2 focused weeks. The cache interface is small. The risk is finding incidental coupling — places where caching code reaches directly into IndexedDB APIs rather than going through a well-defined boundary. Audit before refactor.

---

## Part 6: Pluggability — Everything Survives

A core question we worked through: does the move to RN break MJ's class registration / factory / decorator patterns? **No.** Here's why, point by point.

### `@RegisterClass` decorators
Decorators are a TypeScript / metadata-reflect feature, not a framework feature. They run at module load time regardless of whether the host is Angular, RN, Node.js, or a browser. Existing registrations work.

### `MJGlobal.Instance.ClassFactory.CreateInstance(...)`
The factory is a singleton holding registrations in a `Map`. It's pure JS. No DOM, no framework dependency. Calling it from a React function component is identical to calling it from an Angular service.

### `BaseSingleton<T>` with the Global Object Store
The store uses module-level state plus a globalThis-mounted registry to survive code duplication across bundlers. RN has its own bundler (Metro), but `globalThis` exists and the pattern works without changes.

### Inheritance chains and OOP composition
Classes, inheritance, abstract methods, protected constructors, `super()` calls — all standard TypeScript, all unaffected by the UI framework.

### How React function components call this code

```tsx
import { useEffect, useState } from 'react';
import { Metadata, RunView } from '@memberjunction/core';
import { ContactEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { FlatList, Text, ActivityIndicator } from 'react-native';

function ContactList({ companyId }: { companyId: string }) {
  const [contacts, setContacts] = useState<ContactEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const rv = new RunView();
      const result = await rv.RunView<ContactEntity>({
        EntityName: 'Contacts',
        ExtraFilter: `CompanyID='${companyId}'`,
        ResultType: 'entity_object'
      });
      setContacts(result.Success ? result.Results : []);
      setLoading(false);
    })();
  }, [companyId]);

  if (loading) return <ActivityIndicator />;

  // Pluggable per-entity renderer via existing ClassFactory
  const renderer = MJGlobal.Instance.ClassFactory.CreateInstance<BaseContactRenderer>(
    BaseContactRenderer, 'MobileContactRenderer'
  );

  return (
    <FlatList
      data={contacts}
      keyExtractor={c => c.ID}
      renderItem={({ item }) => renderer.Render(item)}
    />
  );
}
```

### A mobile-specific use of ClassFactory

We can use the **same registration mechanism** to swap UI components per entity — exactly mirroring how Angular custom forms work today. Function components are values; classes are values; the factory doesn't care which.

```tsx
// A package author registers a custom mobile view for Contacts
@RegisterClass(BaseMobileEntityView, 'Contacts')
export class ContactsMobileView extends BaseMobileEntityView { ... }

// Or, for purely functional components, register a function:
MJGlobal.Instance.ClassFactory.Register(
  BaseMobileEntityView,
  ContactsMobileView,
  'Contacts'
);

// The mobile shell resolves per-entity views generically
function EntityRouter({ entityName, id }: Props) {
  const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
    BaseMobileEntityView, entityName
  );
  const Component = reg?.SubClass ?? DefaultMobileEntityView;
  return <Component id={id} />;
}
```

This means the **same architectural patterns** customers and partners use to extend MJExplorer will extend the mobile app. No new mental model.

---

## Part 7: Tech Stack Choices

### Framework: Expo (managed flow), not bare RN

Modern RN development is dominated by **Expo**. The "bare RN is hardcore / Expo is for prototypes" framing is outdated — serious teams (Bluesky, Shopify Shop, Coinbase Wallet) ship Expo in production.

What we get from Expo:
- **EAS Build** — managed iOS/Android CI builds without local Xcode/Android Studio setup
- **EAS Update** — over-the-air JS updates (rare for our case, but available)
- **Expo Router** — file-based routing, similar mental model to Next.js
- **expo-modules** — well-maintained wrappers for native APIs (camera, biometrics, secure storage, file system, notifications)
- **Config plugins** — declarative native config without leaving the managed flow

We accept Expo's opinions in exchange for not maintaining Xcode/Gradle config ourselves. If we hit a wall (custom native module that has no Expo equivalent), Expo supports a "prebuild" escape hatch that drops us into bare RN for that specific need.

### Other key dependencies

| Concern | Pick | Why |
|---|---|---|
| Navigation | **Expo Router** | File-based, deep-link-friendly, native stack under the hood |
| State management | **Built-in hooks + Zustand** (if needed) | Avoid Redux unless we hit a real reason. MJ's data layer already owns most state. |
| GraphQL client | **Apollo Client** (same as web) | Already a dependency; reuses query patterns |
| Local cache storage | **MMKV** (hot) + **expo-sqlite** (cold) | MMKV is the de-facto fast K/V store for RN; SQLite for larger structured data |
| Auth storage | **expo-secure-store** | Keychain on iOS, EncryptedSharedPreferences on Android |
| Lists | **`FlatList` / `FlashList`** (Shopify) | `FlashList` for large datasets — recycler-based, much smoother |
| Forms | **React Hook Form** | Standard, performant, plays well with controlled/uncontrolled inputs |
| Styling | **NativeWind** (Tailwind for RN) or **Restyle** | Decision in Phase 1 kickoff. NativeWind lowers cognitive cost; Restyle is more type-safe. |
| Icons | **lucide-react-native** or **@expo/vector-icons** | Match MJ Explorer's icon language where possible |
| Date/time | **date-fns** (already used in monorepo) | Consistency |

---

## Part 8: Repository Structure

```
packages/
├── MobileApp/                                NEW — the RN Expo project
│   ├── app/                                  Expo Router screens
│   │   ├── (tabs)/                           Bottom tab navigator
│   │   │   ├── chat.tsx
│   │   │   ├── explorer/
│   │   │   │   ├── index.tsx                 Entities/Queries/Dashboards picker
│   │   │   │   ├── entities/[name].tsx
│   │   │   │   ├── records/[entity]/[id].tsx
│   │   │   │   ├── queries/[id].tsx
│   │   │   │   └── dashboards/[id].tsx
│   │   │   └── profile.tsx
│   │   ├── login.tsx
│   │   └── _layout.tsx
│   ├── src/
│   │   ├── components/                       Shared UI primitives
│   │   ├── hooks/                            useEntity, useRunView, useAgent, etc.
│   │   ├── providers/                        Apollo, theme, auth, MJ provider init
│   │   ├── registrations/                    Force-load custom UI registrations
│   │   └── theme/                            Tokens that mirror Explorer's design tokens
│   ├── assets/                               Icons, splash, fonts
│   ├── app.json                              Expo config
│   ├── eas.json                              EAS Build profiles
│   ├── package.json
│   └── tsconfig.json
│
├── GraphQLDataProvider/                      EXISTING — refactored cache layer
│   └── src/
│       ├── cache/
│       │   ├── IClientCacheStorage.ts        NEW interface
│       │   ├── IndexedDBCacheStorage.ts      Existing web impl, refactored
│       │   └── InMemoryCacheStorage.ts       NEW — for tests
│       └── ...
│
├── MobileCacheStorage/                       NEW — RN-only cache implementations
│   └── src/
│       ├── MMKVCacheStorage.ts
│       └── SQLiteCacheStorage.ts
│
└── ... (everything else unchanged)
```

### Monorepo vs. separate repo

We keep `MobileApp` **inside the monorepo**. Reasons:
- Trivial `@memberjunction/*` imports — workspace symlinks just work
- Single source of truth for entity types — CodeGen output flows to mobile automatically
- Shared tooling (TypeScript config, lint, formatting, Turborepo)

The mobile-specific concerns (Expo, EAS Build, App Store metadata) live entirely inside `packages/MobileApp/`. They don't pollute the rest of the monorepo.

CI: EAS Build runs as a separate GitHub Actions workflow triggered on changes under `packages/MobileApp/**` or any of its TS dependencies.

---

## Part 9: Phased Roadmap

### Phase 1 — Foundation + Chat + Data Explorer subset

**Workstream A: Shared code refactor**
- Cache abstraction in `@memberjunction/graphql-dataprovider`
- New `@memberjunction/mobile-cache-storage` package with MMKV + SQLite impls
- Verify the entire shared TS layer compiles and runs under Hermes (Metro bundler)

**Workstream B: RN project bootstrap**
- `packages/MobileApp/` with Expo, Expo Router, NativeWind (or Restyle), Apollo, auth wiring
- Login flow (existing OAuth via `expo-auth-session`; tokens in `expo-secure-store`)
- App-wide MJ provider init (Metadata, GraphQL client, cache storage injection)
- Three-tab shell with empty Chat / Explorer / Profile screens

**Workstream C: Chat with Agents**
- Conversation list, conversation detail, message thread UI
- Streaming responses from agent runs
- Artifact rendering (text, JSON tables, simple Markdown)
- Reuses existing `ai-agents`, `ai-prompts`, conversation entities entirely

**Workstream D: Data Explorer subset**
- Entity browser: list → record list (cards) → record detail (read-only single-column)
- Query runner: list → param form → results (cards or simple tabular)
- Dashboard viewer: list → render existing dashboard component (best-effort on mobile)
- Pluggable `BaseMobileEntityView` with default and per-entity registrations

**Phase 1 exit criteria**
- Internal team installs via TestFlight / Google Play Internal Testing
- Can log in, see conversations, talk to Skip, view an entity record, run a query
- Cache works offline-read for previously-visited entities and conversations
- Lighthouse-equivalent quality bar: smooth 60fps scroll on iPhone 12+ and Pixel 6+

### Phase 2 — Voice, Push, Biometrics, Edit

- Voice input (record → Whisper via MJAPI; consider on-device STT later)
- Voice output (system TTS or ElevenLabs via MJAPI)
- Push notifications (APNs/FCM via Expo Notifications; server-side push endpoint on MJAPI)
- Biometric app unlock (`expo-local-authentication`)
- Record editing for top entity types (start with single-field updates, expand carefully)
- Offline read cache improvements (TTL tuning, manual refresh, last-sync indicators)

### Phase 3 — Field capture, offline mutations, polish

- Photo / file capture for attachments
- Offline mutation queue with sync-on-reconnect
- Mobile-aware dashboard authoring (separate initiative — likely a new dashboard "mobile layout" concept in MJ core)
- App Store / Play Store public listing decisions

---

## Part 10: Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hidden DOM dependencies in shared TS packages (`window`, `document`, `localStorage`) | Medium | Audit pass before Phase 1 starts: grep for DOM/browser globals in `@memberjunction/core`, `core-entities`, `ai*`, `graphql-dataprovider`. Replace any found with environment-checks or abstractions. |
| Bundle size — MJ packages were never tree-shaken for mobile | Medium | Metro bundler + Hermes minification get us most of the way. Profile early; add per-package side-effect declarations if needed. |
| Apollo Client behavior differences under RN networking stack | Low | Apollo officially supports RN. Known issues are documented. |
| Existing dashboards render poorly on mobile (acknowledged) | High | Explicitly out of scope for Phase 1. Document as "dashboard authors will eventually add mobile layouts." Don't fix individually. |
| App Store review surprises on first submission | Medium | Submit a TestFlight build during Phase 1 to surface issues early. Apple's typical objections (privacy descriptions, third-party login disclosures) are well-documented. |
| TypeScript decorator behavior under Metro/Babel vs. tsc | Low | Verify in the bootstrap phase. RN supports legacy decorators via Babel config; well-trodden path. |
| MMKV native module compatibility with future Expo SDK upgrades | Low | MMKV has a maintained Expo config plugin (`react-native-mmkv`). Pin Expo SDK upgrades behind testing. |

---

## Part 11: Open Questions for Decision

These don't block starting; they're flagged for explicit decision during Phase 1 kickoff:

1. **Styling library:** NativeWind (Tailwind syntax, lower learning curve) vs. Restyle (Shopify, more type-safe, more verbose). Both viable.
2. **List library:** Stock `FlatList` vs. Shopify's `FlashList`. `FlashList` is better for long lists but adds a dependency. Probably start with `FlatList`, swap to `FlashList` if profiling shows a need.
3. **Auth flow:** Reuse the existing OAuth provider exactly, or switch to a mobile-native flow (Sign in with Apple, Google Sign-In)? The existing flow works fine via `expo-auth-session` — likely no change for Phase 1.
4. **Telemetry:** Do we wire `@memberjunction/core-telemetry` (if it exists) into the mobile app from day one, or defer? Recommend day one — debugging field issues without telemetry is painful.
5. **Distribution model:** Public App Store listing vs. private MDM / TestFlight only for customer admins to install? Likely customer-by-customer, but the default for Phase 1 is internal TestFlight only.

---

## Decision Trail

For future reference, here's the abbreviated thinking that led to RN:

1. **Started with PWA proposal** — accurate on technical claims, but oversold the user experience. iOS PWA limitations (Safari 7-day eviction, ~50 MB storage, no real push without home-screen install, voice API gaps) make it a weak fit for an enterprise B2B mobile product.
2. **Considered Capacitor** — strictly better than pure PWA (real App Store, real push, real biometrics, real background). But WebView-based rendering still has a real feel gap vs. native, especially for lists, keyboard handling, and animations. Good for "MJ on a small screen"; not good for "the mobile app a CEO shows off."
3. **Considered Flutter** — TS reuse is **zero**, which kills it for MJ. We'd be maintaining two parallel non-visual stacks forever. Even with AI accelerating Dart authoring, the architectural drag of keeping entity logic in sync between TS and Dart is a permanent tax.
4. **Landed on React Native (Expo)** — keeps ~70% of the stack shared (everything below the UI), gives us native-quality UX, fits the existing TS-first team, and integrates with the `@RegisterClass`/`ClassFactory` patterns without modification. The one real cost — refactoring the cache layer in `graphql-dataprovider` — also improves the web codebase.
5. **Decided on minimal Phase 1 scope** — Chat + Data Explorer subset (Entities, Queries, Dashboards). Resisted the urge to mirror Explorer. Voice, push, biometrics, editing, offline mutations all explicitly deferred to later phases. Most existing dashboards won't look great on mobile — that's acknowledged and a separate problem to solve later.
