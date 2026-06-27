# MemberJunction Mobile App — React Native Architecture & Phase 1 Plan

**Status:** Proposal
**Date:** 2026-05-18
**Supersedes:** The earlier PWA-based proposal that lived at `packages/Mobile/ARCHITECTURE.md` (deleted in this branch)

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
┌─────────────────────────────────────────┐
│           [Conversation Title]      ⋮    │
├─────────────────────────────────────────┤
│                                          │
│                                          │
│        (Active screen content)           │
│                                          │
│                                          │
├─────────────────────────────────────────┤
│     💬             🗂️             👤    │
│    Chat          Explorer        Profile │
└─────────────────────────────────────────┘
```

Three bottom tabs. Chat is the default landing tab. Explorer holds Entities / Queries / Dashboards as a segmented control or nested list. Profile is login/logout/identity only for Phase 1.

---

## Part 4: The One Refactor Required — Cache Abstraction

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

## Part 5: Pluggability — Everything Survives

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

## Part 6: Tech Stack Choices

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

## Part 7: Repository Structure

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

## Part 8: Phased Roadmap

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

## Part 9: Risks and Mitigations

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

## Part 10: Open Questions for Decision

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
