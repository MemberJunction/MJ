# MJ Mobile v1.0 — White-Label Architecture, Core Data Surfaces & Year-End Store Launch Plan

**Status:** Proposed Plan of Record (2026-10-29)  
**Target Milestone:** v1.0 Public & White-Label Release on **Apple App Store (iOS)** and **Google Play Store (Android)** in **Q4 2026** (Submission target: **December 11, 2026**, ahead of holiday App Review slowdowns)  
**Companions:** [`README.md`](README.md) (Phase 1–3 foundation), [`MOBILE-AS-APP-HOST.md`](MOBILE-AS-APP-HOST.md) (`BaseMobileResource` hosting contract), [`PHASE4-V6-REALTIME.md`](PHASE4-V6-REALTIME.md) (v6 runtime extraction & realtime sessions)  
**Primary Package:** [`packages/MobileApp/`](../../packages/MobileApp/) (`@memberjunction/mobile-app`, Expo SDK 54, React Native 0.81.5, React 19.1.0, Expo Router v6, Hermes, New Architecture)

---

## 0. Executive Summary & Product Mandate

Our goal is to **ship the first production cut of MJ Mobile to the iOS App Store and Google Play Store before year-end 2026**, while structuring the architecture so **any organization or partner can produce a fully branded, white-labeled mobile app without forking MemberJunction core**.

### Core v1.0 Product Scope
1. **Effortless White-Label Brandability**:
   - Single typed `brand.config.ts` driving a dynamic Expo `app.config.ts` (app name, bundle ID / package, URL scheme, icons, splash, permissions) and a runtime `ThemeProvider` (Light + Dark + brand tokens).
   - Clean split into a published **`@memberjunction/mobile-core`** library package plus a thin ~15-file Expo host/template (mirroring `@memberjunction/ng-explorer-core` + `MJExplorer`).
   - Optional **Workspace URL discovery** on login so the official MemberJunction store binary can connect to any customer's MJAPI deployment, while white-label builds lock directly to a single customer's server.
2. **Simple View Functionality (`MJ: User Views`)**:
   - First-class execution of saved `MJ: User Views` per entity (`RunView({ ViewID })`), honoring saved `WhereClause` / `SmartFilterWhereClause`, `GridState` column visibility/order, and `SortState`, paired with server-side `UserSearchString` and virtualized pagination.
   - One reusable `<SavedViewList />` primitive powering **Entity Views**, hosted **`ResourceType: 'Views'`** nav items, and **`View` panels inside Dashboards**.
3. **Dashboards & Scoped Data Explorer**:
   - Complete `Config` dashboard rendering across all four mobile-native panel kinds (`Query`, `Artifact`, **`View`**, and **`Component`**) backed by `DashboardEngine` permissions.
   - Application- and permission-scoped Data Explorer (`IncludeInAPI`, `CanUserRead`, `MJ: Application Entities`), clickable foreign-key and metadata-driven polymorphic FK (`EntityField.EntityIDFieldName`) record links, native date picker in `RecordForm`, and contextual `"Ask Agent"` handoffs carrying entity/record/view/query context.
4. **Agent Chat & Artifacts / Interactive Components**:
   - Harden the existing `ConversationsRuntime` chat experience, wire `ArtifactContentView` to `@memberjunction/markdown-core` (`MarkdownView`), bundle `@memberjunction/react-runtime` locally for `DomComponentHost` (eliminating `unpkg.com` version drift and firewall failures), and include a runtime execution-mode switch (`dual` vs `webview-only`) to de-risk Apple App Review Guideline 2.5.2.

---

## 1. Honest Baseline Audit (Verified Against Source, 2026-10-29)

### 1.1 What Is Already Strong
- **"One TypeScript Brain" on Hermes**: `@memberjunction/core`, `core-entities`, `global`, `graphql-dataprovider`, `conversations-runtime`, `realtime-runtime`, and `markdown-core` run unchanged in React Native with only a 41-line polyfill (`packages/MobileApp/src/polyfills.ts`).
- **Metadata-Driven Hosting**: `BaseMobileResource` (`src/host/BaseMobileResource.ts`) and `BaseMobileArtifactRenderer` (`src/artifacts/BaseMobileArtifactRenderer.ts`) resolve through `MJGlobal.ClassFactory` against existing `MJ: Applications` and artifact metadata.
- **Dual Interactive Component Engine**: `ComponentRenderer` (`src/interactive/ComponentRenderer.tsx`) routes pure-JS specs to `InteractiveComponentRenderer` (Hermes) and DOM/Canvas specs (`Chart.js`, `ApexCharts`, `AG Grid`, `Leaflet`, `antd`) to `DomComponentHost` (`src/interactive/dom-host/DomComponentHost.tsx`), a credential-free `react-native-webview` with an RPC `postMessage` bridge for `RunView` / `RunQuery` and `CapturedDataFallback` on error.
- **Unit Test Foundation**: 523 passing Vitest tests across 40 test files (`3.2s`) plus 9 Maestro flows (`.maestro/`).

### 1.2 Baseline Readiness Scorecard

