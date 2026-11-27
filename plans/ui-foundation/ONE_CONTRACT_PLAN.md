# One Contract Plan: Lego, ComponentSpec and widgets on every surface

Proposed 2026-11-21 (Amith). Revised 2026-11-24 and 2026-11-27 after review by Matt and Colin on #6818 and addition of the native desktop surface. Status: direction agreed; ready to spin out implementation PRs.

**PR #6818 is the master tracker for this work.** Section 2 links every document, RFC and PR that spins out of it.

This plan extends [UNIFIED_PLAN.md](UNIFIED_PLAN.md) and proposes amendments to the Lego plan ([README.md](README.md)). Section 12 lists each amendment. This PR does not edit those files; Matt and Colin own them.

## 1. Summary

MJ has two component worlds that do not share parts. Compiled Angular components are typed and build-checked, and render only in Angular hosts. Runtime React components (`ComponentSpec`, built for Skip) change without a build and already render on mobile, but they are untyped JavaScript loaded against React 18.2 from public CDNs. Lego is about to add a third vocabulary that only Angular can use.

This plan makes them one UX architecture across every surface MJ targets—Explorer and custom web apps, responsive mobile web, MJ Elements, true native mobile (iOS and Android), and native desktop (Windows, macOS and Linux, including OS alerts and desktop widgets):

1. **One shared core** describes every Lego primitive. It is a small framework-free TypeScript package: prop types, defaults, part and token descriptors, and a pure function per primitive that returns its classes, style variables and aria. Angular, React and React Native all call it, so they cannot drift. `components.json` is generated from it.
2. **Lego's styling ships as plain CSS** (already Lego decision D1). Any host that can load a stylesheet—web, embedded Element, mobile WebView, sandbox frame, or Electron desktop window—gets the same look.
3. **AI-generated components become typed TSX.** A real TypeScript check runs on the server against types generated from the spec and the contract. JSX stays supported with no end date and no conversion. We stop generating new JSX.
4. **The ComponentSpec runtime moves to current React** and stops depending on other people's UMD files and on public CDNs. MJ builds the script files itself and loads them from a host-configured asset base (MJ's origin on web; local packaged assets on mobile and desktop). This is not a move to ES modules.
5. **Widgets get a contract.** `componentRole: 'widget'` is already reserved in the spec. A widget can be a runtime TSX spec or a compiled Angular class, and a dashboard, Home board, mobile screen, or desktop widget host shows it through one role contract.
6. **Metadata dashboards become the default surface.** Home becomes one, with layered layouts on a shared Card Grid mode in `dashboard-viewer`. This has its own design document, [HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md), and ships in the same release.
7. **Native desktop joins web and mobile on the same architecture, with unified one-click updates.** An Electron-based MJ Desktop app (Windows, macOS, Linux) focuses initially on Chat, Dashboards and Data Explorer, adding native OS alerts, a menu-bar/tray widget board, desktop-pinned widgets, and a shared version-check + one-click auto-update contract across the desktop titlebar, mobile (`expo-updates` + store) and web (section 5).
8. **The shared core is proven across all four runtime targets** (Angular, plain React, inside a ComponentSpec, and React Native) via the `surface` + `row` tracer bullet before Wave 1 starts (section 10).

Every claim the system makes about itself is enforced by a deterministic gate (section 7), in line with principle 9 of the unified plan.

### What each person is asked for

