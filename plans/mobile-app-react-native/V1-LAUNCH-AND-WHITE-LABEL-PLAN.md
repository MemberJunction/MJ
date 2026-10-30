# MJ Mobile v1.0 — White-Label Architecture, Core Data Surfaces & Year-End Store Launch Plan

**Status:** Proposed Plan of Record — **Revision 2** (2026-10-29)  
**Target Milestone:** v1.0 Public & White-Label Release on **Apple App Store (iOS)** and **Google Play Store (Android)** in **Q4 2026** (Submission target: **December 11, 2026**, ahead of holiday App Review slowdowns)  
**Companions:** [`README.md`](README.md) (Phase 1–3 foundation), [`MOBILE-AS-APP-HOST.md`](MOBILE-AS-APP-HOST.md) (`BaseMobileResource` hosting contract), [`PHASE4-V6-REALTIME.md`](PHASE4-V6-REALTIME.md) (v6 runtime extraction & realtime sessions)  
**Primary Package:** [`packages/MobileApp/`](../../packages/MobileApp/) (`@memberjunction/mobile-app`, Expo SDK 54, React Native 0.81.5, React 19.1.0, Hermes, New Architecture)

> **Revision 2 Note (2026-10-29):** Upgraded §0, §2, §3.3, §5, and §6 to enforce **100% zero-copy branding and zero-copy extensibility** matching MJ Explorer's idiomatic architecture:
> 1. **Zero-route-file `<MJMobileApp />` minimal host shell** (programmatic `@react-navigation/native` inside `@memberjunction/mobile-core`, eliminating host-level Expo Router `app/` wrapper files that would drift across MJ upgrades).
> 2. **Direct reuse of MJ's existing Theme & Auth server infrastructure** (`@memberjunction/theme-engine` + `MJ: Themes`, `GET /auth/providers`, and `GET /auth/login-screen`) instead of inventing mobile-only theme/auth discovery schemas.
> 3. **Full MJ-idiomatic `@RegisterClass` / `MJGlobal.ClassFactory` extension hierarchy + `mj codegen manifest --open-app-mobile-bootstrap`** (`dynamicPackages.mobile`) so both local customer extensions and OpenApps (`@mj-biz-apps/*-mobile`) plug in via metadata with zero copy/paste.

---

## 0. Executive Summary & Product Mandate

Our goal is to **ship the first production cut of MJ Mobile to the iOS App Store and Google Play Store before year-end 2026**, while structuring the architecture so **any organization or partner can distribute either a 100%-stock branded mobile binary OR a metadata-extended custom mobile app without copying or forking a single screen or route**.

### Core v1.0 Product Scope
1. **Zero-Copy White-Label Brandability & Idiomatic MJ Extensibility**:
   - **Minimal App Shell (`<MJMobileApp />`)**: Mirrors `MJExplorer`'s 12-line `AppComponent` (`<mj-explorer-app />`). The entire navigation tree lives inside **`@memberjunction/mobile-core`** (`@react-navigation/native`), so a pure-brand customer repo contains **zero screen files and zero route files** — only `brand.config.ts` (compile-time native store identity), `app.config.ts` (`withMJMobileBrand`), `assets/`, and an ~8-line `App.tsx`.
   - **Shared Server-Driven Theme & Auth**: Runtime colors (Light + Dark OKLCH ramps), login screen branding, and SSO providers come directly from MJ's **already-shipped** `@memberjunction/theme-engine` (`MJ: Themes`), `GET /auth/providers` (`PublicAuthProviderCatalog`), and `GET /auth/login-screen` (`PublicLoginScreen`). Configuring branding and auth once in MJ brands **both Web and Mobile**.
   - **Idiomatic `@RegisterClass` + `mj codegen manifest` Extensions**: Apps and OpenApps extend or override any surface (`BaseMobileResource`, `BaseMobileDashboard`, `BaseMobileEntityForm`, `BaseMobileRecordCard`, `BaseMobileArtifactRenderer`, `BaseEntity`) via `MJGlobal.ClassFactory` and `mj codegen manifest --open-app-mobile-bootstrap` (`dynamicPackages.mobile`) — zero copy/paste, zero manual registry edits.
2. **Simple View Functionality (`MJ: User Views`)**:
   - First-class execution of saved `MJ: User Views` per entity (`RunView({ ViewID })`), honoring saved `WhereClause` / `SmartFilterWhereClause`, `GridState` column visibility/order, and `SortState`, paired with server-side `UserSearchString` and virtualized pagination.
   - **Minimalist Smart Filter View Creation/Edit**: A one-handed bottom sheet (`Name` + natural-language `SmartFilterPrompt` with `SmartFilterEnabled = true`) that saves an `MJ: User Views` entity so `MJUserViewEntityServer` generates the SQL `SmartFilterWhereClause` and `SmartFilterExplanation` via AI on the server — giving mobile users view creation without a complex filter-tree builder.
   - One reusable `<SavedViewList />` primitive powering **Entity Views**, hosted **`ResourceType: 'Views'`** nav items, and **`View` panels inside Dashboards**.
3. **Dashboards & Scoped Data Explorer**:
   - Complete `Config` dashboard rendering across all four mobile-native panel kinds (`Query`, `Artifact`, **`View`**, and **`Component`**) backed by `DashboardEngine` permissions, plus `BaseMobileDashboard` resolution for `Type = 'Code'` dashboards that register a native counterpart.
   - Application- and permission-scoped Data Explorer (`IncludeInAPI`, `CanUserRead`, `MJ: Application Entities`), clickable foreign-key and metadata-driven polymorphic FK (`EntityField.EntityIDFieldName`) record links, native date picker in `RecordForm`, and contextual `"Ask Agent"` handoffs carrying entity/record/view/query context.