| Surface | Current State | Key Gap to Close for v1.0 |
| :--- | :---: | :--- |
| **Build & Boot Health** | 🔴 Broken | `pnpm run typecheck` fails with **22 TS errors** across 4 screens; `BootGate` deadlocks on clean unauthenticated launch; `Env` hardcodes `http://...:4001`. |
| **Simple Views (`MJ: User Views`)** | 🔴 0% | Zero `MJ: User Views` or `ViewID` usage anywhere in `MobileApp`; `View` dashboard panels and `Views` app nav items show `"opens on desktop"`. |
| **White-Label Brandability** | 🔴 15% | `"private": true` monorepo package, static `app.json` (no icons/splash), hardcoded BlueCypress dev Auth0/MSAL & `mjmobile://`, static light-only `tokens.ts`, ~20 hardcoded `"MemberJunction"` / `"Skip"` / `"Sage"` strings. |
| **Store Compliance (iOS & Android)** | 🔴 25% | Play Store `READ_MEDIA_IMAGES` auto-rejection, Apple `NSPhotoLibraryAddUsageDescription` undeclared feature, Guideline 2.1 dead UI toggles & 90%-empty `Apps` tab, sign-out cross-user data leak, missing `eas.projectId` & privacy manifest. |
| **Dashboards** | 🟡 45% | `Config` dashboards (`Query` + `Artifact` + mobile composer) work; `Type = 'Code'` Angular dashboards are excluded; `Component` & `View` panels fall back to desktop-only; `LoadDashboards` bypasses `DashboardEngine` permissions. |
| **Data Explorer** | 🟡 55% | Lists 300+ system `MJ:` tables unscoped; caps at 100 rows with client-only search; FKs render as raw UUIDs; `"Ask Skip"` drops record/entity context. |
| **Agent Chat & Artifacts** | 🟢 75% | Strongest area once casing regression is fixed. Needs `ArtifactContentView` markdown swap, local `react-runtime` UMD bundle in `DomComponentHost`, wired `SuggestedResponses` chips, and message windowing fix. |

### 1.3 Six P0 Regressions & Security/Boot Blockers (Must Fix in Phase 0)

1. **P0-1 — Silent Compile & Runtime Breakage in 4 Core Screens (22 TS Errors)**:
   - `packages/MobileApp/package.json` lacks a `"build"` script, so `turbo build` never runs `tsc --noEmit` on `MobileApp`, and Vitest strips types without importing `app/(tabs)/**`. A partial PascalCase codemod renamed hook/type fields without updating four screens (causing destructured props to resolve to `undefined` at runtime):
     - `app/(tabs)/(chats)/chat/[id].tsx:78-80,207` (13 errors): Destructures `{ data, loading, error, refresh }` from `useConversation` (returns `{ Data, Loading, Error, Refresh }`), `{ conversations, refresh }` from `useConversations` (`{ Conversations, Loading, Error, Refresh }`), and reads `.id/.live/.agents/.title` on `ConversationSummary` (`Id`, `Live`, `Agents`, `Title`).
     - `app/(tabs)/(home)/index.tsx:67` (5 errors): Destructures `{ conversations, loading, refresh }` from `useConversations`.
     - `app/(tabs)/(home)/explorer/entity/[name].tsx:47` (1 error): Reads `data?.Entity.DisplayName` instead of `data?.entity.DisplayName`.
     - `app/(tabs)/(home)/explorer/query/[id].tsx:45-70` (3 errors): Reads `result.Success` / `result.ErrorMessage` instead of `result.success` / `result.errorMessage` (treating every query run as failed).
2. **P0-2 — Cold-Launch & Sign-Out Deadlock in `BootGate`**:
   - `app/_layout.tsx:64-72` wraps `<Stack />` inside `<BootGate>`. When `status === 'no-token'` (every clean store install and after `signOut()`), `src/boot/BootGate.tsx:77-78` returns `<Redirect href="/login" />` **instead of rendering `{children}` (`<Stack />`)**. Because `app/login.tsx` is a screen *inside* `<Stack />`, unauthenticated launch fails with no root navigator mounted. (E2E missed this because `.maestro/01-boot-smoke.yaml` injects `EXPO_PUBLIC_MJ_DEV_JWT`.)
   - **Fix**: Keep `<Stack />` always mounted in `app/_layout.tsx`; move `BootGate` to guard `app/(tabs)/_layout.tsx` (or render `<LoginScreen />` directly when `status === 'no-token'`).
3. **P0-3 — Cleartext `http://` + Port `:4001` Hardcoded in `Env`**:
   - `src/config/env.ts:35-36` builds `http://${LocalApiHost}:4001/graphql` and `ws://${LocalApiHost}:4001/graphql`. Production MJAPI servers run `https://` / `wss://` on port 443, and iOS App Transport Security blocks cleartext HTTP to remote hosts in release builds.
   - **Fix**: Accept full `EXPO_PUBLIC_MJ_GRAPHQL_URL` / `EXPO_PUBLIC_MJ_WS_URL` (and brand/workspace URL config) with automatic `https://` → `wss://` derivation, falling back to `http://localhost:4001/graphql` only in `__DEV__`.
4. **P0-4 — Deep-Link Prompt Injection / File Exfiltration & Exposed Production Dev Surfaces**:
   - `app/(tabs)/(chats)/chat/[id].tsx:184-200` reads `autosend` and `autosendAttachment` from URL query params and immediately runs `handleSend()` + `ReadAttachmentBase64(new File(att.uri))` without confirmation. An external link (`<scheme>:///chat/<id>?autosend=...&autosendAttachment={"uri":"file:///..."}`) can execute arbitrary agent prompts and exfiltrate readable sandbox files to MJ Storage.
   - `app/login.tsx:139-148` exposes `"Developer options -> Paste JWT"` without `if (__DEV__)`, and `app/devchat.tsx`, `app/interactive-demo.tsx`, and `app/markdown-preview.tsx` ship in the production route tree.
   - **Fix**: Replace URL-param `autosendAttachment` with an in-memory one-time handoff store from `new-conversation.tsx` (never from external deep links); require user confirmation or `__DEV__` for `autosend`; guard `DevTokenSheet` and all dev/demo routes behind `__DEV__`.