| Who | Why you | The ask |
|---|---|---|
| Matt | You own the Lego contract, catalog and names (D11) | Build the shared core and `surface` + `row` four-surface tracer bullet ahead of Wave 1, lead Wave 1 (core + CSS + Angular + web React), and run the Home user-research pass. Review sections 4 to 7, 9 and 12. |
| Colin | You own Home and build the catalog generator | Wire the generator and gates G1 to G7 against the shared core, lead Workstream D (`dashboard-viewer` Card Grid, widget host, spec cache, approval enforcement) and Workstream G's design RFC + Home build. Review desktop + update seams in section 5. |
| Jordan | You moved Skip's stage-audit fixes into the linter and harness (#6362) | Review Workstream C. The type-check replaces the rule families that produced those false positives. |
| Caeleb | You built first-class dashboards (#4982) and the run-consent gate (#6786) | Review Workstreams D and G: the widget host, trust at render, and layered dashboard layouts. |
| Robert | You asked for dashboards on Home and review the when-to-use guidance | Review the widget vocabulary (section 11), Workstream G, and the desktop/OS widget direction (section 5). |
| Madhav | Skip is the largest ComponentSpec consumer | Review Workstream C for what changes in Skip's generation pipeline. |

## 2. Tracker

Work merges to `next` in order. Add a row here for each PR or document as it is opened.

| Item | Where | Owner | State |
|---|---|---|---|
| This plan | #6818 | Amith | In review |
| Unified UI plan | [UNIFIED_PLAN.md](UNIFIED_PLAN.md), #6503 | Matt, Colin | Merged; amendments in section 12 |
| Lego wave 0 prototype | #6673 | Matt | Open |
| Home and layered dashboards (workstream G) | [HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md) | Colin; Matt drives user research | Stub; design and research to start |
| Tracer bullet: shared core with `surface` and `row` on all four surfaces | PR to be opened | Matt, Colin | Not started |
| Sandboxed component host | #5257 | Open | Open; needed for P10 and P11 on web and desktop |
| Mobile v1 and its render-mode decision | #6179 | Open | Open; decides how widgets render on mobile |
| MJ Elements | #5903, #5916 | Matt | Open |
| Browser Extension (Angular 21 side panel) | #6464 | Open | Open; consumes Angular Lego + conversations |
| MJ Desktop (Windows, macOS, Linux) & OS widgets plan | Doc/PR to be opened | TBD | Scoped in section 5 and workstream H |

## 3. What is wrong today

| # | Problem | Evidence on `next` |
|---|---|---|
| 1 | Two component worlds with no shared parts. A spec can only compose other specs. An Angular part cannot be drawn on mobile. | `ComponentSpec.dependencies` in `packages/InteractiveComponents/src/component-spec.ts`; mobile maps a Component dashboard part to `unknown` (`packages/MobileApp/src/data/services/explorer.ts`, `kindFromTypeName`) |
| 2 | Lego's catalog is planned as an output of the Angular primitives, and its behaviour rule names Angular CDK. Nothing but Angular can consume it. | UNIFIED_PLAN phase 3: "`components.json` generated from the primitives themselves"; README §4: "The boring half ... comes from Angular CDK" |
| 3 | The spec runtime loads React 18.2 as a script-tag (UMD) build from unpkg. React 19 no longer ships one. All 28 active component libraries load the same way from public CDNs, which also breaks offline and strict-CSP desktop/mobile hosts. | `packages/React/runtime/src/utilities/core-libraries.ts`; `metadata/component-libraries/.component-libraries.json` |
| 4 | Hand-kept CDN URLs drift, and `MJReactComponent` only snapshots 33 colour tokens into `props.styles`, missing fonts, type scale, radii, shadows and container-scoped surface contrast. | Emotion rows declare 11.11.x and load 11.14.x; `geo-maps` loads floating `^5`; `component-styles.ts:263-312` |
| 5 | AI-generated components are unchecked JavaScript. The linter approximates a type checker by hand. | 78 rule files, about 20 of them type-shaped, on a 1,492-line `type-inference-engine.ts`. #6362: false positives "flagged correct code, and the fixer then changed working code to satisfy it"; Skip carried the fixes as patches |
| 6 | Widgets have no contract. Home's sections are hard-coded, and `ComponentPartComponent` runs an uncached `RunView` per widget with no per-placement `UserStateScope`. | `componentRole` lists `'widget'` as "reserved for future role contracts"; `home-dashboard.component.html`; `component-part.component.ts` |
| 7 | Approval is recorded but not enforced at render, and shipped components have no approvals populated. | `ApprovalStatus` and `ApprovedFingerprint` are null on all 105 published `MJ: Components` rows; `ComponentMetadataEngine.FindComponent` filters on neither status nor version; #6786 covers artifacts only |
| 8 | Layouts are mostly code. A metadata dashboard has one shared layout owned by its creator, with no organization or role default and no personal arrangement. Pinned Home dashboards persist via `HomeAppPinService`, while the active dashboard view on Home lives only in the URL. | `MJ: Dashboard User States` serves Code dashboards only; `MJ: Dashboard User Preferences` picks which dashboard a user or the system defaults to, not how it is laid out; `home-pinned-dashboards.ts` |
| 9 | Explorer's shell and update path assume a browser PWA, while mobile has no wired update UX yet. Building desktop or mobile clients without a shared shell/update contract risks drifting client versions or forking the shell. | `@memberjunction/ng-explorer-service-worker` hard-wires Angular `SwUpdate`; `packages/MobileApp/package.json` declares `expo-updates` (`^29.0.20`) with zero `src/` wiring or store-version check |

## 4. The design

```
Hosts        Web (MJ Explorer, custom Angular apps, responsive web, MJ Elements, Browser Extension)
             Native Desktop (Electron on Windows, macOS, Linux: Chat, Dashboards, Explorer, tray & desktop widgets)
             Native Mobile (iOS and Android: native screens + local WebView)
             Conversations, artifacts and #5257's sandboxed frame
             (each host mounts a role contract: form, form-panel, widget)

Components   Compiled Angular widgets and compositions
             Typed TSX ComponentSpecs (runtime, AI-authorable)

Bindings     Angular (ng-ui-components) · React (web, desktop, mobile WebView, sandbox frame) · React Native
             Thin. Each calls the shared core and is checked against the contract.

Foundation   Tokens · primitives CSS · the shared core (TypeScript; components.json is generated from it)
             Framework-neutral. The single source.

Logic        Engines and Remote Operations. Typed TypeScript, shared by every host. Unchanged.
```

Five rules hold it together.

1. **The shared core is the source.** A primitive's inputs, defaults, parts, classes, style variables and aria are computed in one framework-free TypeScript package. Each binding calls it and renders the result. A hand-written JSON contract with checks was the first proposal; review showed checks alone let a binding ignore inputs (section 8).
2. **Styling is CSS, written once.** Lego D1 puts every primitive's CSS in a named `@layer` with an `.mj-` prefix and encapsulation off. In the wave 0 prototype (#6673), `mj-surface` maps inputs to `.mj-*` classes and runtime `--_mj-*` / instance CSS custom properties computed by the core. A binding never writes parallel stylesheet rules; it applies the classes and style variables the core returns.
3. **Behaviour is per host; its contract is shared.** Angular keeps CDK for overlay, focus trap, roving focus and announcements. Interactive React bindings use React Aria hooks on the same `.mj-*` markup (with native `<dialog>` reserved for Wave 2+ modal layers once host overlay coordination lands). React Native uses native primitives and modals. All three implement the same named kinds, dismiss rules and events.
4. **Logic stays in engines and Remote Operations.** Widgets are thin views. Strong typing and data access live in engines and Remote Operations, which lets one widget's data and actions work identically on web, mobile, Electron desktop, and OS widget extensions.
5. **Layouts are data.** On Card Grid dashboards, placements are stored as metadata and resolved from **one winning base layout** (highest-priority Role, else Global/org default—never merged across roles) with the user's flat per-placement changes applied on top and a Reset to default ([HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md)). Code-based and Golden Layout dashboards remain for surfaces that need split trees.

**What runs where.**

| Widget / UI kind | Web (Explorer, custom Angular, Elements, Extension) | Native Desktop (Electron: main window, tray & pinned desktop widgets) | Native Mobile (#6179) | OS-native widget galleries (Windows 11 / macOS WidgetKit) |
|---|---|---|---|---|
| Runtime TSX spec | Yes (in #5257 sandbox frame) | Yes (in #5257 sandbox frame, using packaged local assets) | Yes, after workstream F (local WebView by default; native RN swap when built only from primitives) | Windows 11 Web Widgets directly via WebView2; macOS WidgetKit & Adaptive Cards via native snapshot projections backed by the same Remote Operations |
| Compiled Angular class | Yes | Yes (renderer is Chromium + Angular 21) | No. Angular does not run in the mobile app | Projected via summary Remote Operations if exposed to OS galleries |
| Existing JSX spec | Yes, unchanged | Yes, unchanged | As today (local WebView) | Same as TSX |

**Naming.** No new layer number. The UI Layering Guide's L0 to L3 govern data access and navigation and are enforced by name (`runtime`, `widgets`, `surface`, `shell`) across MJ and OpenApp packages. Lego has its own stack: foundation, primitives, compositions, app. This plan widens Lego's foundation to include `tokens.css`, `primitives.css` and the shared core, and adds React and React Native bindings beside Angular.

## 5. Every surface on one UX architecture — including Native Desktop

The goal of One Contract is that teams and agents build against **one design system, one component catalog, and one widget contract**, and reach every client form factor without inventing per-platform UI stacks:

| Surface family | How it ships | What it consumes from this plan |
|---|---|---|
| **Web apps** | `MJExplorer` (`<mj-explorer-app />`), custom standalone Angular apps (`L1/L2`), and the Browser Extension (#6464) | Angular Lego (`ng-ui-components`), `tokens.css` + `primitives.css`, `dashboard-viewer` Card Grid, and TSX `ComponentSpec`s in #5257's sandbox |
| **Responsive mobile web & MJ Elements (#5903)** | Explorer / web apps on phones and tablets, plus light-DOM custom elements embedded on external pages | Coarse-pointer `44px` control heights, dialogs collapsing to bottom sheets on phones, `@layer primitives` CSS, and shared catalog metadata |
| **True native mobile (#6179)** | White-label `<MJMobileApp />` for iOS and Android (Expo / React Native + local WebView) | Generated mobile theme tokens, React Native widget bindings (P5), and locally bundled React 19 + Lego React bindings in `DomComponentHost` |
| **Native desktop (Windows, macOS, Linux)** | White-label `<mj-desktop-app />` built on **Electron** (Chromium + Angular 21 renderer, Node main process) | **Zero new bindings.** Reuses Angular Lego, web React Lego, `tokens.css` + `primitives.css`, L0–L3 packages, and locally bundled TSX `ComponentSpec`s |

*(Note: MJ Forge stays separate outside the MJ repo as a standalone, general-purpose database IDE. MJ Desktop here is the white-label application shell for building desktop apps on top of MemberJunction, mirroring `<mj-explorer-app />` on web and `<MJMobileApp />` on mobile.)*

### 5.1 Focused v1 scope for MJ Desktop

Rather than wrapping every admin studio on day one, initial MJ Desktop apps focus on three high-value everyday workflows plus native OS presence:

1. **First-class Chat & Realtime Voice:** Persistent multi-turn agent conversations, inline interactive `ComponentSpec` artifacts, MJ Docs previews, and a global OS shortcut (`Opt+Space` / `Alt+Space`) for quick-ask and voice from anywhere in the OS.
2. **Dashboards & Home:** Personal and role-layered Card Grid dashboards (Workstream D + G) alongside existing dashboards, with multi-window tear-off onto secondary monitors.
3. **Data Explorer:** Saved `MJ: User Views`, entity search, record detail forms (`ng-base-forms`), and deep-link handoffs between Chat, Dashboards and records.

Because Electron runs Chromium + Angular 21, every OpenApp L0–L3 package (`dynamicPackages.client`), compiled Angular widget, and runtime TSX `ComponentSpec` works on Windows, macOS and Linux with zero porting, 120 Hz rendering, and full Playwright + axe gate coverage (`G6`).

### 5.2 Native OS alerts and desktop widgets (Windows, macOS, Linux)

Users install a desktop app for what a browser tab cannot do: OS-level alerts, instant ambient access, and **turning any MJ dashboard widget into a desktop widget**. This plan supports desktop widgets in two complementary tiers on top of the exact same `componentRole: 'widget'` and Remote Operations contracts:

1. **Native OS alerts, Keychain & Menu Bar / System Tray board (all three OSes):**
   - Native OS notifications with action buttons, unread badge counts, OS Focus / Do Not Disturb awareness, and `mj://` deep links that open or focus the target conversation, approval or record.
   - Credentials stored in the OS Keychain (`safeStorage`) so sessions survive restarts without browser tab login churn.
   - A **Menu Bar (macOS) / System Tray (Windows, Linux) popover** mounting a compact `dashboard-viewer` Card Grid (`Tasks.GetMyDay`, `Approvals waiting on me`, `Quick add`) and quick chat.
2. **Tier 1 — Pinned Electron desktop widgets (live & interactive on Windows, macOS and Linux):**
   - Any MJ dashboard widget (`componentRole: 'widget'`, whether a TSX `ComponentSpec` or a compiled Angular class) can be **"Pinned to Desktop"** into a frameless, translucent desktop-level `BrowserWindow` (pinned to the wallpaper layer or toggled as a floating HUD) on **Windows, macOS and Linux**.
   - Pinned widget windows share the main process's authenticated session, `#5257`'s sandboxed host, and packaged local `P7` library assets, so **every MJ widget runs live and interactive on all three OSes with zero per-OS widget code**.
3. **Tier 2 — Native OS widget galleries (Windows 11 Widgets Board & macOS WidgetKit):**
   - Where an app also wants entries inside the OS's own widget picker, each OS imposes host rules that this plan's layering already fits cleanly:
     - **Windows 11 Widgets Board (`IWidgetProvider`):** Supports Edge WebView2 web widgets inside an Adaptive Card envelope as well as pure Adaptive Cards JSON. A TSX widget + `tokens.css` / `primitives.css` can render in WebView2, or project summary fields to an Adaptive Card.
     - **macOS Desktop & Notification Center (`WidgetKit`):** Apple forbids WebViews and JS in WidgetKit, requiring a SwiftUI `TimelineProvider` with budgeted snapshots and `AppIntent` buttons. Crucially, **one SwiftUI `WidgetKit` extension serves both iOS Home/Lock Screen (#6179) and macOS Desktop**: it calls the widget's backing **Remote Operation** (Workstream E) and consumes generated `tokens.json` (Workstream B), deep-linking taps (`mj://`) back into MJ Desktop or MJ Mobile.
     - **Linux (GNOME / KDE):** Native desktop applets fragment across GNOME (GJS) and KDE (QML), so Tier 1's pinned Electron widget windows + StatusNotifierItem tray are the standard Linux path.

### 5.3 Version awareness and one-click auto-update (Desktop, Mobile and Web)

Packaged desktop and mobile clients go stale quickly if updates require hunting for installers or store pages, and a stale client can drift behind its `MJAPI` server. Version awareness and one-click updates are therefore first-class shell features across every surface, backed by one shared **`UpdateHostAdapter`** state contract (`idle | checking | downloading | ready-to-apply | store-upgrade-required`, target version, optional `minSupportedClientVersion` from `MJAPI`, and `applyUpdate()`):

1. **Desktop — one-click update pill in the titlebar (Windows, macOS, Linux):**
   - `electron-updater` checks and downloads signed differential updates silently in the background (Squirrel/`.zip` on macOS, NSIS on Windows, `AppImage`/feed on Linux).
   - Once staged, a non-intrusive **one-click `"Update ready · Restart"` pill** lights up directly in the app's titlebar (and tray menu). Clicking it calls `quitAndInstall()`, preserving and restoring open windows, active Chat threads, and Dashboards on relaunch.
2. **Mobile — one-tap OTA reload and store upgrade (#6179):**
   - `packages/MobileApp` already carries `expo-updates` in `package.json` with no runtime or UI wiring yet. Mobile wires two paths into the same state contract:
     - **Compatible JS/asset updates (`expo-updates`):** Downloaded in the background when `runtimeVersion` matches, surfacing a **one-tap `"New version ready · Tap to update"` banner/pill** in the mobile header / Home / Profile bar (`Updates.reloadAsync()`).
     - **Native binary updates (App Store / Google Play):** Detected via store metadata and `MJAPI`'s client-version handshake when `runtimeVersion` bumps, surfacing a **one-tap `"Update in App Store / Play Store"` deep link** (dismissible when optional; full-screen gate only when below `minSupportedClientVersion`).
3. **Web — `SwUpdate` on the same adapter:**
   - `@memberjunction/ng-explorer-service-worker` (`UpdateNotificationService`) plugs Angular `SwUpdate` into the same `UpdateHostAdapter`, so web Explorer can surface the same Lego update pill/toast instead of maintaining a service-worker-only UX.

### 5.4 Five layering rules folded into this plan so Desktop needs zero rework

1. **Host-configured asset base for `P7`:** Approved library bundles, `react-runtime`, `tokens.css` and `primitives.css` resolve through a host-supplied base URL—MJ's HTTP origin on web, and packaged local assets (`app://`) on Electron desktop and mobile WebView—so desktop boots offline with zero CDN calls.
2. **`#5257` sandbox protects Electron's preload bridge (`P10`, `P11`):** Running `ComponentSpec`s inside `#5257`'s opaque-origin sandboxed frame isolates runtime `new Function` code from Electron's `preload` IPC bridge and Node/OS capabilities, provided `#5257`'s frame host supports custom packaged schemes (`app://`) alongside `https://`.
3. **Surface-aware `WidgetHostProps` (`P8`) with upward intent events:** `WidgetHostProps` carries the host surface (`'home' | 'dashboard' | 'tray' | 'desktop-widget' | 'companion'`) and emits open/navigation intents upward (`RecordOpenRequested`, action intents) rather than assuming an Explorer tab bar—so clicking an item in a pinned desktop widget or tray popover opens/focuses the main Desktop window.
4. **Multi-window DOM scoping & window-drag safety (`Workstream B`):** Wave 0 overlay/theme services (`MJLayerService`, `ThemeEngine` DOM writers) inject Angular's `DOCUMENT` token rather than reading global `window.document` so tear-off windows and pinned widget windows stay isolated. Interactive primitives set `-webkit-app-region: no-drag` inside `@layer primitives` (a browser no-op that keeps controls clickable in custom Electron titlebars—including the one-click update pill—and frameless desktop widgets), and the token scale reserves a compact `xs` (`28px`) density step.
5. **Shell host adapters (`UNIFIED_PLAN` Explorer deconstruction):** Keeping browser-specific concerns in `ng-explorer-app` behind small host adapters (browser OAuth redirect vs. OS Keychain PKCE, `SwUpdate` vs. `electron-updater` on `UpdateHostAdapter`, web notifications vs. native OS alerts, single-tab vs. multi-window `NavigationService`) lets `<mj-desktop-app />` compose Chat, Dashboards and Data Explorer without forking `ng-explorer-app`.

## 6. Proposed decisions

| # | Proposal | Why |
|---|---|---|
| P1 | The source of truth is a small framework-free TypeScript package. Angular calls it in `computed()`, React in render, React Native for props and tokens. The catalog generator emits `components.json`, the NAMING.md arrays, the gallery and AI declarations from it. No hand-edited JSON. | Shared code cannot drift; a checked JSON contract can. Agreed with Matt and Colin on #6818. |
| P2 | The primitives CSS and the token CSS are published as plain files (`tokens.css`, `primitives.css`) any host can load. | Already implied by D1 and the wave 0 spec §9. Covers Explorer, MJ Elements, mobile WebView, #5257's frame, and Electron desktop. |
| P3 | Behaviour stays per host on a shared contract. Angular keeps CDK. Interactive React bindings use React Aria hooks, keep the same `.mj-*` markup, and pass the same keyboard and axe suite as Angular. Overlay primitives (`layer`, `dialog`, `popover`) stay out of Wave 1 widgets until host overlay coordination lands. | Native `[popover]` gives no roving focus or menu semantics. Separate Angular and React overlay stacks would not share Escape or focus return. |
| P4 | The React binding is plain typed components that render the same markup and classes. It does not use custom elements. | Inside Explorer/Electron, element tags equal the Angular selectors and would double-render; each Elements bundle carries its own Angular; React Native renders an unknown tag as a bare view. |
| P5 | React Native bindings cover the ~10 widget primitives (excluding overlays). RN is included in the Wave 0 `surface` + `row` tracer bullet to prove the core is not DOM-shaped, then follows Workstream B's cross-platform token build in Workstream F so device reviews do not bottleneck Wave 1 PRs. | Web React and ComponentSpec are both DOM, so RN in the tracer bullet proves the core's shape up front while keeping Wave 1 velocity high. |
| P6 | New specs are generated as TSX only; Skip and other generators stop emitting JSX (`erasableSyntaxOnly: true`). JSX specs stay supported with no end date and are not converted. A spec declares its language. The type-check runs on the server; the host only strips types. | Measured: 114 of 117 shipped components compile to identical output with the TypeScript preset on (the other 3 fail identically without it; section 8). |
| P7 | Each host supplies its own React 19. MJ builds one script-loadable file per approved library version from npm, verified by integrity hash (G10), and loads it via a **host-configured asset base URL** (MJ's origin on web; local packaged assets on mobile WebView and Electron desktop). This is not a move to ES modules. | Removes public CDN and third-party UMD dependencies while enabling offline, zero-network-latency startup on mobile and desktop. |
| P8 | `componentRole: 'widget'` gets a typed host contract (`WidgetHostProps`), following `form-panel`: size class, placement ID, host surface kind (`home`, `dashboard`, `tray`, `desktop-widget`, `companion`), host context, standard upward intent events and methods, and an optional `settingsSchema`. | `FormPanelHostProps` and `InteractiveFormsEngine` already run this compiled-or-runtime hybrid; surface context + upward events let the same widget run on Home, mobile, a tray popover, or a pinned desktop window. |
| P9 | On web and desktop, the widget host is the unified Component/Widget part in `dashboard-viewer`, whose new Card Grid layout mode powers Home, layered metadata dashboards, and compact tray/desktop widget boards. Mobile gains a `component` part kind and accepts props and events. | Building Card Grid once in `dashboard-viewer` avoids maintaining a separate Home widget board. |
| P10 | Trust is decided at approval time. An Approved spec renders with no prompt; an unapproved one renders only for its author. Approval covers resolved child specs transitively. A backfill approves the shipped components first. | Review found no shipped component has an approval recorded, and `ApprovedFingerprint` hashes only the parent spec. Prompting end users causes warning fatigue. |
| P11 | Specs gain `utilities.ops`, limited to operations declared in the spec's `dataRequirements`. Bridges normalize wire row types uniformly (`ProviderBase.NormalizeSimpleRowTypes`: `RunView` dates = `Date`, `RunQuery` = `string`). On web and Electron desktop, the allowlist is enforced inside #5257's sandboxed frame. | Quick actions today need `GetEntityObject` and `Save`, which bridges cannot safely expose raw. Uniform bridge normalization gives every TSX spec one `.d.ts` contract across web, mobile and desktop. |
| P12 | The runtime hands the Lego React components (bundling their React Aria hooks) to every spec on a dedicated prop, separate from `props.components`. Skip generates against them. TSX widgets style through Lego CSS variables, with `BuildStylesFromTheme` fixed for non-colour tokens and container scope where `DataGrid`/`SimpleChart` still read `props.styles`. | Routing React Aria inside the host-supplied Lego React package avoids waiting on Workstream C's library build and prevents collisions with `spec.dependencies`. |
| P13 | The widget host mounts either implementation of the role: a TSX/JSX spec, or a compiled Angular class resolved through `ClassFactory` (with no `DashboardPartType` row per compiled widget). Compiled Angular widgets run in any Angular host (Explorer web, custom Angular apps, Browser Extension, Electron desktop); TSX specs also run on Native Mobile. | `InteractiveFormsEngine` already does this for form panels. Core Home defaults can stay compiled Angular for instant first paint while rendering alongside TSX widgets on web and desktop. |
| P14 | Metadata dashboards (Card Grid mode in `dashboard-viewer`) are the default surface for new work, and Home becomes one. Design is in [HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md). | The value of this plan reaches users through customizable widgets and dashboards across web, mobile and desktop. |
| P15 | The Wave 0 tracer bullet proves `surface` and `row` across all four runtime targets (Angular, plain React, ComponentSpec, and React Native). Thereafter, Wave 1 PRs gate on core + CSS + Angular + web React + ComponentSpec (`G1`–`G6`), while RN bindings for the ~10 widget primitives land in Workstream F once B's token build is ready. | `row` exercises parts, ARIA and keyboard where `surface` is too simple, proving the core's shape across DOM and non-DOM consumers without blocking Wave 1 PR cadence. |
| P16 | Primitive contracts remain provisional until the named edge release, then freeze under Lego's additive rule (`G7`). In-repo MJ Explorer conversions proceed freely during the provisional window (updated in the same PR if a contract shifts); external repos adopt at their own risk until freeze. | Keeps Lego adoption moving inside MJ while preserving freedom to fix any contract flaw uncovered by React, ComponentSpec or RN before the freeze. |
| P17 | Native desktop apps on MJ use **Electron** (Windows, macOS, Linux), focusing v1 on Chat, Dashboards and Data Explorer with native OS alerts, a tray widget board, and pinned desktop widgets (section 5), reusing the Angular and web React bindings plus local `P7` bundles and `#5257` preload isolation. | Delivers Windows/macOS/Linux parity, 120 Hz rendering, full OpenApp L0–L3 reuse, live desktop widgets, and Playwright `G6` coverage with zero extra primitive bindings. |
| P18 | Desktop, mobile and web share one **version-awareness and one-click update contract (`UpdateHostAdapter`)**: a titlebar `"Update ready · Restart"` pill via `electron-updater` on desktop, a one-tap header/Home pill via `expo-updates` + App Store / Play Store upgrade prompt on mobile, and `SwUpdate` on web, paired with an optional `MJAPI` `minSupportedClientVersion` check (section 5.3). | Keeps packaged desktop and mobile clients current with a single click/tap and prevents silent client-server version skew. |

## 7. Deterministic gates

Each gate is a pure check with no model and no network. The same inputs always give the same result.

| Gate | What it proves | How | Run in the spike |
|---|---|---|---|
| G1 | The generated catalog is well formed | JSON Schema validation of `components.json` | No |
| G2 | Generated files match the core | Regenerate in CI; any diff fails. Output is a pure function of the core: sorted keys, no clock | Yes, against a JSON contract |
| G3 | Every binding uses the shared core | Each binding's rendered classes, style variables and aria equal the core's output for every fixture, including defaults and every input (`@testing-library/react-native` for RN structure/tokens) | Partly: the spike compared against a JSON contract |
| G4 | No input is ignored | Fixtures vary every input one at a time; output must change where the core says it does | No. The spike's version only required destructuring, which review showed is not enough |
| G5 | The CSS matches the core | Parse the stylesheet; every class and public custom property must be one the core declares, and every declared class must exist | Yes, on #6673's stylesheet |
| G6 | Every DOM surface passes the same suite | The same fixtures, keyboard tests and axe checks run in Playwright against Angular, plain React and a ComponentSpec (covering web and Electron's Chromium runtime). React Native visuals are reviewed on a device | React only, class lists only |
| G7 | The catalog only grows once frozen | Diff against the last released catalog; removals, renames and narrowed types fail | No |
| G8 | A TSX spec is type-correct | TypeScript check (`erasableSyntaxOnly`) against declarations generated from the spec, bridge-normalized wire types, and the contract. The contract hash is stamped on the checked spec | Yes |
| G9 | Existing JSX specs are unaffected | Compile every shipped component with and without the TypeScript preset; output must be identical | Yes |
| G10 | A library file is what was approved | Built from a pinned npm version; integrity hash stored on the library row and checked on load (both HTTP origin and packaged local assets) | No |
| G11 | A layout is valid | Every placement names a widget that exists, and its configured values satisfy that widget's declared properties. Checked on save, and in CI for shipped layouts | No |

**What the gates cannot prove.**

- React Native visual parity. Structure and token resolution are checked in CI (`G3`); appearance is reviewed on a device.
- Behaviour parity across overlay hosts (focus order, dismiss rules). Needs interaction tests per host.
- Filter strings. SQL inside a string is still a string.

## 8. What the spike proved, and what review found

The spike scripts were throwaway and are not in the repo. They are at commit `3e4dc4aece` under `plans/ui-foundation/one-contract-spike/`. Everything below was run on 2026-11-21.

**Typed TSX.**

- A sample "My Open Tasks" widget spec produced about 25 lines of generated declarations.
- The TypeScript checker caught eight planted mistakes of the kind AI makes: a wrong field name (with "Did you mean `DueAt`?"), a nullable date compared without a null check, a status value that does not exist, a wrong prop type and an invalid variant on a child component, an optional event called unguarded, a field the spec never declared, and a style token that does not exist.
- The first check in a process took about 500 ms; later checks took 20 to 60 ms (TypeScript 5.9.3).
- Babel 7.24.4, the line the web host loads today, stripped the types in 24 ms. The output ran through the runtime's injected-React factory shape and rendered on React 19.3.

**Backward compatibility.** All 117 shipped components were compiled with and without the TypeScript preset. 114 gave identical output. The other 3 fail the same way without the preset, so the preset is not the cause.

**The contract gates, on Matt's real prototype.** A hand-written contract for `surface` was checked against #6673's component and stylesheet.

- The Angular binding matched on all eight inputs, three parts and four built-in levels.
- The CSS check flagged `--mj-surface-gap`: the hand-written contract had left `gap` out. That is the gate doing its job.
- A drift test added an input and flipped a default in the contract. The Angular check named both differences, and the React binding stopped compiling.

**What review found, and how it was resolved (Matt and Colin, #6818).**

- The gates passed a React `surface` that ignored five of its eight inputs. Resolved by moving to the shared TypeScript core (P1) and input-sensitivity gate G4.
- Dates across bridges: `ProviderBase.NormalizeSimpleRowTypes` in `MJCore` converts `'simple'` `RunView` dates to `Date` (when `EntityName` is supplied) while `RunQuery` stays text, whereas the mobile WebView bridge and legacy linter (`packages/React/linter/src/type-context.ts:194`) treated dates as strings. **Agreed resolution: bridge converts.** Mobile WebView and `#5257`'s `BridgeDataProvider` reuse `ProviderBase`'s normalization so `RunView` = `Date` and `RunQuery` = `string` uniformly on every host, giving each TSX spec one `.d.ts` contract.
- The 116 shipped specs have gaps the `.d.ts` generator must handle: missing `fieldMetadata` (read `Metadata.EntityByName()`), missing `dependencies[].properties` (resolve registry pointers), non-TS `properties[].type` strings (`function`, `array`, `spec.typeDefinitions`), names colliding across `properties` and `events`, and unmodeled `dataRequirements.queries` / `componentRole`.
- No shipped component has an approval recorded (P10 backfill + transitive child-spec check).

Not proven yet: `antd` on React 19, the multi-asset library build, the mobile native renderer with the TypeScript preset, and any of this wired into MJ.

## 9. Workstreams

Ownership reflects the split agreed with Matt and Colin on #6818. Workstream C's runtime/bundler items, Workstream F's mobile items, and Workstream H's desktop app need dedicated owners alongside UI foundation so neither stream bottlenecks the other.

### A. Shared core and gates (Matt for the core; Colin for the generator and gates)

- [ ] The shared core package: prop types, defaults, descriptors and one pure host function per primitive
- [ ] Tracer bullet: `surface` and `row` on the core across all four surfaces—Angular, plain React, ComponentSpec, and React Native (using mobile's existing token file once to prove the core's shape; P15)
- [ ] Generator: core to `components.json`, the five `NAMING.md` grammar arrays for `check:ui`, the Theme Studio gallery and the AI declaration file
- [ ] Gates G1 to G7 in CI, replacing the planned unknown-component check
- [ ] `axe` in the React test harness, so AI-generated layouts are checked at generation time

### B. Lego (Matt; Colin on WS6b token mechanics)

- [ ] Wave 1 (badge, metric, card, stat tile, icon): shared core, CSS, Angular, web React (bundling React Aria hooks where interactive) and ComponentSpec verification in the same PR (`G1`–`G6`), plus in-repo Explorer conversions (P16)
- [ ] Wave 0 step 7 (`@layer reset` in `explorer-app`) lands before React renders `.mj-*` classes in Explorer
- [ ] Multi-window & desktop CSS readiness: inject Angular's `DOCUMENT` in `MJLayerService` / `ThemeEngine` DOM writers (never bare `window.document`), add `-webkit-app-region: no-drag` on interactive primitives inside `@layer primitives`, and reserve a compact `xs` (`28px`) control-height step
- [ ] Publish `tokens.css` and `primitives.css` as loadable files (wave 0 spec §9)
- [ ] One token source feeding CSS, a TypeScript map / `tokens.json` and the mobile theme, replacing the hand-kept copies in `packages/MobileApp/src/theme/tokens.ts` and `packages/Web/RealtimeWidget/src/ui/tokens.ts`

### C. ComponentSpec runtime (needs dedicated runtime/bundler owner; Jordan and Madhav for Skip; Colin on `ComponentTypeToValueType` and `BuildStylesFromTheme`)

- [ ] First (pulled forward for the tracer bullet): the runtime hands the host-supplied Lego React package (including React Aria hooks) to specs on a dedicated prop (P12). `DataGrid` (`antd`) and `SimpleChart` (Canvas) stay on their current libraries for now
- [ ] Fix `BuildStylesFromTheme` to bridge non-colour tokens and container-scoped surface contrast for components (`DataGrid`, `SimpleChart`) that still read `props.styles` (Colin)
- [ ] `ComponentTypeToValueType` accepts real TypeScript type expressions (`'sm' | 'md'`, `Date`, `string | null`), so dashboard input mapping and G11 do not reject TSX specs (Colin)
- [ ] Spec `language` field; TypeScript preset in the web, desktop, WebView and mobile native compile paths
- [ ] Generators emit TSX only. JSX specs stay supported with no end date and are not converted (P6)
- [ ] Declaration generator: handles the gaps in shipped specs (section 8), models uniform bridge-converted wire types (`RunView` = `Date`, `RunQuery` = `string`, never copying `type-context.ts:194`), and turns on `erasableSyntaxOnly`
- [ ] Freeze the JavaScript inference engine for legacy JSX
- [ ] Type-check service beside the linter, in the server action path and the test harness; diagnostics returned to the authoring agent
- [ ] Retire the ~20 type-shaped lint rules for TSX specs; keep the policy rules
- [ ] Host-provided React 19. Spike first: `antd` on React 19, and the four libraries that ship CSS, assets or workers (ApexCharts, ag-grid, leaflet, mapbox-gl). Prune unused libraries and drop `axios`
- [ ] Mobile: fix `HERMES_COMPILER_CONFIG` overwriting `ComponentCompiler`'s Babel presets before adding the TypeScript preset
- [ ] Library build & host asset resolver (P7): one file per approved version from npm with an integrity hash (G10), loaded via a host-configured asset base URL (MJ's origin on web; local packaged assets on mobile and Electron desktop); React 19 is the first one
- [ ] `utilities.ops` allowlist on `ComponentDataRequirements`, generated `.d.ts` types from `MJ: Remote Operations`, and bridge execution inside #5257's sandbox (including packaged `app://` protocol support for desktop; P11)
- [ ] `FindComponent` resolves by version and filters on approval status

### D. Widget role and hosts (Colin)

- [ ] `WidgetHostProps` (including surface kind `home | dashboard | tray | desktop-widget | companion` and upward navigation/action events), event and method names, and `settingsSchema` in `@memberjunction/interactive-component-types`
- [ ] One part renderer mounts both a spec and a compiled Angular class (P13), with no `DashboardPartType` row per compiled widget
- [ ] Card grid layout mode (`layoutMode: 'golden-layout' | 'card-grid'`) built once in `dashboard-viewer`; Home, metadata dashboards, and desktop tray/widget hosts use it
- [ ] Spec loads cached in memory and invalidated on `MJ: Components` save, instead of one `RunView` per widget
- [ ] Per-placement settings: the host passes `UserStateScope` as namespace, name and placement ID, tied into the governed settings namespace with cleanup on remove/reset
- [ ] Approval backfill for all shipped components, then transitive parent + child-spec approval enforcement in the host (P10)
- [ ] Card Grid support in the agent layout tools (which assume Golden Layout today) and `Component` added to the agent studio tools' part-type list
- [ ] Widget metadata for discovery: owning app, category, supported sizes (including compact/desktop-widget sizes), required permission

### E. First widgets (Tasks and Planning owners)

- [ ] `Tasks.GetMyDay` Remote Operation, lifting `Get My Tasks Briefing`, shared with the Chief of Staff briefing
- [ ] `Planning.GetMyPlanning` Remote Operation, lifting `Get My Planning Briefing`
- [ ] Tasks: Approvals waiting on me, My day, Urgency strip, Quick add
- [ ] Planning: My priorities, Check-ins due, Plan pulse
- [ ] Fix `OpenStuckCount`, hard-coded to 0 in `GetPlanDashboardData` (bizapps-planning)

### F. Mobile (with the owners of #6179)

- [ ] Renderer accepts `WidgetHostProps`, normalizes wire dates via `ProviderBase` rules, and delivers events on both the native and WebView paths (including `'ops.Execute'`)
- [ ] `component` dashboard part kind
- [ ] WebView bundles React 19, `tokens.css`, `primitives.css` and the current runtime locally (#6179 already plans the local bundle)
- [ ] React Native bindings for the ~10 widget primitives (after Workstream B's cross-platform token build), checked in CI with `@testing-library/react-native` (`G3`) and reviewed on device; native renderer swaps them in for specs built only from primitives
- [ ] Version awareness & one-tap update UX (P18): wire `expo-updates` background download + one-tap header/Home `"Tap to update"` reload pill, paired with App Store / Play Store binary upgrade detection and `MJAPI` `minSupportedClientVersion` check

### G. Home and layered dashboards (Colin; Matt drives user research)

Designed in [HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md). Runs in parallel from now, includes a short round of user research with non-technical users, keeps compiled Angular defaults on Core Home so first paint does not wait on React or BizApps widgets, and ships in the same release.

### H. Native Desktop — Windows, macOS and Linux (dedicated desktop owner, building on A–D and G)

- [ ] Shell host adapters in `ng-explorer-app` / `ng-auth-services` / `ng-explorer-service-worker` (OS Keychain PKCE auth, shared `UpdateHostAdapter` bridging `SwUpdate` on web and `electron-updater` on desktop, native OS notifications + `mj://` deep links, multi-window `NavigationService` tear-off) aligned with `UNIFIED_PLAN` Explorer deconstruction
- [ ] White-label `<mj-desktop-app />` Electron package (Windows, macOS, Linux) focused on **Chat + Realtime Voice** (with global OS shortcut), **Dashboards**, and **Data Explorer**, bundling `tokens.css`, `primitives.css`, React 19 and approved `P7` libraries locally under #5257's sandboxed host
- [ ] **One-click titlebar auto-update** (`electron-updater` background staging + `"Update ready · Restart"` pill in the titlebar and tray menu that preserves open windows, Chat and Dashboards across relaunch; P18)
- [ ] **Menu Bar / System Tray popover** and **Tier 1 Pinned Desktop Widgets** (frameless desktop-level `BrowserWindow`s mounting any `componentRole: 'widget'` live across Windows, macOS and Linux)
- [ ] Optional **Tier 2 OS Widget Gallery providers**: Windows 11 `IWidgetProvider` (WebView2 / Adaptive Cards) and a shared iOS + macOS SwiftUI `WidgetKit` extension backed by `Workstream E` Remote Operations and `tokens.json`

## 10. Order of work and release bar

| Step | Work | Depends on |
|---|---|---|
| 1 | **A** (shared core, `surface` + `row` four-surface tracer bullet, generator + gates `G1`–`G7`), **D** (non-TSX foundation: `WidgetHostProps`, Card Grid in `dashboard-viewer`, P13 renderer, spec cache, `UserStateScope`, approval backfill, studio tools), and **C** (TSX, React 19, library build, `utilities.ops`). These start in parallel. | Agreed P1 and P15 |
| 2 | **B** Wave 1 on the shared core (core + CSS + Angular + web React + ComponentSpec, plus in-repo Explorer conversions) and cross-platform token build | Step 1 tracer bullet + gates; wave 0 prototype gate (#6673) |
| 3 | Wire TSX-typed rendering into **D**; **E** Remote Operations | Step 1 (C and D) |
| 4 | **G** Core Home and layered Card Grid dashboards (design and user research run in parallel from Step 1; Core Home build depends only on **D**, not BizApps widgets) | Step 1 (D) + user research |
| 5 | **E** first Tasks and Planning widgets on Home and in dashboards | Steps 2 and 3 |
| 6 | **F** mobile host + React Native widget bindings (following B's cross-platform token build) + mobile one-tap update UX | Step 2 token build; Step 3; #6179's render-mode decision |
| 7 | **H** MJ Desktop (Electron on Windows, macOS, Linux: Chat, Dashboards, Data Explorer, titlebar one-click auto-update, OS alerts, tray & pinned desktop widgets) | Steps 2, 3 and 4 (does not block the core contract freeze if scheduled on its own release train, because its host seams land in B, C and D) |

**Release bar.** Steps 1 through 6 merge to `next` in order and land before one named edge release. Until that edge release, primitive contracts are provisional (P16), while in-repo Explorer conversions proceed freely and are updated in-PR if a provisional contract changes. Step 7's architectural seams (host asset base, `DOCUMENT` injection, `-webkit-app-region: no-drag`, surface-aware `WidgetHostProps`, `#5257` custom-protocol support) land in Steps 1–3 so MJ Desktop can ship without revisiting any contract.

## 11. Widget vocabulary

The first widgets need little: card, stat tile, metric, badge, icon, list row, progress ring or sparkline, empty state and button (excluding overlay primitives in Wave 1). Card, stat tile, metric, badge and icon are Lego Wave 1; `surface` and `row` are Wave 0. This ~10-primitive set is what gets web React bindings in Wave 1 and React Native bindings in Workstream F, and powers web dashboards, mobile widgets, and pinned desktop widgets alike.

## 12. Proposed amendments to existing plans

| Document | Today | Proposed |
|---|---|---|
| UNIFIED_PLAN phase 3 | "`tokens.json` and `components.json` generated from the primitives themselves" | Generated from the shared core, which every binding calls. The core lands ahead of Wave 1 |
| UNIFIED_PLAN phase 2 | Wave 1 lands as Angular primitives with first conversions | Wave 0 tracer bullet (`surface` + `row`) proves all four surfaces; each Wave 1 primitive lands on the shared core with CSS, Angular, web React and ComponentSpec gates (plus in-repo conversions), with RN bindings following the token build in Workstream F |
| UNIFIED_PLAN WS4 (`mj-update-notification`) & "Later, or study first" | `mj-update-notification` stays single-purpose on `SwUpdate`; Home metadata dashboards and Explorer deconstruction are unscheduled | `UpdateNotificationService` moves behind `UpdateHostAdapter` (P18) so Web (`SwUpdate`) and Electron Desktop (`electron-updater` titlebar pill) share one contract. Home metadata dashboards scheduled as Workstream G; Explorer shell host adapters feed Workstream H |
| Lego README §4 | "The boring half ... comes from Angular CDK" | True for the Angular binding. React uses React Aria hooks (and native `<dialog>` later); React Native uses native primitives on the same behaviour contract |
| Lego README §4, "The four layers" | Foundation is tokens, scales and the layer service on CDK | Foundation is tokens, `primitives.css` and the shared core. `MJLayerService` on CDK is part of the Angular binding (scoped via `inject(DOCUMENT)` for multi-window desktop hosts) |
| Lego README §8 and §10 | "No sandbox tier, on purpose" | Unchanged for Open Apps. `#5257`'s sandboxed frame for runtime `ComponentSpec`s loads the same CSS and Lego React binding on web, mobile WebView and Electron desktop (isolating Electron's preload bridge too) |
| #5257 | Precompile on publish in its last phase; web + mobile DOM host | Precompiled output is an optional cache; in-browser compile stays the baseline. Trust rules (D5, D7) are needed by P10; `BridgeDataProvider` normalizes dates via `ProviderBase` and frame host supports packaged `app://` schemes for Electron desktop |
| #6179 | WebView bundles the runtime with React 18.2; `expo-updates` installed but unwired | Bundle React 19 + Lego CSS/React locally; normalize bridge dates; add the `component` part kind, `WidgetHostProps`, and P18's one-tap `expo-updates` + App Store/Play Store update UX. SwiftUI `WidgetKit` extensions can be shared with macOS Desktop (section 5.2) |
| #5903 (MJ Elements) | Base layer is "Angular once, the tokens and base component styles" | No change. Published `tokens.css` and `primitives.css` are that base layer |

## 13. Risks and open questions

1. **Three bindings can drift.** G3 to G6 exist for this, over the shared TypeScript core (P1). React Native visual parity still requires device review.
2. **Multi-surface Wave 1 scope and Workstream C ownership.** Keeping RN bindings in Workstream F (after the Wave 0 tracer bullet and B's token build) protects Wave 1 PR velocity, but Workstream C, Workstream F and Workstream H still require dedicated owners outside Matt and Colin.
3. **`antd` on React 19.** The shared `DataGrid` depends on `antd` 5.20.2 (`findDOMNode` removal in React 19). Spike `antd` 5/6 script-loadable builds early in Workstream C.
4. **Library build location.** At MJ release for the core set (also bundled into mobile/desktop app packages via P7), in the component registry as a service, or a CLI step for customer-added libraries. Undecided.
5. **Libraries that do not flatten to one file.** ApexCharts, ag-grid, leaflet and mapbox-gl ship paired CSS, assets or workers.
6. **Mobile render mode.** #6179 leans to WebView-only in production. If that holds, widgets on mobile use the web React bindings and the RN bindings serve native mobile screens (and prove non-DOM core purity). Decide in #6179.
7. **React Native visual parity has no automated pixel check.** Structure and tokens run in CI via `@testing-library/react-native` (`G3`); visuals are reviewed on device.
8. **React Aria in Lego React.** Bundled directly inside the host-supplied Lego React package (P12) so interactive primitives keep exact `.mj-*` markup without waiting on `MJ: Component Libraries`.
9. **Legacy spec gaps for `.d.ts` generation.** `properties[].type` free strings, missing `fieldMetadata`, registry `dependencies`, and property/event name collisions across the 116 shipped specs must be handled cleanly in Workstream C's generator.
10. **Skip's generation prompts** live outside this repo and must be updated to emit typed TSX against the dedicated Lego primitives prop and `utilities.ops`.
11. **Organization and department scope.** `Global` is deployment-wide today and MJ core has no department concept; multi-tenant org defaults are tracked in [HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md).
12. **Many widgets mean many reads.** A Home or desktop widget board with a dozen widgets needs shared engines, summary Remote Operations per app (as Workstream E builds for Tasks and Planning), and cached spec metadata so warm load stays at 500 to 700 ms.
13. **OS-native widget gallery limits vs. live pinned desktop widgets.** Electron's pinned desktop widget windows (Tier 1) run live interactive MJ widgets on Windows, macOS and Linux, whereas Apple's `WidgetKit` (Tier 2) forbids WebViews/JS and throttles timeline refreshes (~15–60 min). Keeping widget data in typed Remote Operations lets both tiers share one backend contract without over-promising live DOM inside `WidgetKit`.
14. **Converting code dashboards is large.** This plan sets Card Grid metadata dashboards as the default for new work and converts Home; existing code dashboards convert as they are touched.

## 14. References

- Unified UI plan: [UNIFIED_PLAN.md](UNIFIED_PLAN.md) (#6503). Lego: [README.md](README.md) (#5911), [WAVE_0_SPEC.md](WAVE_0_SPEC.md) (#6674), prototype #6673
- Home and layered dashboards RFC: [HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md)
- Layering and architecture guides: [`guides/UI_LAYERING_GUIDE.md`](../../guides/UI_LAYERING_GUIDE.md), [`guides/BUILDING_UI_ON_MJ.md`](../../guides/BUILDING_UI_ON_MJ.md)
- Spec and roles: `packages/InteractiveComponents/src/component-spec.ts`, `packages/InteractiveComponents/src/runtime-types.ts`
- Runtime: `packages/React/runtime/src/compiler/component-compiler.ts`, `packages/React/runtime/src/utilities/core-libraries.ts`, `packages/React/runtime/src/utilities/user-state.ts`
- Angular host: `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts`; dashboard part: `packages/Angular/Generic/dashboard-viewer/src/lib/parts/component-part.component.ts`
- Mobile: `packages/MobileApp/src/interactive/`
- Dashboards and layering: `packages/Angular/Generic/dashboard-viewer/`, `packages/MJCoreEntities/src/engines/dashboards.ts`, `packages/MJCoreEntities/src/engines/interactive-forms.ts` (Global, Role and User scopes)
- Linter and harness: `packages/React/linter`, `packages/React/test-harness`; #6362
- Related open PRs: #5257 (sandboxed component host), #6179 (mobile v1), #5903 and #5916 (MJ Elements), #6464 (Browser Extension), #6786 (run consent), #6181 (signals and compositions)