4. **Agent Chat & Artifacts / Interactive Components**:
   - Harden the existing `ConversationsRuntime` chat experience, wire `ArtifactContentView` to `@memberjunction/markdown-core` (`MarkdownView`), bundle `@memberjunction/react-runtime` locally for `DomComponentHost` (eliminating `unpkg.com` version drift and firewall failures), and include a runtime execution-mode switch (`dual` vs `webview-only`) to de-risk Apple App Review Guideline 2.5.2.

---

## 1. Honest Baseline Audit (Verified Against Source, 2026-10-29)

### 1.1 What Is Already Strong
- **"One TypeScript Brain" on Hermes**: `@memberjunction/core`, `core-entities`, `global`, `graphql-dataprovider`, `conversations-runtime`, `realtime-runtime`, `theme-engine`, and `markdown-core` are pure framework-agnostic TypeScript and run on Hermes with only a 41-line polyfill (`packages/MobileApp/src/polyfills.ts`).
- **Metadata-Driven Hosting Proof of Concept**: `BaseMobileResource` (`src/host/BaseMobileResource.ts`) and `BaseMobileArtifactRenderer` (`src/artifacts/BaseMobileArtifactRenderer.ts`) resolve through `MJGlobal.ClassFactory` against existing `MJ: Applications` and artifact metadata.
- **Dual Interactive Component Engine**: `ComponentRenderer` (`src/interactive/ComponentRenderer.tsx`) routes pure-JS specs to `InteractiveComponentRenderer` (Hermes) and DOM/Canvas specs (`Chart.js`, `ApexCharts`, `AG Grid`, `Leaflet`, `antd`) to `DomComponentHost` (`src/interactive/dom-host/DomComponentHost.tsx`), a credential-free `react-native-webview` with an RPC `postMessage` bridge for `RunView` / `RunQuery` and `CapturedDataFallback` on error.
- **Unit Test Foundation**: 523 passing Vitest tests across 40 test files (`3.2s`) plus 9 Maestro flows (`.maestro/`).

### 1.2 Baseline Readiness Scorecard

| Surface | Current State | Key Gap to Close for v1.0 |
| :--- | :---: | :--- |
| **Build & Boot Health** | 🟢 Fixed (P0-1 – P0-6, 2026-10-30) | `pnpm run typecheck` 0 errors with `build` enforced by Turbo; unauthenticated launch, sign-out and second-user sign-in verified on the iOS Simulator; `Env` takes `EXPO_PUBLIC_MJ_GRAPHQL_URL` with a dev-only localhost fallback. Android Emulator run of the exit flow still outstanding. |
| **Simple Views (`MJ: User Views`)** | 🔴 0% | Zero `MJ: User Views` or `ViewID` usage anywhere in `MobileApp`; `View` dashboard panels and `Views` app nav items show `"opens on desktop"`. |
| **White-Label & Extension Architecture** | 🔴 15% | `"private": true` monorepo package, host-filesystem `app/` routes (Expo Router), static `app.json` (no icons/splash), hardcoded dev Auth0/MSAL & `mjmobile://`, static light-only `tokens.ts` (ignoring `@memberjunction/theme-engine`), hand-edited `registry.ts` (ignoring `mj codegen manifest`). |
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
   - **Fix**: Keep the root navigator always mounted; guard only the authenticated tab shell (or switch navigator branches declaratively on `status === 'ready'`).
3. **P0-3 — Cleartext `http://` + Port `:4001` Hardcoded in `Env`**:
   - `src/config/env.ts:35-36` builds `http://${LocalApiHost}:4001/graphql` and `ws://${LocalApiHost}:4001/graphql`. Production MJAPI servers run `https://` / `wss://` on port 443, and iOS App Transport Security blocks cleartext HTTP to remote hosts in release builds.
   - **Fix**: Accept full `EXPO_PUBLIC_MJ_GRAPHQL_URL` / `EXPO_PUBLIC_MJ_WS_URL` (and brand/workspace URL config) with automatic `https://` → `wss://` derivation, falling back to `http://localhost:4001/graphql` only in `__DEV__`.
4. **P0-4 — Deep-Link Prompt Injection / File Exfiltration & Exposed Production Dev Surfaces**:
   - `app/(tabs)/(chats)/chat/[id].tsx:184-200` reads `autosend` and `autosendAttachment` from URL query params and immediately runs `handleSend()` + `ReadAttachmentBase64(new File(att.uri))` without confirmation. An external link (`<scheme>:///chat/<id>?autosend=...&autosendAttachment={"uri":"file:///..."}`) can execute arbitrary agent prompts and exfiltrate readable sandbox files to MJ Storage.
   - `app/login.tsx:139-148` exposes `"Developer options -> Paste JWT"` without `if (__DEV__)`, and `app/devchat.tsx`, `app/interactive-demo.tsx`, and `app/markdown-preview.tsx` ship in the production route tree.
   - **Fix**: Replace URL-param `autosendAttachment` with an in-memory one-time handoff store from `new-conversation.tsx` (never from external deep links); require user confirmation or `__DEV__` for `autosend`; guard `DevTokenSheet` and all dev/demo screens behind `__DEV__`.
5. **P0-5 — Cross-User Data, Offline-Queue & Push-Token Leak on Sign-Out**:
   - `src/providers/mj-provider.tsx:289-306` (`signOut()`) does **not**:
     1. Clear `offline-queue.ts` (`mj-mobile-offline-queue`) — User A's queued offline mutations replay under User B's session.
     2. Call `UnregisterDeviceToken()` (`src/data/services/notifications.ts:144`) — User A's `MJ: User Settings` retains the device push token.
     3. Tear down the GraphQL WebSocket client, clear `PrefsStorage` / `MMKVStorageProvider`, or reset `UserInfoEngine.Instance` & `DashboardEngine.Instance`.
   - Also note: `MMKVStorageProvider` (`src/providers/mmkv-storage-provider.ts`) is currently dead code (never wired into `GraphQLDataProvider` / `Metadata` at boot), and user preferences in `src/data/preferences.ts` write only to local MMKV rather than syncing per-user preferences through `UserInfoEngine.Instance` (`MJ: User Settings`).