5. **P0-5 — Cross-User Data, Offline-Queue & Push-Token Leak on Sign-Out**:
   - `src/providers/mj-provider.tsx:289-306` (`signOut()`) does **not**:
     1. Clear `offline-queue.ts` (`mj-mobile-offline-queue`) — User A's queued offline mutations replay under User B's session.
     2. Call `UnregisterDeviceToken()` (`src/data/services/notifications.ts:144`) — User A's `MJ: User Settings` retains the device push token.
     3. Tear down the GraphQL WebSocket client, clear `PrefsStorage` / `MMKVStorageProvider`, or reset `UserInfoEngine.Instance` & `DashboardEngine.Instance`.
   - Also note: `MMKVStorageProvider` (`src/providers/mmkv-storage-provider.ts`) is currently dead code (never wired into `GraphQLDataProvider` / `Metadata` at boot), and user preferences in `src/data/preferences.ts` write only to local MMKV rather than syncing per-user preferences through `UserInfoEngine.Instance` (`MJ: User Settings`).
6. **P0-6 — Biometric `AppLockGate` Unmounts Navigation & Active Calls on Background**:
   - `src/auth/AppLockGate.tsx:20-24` returns `<LockScreen />` *instead of* `{children}` when locked (`useAppLock.ts:84`), unmounting `<Stack />` on every background transition and destroying navigation history, unsent chat drafts, and active voice calls.
   - **Fix**: Always render `{children}` and mount `<LockScreen />` as an opaque `StyleSheet.absoluteFill` overlay above it (blocking pointer events and screen-switcher previews).

---

## 2. White-Label & Brandability Architecture

### 2.1 Why Branding Currently Requires Forking
1. `packages/MobileApp/package.json` is `"private": true` inside the MJ monorepo; `metro.config.js` reaches up `../..` to workspace packages, and `BaseMobileResource` is only reachable via internal `@/host/BaseMobileResource`.
2. `app.json` is static JSON hardcoding `"MJ Mobile"`, `"org.memberjunction.mobile"`, `"mjmobile"`, and `"MJ Mobile uses..."` permission strings, with **no `assets/` directory, no app icon, no adaptive icon, and no splash screen**.
3. `src/config/env.ts:40-53` hardcodes BlueCypress dev Auth0/MSAL tenant & client IDs, and `src/auth/auth0.ts:45` + `src/auth/msal.ts:49` hardcode `scheme: 'mjmobile'`.
4. `src/theme/tokens.ts` exports static light-only `Colors` constants baked into module-load `StyleSheet.create(...)` calls (`brand: '#0076b6'`, `bg: '#f8fafc'`). The Profile `Appearance` setting (`System / Light / Dark`) is a visual no-op, and `app.json`'s `"userInterfaceStyle": "automatic"` clashes with hardcoded `<StatusBar style="dark" />` when the OS is in Dark Mode.
5. ~20 files hardcode `"MemberJunction"`, `"MJ Mobile"`, `"MJ Explorer"`, `"Skip"`, and `"Sage"`.

### 2.2 Target Architecture: `@memberjunction/mobile-core` + Thin Brand Host