6. **P0-6 — Biometric `AppLockGate` Unmounts Navigation & Active Calls on Background**:
   - `src/auth/AppLockGate.tsx:20-24` returns `<LockScreen />` *instead of* `{children}` when locked (`useAppLock.ts:84`), unmounting the navigation tree on every background transition and destroying navigation history, unsent chat drafts, and active voice calls.
   - **Fix**: Always render `{children}` and mount `<LockScreen />` as an opaque `StyleSheet.absoluteFill` overlay above it (blocking pointer events and OS app-switcher snapshots).

---

## 2. Zero-Copy White-Label & Idiomatic MJ Extension Architecture

### 2.1 Why Branding & Extending Currently Require Forking (and the Expo Router Trap)
1. **The Host-Filesystem Routing Trap (`expo-router/entry` + `app/`)**: Today all 25 route files live in `packages/MobileApp/app/` coupled to Expo Router's filesystem scanner. Even if screen logic moved to a library and customers kept "thin route wrapper files" in their own `app/` folder, **that is still copy/paste**: every time MJ adds a new screen or route in v6.3+, every downstream customer repo is broken/stale until they copy the new route wrappers.
2. **Private Monorepo Package & Hand-Edited Registry**: `@memberjunction/mobile-app` is `"private": true`; `BaseMobileResource` is internal (`@/host/BaseMobileResource`); and `src/host/registry.ts` is hand-maintained instead of generated by `mj codegen manifest`. External repos and OpenApps (`@mj-biz-apps/*`) cannot register mobile surfaces without forking `MobileApp`.
3. **Static `app.json` & Hardcoded `mjmobile://` Scheme**: Static JSON with zero icons/splash; `src/auth/auth0.ts:45` and `src/auth/msal.ts:49` hardcode `scheme: 'mjmobile'`.
4. **Disconnected from MJ's Existing Server Theme & Auth Primitives**: `src/theme/tokens.ts` freezes static light-only hex values at module load time and `src/config/env.ts` hardcodes dev Auth0/MSAL IDs — completely bypassing MJ's already-shipped **`@memberjunction/theme-engine`** (`MJ: Themes`), **`GET /auth/providers`** (`PublicAuthProviderCatalog`), and **`GET /auth/login-screen`** (`PublicLoginScreen` from Login Studio).
5. **Hardcoded Brand & Persona Strings**: ~20 files hardcode `"MemberJunction"`, `"MJ Mobile"`, `"MJ Explorer"`, `"Skip"`, and `"Sage"`.

### 2.2 The `<MJMobileApp />` Minimal App Shell Pattern (100% Zero-Copy Host)

We mirror **`MJExplorer`'s 12-line Minimal App Shell** (`packages/MJExplorer/src/app/app.component.ts` → `<mj-explorer-app />`):
- Move the entire navigation graph **inside `@memberjunction/mobile-core`** using **`@react-navigation/native` programmatically** (the exact engine Expo Router wraps under the hood, with full deep-linking `linking` config derived from `brand.UrlScheme`) rather than scanning a host `app/` directory.
- Separate **`@memberjunction/mobile-bootstrap`** (built-in `@RegisterClass` registrations) + **`mj codegen manifest`** (host & OpenApp `@RegisterClass` registrations) from the UI shell.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Thin Mobile Host Repo (Official MJ App, Pure White-Label, or Extended App)   │
│  ├── package.json             ← depends on @memberjunction/mobile-core       │
│  ├── brand.config.ts          ← ONLY compile-time native binary identity     │
│  ├── app.config.ts            ← withMJMobileBrand(config, brandConfig)       │
│  ├── assets/                  ← icon.png, adaptive-icon.png, splash.png      │
│  ├── App.tsx                  ← ~8 lines mounting <MJMobileApp />            │
│  └── src/generated/           ← class-registrations-manifest.ts (prebuild)   │
│      (ZERO screen files! ZERO route wrapper files! Optional src/extensions/) │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ @memberjunction/mobile-core  +  @memberjunction/mobile-bootstrap (NPM)       │
│  ├── <MJMobileApp />          ← Programmatic @react-navigation/native shell  │
│  ├── ThemeProvider            ← Powered by @memberjunction/theme-engine      │
│  ├── MobileAuthCatalog        ← Consumes MJServer GET /auth/providers        │
│  ├── MobileLoginScreenLoader  ← Consumes MJServer GET /auth/login-screen     │
│  ├── ClassFactory Base Family ← BaseMobileResource / Dashboard / Form / Card │
│  └── Stock Screens            ← Login, Home, Chats, SavedViews, Explorer...  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Shared Framework-Agnostic MJ Brain (@memberjunction/*)                       │
│  core · core-entities · global · graphql-dataprovider · theme-engine         │
│  markdown-core · conversations-runtime · realtime-runtime · react-runtime    │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### What a Complete Customer `App.tsx` Looks Like (Both Pure-Brand and Extended!)

```tsx
import '@memberjunction/mobile-core/polyfills';
import { CLASS_REGISTRATIONS } from '@memberjunction/mobile-bootstrap';
import { CLASS_REGISTRATIONS as LOCAL_AND_OPENAPP_CLASSES } from './src/generated/class-registrations-manifest';
import { MJMobileApp } from '@memberjunction/mobile-core';
import { brandConfig } from './brand.config';

// Anchor @RegisterClass manifests against Metro/Hermes tree-shaking (identical to MJExplorer app.module.ts)
export const REGISTERED_MOBILE_CLASSES = [...CLASS_REGISTRATIONS, ...LOCAL_AND_OPENAPP_CLASSES];

export default function App() {
    return <MJMobileApp brand={brandConfig} />;
}
```

**Why this matters for pure-brand distribution:**  
An organization distributing an app that is **100% identical in functionality** (different name, bundle ID, App Store icon, splash screen, locked server URL, and brand theme) maintains **4 small config files + `assets/`** and **zero UI/route code**. When MJ ships v6.3 with new tabs, screens, or capabilities, they run `pnpm up @memberjunction/mobile-core @memberjunction/mobile-bootstrap && eas build` — **zero copy/paste, zero merge conflicts**.

### 2.3 Compile-Time Native Identity (`brand.config.ts`) vs. Runtime MJ Server Theme & Auth

Instead of duplicating theme or OAuth schemas on mobile, we split **what Apple/Google require baked into the native `.ipa`/`.aab` at build time** from **what MJServer already serves dynamically at runtime**:

1. **Compile-Time Native Binary Config (`brand.config.ts` → `withMJMobileBrand` in `app.config.ts`)**:
   Contains *only* native store/OS manifest fields plus cold-boot fallback seeds before the first server fetch:
   ```typescript
   import type { ThemeSeeds } from '@memberjunction/theme-engine';

   export interface MJMobileBrandConfig {
       // Native OS / Store Identity (baked into Info.plist & AndroidManifest.xml by app.config.ts)
       AppName: string;                  // e.g. "Acme AI"
       Slug: string;                     // e.g. "acme-ai"
       Version: string;                  // e.g. "1.0.0"
       IosBundleIdentifier: string;      // e.g. "com.acme.mobile"
       AndroidPackage: string;           // e.g. "com.acme.mobile"
       UrlScheme: string;                // e.g. "acmeai" -> acmeai://auth OAuth callback & deep links
       EasProjectId?: string;
       Assets: {
           Icon: string;                 // 1024x1024 PNG
           AdaptiveIconForeground: string;
           AdaptiveIconBackground: string;
           SplashImage: string;
           SplashBackgroundColor: string;
           SplashBackgroundColorDark?: string;
       };

       // Server Targeting
       DefaultGraphqlUrl?: string;       // Locked URL for white-label builds (e.g. "https://api.acme.com/graphql")
       AllowCustomWorkspaceUrl: boolean; // true for Official MJ Store App, false for single-tenant white-label

       // Pre-network Cold-Boot Fallback Seeds & Legal Links (overridden by server theme/login-screen once connected)
       FallbackThemeSeeds?: Partial<ThemeSeeds>;
       DesktopAppLabel?: string;         // e.g. "Acme Web" (replaces hardcoded "MJ Explorer")
       DefaultAgentFallbackName?: string;// e.g. "Assistant" (replaces hardcoded "Skip" / "Sage")
       Legal: {
           TermsUrl: string;
           PrivacyPolicyUrl: string;
           SupportUrl: string;
       };

       // Native Capability Gates
       Features: {
           EnableRealtimeVoice: boolean;
           EnablePushNotifications: boolean;
           InteractiveComponentMode: 'dual' | 'webview-only';
       };
   }
   ```
   - `withMJMobileBrand` interpolates `${brand.AppName}` into every iOS `NS*UsageDescription` string and configures icons, splash, bundle IDs, scheme, privacy manifests, `ITSAppUsesNonExemptEncryption: false`, iOS 27 `UIScene` lifecycle (`UIApplicationSceneManifest` + `SceneDelegate`), and `IPHONEOS_DEPLOYMENT_TARGET >= 15.1` across CocoaPods targets.
   - OAuth redirect URIs read `Constants.expoConfig?.scheme` dynamically (`<UrlScheme>://auth`), never hardcoded `'mjmobile'`.

2. **Runtime Branding & Auth — Reusing Existing MJ Server Infrastructure (Zero New Server Endpoints Required)**:
   - **Pre-Login Auth Discovery (`GET /auth/providers`)**: Extract the pure-TS fetch/resolution logic from `packages/Angular/Explorer/auth-services/src/lib/auth-provider-catalog.ts` into a shared framework-agnostic helper (in `@memberjunction/core` or `@memberjunction/auth-client`) consumed by **both** `MJExplorer` and `MJMobileApp`. Mobile discovers the workspace's active OAuth providers (`Auth0`, `MSAL`, `Okta`, `Cognito`, `WorkOS`, `OIDC`), client IDs, tenants/domains, and audiences directly from `MJServer`!
   - **Pre-Login Branding (`GET /auth/login-screen`)**: Reuse `SanitizePublicLoginScreen` (`PublicLoginScreen` from `@memberjunction/theme-engine`, already served by `MJServer` from Login Studio) to render the organization's published logo, title, tagline, and brand colors on `LoginScreen` before sign-in!
   - **Post-Login Full Light & Dark Theme (`@memberjunction/theme-engine` + `MJ: Themes`)**: Feed the active `MJ: Themes` brand seeds (falling back to `brand.FallbackThemeSeeds` / `MJ_DEFAULT_SEEDS`) into `DeriveTheme()` from **`@memberjunction/theme-engine`**, mapping `DerivedTheme.tokens.light` and `DerivedTheme.tokens.dark` directly into React Native's `ThemeProvider` (`useTheme()` + `useThemedStyles`). Sync user mode (`'system' | 'light' | 'dark'`) via `UserInfoEngine.Instance.SetSettingDebounced('mobile.appearance', mode)` with MMKV caching for zero-flash startup.
   - **Multi-Tenant Official Store App (`AllowCustomWorkspaceUrl: true`)**: Entering a workspace URL on `LoginScreen` simply calls the server's **existing** `GET <origin>/auth/providers` and `GET <origin>/auth/login-screen` — immediately branding the login screen and showing the exact SSO button(s) for that customer's server!

### 2.4 Zero-Copy Extensibility via MJ Metadata, `ClassFactory` & `mj codegen manifest`

Organizations and OpenApp authors extend or replace mobile behavior **without modifying or copying `@memberjunction/mobile-core`**, using the exact same two primitives as MJ Explorer:

#### A. Idiomatic `@RegisterClass` Base-Class Family (Exported by `@memberjunction/mobile-core`)
Every mobile surface resolves through `MJGlobal.Instance.ClassFactory.CreateInstance(BaseClass, key)`. Because `ClassFactory` honors registration priority, registering a subclass at higher priority cleanly overrides any stock MJ mobile component:

| Base Class | `ClassFactory` Key (Metadata Source) | What Extending It Does (Zero Base Code Edits) |
| :--- | :--- | :--- |
| **`BaseMobileResource`** | `NavItem.DriverClass` (for `ResourceType: 'Custom'`) **or** `NavItem.ResourceType` (`'User Views'`, `'Records'`, `'Dashboards'`, `'Queries'`) from `MJ: Applications.DefaultNavItems` | Adds a bespoke mobile tab/surface to any MJ Application — or globally overrides a stock generic resource renderer at priority `> 0`. |
| **`BaseMobileDashboard`** | `MJ: Dashboards.DriverClass` (when `Type = 'Code'`) | Lets an app or OpenApp provide a native React Native counterpart for a `Type = 'Code'` dashboard against the **exact same `MJ: Dashboards` metadata row**. |
| **`BaseMobileEntityForm`** / **`BaseMobileEntitySection`** | `EntityInfo.Name` (e.g. `'Deals'`, `'MJ: Tasks'`) | Replaces or injects custom sections into `RecordDetail` / `RecordForm` for a specific entity (parallel to custom Angular entity forms). |
| **`BaseMobileRecordCard`** | `EntityInfo.Name` (or `ViewID`) | Customizes how individual rows render inside `<SavedViewList />` while inheriting view switching, server search, and infinite scroll for free. |
| **`BaseMobileArtifactRenderer`** | `MJ: Artifact Types.Name` / `DriverClass` | Adds or overrides native rendering for custom agent artifact types. |
| **`BaseMobileAuthProvider`** | `PublicAuthProviderInfo` provider type (`'auth0'`, `'msal'`, `'okta'`, `'oidc'`, etc.) | Pluggable mobile OAuth/PKCE handler resolved dynamically from `GET /auth/providers`. |
| **`BaseEntity` Subclasses** | `EntityInfo.Name` (generated `mj_generatedentities` & `@mj-biz-apps/*-entities`) | Existing business-logic subclasses, `Validate()` rules, and typed getters/setters run **unchanged** on Hermes. |

#### B. Build-Time Discovery Without Manual Imports (`mj codegen manifest --open-app-mobile-bootstrap`)
Metro/Hermes (like esbuild on web) eliminates unreferenced modules whose only connection to the app is a `@RegisterClass` decorator side effect. Instead of hand-editing `src/host/registry.ts`, we reuse **`packages/MJCLI/src/commands/codegen/manifest.ts`**:
1. Add `--open-app-mobile-bootstrap` support to `mj codegen manifest`, reading `dynamicPackages.mobile` from `mj.config.cjs` / `mj-app.json` (parallel to `dynamicPackages.client` for `-ng` packages and `dynamicPackages.server` for API packages).
2. Wire `prestart` and `prebuild` in the thin mobile host's `package.json` (identical to `packages/MJExplorer/package.json:10-11`):
   ```json
   "prestart": "mj codegen manifest --exclude-packages @memberjunction --output ./src/generated/class-registrations-manifest.ts --open-app-mobile-bootstrap",
   "prebuild": "mj codegen manifest --exclude-packages @memberjunction --output ./src/generated/class-registrations-manifest.ts --open-app-mobile-bootstrap"
   ```
3. **Result across all 3 distribution models**:
   - **Model 1 — Official MJ Multi-Tenant Store App**: 1 binary published by MJ; `AllowCustomWorkspaceUrl: true`; connects to any MJ server via `/auth/providers` + `/auth/login-screen` + `MJ: Themes`.
   - **Model 2 — 100%-Stock White-Label Store App**: Customer repo has 4 config files + `assets/`; `AllowCustomWorkspaceUrl: false`; zero custom code, zero copied routes; updates via `pnpm up`.
   - **Model 3 — Extended Enterprise / OpenApp Mobile App**: Same 4-file host repo + installed `@mj-biz-apps/*-mobile` / `*-entities` packages (via `mj app install`) and/or local `src/extensions/*.tsx` `@RegisterClass` files — auto-discovered by `mj codegen manifest` and rendered from MJ metadata!

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
   - Replace unvirtualized `ScrollView` + in-memory 100-row filtering in the entity records screen with React Native `<FlatList>` (`onEndReached` pagination + pull-to-refresh + debounced 300ms server-side `UserSearchString` + active filter/sort summary chips), delegating row rendering to `ClassFactory` `BaseMobileRecordCard` if registered for that entity and falling back to the generic view card.
3. **One `<SavedViewList />` Component Unlocks Three Surfaces**:
   - **Data Explorer Entity Screen**: Header/pill dropdown (`"Active Accounts ▾"`) opening a bottom-sheet view picker ("My Views" / "Shared Views" / "All Records" + **"+ New Smart View"**).
   - **Hosted Application `Views` Nav Items**: Register `@RegisterClass(BaseMobileResource, 'User Views')` / `'Views'` in `@memberjunction/mobile-bootstrap` so any `MJ: Applications` nav item pointing to a saved view renders natively instead of `"opens on desktop"`.
   - **Dashboard `View` Panels (`DashboardView.tsx:110`)**: Replace `<DesktopOnlyPart>` on `case 'view':` with `<SavedViewList viewId={part.config.viewId} entityName={part.config.entity} compact maxRows={8} />` plus an `"Open full view →"` footer link.
4. **Minimalist Smart Filter View Sheet (`SmartFilterViewSheet.tsx`)**:
   - Let users create or edit a personal `MJ: User Views` record using just two inputs: **View Name** and **Smart Filter Prompt** (e.g., *"Open enterprise deals over $50k closing this quarter"*).
   - Saving sets `SmartFilterEnabled = true` and `SmartFilterPrompt`; `MJUserViewEntityServer` generates `SmartFilterWhereClause` and `SmartFilterExplanation` server-side and returns them automatically (`GraphQLDataProvider._serverDerivedUpdateFieldsByEntity`).

### 3.2 Scoped Data Explorer, Relational Links & Contextual Agent Handoff
1. **Entity Permission & Application Scoping (`src/data/services/explorer.ts:27-38`)**:
   - Tighten `LoadEntities(options?: { applicationId?: string; includeSystem?: boolean })` to require:
     - `e.IncludeInAPI === true`
     - `e.AllowUserSearchAPI !== false`
     - `!e.Name.startsWith('__')`
     - `e.CanUserRead(currentUser)` (via `e.GetUserPermisions(currentUser).CanRead`)
   - Default the entity browser to entities linked via `MJ: Application Entities` for the user's active business applications (hiding 300+ internal `MJ: ...` system metadata entities behind an optional `"All permitted entities"` filter chip), and compute `EntityCount()` from `LoadEntities().length` so hub tile counts match the list.
   - Fix cross-tab navigation jump in `src/explorer/ExplorerLists.tsx:50,86,121`: keep drill-down pushes within the active tab's stack (`Apps` vs `Home`) so tapping an entity inside **Apps → Data Explorer** never jumps the active tab to **Home**.
2. **Clickable Foreign Keys & Polymorphic FKs on Record Detail**:
   - Check `ClassFactory` for a registered `BaseMobileEntityForm` / `BaseMobileEntitySection` for `entity.Name` before falling back to generic field layout.
   - Standard FKs (`field.RelatedEntityID != null`): Resolve display text from the companion virtual name column on the base view (e.g., `Account` for `AccountID`, falling back to ID) and render as a tappable link chip pushing the target record screen.
   - Polymorphic FKs (`field.EntityIDFieldName != null`, per MJ's metadata contract — **strictly driven by `EntityField.EntityIDFieldName`, zero column-name heuristics**): Read the target `EntityID` from the companion column on the loaded record, resolve `md.EntityByID(targetEntityId)`, fetch/display the target record's `NameField`, and link directly to that entity/record.
   - Add a collapsible **"Related"** section at the bottom of Record Detail listing child `EntityRelationshipInfo` collections (`DisplayInForm === true`) with lazy count/preview expansion.
3. **Record Editing Polish (`src/components/RecordForm.tsx`)**:
   - Replace raw ISO-8601 text entry for `kind === 'date'` fields with a native platform date/time picker sheet, formatting display values cleanly per `IsDateOnlySQLType`.
4. **Contextual `"Ask Agent"` Handoff**:
   - Pass structured context params (`contextKind: 'entity' | 'view' | 'record' | 'query' | 'dashboard'`, `entityName`, `recordId`, `viewId`, `queryId`, `title`) when tapping `"Ask <AgentName> about this..."` on Entity, View, Record, Query, and Dashboard screens.
   - Render a removable context pill above the composer in `NewConversationScreen` and inject a concise structured grounding block (entity name, primary key / view ID / query ID, and visible summary fields) into the initial turn.

### 3.3 Dashboards (`Config` Completeness, `BaseMobileDashboard` & `DashboardEngine` Permissions)
1. **Permission-Correct Dashboard Listing (`src/data/services/explorer.ts:310-334`)**:
   - Replace raw `RunView({ EntityName: 'MJ: Dashboards', ExtraFilter: "Type = 'Config'" })` with `DashboardEngine.Instance` (`await DashboardEngine.Instance.Config(false, currentUser)`), filtering to dashboards where `DashboardEngine.Instance.GetDashboardPermissions(d.ID, currentUser.ID).CanRead === true` **and** `(d.Type === 'Config' || HasRegisteredMobileDashboard(d.DriverClass))` (honoring owner, direct `MJ: Dashboard Permissions`, and `MJ: Dashboard Category Permissions`).
2. **Complete `Config` Panel Support in `DashboardView.tsx`**:
   - **`Query` panels**: Existing KPI / SVG `BarChart` / preview cards; apply default parameter values from `QueryInfo.Parameters` so queries with optional/defaulted parameters execute instead of failing.
   - **`Artifact` panels**: Existing `ArtifactContentView` (now rendering full Markdown, Data tables, Charts, and Interactive Components).
   - **`View` panels**: Newly wired to `<SavedViewList compact />` (§3.1).
   - **`Component` panels**: Add `'component'` to `DashboardPartKind` and `kindFromTypeName` (`src/data/services/explorer.ts:448-462`, matching MJ's `Component` `DashboardPartType`) and render via `ComponentRenderer`!
   - **`WebURL` panels**: Validate `part.config.url` (`https://` only) and open via `expo-web-browser` (`openBrowserAsync`); hide the action button when no valid URL is present (eliminating the current dead button bug).
3. **`Type = 'Code'` Dashboards via `BaseMobileDashboard`**:
   - When `dashboard.Type === 'Code'` and `dashboard.DriverClass` resolves via `MJGlobal.Instance.ClassFactory.CreateInstance(BaseMobileDashboard, dashboard.DriverClass)`, `DashboardView` mounts that native `BaseMobileDashboard` directly; unimplemented Angular-only `Code` dashboards stay cleanly hidden from the mobile list.

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
   - Wire `onPress={(prompt) => void handleSend(prompt)}` on `SuggestedResponses` chips in `ChatThreadScreen`.
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
  - Filter the **Apps** tab so applications with **zero** mobile-resolvable `NavItems` are hidden by default (or grouped under a collapsed *"Web-only applications (N)"* footer note) instead of presenting 25 cards that only render `"opens on desktop"`.
  - Gate sample `FieldNotesResource` registration to `__DEV__` / tests only.
  - Clean `ProfileScreen`: remove the root-tab `<` back button; use `GetBiometricLabel()` (`Face ID` / `Touch ID` / `Biometrics`) instead of hardcoded `"Face ID"`; wire `Connected workspace` (workspace info/switcher) and `Help & feedback` (`brand.Legal.SupportUrl`); hide `Voice responses` TTS toggle until implemented.
  - Make Terms & Privacy Policy links clickable on `LoginScreen` (`expo-web-browser` → `brand.Legal.TermsUrl` / `PrivacyPolicyUrl`).
- [ ] **Native Build, Privacy & EAS Configuration**:
  - Supply 1024×1024 app icon, Android adaptive icon (foreground + background), and `expo-splash-screen` assets via `brand.config.ts` + `withMJMobileBrand`.
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
- Resolve Decisions **D1–D7** (§6) and update this plan.
- Fix all **22 TypeScript errors** across the 4 broken screens and add `"build": "tsc --noEmit"` to `packages/MobileApp/package.json` so Turbo/CI enforces type safety on every PR.
- Fix **P0-2** (`BootGate` unauthenticated launch/sign-out deadlock), **P0-3** (`Env` HTTPS/WSS URL configuration), **P0-4** (`__DEV__` guards on `DevTokenSheet`, dev screens, and safe internal handoff replacing URL `autosendAttachment`), **P0-5** (`signOut()` full purge of `offline-queue`, push token, WS client, and user caches + `UserInfoEngine` preference sync), and **P0-6** (`AppLockGate` overlay preserving navigation state).
- **Exit Gate**: `pnpm run typecheck` (0 errors), `pnpm run test` (all green), cold unauthenticated boot → OAuth sign-in → chat → sign-out → second-user sign-in verified clean on iOS Simulator & Android Emulator.

### Phase 1: `<MJMobileApp />` Shell, Shared Server Theme/Auth & `ClassFactory` Extension Contract (Week 2 — Nov 9–13)
- Encapsulate the navigation tree inside `<MJMobileApp brand={brandConfig} />` (`@react-navigation/native` programmatic stacks/tabs + deep-link config derived from `brand.UrlScheme`) so the host entry point shrinks to an ~8-line `App.tsx` with zero host route files.
- Author `MJMobileBrandConfig` (`brand.config.ts`) + `withMJMobileBrand` (`app.config.ts`), default MJ icons/adaptive icons/splash assets, and dynamic `Constants.expoConfig?.scheme` OAuth redirects.
- Wire runtime `ThemeProvider` directly to **`@memberjunction/theme-engine`** (`DeriveTheme` from `MJ: Themes` + `FallbackThemeSeeds`), and wire `LoginScreen` to MJServer's existing **`GET /auth/providers`** (extracting shared `AuthProviderCatalog` fetch logic from `ng-auth-services` to a shared TS module) and **`GET /auth/login-screen`** (`SanitizePublicLoginScreen`), plus optional Workspace URL entry (**D1**).
- Define the `ClassFactory` extension base classes (`BaseMobileResource`, `BaseMobileDashboard`, `BaseMobileEntityForm`, `BaseMobileRecordCard`, `BaseMobileArtifactRenderer`, `BaseMobileAuthProvider`), purge all hardcoded `"MemberJunction"` / `"MJ Mobile"` / `"Skip"` / `"Sage"` strings, and add `--open-app-mobile-bootstrap` (`dynamicPackages.mobile`) to `mj codegen manifest`.
- **Exit Gate**: A 4-file pure-brand test config (`brand.config.example.ts`) builds a distinctly named, colored, icon-branded app in Light and Dark mode with zero copied screen/route files and zero `"MemberJunction"` or `"Skip"` leaks; a test `@RegisterClass` extension overrides a stock card/resource purely via `class-registrations-manifest.ts`.

### Phase 2: Simple Views (`MJ: User Views`) & Scoped Data Explorer (Week 3 — Nov 16–20)
- Build `src/data/services/views.ts`, `useEntityViews`, `useRunUserView`, and virtualized `<SavedViewList />` (`FlatList` + `ViewID` execution + `GridState` column/sort projection + server `UserSearchString` + pagination + `BaseMobileRecordCard` override lookup).
- Integrate `<SavedViewList />` into the Entity screen (with bottom-sheet view switcher) and register `'User Views'` / `'Views'` in `@memberjunction/mobile-bootstrap`.
- Scope `LoadEntities` by `IncludeInAPI`, `CanUserRead`, and `MJ: Application Entities`; fix `EntityCount()` and tab-local navigation stacks in `ExplorerLists.tsx`.
- Add `BaseMobileEntityForm` lookup, tappable FK & metadata-driven polymorphic FK (`EntityField.EntityIDFieldName`) record links + collapsible Related lists on Record Detail, native date picker in `RecordForm.tsx`, and contextual `"Ask Agent"` handoff to `NewConversationScreen`.
- **Exit Gate**: Unit + integration tests for `views.ts` and FK resolution; user can switch saved views, search server-side across >100 rows, tap FKs between records, and ask an agent about a specific record with context pre-attached.

### Phase 3: Dashboards, Artifacts & Chat Polish (Week 4 — Nov 23–27)
- Migrate `LoadDashboards` to `DashboardEngine.Instance` permissions + `BaseMobileDashboard` lookup; wire **`View`** (`<SavedViewList compact />`) and **`Component`** (`ComponentRenderer`) panel types in `DashboardView.tsx`; fix `WebURL` link validation and defaulted `Query` parameters.
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
- Extract published `@memberjunction/mobile-core` + `@memberjunction/mobile-bootstrap` npm packages + 4-file standalone starter template (`brand.config.ts`, `app.config.ts`, `App.tsx`, `package.json`, `WHITE_LABEL_GUIDE.md`) and verify both a 100%-stock branded build and an OpenApp-extended build compile cleanly via EAS outside the monorepo.
- **Dec 14–23**: App Review turnaround buffer (with `InteractiveComponentMode: 'webview-only'` fallback ready if Guideline 2.5.2 is raised) and v1.0 GA release.

---

## 6. Open Decisions (`D1`–`D7`)

| ID | Question | Recommended Lean |
| :--- | :--- | :--- |
| **D1** | **Official Store App Multi-Tenancy**: Should the official MJ App Store / Play Store binary set `AllowCustomWorkspaceUrl: true` so users enter their MJ server URL on login (consuming MJServer's existing `GET /auth/providers` + `GET /auth/login-screen`), while white-label builds lock `DefaultGraphqlUrl` (`AllowCustomWorkspaceUrl: false`)? | **Yes** — zero new server endpoints needed, makes the official store app useful to every MJ customer, and keeps white-label builds single-tenant. |
| **D2** | **Dashboards Scope (`Config` vs. `Code`)**: Support all `Config` dashboards (`Query` + `Artifact` + `View` + `Component` panels) plus `BaseMobileDashboard` `@RegisterClass` overrides for `Type = 'Code'` dashboards, hiding unported Angular-only `Code` dashboards? | **Yes** — avoids porting desktop admin dashboards before launch while giving apps/OpenApps an idiomatic `ClassFactory` hook for custom mobile dashboards. |
| **D3** | **Simple Views (`MJ: User Views`) Scope**: Scope v1.0 to **executing existing saved views** (view picker, `ViewID` filter/column/sort execution, server search, pagination, `BaseMobileRecordCard` hook, FK tap-through, and Dashboard `View` panels) **plus minimalist Smart Filter view creation/editing** (`Name` + natural-language `SmartFilterPrompt` via `MJUserViewEntityServer`), deferring complex manual filter-tree / column-layout builders to v1.1? | **Yes** — fits one-handed mobile workflows, reuses server-side AI `SmartFilterWhereClause` generation, and ships cleanly in Week 3. |
| **D4** | **Interactive Components & Apple Guideline 2.5.2**: Default production builds to `'webview-only'` (`DomComponentHost` with locally bundled `@memberjunction/react-runtime`) or `'dual'` (Hermes + WebView) with a `'webview-only'` kill-switch? | **Default production builds to `'webview-only'` (or server-togglable flag)** — localizing `react-runtime` removes `unpkg.com` failures, supports 100% of DOM/Canvas + React specs, and minimizes Apple 2.5.2 review friction. |
| **D5** | **Voice & Push Notification Cut Line for v1.0**: Gate `EnableRealtimeVoice` and `EnablePushNotifications` behind `BrandConfig.Features` defaulted to `false` for v1.0 unless hardware QA + server push sender clear the Week 5 gate? | **Yes (default `false` for v1.0, ship in v1.1)** — protects the Dec 11 store submission cutoff. |
| **D6** | **Timing of `@memberjunction/mobile-core` Package Split**: Establish the `<MJMobileApp />` + `@memberjunction/mobile-bootstrap` module boundary inside `packages/MobileApp` in Week 2 and publish `@memberjunction/mobile-core` + 4-file starter repo in Week 5–6, OR split npm packages upfront in Week 2? | **Establish clean internal boundary in Week 2, extract published npm packages in Week 5–6** — maximizes feature velocity in Weeks 2–4 while guaranteeing zero-copy package ergonomics at v1.0 launch. |
| **D7** | **Programmatic `@react-navigation/native` inside `<MJMobileApp />` vs. Expo Router Host `app/` Directory**: Replace Expo Router's host-filesystem `app/` directory with programmatic `@react-navigation/native` stacks/tabs inside `<MJMobileApp />` (keeping Expo SDK 54, `app.config.ts`, `expo-*` modules, and EAS Build)? | **Yes (`@react-navigation/native` inside `<MJMobileApp />`)** — Expo Router already uses `@react-navigation/native` underneath; moving navigation inside the component eliminates all host route wrapper files so pure-brand and OpenApp-extended repos have **zero** copied routes to maintain across upgrades. |

---

## 7. Explicit Non-Goals for v1.0 (Deferred to v1.1+)

- Authoring or modifying `MJ: User Views` filter trees / column layouts from a phone.
- Porting desktop-only Angular administrative surfaces (CodeGen, Entity/Schema Admin, Workflow/Action Designer, Component Studio) to React Native.
- Multi-pane tablet split-view layouts (`supportsTablet: true` dedicated iPad UX — v1.1).
- Non-WebRTC PCM16 realtime voice providers on Hermes (`Gemini Live`, `ElevenLabs`, `AssemblyAI` — requires native PCM audio worklet bridge, tracked in [`PHASE4-V6-REALTIME.md`](PHASE4-V6-REALTIME.md)).
- Full offline read-replica sync (v1.0 caches metadata/settings in MMKV and queues scalar record updates while offline, replaying on reconnect).