Mirroring MJ Explorer (`@memberjunction/ng-explorer-core` + thin host app), we separate **reusable mobile framework & screens** from **brand identity & native app manifest**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Customer Branded Host App (or Official MJ Store App / Starter Template)   │
│  ├── brand.config.ts        ← Single source of truth for brand & server   │
│  ├── app.config.ts          ← Dynamic Expo manifest generated from brand  │
│  ├── assets/                ← icon.png, adaptive-icon.png, splash, logo   │
│  ├── custom-resources.ts    ← Optional @RegisterClass(BaseMobileResource) │
│  └── app/                   ← Thin Expo Router wrappers re-exporting core │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ depends on
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ @memberjunction/mobile-core (Published NPM Package)                       │
│  ├── BrandProvider & ThemeProvider (Light/Dark + brand palette overrides) │
│  ├── MJProviderRoot, BootGate, AppLockGate, OAuth (Auth0 / MSAL / OIDC)   │
│  ├── BaseMobileResource & BaseMobileArtifactRenderer + Generic Renderers  │
│  └── Standard Screens (Login, Home, Chats, SavedViews, Explorer, Profile) │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ depends on
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Shared Framework-Agnostic MJ Brain (@memberjunction/*)                    │
│  core · core-entities · global · graphql-dataprovider · markdown-core     │
│  conversations-runtime · realtime-runtime · interactive-component-types   │
└───────────────────────────────────────────────────────────────────────────┘
```

### 2.3 The `MJMobileBrandConfig` Contract (`brand.config.ts` → `app.config.ts` + Runtime)

A customer creating a branded app edits **one typed file** (`brand.config.ts`) and drops their PNG/SVG assets into `assets/`:

```typescript
export interface MJMobileAuthProviderConfig {
    Type: 'auth0' | 'msal' | 'oidc';
    Label: string;                  // e.g. "Continue with Acme SSO"
    ClientId: string;
    Domain?: string;                // Auth0 / OIDC issuer domain
    TenantId?: string;              // Microsoft Entra tenant ID
    Audience?: string;
    Scopes?: string[];
}

export interface MJMobilePaletteOverrides {
    Brand: string;                  // Primary accent (replaces #0076b6)
    BrandSoft?: string;
    BrandInk?: string;
    Background?: string;
    Surface?: string;
    Ink?: string;
}

export interface MJMobileBrandConfig {
    // 1. Build-time Native Identity (consumed by app.config.ts)
    AppName: string;                // e.g. "Acme AI"
    Slug: string;                   // e.g. "acme-ai"
    Version: string;                // e.g. "1.0.0"
    IosBundleIdentifier: string;    // e.g. "com.acme.mobile"
    AndroidPackage: string;         // e.g. "com.acme.mobile"
    UrlScheme: string;              // e.g. "acmeai" -> acmeai://auth
    EasProjectId?: string;
    Assets: {
        Icon: string;               // 1024x1024 PNG
        AdaptiveIconForeground: string;
        AdaptiveIconBackground: string;
        SplashImage: string;
        SplashBackgroundColor: string;
        SplashBackgroundColorDark?: string;
    };

    // 2. Connectivity & Multi-Tenancy
    DefaultGraphqlUrl?: string;     // e.g. "https://api.acme.com/graphql"
    AllowCustomWorkspaceUrl: boolean; // true for Official MJ Store App, false for single-tenant white-label
    AuthProviders: MJMobileAuthProviderConfig[];

    // 3. Runtime Copy, Persona & Legal Links
    Tagline: string;                // e.g. "Talk to your data. Anywhere."
    DesktopAppLabel: string;        // e.g. "Acme Web" (replaces hardcoded "MJ Explorer")
    DefaultAgentFallbackName: string; // e.g. "Assistant" (replaces hardcoded "Skip" / "Sage")
    Legal: {
        TermsUrl: string;
        PrivacyPolicyUrl: string;
        SupportUrl: string;
    };

    // 4. Theme & Feature Flags
    Theme: {
        DefaultAppearance: 'system' | 'light' | 'dark';
        Light?: Partial<MJMobilePaletteOverrides>;
        Dark?: Partial<MJMobilePaletteOverrides>;
        FontFamily?: { Regular?: string; Medium?: string; SemiBold?: string; Bold?: string };
    };
    Features: {
        EnableRealtimeVoice: boolean;
        EnablePushNotifications: boolean;
        InteractiveComponentMode: 'dual' | 'webview-only';
    };
}
```

- **Dynamic `app.config.ts`**: Reads `brand.config.ts` (or `BRAND_CONFIG_PATH` in CI/EAS) and generates the entire Expo manifest, interpolating `${brand.AppName}` into every iOS `NS*UsageDescription` string and configuring `icon`, `android.adaptiveIcon`, `expo-splash-screen`, `scheme`, `ios.bundleIdentifier`, `android.package`, and `extra.eas.projectId`.
- **Dynamic OAuth Redirect URI**: `auth0.ts` and `msal.ts` replace hardcoded `scheme: 'mjmobile'` with `Constants.expoConfig?.scheme` (`makeRedirectUri({ scheme: brand.UrlScheme, path: 'auth' })`).
- **Runtime `ThemeProvider` (`useTheme()`)**:
  - Defines complete `LightTokens` and `DarkTokens` semantic palettes, merged with `brand.Theme.Light` / `brand.Theme.Dark` (and optional server-supplied workspace palette).
  - Resolves active scheme from `Appearance` (`useColorScheme()`) when user preference is `'system'`, updates `<StatusBar style={isDark ? 'light' : 'dark'} />`, and syncs the user's appearance preference via `UserInfoEngine.Instance.SetSettingDebounced('mobile.appearance', mode)` (cached locally in MMKV for zero-flash cold boot).
  - Provides `useThemedStyles((theme) => StyleSheet.create(...))` memoized on the active theme object so screens switch Light/Dark/Brand cleanly at runtime without app restart.

### 2.4 Workspace URL Discovery (For the Official MJ Store Binary)
On the public iOS App Store and Google Play Store, MemberJunction publishes **one official MJ Mobile app**, while customers wanting custom store icons/names build white-label binaries via `brand.config.ts` (or Apple Custom Apps / Managed Google Play).
- When `AllowCustomWorkspaceUrl: true`, `LoginScreen` shows a **"Workspace URL"** step (e.g. `https://mj-api.company.com`) before OAuth buttons.
- Entering a URL fetches `GET https://<host>/.well-known/mj-mobile.json` (a tiny unauthenticated endpoint added to `@memberjunction/server` derived from `mj.config.cjs` auth settings) returning `{ workspaceName, graphqlUrl, graphqlWsUrl, authProviders, logoUrl?, palette? }`.
- `LoginScreen` then renders **only** the OAuth provider(s) configured for that workspace (eliminating the current UX bug where both Auth0 and Microsoft buttons render simultaneously even when a deployment only uses one), and `ProfileScreen`'s `"Connected workspace"` row lets users view or switch workspaces cleanly.

---

## 3. Core Feature Engineering Specifications

### 3.1 Simple View Functionality (`MJ: User Views`)
Saved views are a cornerstone of MemberJunction and are currently 0% implemented on mobile. Because `@memberjunction/core` `RunView` already executes `ViewID` server-side, mobile needs a thin, fast **Saved View Runner**:

1. **View Discovery Service (`src/data/services/views.ts`)**:
   - Load views for an `EntityID` from `MJ: User Views` where `(UserID = currentUser.ID OR IsShared = 1)` (respecting view permissions via `UserViewEngine` / `RunView`), ordered by `IsDefault DESC, Name ASC`.
   - Always prepend/fallback to a synthesized **"Default View"** (`DefaultInView` columns, `NameField ASC`) when an entity has zero saved views.
   - Parse `GridState` JSON (`columnSettings`: filter to `!hidden`, sort by column sequence, respect `UserDisplayName` labels, cap mobile card summary to top 4–5 visible columns with tap-through to full record detail) and `SortState` JSON.
2. **Server-Backed Execution & Pagination (`useRunUserView`)**:
   - Execute `rv.RunView({ ViewID, EntityName, UserSearchString, StartRow, MaxRows: 50, ResultType: 'simple' })` (or `EntityName` + `DefaultInView` `Fields` for the synthesized Default View).
   - Replace unvirtualized `ScrollView` + in-memory 100-row filtering in `explorer/entity/[name].tsx` with React Native `<FlatList>` (`onEndReached` pagination + pull-to-refresh + debounced 300ms server-side `UserSearchString` + active filter/sort summary chips).
3. **One `<SavedViewList />` Component Unlocks Three Surfaces**:
   - **Data Explorer Entity Screen (`explorer/entity/[name].tsx`)**: Header/pill dropdown (`"Active Accounts ▾"`) opening a bottom-sheet view picker ("My Views" / "Shared Views" / "All Records").
   - **Hosted Application `Views` Nav Items (`src/host/generic-resources.tsx`)**: Register `@RegisterClass(BaseMobileResource, 'User Views')` / `'Views'` so any `MJ: Applications` nav item pointing to a saved view renders natively instead of `"opens on desktop"`.
   - **Dashboard `View` Panels (`src/components/dashboard/DashboardView.tsx:110`)**: Replace `<DesktopOnlyPart>` on `case 'view':` with `<SavedViewList viewId={part.config.viewId} entityName={part.config.entity} compact maxRows={8} />` plus a `"Open full view →"` footer link.

### 3.2 Scoped Data Explorer, Relational Links & Contextual Agent Handoff
1. **Entity Permission & Application Scoping (`src/data/services/explorer.ts:27-38`)**:
   - Tighten `LoadEntities(options?: { applicationId?: string; includeSystem?: boolean })` to require:
     - `e.IncludeInAPI === true`
     - `e.AllowUserSearchAPI !== false`
     - `!e.Name.startsWith('__')`
     - `e.CanUserRead(currentUser)` (via `e.GetUserPermisions(currentUser).CanRead`)
   - Default the entity browser to entities linked via `MJ: Application Entities` for the user's active business applications (hiding 300+ internal `MJ: ...` system metadata entities behind an optional `"All permitted entities"` filter chip), and compute `EntityCount()` from `LoadEntities().length` so hub tile counts match the list.
   - Fix cross-tab navigation jump in `src/explorer/ExplorerLists.tsx:50,86,121`: push relative routes inside `(apps)` when browsing Data Explorer inside the **Apps** tab so the bottom tab bar does not unexpectedly jump to **Home**.
2. **Clickable Foreign Keys & Polymorphic FKs on Record Detail (`explorer/record/[id].tsx`)**:
   - Standard FKs (`field.RelatedEntityID != null`): Resolve display text from the companion virtual name column on the base view (e.g., `Account` for `AccountID`, falling back to ID) and render as a tappable link chip pushing `record/[targetId]?entity=[field.RelatedEntity]`.
   - Polymorphic FKs (`field.EntityIDFieldName != null`, per MJ's metadata contract — **strictly driven by `EntityField.EntityIDFieldName`, zero column-name heuristics**): Read the target `EntityID` from the companion column on the loaded record, resolve `md.EntityByID(targetEntityId)`, fetch/display the target record's `NameField`, and link directly to that entity/record.
   - Add a collapsible **"Related"** section at the bottom of `record/[id].tsx` listing child `EntityRelationshipInfo` collections (`DisplayInForm === true`) with lazy count/preview expansion.
3. **Record Editing Polish (`src/components/RecordForm.tsx`)**:
   - Replace raw ISO-8601 text entry for `kind === 'date'` fields with a native platform date/time picker sheet, formatting display values cleanly per `IsDateOnlySQLType`.
4. **Contextual `"Ask Agent"` Handoff**:
   - Pass structured context params (`contextKind: 'entity' | 'view' | 'record' | 'query' | 'dashboard'`, `entityName`, `recordId`, `viewId`, `queryId`, `title`) when tapping `"Ask <AgentName> about this..."` on `entity/[name].tsx`, `record/[id].tsx`, `query/[id].tsx`, and `dashboard/[id].tsx`.
   - Render a removable context pill above the composer in `new-conversation.tsx` and inject a concise structured grounding block (entity name, primary key / view ID / query ID, and visible summary fields) into the initial turn.

### 3.3 Dashboards (`Config` Completeness & `DashboardEngine` Permissions)
1. **Permission-Correct Dashboard Listing (`src/data/services/explorer.ts:310-334`)**:
   - Replace raw `RunView({ EntityName: 'MJ: Dashboards', ExtraFilter: "Type = 'Config'" })` with `DashboardEngine.Instance` (`await DashboardEngine.Instance.Config(false, currentUser)`), filtering to `d.Type === 'Config'` **and** `DashboardEngine.Instance.GetDashboardPermissions(d.ID, currentUser.ID).CanRead === true` (honoring owner, direct `MJ: Dashboard Permissions`, and `MJ: Dashboard Category Permissions`).
2. **Complete `Config` Panel Support in `DashboardView.tsx`**:
   - **`Query` panels**: Existing KPI / SVG `BarChart` / preview cards; apply default parameter values from `QueryInfo.Parameters` so queries with optional/defaulted parameters execute instead of failing.
   - **`Artifact` panels**: Existing `ArtifactContentView` (now rendering full Markdown, Data tables, Charts, and Interactive Components).
   - **`View` panels**: Newly wired to `<SavedViewList compact />` (§3.1).
   - **`Component` panels**: Add `'component'` to `DashboardPartKind` and `kindFromTypeName` (`src/data/services/explorer.ts:448-462`, matching MJ's `Component` `DashboardPartType`) and render via `ComponentRenderer`!
   - **`WebURL` panels**: Validate `part.config.url` (`https://` only) and open via `expo-web-browser` (`openBrowserAsync`); hide the action button when no valid URL is present (eliminating the current dead button bug).
3. **`Type = 'Code'` Dashboards Posture for v1.0**:
   - Existing `Type = 'Code'` Angular dashboards remain excluded from the generic `Config` parser, **unless** a mobile driver is registered for `dashboard.DriverClass` via `@RegisterClass(BaseMobileResource, '<DriverClass>')` — in which case `LoadDashboards` and `HostedDashboard` resolve and mount that native `BaseMobileResource` seamlessly!

### 3.4 Agent Chat, Artifacts & Interactive Components Hardening
1. **Fix Markdown Artifacts (`src/artifacts/ArtifactContentView.tsx:130-157`)**:
   - Delete the local 25-line Phase 1 regex `MarkdownView` stub inside `ArtifactContentView.tsx` and import `@/components/markdown/MarkdownView` (`@memberjunction/markdown-core`) so tables, code blocks, links, callouts, and inline SVGs render identically in artifacts and chat bubbles.
2. **Eliminate Remote CDN Dependency in `DomComponentHost` (`src/interactive/dom-host/host-page.ts:40-47`)**:
   - `host-page.ts` currently loads `https://unpkg.com/@memberjunction/react-runtime@6.1.0/dist/runtime.umd.js` (stale vs workspace `6.2.x`), `react@18.2.0`, `react-dom@18.2.0`, and `@babel/standalone@7.29.1` from `unpkg.com`.
   - Bundle the exact workspace `@memberjunction/react-runtime` UMD build + React/ReactDOM/Babel core scripts as local static assets loaded into `DomComponentHost` (falling back to CDN only for optional third-party chart/grid libraries like `Chart.js` or `Leaflet` when declared by a component spec). This fixes version drift and works behind enterprise firewalls.
3. **Apple Guideline 2.5.2 Mitigation Flag (`InteractiveComponentMode`)**:
   - Apple App Review Guideline 2.5.2 scrutinizes executing downloaded code in native JS runtimes (Hermes `new Function`), whereas visual HTML/JS rendered inside Apple's sandboxed `WKWebView` (`react-native-webview`) is standard across enterprise BI/chat apps (Claude Artifacts, ChatGPT, Notion, Power BI).
   - Wire `brand.Features.InteractiveComponentMode` (`'dual' | 'webview-only'`): in `'webview-only'` mode, `ComponentRenderer` routes **all** interactive React component artifacts through `DomComponentHost` (`WKWebView`). If Apple Review challenges Hermes `new Function`, flipping one config/server flag keeps 100% of interactive components working without cutting the feature.
4. **Chat Thread UX & Data Windowing Fixes**:
   - Wire `onPress={(prompt) => void handleSend(prompt)}` on `SuggestedResponses` chips in `app/(tabs)/(chats)/chat/[id].tsx:484-488`.
   - Fix `LoadConversation` (`src/data/services/conversations.ts:241-243`): load the **most recent** 200 messages (`OrderBy: 'Sequence DESC', MaxRows: 200`, reversed client-side) with a `"Load earlier messages"` button instead of capping at the *oldest* 500 messages (`Sequence ASC`).
   - Fix `LoadConversations` (`src/data/services/conversations.ts:100-110`): scope the `MJ: Conversation Details` query to `ConversationID IN (...)` for the loaded conversations (or use latest-detail projection) so a single active chat doesn't starve older threads of snippets.
   - Add long-press / header menu actions for **Rename Conversation** and **Delete Conversation** (respecting owner permissions).
   - Verify/seed `UI`-role permissions for `MJ: Files` and `MJ: File Entity Record Links` (or route mobile attachment uploads through MJAPI's authenticated upload mutation) so attachments larger than `MaxInlineBytes` succeed for non-admin users.

---

## 4. iOS & Android Store Readiness Checklist

Every item below is a verified store-submission requirement or rejection trigger:

- [ ] **Google Play Photo/Video Permission Policy**: Remove `"android.permission.READ_MEDIA_IMAGES"` from `app.config.ts` (`expo-image-picker` v17 uses the Android System Photo Picker with zero broad media permissions).
- [ ] **Apple Guideline 5.1.1(i) (Unused Permission)**: Remove `"NSPhotoLibraryAddUsageDescription"` (app does not export/save images to the user's photo library).
- [ ] **Apple Guideline 5.1.1(v) (Account Deletion)**: Confirm mobile OAuth login flow disables public self-registration (enterprise-admin-provisioned B2B accounts, documented in App Review Notes with dedicated reviewer credentials), OR add an in-app `"Delete Account"` flow in `ProfileScreen`.
- [ ] **Apple Guideline 2.1 / 4.2 (App Completeness & Dead Controls)**:
  - Filter the **Apps** tab (`app/(tabs)/(apps)/apps.tsx`) so applications with **zero** mobile-resolvable `NavItems` are hidden by default (or grouped under a collapsed *"Web-only applications (N)"* footer note) instead of presenting 25 cards that only render `"opens on desktop"`.
  - Gate sample `LoadFieldNotesMobileResource()` (`src/host/registry.ts:47`) to `__DEV__` / tests only.
  - Clean `ProfileScreen` (`app/(tabs)/(you)/profile.tsx`): remove the root-tab `<` back button; use `GetBiometricLabel()` (`Face ID` / `Touch ID` / `Biometrics`) instead of hardcoded `"Face ID"`; wire `Connected workspace` (workspace info/switcher) and `Help & feedback` (`brand.Legal.SupportUrl`); hide `Voice responses` TTS toggle until implemented.
  - Make Terms & Privacy Policy links clickable on `LoginScreen` (`expo-web-browser` → `brand.Legal.TermsUrl` / `PrivacyPolicyUrl`).
- [ ] **Native Build, Privacy & EAS Configuration**:
  - Supply 1024×1024 app icon, Android adaptive icon (foreground + background), and `expo-splash-screen` assets via `brand.config.ts`.
  - Set `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` so TestFlight builds don't block on export-compliance prompts.
  - Add iOS `privacyManifests` (`NSPrivacyAccessedAPITypes` for FileTimestamp / UserDefaults / DiskSpace required by `react-native-mmkv` and `expo-file-system` — prevents Apple `ITMS-91053` rejection).
  - Fix `eas.json`: add a physical-device `preview` / `adhoc` iOS profile (`"simulator": false`) alongside a `simulator` profile, populate `extra.eas.projectId`, and configure `submit.production` for App Store Connect + Google Play Console.
  - Verify iPad compatibility-mode rendering (Apple reviews iPhone-only `supportsTablet: false` builds inside iPad 2x compatibility frame) and Android large-screen / foldable layout resilience.
- [ ] **Hardware Feature Cut Gate (Voice & Push Notifications)**:
  - **Voice (`MobileVoiceSession`)**: Currently supports WebRTC providers (OpenAI Realtime / GPT-Live) only and lacks `@config-plugins/react-native-webrtc` in `app.json`. Gate behind `brand.Features.EnableRealtimeVoice`: enable in v1.0 only if physical iOS + Android call/speakerphone/interruption QA passes in Week 5; otherwise ship disabled (`false`) and enable in v1.1.
  - **Push Notifications**: Currently lacks `eas.projectId`, `googleServicesFile` (FCMv1), and **any server-side sender reading `mobile.pushDeviceToken`**. Gate behind `brand.Features.EnablePushNotifications`: keep `false` for v1.0 unless server-side completion push via `@memberjunction/communication-expo-push` is wired and device-tested by Week 5.

---

## 5. Phased Execution Schedule (Nov – Dec 2026)

> **Calendar Constraint**: Apple App Store review throughput drops sharply during the December 20–27 holiday window. First-time enterprise OAuth + AI apps typically require 1–2 review cycles. **v1.0 Release Candidate builds should be submitted to App Store Connect and Google Play Console by Friday, December 11, 2026.**

### Phase 0: Alignment, CI Gate & P0 Unbreak (Week 1 — Nov 2–6)
- Resolve Decisions **D1–D6** (§6) and update this plan.
- Fix all **22 TypeScript errors** across the 4 broken Expo Router screens and add `"build": "tsc --noEmit"` to `packages/MobileApp/package.json` so Turbo/CI enforces type safety on every PR.
- Fix **P0-2** (`BootGate` unauthenticated launch/sign-out deadlock), **P0-3** (`Env` HTTPS/WSS URL configuration), **P0-4** (`__DEV__` guards on `DevTokenSheet`, dev routes, and safe internal handoff replacing URL `autosendAttachment`), **P0-5** (`signOut()` full purge of `offline-queue`, push token, WS client, and user caches + `UserInfoEngine` preference sync), and **P0-6** (`AppLockGate` overlay preserving `<Stack />`).
- **Exit Gate**: `pnpm run typecheck` (0 errors), `pnpm run test` (all green), cold unauthenticated boot → OAuth sign-in → chat → sign-out → second-user sign-in verified clean on iOS Simulator & Android Emulator.

### Phase 1: White-Label `BrandConfig`, `app.config.ts` & Runtime `ThemeProvider` (Week 2 — Nov 9–13)
- Author `MJMobileBrandConfig` (`brand.config.ts`), dynamic `app.config.ts`, default MJ brand icons/adaptive icons/splash assets, and dynamic `Constants.expoConfig?.scheme` OAuth redirects.
- Implement `BrandProvider` + `ThemeProvider` (`Light` + `Dark` + brand palette overrides + `<StatusBar>` sync) and migrate screens off static module-scope `Colors.*` references.
- Purge all ~20 hardcoded `"MemberJunction"`, `"MJ Mobile"`, `"MJ Explorer"`, `"Skip"`, and `"Sage"` strings in favor of `useBrand()`.
- If **D1** is approved, add lightweight `/.well-known/mj-mobile.json` discovery route in `@memberjunction/server` + Workspace URL step on `LoginScreen`.
- **Exit Gate**: Building with an alternate `brand.config.example.ts` produces a distinctly named, colored, icon-branded app in Light and Dark mode with zero `"MemberJunction"` or `"Skip"` leaks.

### Phase 2: Simple Views (`MJ: User Views`) & Scoped Data Explorer (Week 3 — Nov 16–20)
- Build `src/data/services/views.ts`, `useEntityViews`, `useRunUserView`, and virtualized `<SavedViewList />` (`FlatList` + `ViewID` execution + `GridState` column/sort projection + server `UserSearchString` + pagination).
- Integrate `<SavedViewList />` into `explorer/entity/[name].tsx` (with bottom-sheet view switcher) and register `'User Views'` / `'Views'` in `src/host/generic-resources.tsx`.
- Scope `LoadEntities` by `IncludeInAPI`, `CanUserRead`, and `MJ: Application Entities`; fix `EntityCount()` and cross-tab navigation in `ExplorerLists.tsx`.
- Add tappable FK & metadata-driven polymorphic FK (`EntityField.EntityIDFieldName`) record links + collapsible Related lists on `record/[id].tsx`, native date picker in `RecordForm.tsx`, and contextual `"Ask Agent"` handoff to `new-conversation.tsx`.
- **Exit Gate**: Unit + integration tests for `views.ts` and FK resolution; user can switch saved views, search server-side across >100 rows, tap FKs between records, and ask an agent about a specific record with context pre-attached.

### Phase 3: Dashboards, Artifacts & Chat Polish (Week 4 — Nov 23–27)
- Migrate `LoadDashboards` to `DashboardEngine.Instance` permissions; wire **`View`** (`<SavedViewList compact />`) and **`Component`** (`ComponentRenderer`) panel types in `DashboardView.tsx`; fix `WebURL` link validation and defaulted `Query` parameters.
- Replace the Phase 1 regex stub in `ArtifactContentView.tsx` with `@/components/markdown/MarkdownView`.
- Bundle `@memberjunction/react-runtime` + core UMD scripts locally for `DomComponentHost` (`host-page.ts`) and wire `InteractiveComponentMode: 'dual' | 'webview-only'`.
- Wire `SuggestedResponses` chip taps, newest-first message windowing (`Sequence DESC` + `"Load earlier"`), conversation rename/delete actions, and verify `UI`-role attachment uploads.
- **Exit Gate**: Full Maestro E2E suite updated and green across Login, Chat, Markdown/Data/Interactive Artifacts, Saved Views, Record Edit, and Config Dashboards.

### Phase 4: Store Policy Scrub, Hardware QA & Internal Track Alpha (Week 5 — Nov 30–Dec 4)
- Complete Section 4 Store Readiness Checklist (Android permission removal, iOS `Info.plist` & `privacyManifests`, filtered `Apps` tab, cleaned `ProfileScreen` & legal links, EAS physical-device + production profiles).
- Distribute EAS builds to **TestFlight (iOS)** and **Google Play Internal Testing (Android)**.
- Execute physical-device QA matrix (iPhone, iPad 2x compatibility mode, Pixel/Samsung Android, OS Dark Mode, cellular/offline transitions, OAuth deep-link callback, biometric lock). Make final v1.0 flag call on Voice & Push.

### Phase 5: Store Submission & `@memberjunction/mobile-core` Package Extraction (Week 6 — Dec 7–11, Buffer Dec 14–23)
- **By Dec 11**: Submit v1.0 RC to **Apple App Store Review** and **Google Play Production Review** with comprehensive reviewer notes, demo enterprise workspace & credentials, screenshots, and privacy nutrition labels.
- Extract `@memberjunction/mobile-core` + standalone brandable starter template (`brand.config.ts` + `app.config.ts` + `WHITE_LABEL_GUIDE.md`) and verify an external branded build compiles cleanly via EAS outside the monorepo.
- **Dec 14–23**: App Review turnaround buffer (with `InteractiveComponentMode: 'webview-only'` fallback ready if Guideline 2.5.2 is raised) and v1.0 GA release.

---

## 6. Open Decisions (`D1`–`D6`)

| ID | Question | Recommended Lean |
| :--- | :--- | :--- |
| **D1** | **Official Store App Multi-Tenancy**: Should the official MJ App Store / Play Store binary include a **"Workspace URL"** login step (`/.well-known/mj-mobile.json` discovery) so any MJ customer can connect to their own server, while white-label builds lock `DefaultGraphqlUrl` and set `AllowCustomWorkspaceUrl: false`? | **Yes** — makes the official store listing immediately useful to every MJ customer while keeping white-label apps single-tenant and zero-friction. |
| **D2** | **Dashboards Scope (`Config` vs. `Code`)**: Is full `Config` dashboard support (`Query` + `Artifact` + `View` + `Component` panels) sufficient for v1.0, leaving `Type = 'Code'` Angular dashboards desktop-only unless an app explicitly registers a native `BaseMobileResource` for that `DriverClass`? | **Yes (`Config` + optional `BaseMobileResource` override)** — avoids porting bespoke Angular admin dashboards before launch while making every user/agent-authored dashboard work on mobile. |
| **D3** | **Simple Views (`MJ: User Views`) Scope**: Is **executing existing saved views** (view picker, `ViewID` filter/column/sort execution, server search, pagination, FK tap-through, and Dashboard `View` panels) sufficient for v1.0, deferring *creating/editing view definitions* and *creating new entity records* on mobile to v1.1? | **Yes** — matches mobile lookup/triage workflows and ships cleanly within Week 3. |
| **D4** | **Interactive Components & Apple Guideline 2.5.2**: Ship v1.0 with `'dual'` mode (Hermes native + `WKWebView` `DomComponentHost`) backed by a `'webview-only'` kill-switch, OR default production iOS builds to `'webview-only'` (`DomComponentHost` with locally bundled `@memberjunction/react-runtime`) from day one? | **Default production builds to `'webview-only'` (or `'dual'` with server-togglable flag)** — localizing `react-runtime` inside `DomComponentHost` eliminates `unpkg.com` failures, supports 100% of DOM/Canvas + React specs, and minimizes Apple 2.5.2 review friction; we can also trim heavy native-only libs (`xlsx`, `moment`, `luxon`) if `'webview-only'` is chosen. |
| **D5** | **Voice & Push Notification Cut Line for v1.0**: Gate `EnableRealtimeVoice` and `EnablePushNotifications` behind `BrandConfig.Features` and default **off (`false`)** for v1.0 unless end-to-end hardware QA + server push sender land cleanly before Week 5? | **Yes (default `false` for v1.0, ship in v1.1)** — protects the Dec 11 store submission deadline from WebRTC native plugin edge cases and missing server push triggers. |
| **D6** | **Timing of `@memberjunction/mobile-core` Package Split**: Refactor `BrandConfig` + `app.config.ts` + `ThemeProvider` inside `packages/MobileApp` first (Week 2) and extract the published `@memberjunction/mobile-core` npm package + starter template in Week 5–6, OR split packages upfront in Week 2? | **Refactor boundary in Week 2 (`src/core/*` vs `brand.config.ts`), extract npm package in Week 5–6** — avoids Metro/monorepo packaging churn blocking feature velocity while guaranteeing clean separation for white-label consumers at v1.0 launch. |

---

## 7. Explicit Non-Goals for v1.0 (Deferred to v1.1+)

- Authoring or modifying `MJ: User Views` filter trees / column layouts from a phone.
- Porting desktop-only Angular administrative surfaces (CodeGen, Entity/Schema Admin, Workflow/Action Designer, Component Studio) to React Native.
- Multi-pane tablet split-view layouts (`supportsTablet: true` dedicated iPad UX — v1.1).
- Non-WebRTC PCM16 realtime voice providers on Hermes (`Gemini Live`, `ElevenLabs`, `AssemblyAI` — requires native PCM audio worklet bridge, tracked in [`PHASE4-V6-REALTIME.md`](PHASE4-V6-REALTIME.md)).
- Full offline read-replica sync (v1.0 caches metadata/settings in MMKV and queues scalar record updates while offline, replaying on reconnect).
