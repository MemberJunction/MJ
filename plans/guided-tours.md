# Guided Tours: a Framework Primitive for In-App Guidance

## Status
- **Status**: Draft (revised after team review, ready for Phase 0/1)
- **Created**: 2026-11-04
- **Updated**: 2026-11-13
- **Author**: Amith Nagarajan + Claude (with review synthesis from `@cmbrock-BC` & `@MattC-BC`)
- **Branch**: `claude/guided-tours`
- **Companion doc**: [MJ Guided Tours — Design Proposal](https://claude.ai/artifact/R2s29bJUkhy2iboGB2qmxQ). That doc is the narrative version; **this file is the plan of record** and supersedes it where they differ. The main additions here are hosts beyond Explorer (§4.2), the extension model (§5), agent integration (§10), the two-stage Light DOM embed architecture (§4.1), and the default tour catalogs (§16–§17).

---

## 1. Overview

MJ needs built-in in-app guidance comparable to Appcues, Pendo, WalkMe, Whatfix, Userpilot and Chameleon:

- product tours
- hints and beacons
- announcements
- checklists and learning paths
- per-user progress, prerequisites, optional and branching paths, and suggested tours

MJ should not bolt one of those overlays on. It should build guidance as a framework primitive, because MJ owns everything those tools have to reverse-engineer: the metadata, the component tree, the data, the permissions, the release pipeline and the agents.

The plan rests on five ideas:

1. **Tours are metadata.** A tour is a set of rows: tour, steps, paths, triggers and prerequisites. Open Apps ship them in their release migrations, like nav items and applications, and host admins customize them through overrides that survive upgrades.
2. **Everything is a plugin.** Every behavior is a ClassFactory-registered class with a logic half and, where relevant, a UX half. This covers step types, anchor resolvers, completion checks, triggers, eligibility policies, presenters, directors, and tour-level and step-level drivers. MJ ships a standard library of each, and any app can add or override them, for all tours or for one tour or step.
3. **One tour session, many directors.** A headless `TourSession` holds the pathway and the user's progress. Who drives it is pluggable:
   - a no-LLM visual player (the default)
   - Sage in chat
   - the realtime co-agent in voice
   - a verify director that replays tours in CI

   Every agent can start a tour, see that one is running, and help without derailing it.
4. **Anchors are semantic and checked in CI.** Steps target named things: a registered anchor key, a form field, a section, a nav item by DriverClass. They never target CSS paths. A standards gate fails any PR that breaks a tour, and a replay director turns every tour into a smoke test.
5. **Any host, not only Explorer.** The engine is pure TypeScript (`L0`), and the UI layer (`ng-tours`, `L1+L2`) ships both as Angular components and as a two-stage `<mj-tour-host>` custom element (a ~10 KB vanilla shell script that lazy-loads the Light DOM Angular session bundle only when a tour runs). Explorer is the first host, not a special case. The same tour definition runs in five places:
   - Explorer
   - any Angular app, MJ-connected or not
   - an Angular custom element (`<mj-tour-host>`)
   - a single `<script>` tag on any HTML page
   - the MJ mobile app

   Navigation, identity, persistence and the agent bridge are host adapters. This directly follows MJ's `@memberjunction/ng-realtime-widget` pattern (two-stage element bundle with Light DOM isolation via cascade layers + prefixing and shared guest session minting).

The plan also covers the content:

- default tours for MJ core: an intro to MJ, user tours per app, admin tours, builder tours and learning paths
- follow-on tours for each BizApps Open App
- demo tours for More Cheese

---

## 2. Goals and non-goals

### Goals
- A metadata model for tours, steps, branching paths, prerequisites, triggers, learning paths, per-user runs and admin overrides, in core `__mj`.
- A pluggable class model that apps can use to extend or override tour behaviour **end to end** (a tour driver and presenter) or **per step** (step types, plus a per-step driver override). The extension points are:
  - step types
  - anchor resolvers
  - completion checks
  - triggers
  - eligibility policies
  - directors
- A focused standard step-type library (~9 true visual primitives) that covers the patterns every major vendor converged on without authoring sprawl.
- Semantic, CI-verified anchoring, plus a runtime record of which anchor strategy resolved for each step.
- Per-user progress that follows the user across devices, and per-user preferences through `UserInfoEngine`.
- Agents can start tours, see the active tour and its step, guide a tour in chat or voice on rails, and answer questions mid-tour.
- Offering is respectful: on-demand entry points first, and a global interruption budget aware of dirty forms, open dialogs and live sessions.
- Analytics built on real goals (data facts), not completion counts.
- WCAG 2.2 AA conformance for every standard renderer.
- Default tours shipped for MJ core, the BizApps Open Apps, and More Cheese.
- **Host independence.** The same tour runs in Explorer, a non-Explorer Angular app, the `<mj-tour-host>` custom element, a plain HTML page through one script tag, and the mobile app. There are no Explorer imports below L3, no Angular imports in the L0 runtime or Stage-1 shell script, and the `ui-layers` standard enforces both.

### Non-goals (for this plan)
- A visual WYSIWYG content editor on par with Appcues' builder. Tour Studio is structured editing plus an element picker; rich design is out of scope.
- Surveys and NPS. They are adjacent and could later become a step type, but are not designed here.
- A React-specific wrapper. React apps use the custom element or the script API; a hook can follow later.
- Guiding users through third-party SaaS we do not control, such as Salesforce. External pages are supported when their owner adds the script or element; we never inject into sites we do not own.
- Practice sandboxes that create throwaway records. This is listed as an open question because of cross-app side effects (§20).
- Framework-wide localization. The tour content model is ready for it, but i18n is a separate initiative.

---

## 3. Background and context

### 3.1 What the market teaches

Research covered Appcues, Pendo, WalkMe/SAP, Whatfix, Userpilot, Userflow, Chameleon, UserGuiding, Product Fruits, Intercom, Jimo, Usetiful, Frigade, Usertour, Stonly and Amplitude Guides & Surveys (formerly Command AI). It also covered the open-source libraries Shepherd, Driver.js, Intro.js, Joyride, Reactour, NextStep and ngx-ui-tour. Findings that shape this plan:

- **Who starts the tour matters most.** Chameleon's 2024 benchmark puts average completion at 33.5%, against 64% when the user launched the tour. Produktly's 2026 study of 88 companies found 23% for auto-started tours and 69% for user-opened ones.
- **Length matters.** Completion is about 72% at 3 steps and 16% at 7 or more. A progress indicator adds about 12%.
- **Completion is a vanity metric.** In Userpilot's data, raising checklist completion did not move retention. Goals have to be outcomes.
- **Anchors are the top maintenance cost.** Whatfix puts manual reselection at 4–5 hours per app change, and every vendor ends up asking developers to add stable `data-*` attributes. Single-page-app timing ("element not found") forces polling.
- **Guide by default; do it for the user only when asked.** In a CHI 2025 study, semi-automated "do it with me" guidance beat full automation on control, usefulness and learnability. Kelleher and Pausch's in-app *Stencils* tutorials were 26% faster with fewer errors.
- **The leaders are inferring what a framework knows.** Pendo's Novus parses customer code, Whatfix's ScreenSense and WalkMe use vision models, and Frigade watches network calls to discover actions. AI "do it for me" features replay recorded clicks; Userflow's Action Flows cannot be undone and warn against destructive use.
- **Throttling converged on a global budget.** That means caps per period, tag groups, priority and a critical bypass, plus "smart delay" until the user pauses (Chameleon).
- **Licensing.** Shepherd (v14 and later) and Intro.js are AGPL or paid, so we build our own renderer. Driver.js's single-SVG-mask overlay and ngx-ui-tour's anchor-directive registry are the best models.

Vendor figures are vendor-reported. Several vendor domains were blocked from the research environment, so some claims come from search summaries. Treat them as directional. Sources are in §22.

### 3.2 What MJ already has

Nothing tour-shaped exists: there is no tour, coach-mark or spotlight component, and no tour library in any `package.json`. Most of the underlying layers already exist:

| Need | Existing piece | Where |
|---|---|---|
| Where the user is | `AppContextSnapshot$` (app, nav item, user, view, capabilities), fed by `NavigationService.SetAgentContext` | `packages/Angular/Explorer/shared/src/lib/navigation.service.ts` (:270, :294); `packages/AI/CorePlus/src/app-context.ts` |
| Agents act in the browser, in chat and voice | Client tools: `SetAgentClientTools`, global `registerClientTools`, `ClientToolRequestManager`; headless realtime channel (`BaseRealtimeChannelClient` + `ClientOnlyChannelServer`) | `navigation.service.ts:308`; `packages/Angular/Explorer/explorer-app/src/lib/explorer-app.component.ts` (`registerClientTools`, ~:1181); `packages/AI/Agents/src/ClientToolRequestManager.ts`; `packages/AI/Agents/src/realtime/client-only-channel-server.ts` |
| Client-tool precedence | `ResolveClientTools` (override > session > app > static) | `packages/AI/CorePlus/src/client-tool-resolver.ts` |
| A prompt-level tour today | `BuildTourGuidanceClause()`; its comment says it should become "a dedicated Tour skill once that agent primitive exists" | `packages/AI/Agents/src/realtime/realtime-tool-broker.ts:100` |
| An agent mode that lasts across turns | Skills with `ActivationScope = 'Conversation'` | `guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md` §1.6c |
| UI commands in agent replies | `actionableCommands` / `automaticCommands` (open:resource, notification, …) | `packages/AI/CorePlus/src/ui-commands.ts` |
| Branching pathway engine | `GraphTraversalEngine`: zero-dependency pure TypeScript (`SelectOutgoingEdges`, `AdvanceFrontier`), to be moved from `AI/CorePlus` to `@memberjunction/global` so runtimes don't pull `core-entities` | `packages/AI/CorePlus/src/task-graph/graph-traversal-engine.ts` → `@memberjunction/global` |
| Anchors on every generated form | `data-field-name`, `data-section-key`, `data-rail-key`, plus `OnNavigateToCommentAnchor` (switch rail group, expand section, scroll, pulse) | `packages/Angular/Generic/base-forms/src/lib/field/form-field.component.ts:207`; `.../container/record-form-container.component.ts:3304` |
| Conditions and audiences | `CompositeFilter.FromJSON(json).Evaluate(ctx)` (pure TS over `filter.types`) and `mj-filter-builder` | `guides/FILTER_BUILDER_AND_EVALUATION.md` |
| Per-user preferences | `UserInfoEngine` settings: synchronous read, debounced write | `packages/MJCoreEntities/src/engines/UserInfoEngine.ts` |
| Cached, reactive config | `BaseEngine` + `ObserveProperty`. `InteractiveFormsEngine` is the template, kill switch included | `packages/MJCore/src/generic/baseEngine.ts`; `packages/MJCoreEntities/src/engines/interactive-forms.ts` |
| Global / Role / User overrides | Entity Form Contributions scoping | `plans/form-contributions.md` |
| Goals proven by data | `BaseEntityEvent` (save, delete) on the MJGlobal bus | `packages/MJCore/src/generic/baseEntity.ts` |
| Cancelable event contract | `Before*` / `After*` event-args classes (`Before*` sync & cancelable; `After*` informational) | `guides/UI_LAYERING_GUIDE.md` §6 |
| Nudges | `MJ: User Notifications` + `NotificationEngine`; `IsNotificationClickable` special-cases resource types | `packages/Communication/notifications/`; `packages/Angular/Explorer/explorer-core/src/lib/user-notifications/user-notifications.component.ts` |
| Command palette | `OmnibarProvider` subclasses | `packages/Angular/Explorer/explorer-core/src/lib/omnibar/providers/` |
| First-run hook | `MJ_PRE_SHELL_GUARD`, declared and never implemented | `packages/Angular/Explorer/explorer-app/src/lib/pre-shell-guard.ts` |
| Overlay and picker precedent | Component feedback panel: positioned overlay plus capture-phase click picker | `packages/Angular/Generic/artifacts/src/lib/components/plugins/component-feedback-panel/component-feedback-panel.component.ts` |
| Element perception for authoring and health checks | ComputerUse `INTERACTIVITYPROBE`, accessibility snapshots, role+name re-resolution | `packages/AI/ComputerUse/src/browser/` |
| A CI gate on UI hooks | The Sales selector gate checks every harness selector against mounted templates | `bizapps-sales/scripts/assert-harness-selectors.mjs` |
| Deterministic rails before each LLM turn | Marketing's strategy-onboarding state machine | `bizapps-marketing/packages/Core/src/business/strategy/onboardingStateMachine.ts` |
| Shipping UI to any web page | `@memberjunction/ng-realtime-widget`: two-stage element build (`mj-realtime-widget.js` ~8.3 KB vanilla shell IIFE + lazy Stage-2 Light DOM Angular session bundle with `@layer` isolation + CSP nonce) | `packages/Angular/Generic/realtime-widget/scripts/build-element.mjs` |
| Public surfaces and guest identity | `MJ: Conversation Widget Instances` + `WidgetSessionService` (DPoP `cnf.jkt`, `IsIsolatedGuestRole`, 12h cap, `ParseAllowedOrigins`, RV4/RV5 `visitorIdentity.ts`) | `packages/MJServer/src/realtimeWidget/WidgetSessionService.ts` |
| Layer enforcement | `ui-layers` standard: `runtime` packages may not import Angular; `widgets` may not import the router or Explorer | `packages/Standards/src/checks/ui-layers.ts` |

**Gaps this plan closes:**
- no generic anchored popover or spotlight (CDK overlay exists; an arrowed popover does not)
- almost no stable hooks on shell chrome (header buttons are found by CSS class)
- no stable nav-item ID (items are matched by `Label`, which hosts can rename)
- no per-resource "loaded" stream (`LoadCompleteEvent` only feeds the first-load flag and tab titles)
- incomplete z-index tokenization above `--mj-z-dialog` (1200): `_tokens.scss` documents `mj-window` (10000), `MJDialogService` (10001), `MJConfirmService` (20000), omnibar (99999), and toasts (100000) as untokenized values
- no end-user product analytics
- agents in `NativeOnly` tool-calling mode get no client tools and no skills (`packages/AI/Agents/src/native-tools/native-control-config.ts`)

---

## 4. Architecture

```mermaid
flowchart TD
    SRC["Definition source + progress store<br/>TourEngine (MJ user) · surface guest session · inline JSON"] --> SES
    HOST["Host adapter (ITourHost)<br/>Explorer · any Angular app · element/script · mobile<br/>location · navigation · identity · capabilities"] <--> SES
    VD["Visual director<br/>Next/Back, no LLM (default)"] --> SES
    CD["Chat director<br/>Sage + Guided Tour skill"] --> SES
    VO["Voice director<br/>Realtime Tour channel"] --> SES
    XD["Verify director<br/>CI replay"] --> SES
    SES["TourSession (L0, pure TS, also runs in Node)<br/>cursor · pathway on GraphTraversalEngine · conditions · completion"]
    SIG["Signals in<br/>navigation · entity events · TourSignals · form state"] --> SES
    SES --> DOM["ng-tours Overlay & Two-Stage Element<br/>Stage 1 shell (anchors, triggers) → Stage 2 Light DOM Angular overlay"]
    DOM --> REN["Single Step Renderer Set (Angular)<br/>Light DOM with @layer + mjt- prefix · lazy chunks for heavy types"]
    SES --> RUN["Tour Runs / Run Steps<br/>progress · outcomes · anchor health"]
    SES --> EVT["TourEvents$ (Before*/After*)<br/>apps · agents · analytics observe"]
    RUN --> ANA["Analytics and health<br/>funnels · goal lift · broken-anchor alerts"]
```

The central decision is to separate four things:
- *what the tour is*: the session, its pathway and its progress
- *who drives it*: a director
- *how each step behaves and looks*: step types and renderers
- *where it runs*: the host

The tour is data, and the session owns state. Directors, step types, presenters and drivers are plugins. The host (Explorer, another Angular app, any web page) is an adapter. Explorer is the first host, not a special case.

### 4.1 Packages (following the UI layering guide and the `ui-layers` standard)

| Package | Layer (`mjUILayer`) | Holds |
|---|---|---|
| `@memberjunction/tours-runtime` (`packages/Tours/Runtime`) | `runtime`: pure TypeScript, no Angular, no DOM; runs in Node | `TourSession`; the pathway compiler onto `GraphTraversalEngine` (from `@memberjunction/global`); anchor-descriptor and step-config types; the logic-half base classes (`BaseTourDriver`, `BaseTourStepType`, `BaseTourCompletionCheck`, `BaseTourTrigger`, `BaseTourEligibilityPolicy`, `BaseTourDirector`) and their standard implementations; `ITourHost`, capability, `ITourDefinitionSource`, `ITourProgressStore` contracts (§4.2); `InlineTourSource`, `MemoryProgressStore`; `TourAgentToolkit`; `TourEvents`. Never depends on `@memberjunction/core-entities` or `@memberjunction/ai-core-plus` |
| `TourEngine` in `@memberjunction/core-entities` (`packages/MJCoreEntities/src/engines/tours.ts`) | Both tiers | The MJ-connected definition source and progress store: implements `ITourDefinitionSource` / `ITourProgressStore` over `tours-runtime` contracts; cached definitions and current user's runs, `ObserveProperty` streams, `ActiveSession$`, `Tours.Enabled` kill switch. Resolved via `TourEngine.GetProviderInstance(this.ProviderToUse, TourEngine)` in L2 widgets |
| `@memberjunction/ng-tours` (`packages/Angular/Generic/tours`) | `widgets`: no router, no Explorer | **Single UI + embed package**, matching `ng-realtime-widget`'s two-stage build:<br>• **Stage-1 vanilla shell (`shell-entry.ts` → `mj-tours.js`, ~10 KB gzipped IIFE, `FORBIDDEN_IN_SHELL` blocking `@angular/*`, `rxjs`, `zone.js`, `@memberjunction/*`):** defines `<mj-tour-host>`, exports `MountTours()` and `RegisterAnchor()`, runs the `data-mj-tour-anchor` `MutationObserver` (`AnchorRegistry`), and evaluates guest surface eligibility/triggers. Pages where no tour runs never download Angular or `zone.js`.<br>• **Stage-2 session bundle (`session-entry.ts` → `mj-tours-session.js` + lazy `chunks/`):** lazy-loaded via `import()` only when a tour starts or shows a beacon. Boots `createApplication()`, mounts `TourGlobalStylesComponent` (`@layer mj-tours-defaults` with `--mj-*` tokens, `mjButton`, Font Awesome), renders the **single** set of Angular `BaseTourStepRenderer` and `BaseTourPresenter` components in **Light DOM** (`@floating-ui/dom`, `mjt-` CSS prefix, spotlight SVG mask, focus/inert management, live region), plus `[mjTourAnchor]` directive, `MJ_TOUR_HOST` token, `SurfaceTourSource`/`SurfaceProgressStore`, and `WebTourHost`. Heavy step renderers (`AskAgent`, `Media`, `EmbeddedComponent`) sit in split lazy chunks so basic web tours never pull `ng-conversations` or `@memberjunction/core-entities` |
| Explorer integration (`explorer-core`, `explorer-app`, `dashboards`) | `surface` / `shell` | `ExplorerTourHost` (NavigationService, workspace state, `ResourceLoaded$`, agent bridge); header launcher; `OmnibarToursProvider`; Home learning-path card; the "tour" notification type; the **Tour Studio** app |
| `@memberjunction/tours-server` (`packages/Tours/Server`) | Server | Remote Operations (server predicates, batched run recording, claim guest runs, publish, surface tour delivery); Actions (`Start Tour For User`, `Suggest Tours`, `Get Tour Progress`, `Assign Learning Path`); `BaseTourServerPredicate`; server entity subclasses (including auto-snapshotting `TourVersion` when an `Active` tour changes); generalized embed guest-session service shared with `WidgetSessionService` |

Keeping the entire UI in `@memberjunction/ng-tours` (`"mjUILayer": "widgets"`) and keeping `@memberjunction/tours-runtime` DOM-free (`"mjUILayer": "runtime"`) aligns directly with `guides/UI_LAYERING_GUIDE.md` and `guides/BUILDING_UI_ON_MJ.md` (single component library built once on `@memberjunction/ng-ui-components` and shipped via two-stage `@angular/elements`), eliminating a parallel `tours-dom` / `tours-web` renderer hierarchy.

### 4.2 Hosts: running tours outside Explorer

Everything a tour needs from its surroundings goes through a host adapter, so the same tour JSON runs in each of these hosts:

| Host | How tours mount | Identity and progress | Navigation | Agent guide | Step renderers |
|---|---|---|---|---|---|
| MJ Explorer | Built in: `ExplorerTourHost` and `mj-tour-host` in the shell | MJ user; `TourEngine` (`GetProviderInstance`) | `NavigationService` | Sage in chat; realtime Tour channel in voice | Angular Light DOM, all types |
| Any MJ-connected Angular app (a member portal, a custom app) | `ng-tours`, `<mj-tour-host>`, and the app's own `ITourHost` provided under `MJ_TOUR_HOST` | MJ user; `TourEngine` over `ProviderToUse` | The app's own router, behind its host adapter (Generic packages stay router-free) | `ng-conversations` chat or `<mj-realtime-widget>`, if the app embeds them | Angular Light DOM, all types |
| Any Angular app, as a custom element | `RegisterTourElements()`, then `<mj-tour-host surface-key="…">` | Guest session from a surface key, or an MJ session the page already holds | Navigation intents emitted as DOM events, handled by the app | `<mj-realtime-widget>` | Angular Light DOM, all types |
| Any HTML page (React, server-rendered, static site) | One `<script>` tag (`mj-tours.js`, Stage-1 shell) or `MountTours()` | Guest session from a surface key; an MJ session if one is present | URL intents: `location.assign` or an `OnNavigate` callback | `<mj-realtime-widget>` linked to the surface (shares guest JWT + `VisitorKey`) | Stage-2 Light DOM Angular renderers (lazy-loaded on start; heavy types in split chunks) |
| Static page with no MJ backend | `MountTours({ Definitions })` | In memory, or a callback the page supplies | URL intents | None | Stage-2 Light DOM standard set |
| MJ mobile app | `tours-runtime` with native renderers registered under the same keys | MJ user | Mobile navigation | Mobile chat and voice | Native |

**The host contract** (in `tours-runtime`):

```typescript
/** What a tour needs from wherever it runs. Explorer is one implementation. */
export interface ITourHost {
    /** What this host can do; tours that need more are not offered here. */
    readonly Capabilities: TourHostCapabilities;
    /** Where the user is now, and every change. */
    readonly Location$: Observable<TourLocation>;
    /** Carry out a navigation intent (app + nav item, record, or URL). Resolves when the destination is ready. */
    Navigate(intent: TourNavigationIntent): Promise<boolean>;
    /** The signed-in MJ user, a guest visitor, or nobody. */
    readonly Principal: TourPrincipal;
    /** Optional: register the tour agent toolkit with whatever agent surface this host has. */
    AttachAgentBridge?(toolkit: TourAgentToolkit): void;
}

export interface TourHostCapabilities {
    Navigation: 'MJ App' | 'Url' | 'None';
    EntityEvents: boolean;   // BaseEntity events are observable in this page
    MJForms: boolean;        // generated MJ forms render here (FormField / FormSection anchors)
    Angular: boolean;        // Angular renderers can be mounted (always true on web Stage-2 & Angular hosts)
    Agent: 'None' | 'Chat' | 'Voice' | 'Chat and Voice';
    Persistence: 'MJ User' | 'Guest' | 'Memory';
}

/** Where definitions come from and where progress goes. */
export interface ITourDefinitionSource {
    GetTours(location: TourLocation): Promise<TourDefinition[]>;
}
export interface ITourProgressStore {
    GetRuns(): Promise<TourRunRecord[]>;
    RecordEvents(events: TourRunEvent[]): Promise<void>;
}
```

Each contract has three implementations:

| Implementation | For |
|---|---|
| `EngineTourSource` / `EngineProgressStore` | MJ users, over `TourEngine` |
| `SurfaceTourSource` / `SurfaceProgressStore` | Guests, over a surface's guest session and scoped Remote Operations |
| `InlineTourSource` / `MemoryProgressStore` | Static pages, optionally with a callback telemetry sink |

**Capabilities gate tours.** Step types, triggers, completion checks and anchor strategies declare the capabilities they need (`RequiredCapabilities`). Examples:
- `EntityEvent` needs `EntityEvents`.
- `FormField` needs `MJForms`.
- `AskAgent` needs `Agent`.

The eligibility chain skips a tour whose needs the host cannot meet, and Tour Studio warns when a tour is assigned to a surface that cannot run it.

**Anchors on any page.** The canonical anchor is a plain attribute, `data-mj-tour-anchor="portal.renew"`. A page MJ does not build can be toured by adding attributes, or by calling `RegisterAnchor(key, element)`. Role-and-name and selector anchors work anywhere. MJ's form anchors (`data-field-name`, `data-section-key`) work wherever MJ forms render, inside Explorer or not.

**The script API.** Exported functions are PascalCase, per MJ naming.

```html
<script src="https://cdn.example.org/mj-tours.js"
        data-surface-key="ts_live_xxx" data-api-url="https://api.example.org"></script>
<button data-mj-tour-anchor="portal.renew">Renew membership</button>
```

```typescript
import { MountTours } from '@memberjunction/ng-tours';

const tours = await MountTours({
    SurfaceKey: 'ts_live_xxx',
    ApiUrl: 'https://api.example.org',
    OnNavigate: intent => router.push(intent.Url),   // optional; the default is location.assign
});
await tours.Start('portal.renewal');
tours.Signal('portal.renewal.paid', { Amount: 120 }); // feeds Signal completion checks and triggers
tours.On('AfterStepComplete', e => analytics.track(e.StepKey));

// Static mode, no MJ backend:
await MountTours({ Definitions: [/* tour JSON */], Store: 'memory' });
```

**Isolation, theming and CSP** follow `ng-realtime-widget` directly:
- The overlay renders in **Light DOM** (not Shadow DOM, so Font Awesome `@font-face`, `mjButton`, and CDK/Kendo popups work reliably). CSS isolation uses the `mjt-` class prefix and a `@layer mj-tours-defaults` cascade layer mounted via `TourGlobalStylesComponent` (just like `WidgetGlobalStylesComponent`), so host `--mj-*` tokens always win and gaps get filled cleanly.
- CSP: `mj-tours.js` is a classic IIFE (no CORS required on the script tag); Stage-2 loads via native `import()` with `ngJitMode: false` (Angular Linker pre-linked at build time so `unsafe-eval` is never needed) and reads `csp-nonce` the way `realtime-widget/src/lib/csp-nonce.ts` does.

**Public surfaces and guests.**
- `MJ: Tour Surfaces` (§6) declares each place tours run outside MJ-authenticated hosts. Each surface has a publishable key, allowed origins, an auth strategy, a guest role, a rate limit and visitor retention, and links tours many-to-many via `MJ: Tour Surface Tours`. It can optionally link a `MJ: Conversation Widget Instances` row to provide a chat or voice guide on that page.
- Guest sessions generalize `WidgetSessionService` + `widgetCore.ts` (`packages/MJServer/src/realtimeWidget/`) into a shared embed-surface session service so both widget and tour surfaces reuse MJ#6043 `IsIsolatedGuestRole`, DPoP `cnf.jkt`, the 12-hour session cap, fail-closed `ParseAllowedOrigins`, `HostIdentity` verification, and RV1/RV4/RV5 `VisitorKey` handling — and a page hosting both shares one guest JWT and `VisitorKey` cookie.
- A "Tour Guest" role can read only published tours assigned to that surface and record only its own runs, through scoped Remote Operations (`Tours.GetSurfaceTours`, `Tours.RecordEvents`), with no entity CRUD. `Tours.RecordEvents` must derive `SurfaceID` and `VisitorKey`/`mj_sid` strictly from verified JWT claims (never trusting client payload values), and `TourRun.VisitorKey` falls back to `mj_sid` when returning-visitor cookies are off so `CK_TourRun_Principal` always holds.
- Server predicates run as the guest, so they see only what the guest may see.
- Guest runs are claimed on sign-in (RV4 `ResolveVisitorIdentity` + `Tours.ClaimGuestRuns`) and erased on RV5 `ForgetVisitor`.

**What stays Explorer-only** (correctly, at L3): the header launcher, the omnibar provider, the Home learning-path card, the tour notification type, and Tour Studio.

---

## 5. The extension model

Every tour behaviour follows the MJ pattern: a metadata row or JSON key names a class, the class is registered with `@RegisterClass`, and resolution goes through `MJGlobal.ClassFactory`. Last registration wins, so apps override framework defaults by import order, exactly as custom forms do. Where a behaviour has a visual side, it is split into a **logic half** (L0, pure TypeScript in `@memberjunction/tours-runtime`, testable without a DOM, runs in any host) and a **UX half** (L1/L2 Angular `BaseTourStepRenderer` in `@memberjunction/ng-tours`, compiled once and delivered in Light DOM for Angular hosts, custom elements, and script-tag web embeds alike). The mobile host registers native UX halves under the same keys, as it does for `BaseMobileResource`.

### 5.1 Plugin points

| Plugin base | Selected by | Standard implementations shipped by MJ | Example app extensions |
|---|---|---|---|
| `BaseTourStepType` (logic) + `BaseTourStepRenderer` (UX) | `MJ: Tour Step Types` row → `DriverClass` / `RendererClass` | Spotlight, Action, Beacon, Modal, Banner, Choice, Media, EmbeddedComponent, AskAgent (§5.3) | Caliber `PracticeConversation` (starts a short roleplay session); Sales `BoardDrag` (guides dragging a card between stages); Forms `FillSampleForm` |
| Per-step override (subclass of the step type's class) | `MJ: Tour Steps.DriverClass` (nullable) | n/a | One special step in one tour, e.g. Sales' close-won step that also checks a contract and order were provisioned |
| `BaseTourDriver` (tour-level logic) | `MJ: Tours.DriverClass` (null = `Default`) | `Default` | Sales `QuoteToCashTourDriver` adds the current deal to the condition context and owns cross-app branching |
| `BaseTourPresenter` (tour-level UX; Angular) | `MJ: Tours.PresenterClass` (null = `Overlay`) | `Overlay` (spotlight + popover), `SidePanel` (a docked step list for long setup tours), `Embedded` (inside a host component such as an empty state) | More Cheese branded `ICFWelcomePresenter` |
| `BaseTourAnchorResolver` | `ITourAnchor.Strategy` | `Registered`, `FormField`, `FormSection`, `FormRailGroup`, `FormToolbarAction`, `NavItem`, `RailPage`, `AppSwitcher`, `GridColumn`, `Omnibar`, `ChatComposer`, `Role`, `Selector` | Sales `DealBoardColumn` (resolves a Kanban column by a pipeline-stage flag, never by stage name); Caliber `StudioDomain` |
| `BaseTourCompletionCheck` | `ITourCompletion.Checks[].Type` | `NextButton`, `AnchorInteraction`, `Navigation`, `Signal`, `EntityEvent`, `FieldState`, `ServerPredicate`, `AgentConfirmed`, `All`, `Any` | Orders `OrderReachedStatus`; Accounting `BatchDispatched` |
| `BaseTourServerPredicate` (server) | `ServerPredicate` check config | `HasRecords` (entity + filter, as the user), `QueryReturnsRows`, `AuthorizationHeld` | Sales `UserOwnsPipeline` |
| `BaseTourTrigger` | `MJ: Tour Triggers.TriggerType` | `FirstVisit`, `EntityFormOpened`, `Signal`, `AppUpgraded`, `Struggle`, `Schedule`, `AgentSuggested` | Accounting `BatchFailed` offers "Fix a failed batch" |
| `BaseTourEligibilityPolicy` | Registered globally; all apply | `AudiencePolicy`, `PrerequisitePolicy`, `PermissionPolicy`, `StatusPolicy` (completed, dismissed, snoozed), `InterruptionBudgetPolicy` | "Only after company setup is complete" (Accounting); a licence-tier policy |
| `BaseTourDirector` | Session `Mode` | `Visual`, `Chat`, `Voice`, `Verify` (CI replay), `Recorder` (authoring capture in Tour Studio) | Marketing could wrap its strategy-onboarding agent as a director |

The type keys for triggers, completion checks, anchor strategies and server predicates are **open strings** resolved against the ClassFactory. They are not CHECK-constrained, because a CHECK constraint would stop apps adding their own. `mj sync push` validation and the `tour-anchors` standard (§13) report an unknown key. Tour Studio lists the registered keys for authors.

### 5.2 The base classes (sketch)

```typescript
// @memberjunction/tours-runtime — logic half. Pure TypeScript; no Angular, no DOM.

/** Shared by every step type. TConfig is the step's typed Configuration (a JSONType interface). */
export abstract class BaseTourStepType<TConfig extends object = object> {
    /** Authoring-time and sync-push validation of the step's Configuration. */
    public abstract ValidateConfig(config: TConfig): TourValidationResult;

    /** Navigation and make-visible work before the step shows. The default runs the step's Prepare actions. */
    public async Prepare(ctx: TourStepContext<TConfig>): Promise<TourPrepareResult> { /* … */ }

    /** Anchors this step targets; empty for modal-style steps. */
    public GetTargets(ctx: TourStepContext<TConfig>): ITourAnchor[] { /* … */ }

    /** Completion used when the author specified none (e.g. Spotlight → NextButton). */
    public GetDefaultCompletion(ctx: TourStepContext<TConfig>): ITourCompletion { /* … */ }

    /** What an agent director is told about this step, and any step-specific tools it may call. */
    public DescribeForAgent(ctx: TourStepContext<TConfig>): TourStepAgentBrief { /* … */ }

    /** Static checks for the tour-anchors gate and the Verify director. */
    public GetHealthChecks(config: TConfig): TourHealthCheck[] { return []; }

    /** Lifecycle hooks. */
    public async OnEnter(ctx: TourStepContext<TConfig>): Promise<void> { }
    public async OnExit(ctx: TourStepContext<TConfig>, outcome: TourStepOutcome): Promise<void> { }
}

/** Tour-level logic. One per tour (MJ: Tours.DriverClass), default 'Default'. */
export class BaseTourDriver {
    /** Add domain facts to the CompositeFilter context (current deal, pipeline, company…). */
    public async BuildContext(ctx: TourContextBuilder): Promise<void> { }

    /** Synchronous, cancelable (UI layering §6 contract). */
    public BeforeTourStart(args: BeforeTourStartEventArgs): void { }
    public BeforeStepEnter(args: BeforeTourStepEnterEventArgs): void { }

    /** Override branching beyond Step Paths. Return null to accept the graph's choice. */
    public ResolveNextStep(ctx: TourSessionContext, candidates: TourStepRef[]): string | null { return null; }

    /** Goal evaluation; the default evaluates the tour's ITourGoal. */
    public async EvaluateGoal(ctx: TourSessionContext): Promise<boolean> { /* … */ }

    public async OnStepCompleted(ctx: TourSessionContext, step: TourStepRef, outcome: TourStepOutcome): Promise<void> { }
    public async OnTourEnded(ctx: TourSessionContext, outcome: TourRunOutcome): Promise<void> { }

    /** Extra framing for agent directors (domain vocabulary, cautions). */
    public DescribeForAgent(ctx: TourSessionContext): string { return ''; }
}

// @memberjunction/ng-tours — single Angular UX half (Light DOM, also packaged as Stage-2 custom element).
export abstract class BaseTourStepRenderer<TConfig extends object = object> extends BaseAngularComponent {
    @Input() Step!: TourStepView<TConfig>;       // read-only projection of the step
    @Input() Session!: TourSessionView;          // progress, mode, can-go-back…
    @Output() NextRequested = new EventEmitter<TourStepIntentEventArgs>();
    @Output() BackRequested = new EventEmitter<TourStepIntentEventArgs>();
    @Output() DismissRequested = new EventEmitter<TourStepIntentEventArgs>();
    @Output() ChoiceMade = new EventEmitter<TourChoiceEventArgs>();
}

// Registration, e.g. in bizapps-caliber:
@RegisterClass(BaseTourStepType, 'Caliber: Practice Conversation')
export class PracticeConversationStepType extends BaseTourStepType<IPracticeConversationStepConfig> { /* … */ }

@RegisterClass(BaseTourStepRenderer, 'Caliber: Practice Conversation')
@Component({ standalone: true, selector: 'caliber-tour-practice-step', /* … */ })
export class PracticeConversationStepRenderer extends BaseTourStepRenderer<IPracticeConversationStepConfig> { /* … */ }
export function LoadPracticeConversationStep() { /* tree-shaking anchor */ }
```

**Resolution order for a step's behaviour.** The step's own `DriverClass` comes first (a subclass for this one step). Otherwise the step type's `DriverClass` applies. The renderer is the step type's `RendererClass`, or its `Name` when that is null. A presenter can wrap or replace step renderers wholesale, for example `SidePanel` renders every step as a row in a docked list.

**Events.** `TourSession` emits class-based `Before*` / `After*` events per `UI_LAYERING_GUIDE.md` §6:

| Event | Cancelable | Notes |
|---|---|---|
| `BeforeTourStart` | yes | Synchronous veto; `AfterTourStart` does not fire if canceled |
| `AfterTourStart` | no | Informational |
| `BeforeStepEnter` | yes | Synchronous veto; `AfterStepEnter` does not fire if canceled |
| `AfterStepEnter` | no | Informational |
| `AfterStepComplete` | no | Informational |
| `BeforeTourEnd` | yes | Synchronous veto; `AfterTourEnd` does not fire if canceled |
| `AfterTourEnd` | no | Informational |
| `AnchorMissing` | no | Informational |
| `DirectorChanged` | no | Informational |

They are exposed on `TourSession.Events$`, and engine-wide on `TourEngine.Events$`, so drivers, apps, analytics and agents all observe the same stream. Before-handlers are synchronous, per the layering guide.

**Component signals.** A component publishes semantic events with `TourSignals.Emit('sales.deal.stageChanged', payload)`, usually from inside its existing `After*` handlers. That is a component's explicit, documented contract with tours, and the `Signal` completion check and trigger consume it. Signal names are namespaced like anchor keys.

### 5.3 Standard step types (9 primitives, seeded in `metadata/tour-step-types/`)

Consolidating from 14 types down to 9 true visual primitives keeps authoring crisp in Tour Studio and prevents navigation-only stops from burning the 5-step tour budget:

| Step type | What the user sees | Default completion | Notes (including folded concepts) |
|---|---|---|---|
| Spotlight | Dimmed page with a cut-out around the anchor (one SVG `evenodd` mask, several cut-outs allowed) and a popover with title, body and "2 of 5" | `NextButton` | Modal with focus trap and sibling `inert` (spotlighted target remains in a11y tree) |
| Action | Non-modal popover asking the user to do something (click, type into a `FormField`, or wait for a background `Signal` with an optional waiting indicator); page stays fully usable | Required: author picks `Signal` / `EntityEvent` / `FieldState` / `Navigation` / `AnchorInteraction` | Absorbs `FieldEntry` (`FormField` anchor + `FieldState` check) and `WaitForSignal`; F6 moves between popover and page |
| Beacon | A pulsing hotspot that opens a hint on click | Opened or dismissed | Pulse stops within 5 s (WCAG 2.2.2) |
| Modal | Centered card: welcome, announcement, or end-of-tour checkpoint recap with next-tour / learning-path CTA | `NextButton` | Absorbs `Checkpoint`; one-step tours are announcements |
| Banner | Strip across the top of the current resource | Dismissed or call to action clicked | |
| Choice | "What do you want to do first?" or quick knowledge check with 2–4 answers | Answer given | Absorbs `KnowledgeCheck` (optional correct-answer feedback); feeds Step Path conditions |
| Media | Short video or image sequence, captions required | Ended or Next | Uses `ng-media-player` (split lazy chunk in external web embeds) |
| EmbeddedComponent | An MJ interactive component rendered in the popover | Component emits complete | Uses the interactive-components runtime (split lazy chunk) |
| AskAgent | Opens Sage (chat or voice) with a seeded prompt, for an open-ended stop | `AgentConfirmed` or Next | Bridges a visual tour to a guided conversation (split lazy chunk) |

Cross-screen movement (`Navigate` in the initial draft) runs as a step's `Prepare` phase (`ITourStepPrepare`: switch app, nav item, rail page, or record) with a polite WCAG 3.2 / 4.1.3 live-region announcement before the step renders, so tours never spend a step just changing routes.

Each row ships with a `ConfigSchema` (JSON Schema, stored with `@file:`) and a typed JSONType interface under `metadata/entities/JSONType-interfaces/`. Tour Studio's step editor is generated from the schema.

---

## 6. Data model

All entities are in core `__mj` with the `MJ: ` prefix. Rich configuration lives in typed JSON fields (JSONType interfaces), so the shape can grow without migrations.

```mermaid
erDiagram
    TourStepType ||--o{ TourStep : "types"
    Tour ||--o{ TourStep : "has draft steps"
    Tour ||--o{ TourVersion : "publishes"
    Tour ||--o{ TourStepPath : "branches"
    Tour ||--o{ TourPrerequisite : "requires"
    Tour ||--o{ TourTrigger : "offered by"
    Tour ||--o{ TourOverride : "customized by"
    Tour ||--o{ TourRun : "attempted in"
    LearningPath ||--o{ LearningPathTour : "contains"
    Tour ||--o{ LearningPathTour : "member of"
    TourVersion ||--o{ TourRun : "pinned by"
    TourRun ||--o{ TourRunStep : "records"
    User ||--o{ TourRun : "takes"
    Application ||--o{ Tour : "owns"
    TourSurface ||--o{ TourSurfaceTour : "assigns"
    Tour ||--o{ TourSurfaceTour : "assigned to"
    TourSurface ||--o{ TourRun : "records"
```

| Entity | What it is | Key fields |
|---|---|---|
| `MJ: Tour Step Types` | Registry of step types: the plugin catalog authors pick from | `Name`, `Description`, `DriverClass`, `RendererClass`, `ConfigSchema`, `SupportedModes` (Show/Guide/Do), `IsAgentCapable`, `Icon`, `Status` |
| `MJ: Tours` | One guidance experience | `Name`, `TourKey` (stable, namespaced, e.g. `sales.first-deal`), `Description`, `ApplicationID` (owning app; null = core), `RunInAuthenticatedHosts` (default true; Explorer and MJ-connected apps), `Status` (Draft, Active, Retired), `CurrentVersionID`, `EstimatedMinutes`, `AudienceFilter` (CompositeFilter JSON), `LaunchPolicy` (JSON), `Priority`, `ThrottleTags`, `DefaultGuideMode` (Visual, Chat, Voice, User Choice), `AllowAgentActions`, `GuideAgentID` (null = app default, then Sage), `DriverClass`, `PresenterClass`, `Goal` (`ITourGoal`), `StartLocation` (`ITourStartLocation`, including context requirements such as "any open record") |
| `MJ: Tour Versions` | Immutable published snapshot (same pattern as Rubric Versions and Sonar score-model versions) | `TourID`, `VersionNumber`, `Definition` (steps and paths as JSON), `PublishedAt`, `PublishedByUserID`, `ChangeSummary` |
| `MJ: Tour Steps` | Editable draft step | `TourID`, `StepKey` (stable), `Sequence`, `StepTypeID`, `DriverClass` (per-step override), `Title`, `Body` (Markdown, MJ template variables), `Configuration` (validated against the type's schema), `Anchor` (`ITourAnchor`), `Placement`, `Mode` (Show, Guide, Do), `Prepare` (`ITourStepPrepare`), `Completion` (`ITourCompletion`), `SkipWhen` (CompositeFilter), `OnMissing` (Skip, Center, Stall, AgentRecover), `IsOptional`, `GuideNotes` (agent-only context), `VoiceScript` (optional) |
| `MJ: Tour Step Paths` | Branch edge; linear tours need none | `TourID`, `FromStepID`, `ToStepID`, `Condition` (CompositeFilter over session context, or a choice key), `Label`, `Priority`, `IsDefault` |
| `MJ: Tour Prerequisites` | What must come first | `TourID`, `PrerequisiteType` (Tour, Role, Authorization, Application, Data), `RequiredTourID`, `Condition`, `Strength` (Required, Recommended) |
| `MJ: Tour Triggers` | When to offer | `TourID`, `TriggerType` (open key, §5.1), `Configuration`, `Delivery` (Offer, Beacon, Notification, Auto), `CooldownDays`, `Status` |
| `MJ: Learning Paths` | A curriculum, rendered as a checklist | `Name`, `PathKey`, `Description`, `ApplicationID`, `AudienceFilter`, `Status` |
| `MJ: Learning Path Tours` | Membership | `LearningPathID`, `TourID`, `Sequence`, `IsRequired` |
| `MJ: Tour Runs` | One attempt by one user or guest visitor: the progress ledger | `UserID` (null for guests), `VisitorKey` (guests; falls back to `mj_sid` when visitor memory is off), `SurfaceID`, `TourID`, `TourVersionID`, `Status` (Pending, In Progress, Completed, Dismissed, Snoozed, Abandoned, Failed), `GuideMode`, `DirectorType`, `CurrentStepKey`, `PathTaken` (JSON), `LaunchSource` (Launcher, Omnibar, Agent, Trigger, Notification, Link), `LaunchedByAgentRunID`, `StartedAt`, `CompletedAt`, `GoalMetAt`, `SnoozedUntil`, `ConversationID`, `AgentSessionID`, `IsHoldout` |
| `MJ: Tour Run Steps` | Telemetry per stop | `TourRunID`, `StepKey`, `EnteredAt`, `ExitedAt`, `Outcome` (Completed, Skipped, Already Known, Done By Agent, Anchor Missing, Dismissed), `AnchorResolution` (Registered, Semantic, Role, Selector, Failed), `QuestionCount` |
| `MJ: Tour Overrides` | Host-admin changes that never touch shipped rows | `TourID`, `Scope` (Global, Role, User), `RoleID`, `UserID`, `Precedence`, `Status`, `AudienceFilter`, `LaunchPolicy`, `IsDisabled` |
| `MJ: Tour Surfaces` | A place tours run outside MJ-authenticated hosts (a portal, a public page) | `Name`, `SurfaceKey`, `SurfaceType` (MJ Angular App, Web Page, Mobile App), `PublicKey`, `AllowedOrigins`, `AuthStrategy` (MJ User, Guest, Either), `GuestRoleID`, `ConversationWidgetInstanceID` (optional chat or voice guide), `RateLimitPerMinute`, `VisitorRetentionDays`, `Status` |
| `MJ: Tour Surface Tours` | Many-to-many assignment of tours to external surfaces | `SurfaceID`, `TourID`, `IsDefault`, `Sequence`, `StartLocationOverride` |

Rules:
- **Runs pin a version.** An app upgrade that rewrites a tour never corrupts someone's half-finished run. A run on a retired version finishes on its snapshot, or is offered a restart.
- **Active seeded tours auto-snapshot `TourVersion`.** `TourRun.TourVersionID` is `NOT NULL`, while `metadata/tours/` seeds `Tour`, `TourStep`, and `TourStepPath` without requiring authors to duplicate JSON snapshots by hand. Server entity logic (and the `mj sync push` / publish pipeline) automatically creates/updates the immutable `TourVersion` and `CurrentVersionID` whenever an `Active` tour has un-snapshotted step/path changes.
- **Shipped rows are never edited by host admins.** Their changes go into Tour Overrides, the same layering Form Chrome Rules and Form Contributions use, so customizations survive upgrades.
- **CHECK values are written for people**, per the readable-status-values standard (`In Progress`, not `InProgress`).

User preferences use the `UserInfoEngine` key `mj.tours.preferences.v1`. It holds offers on or off, preferred guide mode, voice, pace and show-beacons. Instance defaults use `InstanceConfigEngine` keys such as `Tours.Enabled`, `Tours.InterruptionBudget` and `Tours.DefaultGuideAgentID`. Per-app agent defaults live in the existing `Application.AgentSettings` (`IAgentSettings`).

---

## 7. Anchoring

A step stores an anchor descriptor, resolved at run time by the first rung of this ladder that finds a visible element:

1. **Registered key.** The canonical form is a plain attribute, `data-mj-tour-anchor="sales.deals.board"`, which works on any HTML page; `@memberjunction/ng-tours`'s `AnchorRegistry` (including its Stage-1 shell `mj-tours.js`) watches for it with a `MutationObserver`. In Angular, the `mjTourAnchor` directive sets the attribute and registers the element eagerly. Script hosts can also call `RegisterAnchor(key, element)`. The engine waits on registry events, with no polling. Keys are namespaced (`core.shell.*`, `sales.*`, `orders.*`) and declared in source, so CI can see them. This is the ngx-ui-tour model.
2. **Semantic.** These resolvers use metadata MJ already has:
   - `FormField`, `FormSection`, `FormRailGroup` via `data-field-name`, `data-section-key`, `data-rail-key`
   - `FormToolbarAction` by key
   - `NavItem` by DriverClass, never by label
   - `RailPage` by the stable `Id` in each section nav model
   - `AppSwitcher`, `GridColumn`, `Omnibar`, `ChatComposer`

   A resolver also makes its target reachable: open the record, switch the rail group, expand the section. That is `OnNavigateToCommentAnchor` generalized into a shared `FormAnchorNavigator` in `base-forms`, used by both comments and tours.
3. **Accessible role and name**, Playwright-style, for third-party widgets.
4. **CSS selector**, last resort; flagged by Tour Studio and the gate.

```json
{
  "Strategy": "FormField",
  "Entity": "MJ_BizApps_Sales: Deals",
  "Field": "Amount",
  "Fallbacks": [{ "Strategy": "Role", "Role": "spinbutton", "Name": "Amount" }]
}
```

**Contextual tours.** Semantic anchors can be parameterized from context: `"Entity": "{{Context.Record.EntityName}}"`. One tour such as `core.records` then runs on *any* entity form, which no overlay tool can do.

**When nothing resolves:** wait for a registry event (default 5 s), run `Prepare`, then apply `OnMissing`. Every resolution, including which rung succeeded, is recorded in Tour Run Steps.

---

## 8. Steps and completion

The rule is to **credit the outcome, not the click**. A step counts as done however the user got there: mouse, keyboard, another route, or the agent.

Completion checks (`ITourCompletion`, composable with `All` / `Any`):

- `NextButton`, for show-and-tell steps only
- `AnchorInteraction`: click, focus or change on the anchored element
- `Navigation`: from `NavigationService` / `WorkspaceStateManager` observables, plus the new `NavigationService.ResourceLoaded$`
- `Signal`: a named `TourSignals` event
- `EntityEvent`: a `BaseEntityEvent` save or delete on an entity whose record matches a CompositeFilter; goal-grade evidence
- `FieldState`: a field on the open form satisfies a condition
- `ServerPredicate`: a `BaseTourServerPredicate` evaluated by Remote Operation, batched and cached, always as the user
- `AgentConfirmed`: the agent confirms through a tool call; the weakest evidence, recorded as such

`SkipWhen` uses the same checks in reverse, so a step whose outcome is already true is skipped.

The step lifecycle runs in this order:
1. Prepare
2. Resolve the anchor
3. `BeforeStepEnter`
4. Render
5. Await completion
6. Record the outcome
7. `AfterStepComplete`
8. Pick the next step

Pause, dismiss and anchor-missing exit from any point.

---

## 9. Pathways, prerequisites and learning paths

- **No second graph engine.** At load, `tour-graph-compiler.ts` compiles steps and Step Paths into `GraphNode` / `GraphEdge` for `GraphTraversalEngine`, as `flow-graph-compiler.ts` does for Flow agents. Branch conditions, exclusive groups, optional edges and the "Skipped" cascade all come for free, and the whole thing runs in the browser.
- **Inside a tour:** steps run in `Sequence` unless paths say otherwise. Choice answers, roles, the current record and server-predicate results form the condition context, and `BaseTourDriver.BuildContext` can add domain facts. `ResolveNextStep` is the escape hatch for logic a condition cannot express.
- **Between tours:** prerequisites are either **Required** (the tour is not offered until met) or **Recommended** ("Take *Pipeline basics* first?", or a two-sentence agent recap).
- **Permission prerequisites are derived, not authored.** If an anchor is on an entity the user cannot update, or in an app they cannot access, that step is skipped. If the goal is impossible for them, the tour is never offered.
- **Across apps:** steps navigate through `NavigationService.SwitchToApp` with query params, which land synchronously before a cached component reattaches. Cross-app tours are owned by the *top-most* app in the dependency chain, because Common must stay consumer-blind (§17).
- **Learning paths** render as checklists on Home and in the launcher. Seed visible progress, always show the next concrete step, and never allow skipping a required item. ATS's readiness checklist states why: "a checklist item you may skip teaches people to skip the list."

---

## 10. Agents and tours

Tours are first-class for every agent, not only the guide.

The agent tools and context live in `tours-runtime` as a host-agnostic `TourAgentToolkit`: JSON schemas plus handlers. Each host attaches it to whatever agent surface it has:

- **Explorer**: `NavigationService.SetAgentClientTools` and `registerClientTools`
- **another Angular app**: its `ng-conversations` chat
- **a public page**: `<mj-realtime-widget>`'s browser-declared client tools, as Caliber already does

### 10.1 Agents can start tours
- **Global client tools**, defined once in `TourAgentToolkit`, attached in Explorer through `explorer-app.component.ts` `registerClientTools`, and declared in `metadata/client-tool-definitions/`, so they are available even when no tour is running. Bind them to Sage through `MJ: AI Agent Client Tools`.

  | Tool | Parameters |
  |---|---|
  | `StartTour` | `TourKey`, `Mode` (Visual, Chat, Voice), optional `StartAtStepKey` |
  | `ListTours` | `ForCurrentLocation`, `Query` |
  | `GetActiveTour` | — |
  | `PauseTour` | — |
  | `ResumeTour` | — |
  | `StopTour` | — |

- **UI command `start:tour`** in `packages/AI/CorePlus/src/ui-commands.ts`. An agent's reply can carry a **Show me** button (`actionableCommands`), handled by the conversations surface through the tour host.
- **Server Actions** (metadata plus `@memberjunction/tours-server` classes) for workflows, scheduled jobs, routines and any agent:

  | Action | What it does |
  |---|---|
  | `Start Tour For User` | Creates a Pending run and a "tour" notification; `ResourceConfiguration.type = 'tour'` is handled in `IsNotificationClickable` |
  | `Suggest Tours` | Ranked, eligible tours for a user and context |
  | `Get Tour Progress` | Progress for a user, tour or learning path |
  | `Assign Learning Path` | Assigns a path to a user or role |

- **How-do-I matching.** Tours are indexed with entity search (name, description, step titles and bodies). "How do I close a deal?" resolves to `sales.close-won`. Sage can answer from the tour's steps in text *and* offer to show it.

### 10.2 Agents know a tour is running
- **`AppContextSnapshot.ActiveTour`.** Add it to `packages/AI/CorePlus/src/app-context.ts`:
  - fields: `{ TourKey, Name, StepKey, StepTitle, StepIndex, StepCount, Mode, DirectorType, StartedAt }`
  - `AvailableTours`: up to 3 eligible tours for the current location
  - `FormatAppContextNote` prints "User is on step 3 of 5 of the tour *Closing your first deal* (visual)"

  Every agent receives this through the existing `buildAppContextSection`.
- **Realtime.** `TourEngine.Events$` is bridged into `ClientContextChannel`, so a voice co-agent hears "tour started" and "step completed" as context notes even when it is not the director.
- **Coexistence rule.** Only the session's **director** can move the cursor or perform steps. Any other agent may answer, pause, resume, or "hand back to the guide". The runtime enforces this, not the prompt.

### 10.3 Agent-guided tours: "rails with a leash"

The authored pathway is the rail, and the agent holds a cursor on it. The agent may:
- explain and answer questions
- take authored branches
- skip steps that are satisfied or already known
- pause, recover and resume

It may **not** invent steps, reorder the pathway, or point at UI the registry has not confirmed is on screen. This follows the same principle as Marketing's onboarding agent: deterministic state decides, the model narrates.

- **Chat director.** Sage, with a **Guided Tour** skill (`metadata/ai-skills/`, `ActivationScope = 'Conversation'`) activated when a tour starts in chat mode. The skill's instructions replace `BuildTourGuidanceClause`, which stays only for unscripted tours.
- **Voice director.** The Realtime Co-Agent over a dedicated headless Tour channel (`BaseRealtimeChannelClient` descriptor with `DisplayPolicy: 'headless'` and `ClientOnlyChannelServer`), using the same tour session tools via `ContextTool` and receiving completion/step updates through `RequestSpokenResponse` (following the whiteboard channel precedent).
- **Modes per step:**
  - **Guide** (default): highlight, then wait for the user.
  - **Show**: highlight and explain.
  - **Do**: the agent performs the step only when `AllowAgentActions` is true, the step type supports it, and the user confirms **each state-changing mutation** (`TourPerformStep`). Deletes, financial posting / batch dispatch, permission or role grants, and outbound messages are **hard-banned** from Do mode regardless of author flags. All permitted actions execute through typed client tools or Actions with the user's own permissions — never synthetic DOM clicks — and Record Changes audits every write.
  - **Skip**.
- **Session tools.** The tour player registers these while a session is live, through `SetAgentClientTools`. Names avoid dots for native tool-calling.

  | Tool | Purpose | Guard |
  |---|---|---|
  | `TourGetState` | Current step, path, remaining steps, guide notes | Read-only |
  | `TourGetVisibleAnchors` | Registered and semantic anchors on screen, with accessible names | The only source the agent may cite |
  | `TourHighlight` | Spotlight an anchor with an optional caption | Fails loudly if the anchor is not visible |
  | `TourGoToStep` | Move the cursor | Authored edges only, or back to a completed step; director only |
  | `TourPrepareStep` | Run the step's navigation and make-visible | Navigation consent once per tour |
  | `TourPerformStep` | Do mode | `AllowAgentActions`, per-mutation confirmation, non-banned action; director only |
  | `TourMarkKnown` | Skip ahead because the user already knows | Optional steps, unless the user confirms |
  | `TourSuggest` | Offer a prerequisite or the next path item | Eligibility applies |
  | Step-type tools | From `BaseTourStepType.DescribeForAgent` | Declared by the step type |

- **Grounding** comes from three places: the step's guide notes, entity and field descriptions from metadata, and Knowledge Hub or scoped search. After an answer the agent offers "back to step 4?".
- **Unscripted tours.** When no authored tour matches "show me around Orders", Sage composes an ephemeral tour from the app's nav items, rail pages and registered anchors. It labels the tour unscripted and offers to save it as a draft in Tour Studio.
- **Voice specifics:**
  - The highlight starts with the utterance.
  - Turns are short, and the user can interrupt.
  - The agent is silent while waiting for the user to act, and plays a soft cue on completion.
  - Commands: next, repeat, skip, show me, do it for me.
  - Every spoken line is mirrored as text.

```mermaid
sequenceDiagram
    participant U as User
    participant S as Sage (Chat director)
    participant P as Tour player (browser)
    participant R as TourSession
    U->>S: "Walk me through closing a deal"
    S->>P: StartTour(sales.close-won, Chat)
    P->>R: start, compile pathway, step 1
    S->>P: TourGetVisibleAnchors()
    P-->>S: [sales.deal.stage (Stage), …]
    S->>P: TourHighlight(sales.deal.stage, "Pick the winning stage")
    U->>P: moves the deal to Closed Won
    P->>R: EntityEvent check satisfied → step complete
    R-->>S: context note: step 1 complete (EntityEvent)
    S->>U: "Done — the contract and order were created. Want to see the order?"
```

**Failure modes and their guards:**

| Failure | Guard |
|---|---|
| The agent describes UI that is not there | It may cite only `TourGetVisibleAnchors` results; `TourHighlight` fails loudly |
| The agent drifts from the pathway | The runtime owns the cursor; `TourGoToStep` accepts authored edges only |
| The user wanders off | Registry and navigation events; answer, offer a way back, persist the run |
| The anchor is missing | Wait, prepare, diagnose (permission, empty data, collapsed panel), fall back to centered, log |
| The user already knows | `SkipWhen`, `TourMarkKnown`, an "I know this" button |
| Do-mode safety and consent | Explicit per-mutation confirmation on `TourPerformStep`; deletes, financial posting, permission grants, and outbound messages hard-banned |
| Cost and latency | Visual director by default; agent guidance opt-in; "Ask about this step" opens a cheap chat already loaded with the tour context |
| `NativeOnly` agents | Guided Tour agents must run in hybrid mode (`NativeOnly: false`) so conversation skills and client tools remain active; closing that core gap is separate follow-up work |

---

## 11. Launching, suggesting and throttling

**The default is to offer, not to auto-launch.** Entry points, ordered by how intentional they are:

1. A Tours and Help launcher in the shell header.
2. Sage ("how do I…" plus **Show me**).
3. The omnibar (`OmnibarToursProvider`).
4. `mj-empty-state` actions ("Take the 2-minute tour").
5. First-visit beacons.
6. Notifications ("What's new in Sales 6.22" after an Open App upgrade).
7. Capped auto-launch for genuinely critical flows.

**Eligibility pipeline.** The `BaseTourEligibilityPolicy` chain runs client-side over cached data, with no server call per navigation:
1. Active and not overridden off.
2. App installed and accessible.
3. Audience matches.
4. Prerequisites met.
5. Permissions allow it.
6. Not completed, dismissed or snoozed.
7. A trigger matched.
8. The interruption budget allows it.

Server predicates are batched and cached behind one Remote Operation.

**Interruption budget:**
- Instance defaults: at most one unrequested offer per session and per day. Tag-group caps, priority for collisions, and a critical-bypass flag.
- Never while a form is dirty, a dialog is open, the user is typing, a realtime session is live, or within a few seconds of load.

**Struggle signals** (a `Struggle` trigger plugin) produce a quiet offer from the Sage orb, never a modal, using only high-signal indicators (avoiding noisy idle or navigation-flip heuristics):
- repeated validation failures on Save
- "how do I" omnibar searches

Tours are kept to five steps or fewer; longer journeys become learning paths.

---

## 12. Authoring and shipping

- **Source of truth.** `metadata/tours/` in each repo: one JSON per tour, `@file:` Markdown per step body, `@lookup` for applications, entities and step types. Step types are seeded in `metadata/tour-step-types/`. A tour lives in the same pull request as the screen it tours.
- **Shipping.** Feature PRs carry JSON only. Tours reach hosts in the release `Metadata_Sync` migration like every other metadata record (`guides/RELEASE_METADATA_MIGRATIONS_GUIDE.md`), so no new machinery is needed. When an `Active` tour is saved or synced with changed steps or paths, server entity logic automatically snapshots the new immutable `TourVersion` and updates `CurrentVersionID`.
- **Host customization** goes through `MJ: Tour Overrides` only.
- **What's new.** When an Open App's installed version changes (`MJ: Open Apps`), tours tagged with that version become eligible as "What's new" offers.
- **Tour Studio** (new Explorer app, `packages/Angular/Explorer/dashboards/src/TourStudio/`, plus `metadata/applications/.tour-studio-application.json`), built on Explorer chrome conventions (`plans/explorer-chrome-conventions.md` — `<mj-page-layout>`, `<mj-page-header>` `[toolbar]` with `<mj-page-search>` + `<mj-filter-popover>`, `<mj-page-body>`, and `SetAgentContext`/`SetAgentClientTools`):
  - a tour list with health and funnel numbers
  - a step editor generated from each step type's `ConfigSchema`
  - a pathway graph editor (reusing `ng-flow-editor` / `ng-task-graph-editor`)
  - a **pick element** mode that proposes the most stable anchor (registered, then semantic, then role) and warns before saving a CSS fallback; it builds on the component-feedback-panel picker and the Recorder director
  - preview as a role or a specific user
  - overrides and learning-path assignment
  - authenticated-host toggle (`RunInAuthenticatedHosts`) and many-to-many surface assignment (`MJ: Tour Surface Tours`), with a warning when a tour needs a capability a surface's host lacks
  - publish, which creates a `TourVersion`
- **AI-assisted authoring:**
  - "Draft a tour for this screen": an agent reads form sections, fields, descriptions, nav item, registered anchors and permissions.
  - "Record and narrate": the Recorder director captures the clicks; the agent writes the copy.
  - Headless authoring for coding agents through MCP / CLI.

  AI always produces drafts, and a person publishes.

---

## 13. Tour health

1. **Static gate.** A new `tour-anchors` check in `@memberjunction/standards` (`packages/Standards/src/checks/tour-anchors.ts`) runs via `mj standards check --check tour-anchors` and is adopted in each repo's `.mj-standards.json`. To support cross-repo validation without scanning MJ Explorer's source tree, `@memberjunction/ng-tours` exports a compiled **core anchor manifest JSON** (`core.shell.*` and core form anchors). It checks that:
   - every registered key a tour references is declared by a mounted template in the repo or in the imported `@memberjunction/ng-tours` core anchor manifest
   - every semantic anchor names a real entity and field in generated metadata, while permitting `{{Context...}}` template variables (e.g. `{{Context.Record.EntityName}}`)
   - every step type, check, trigger and resolver key is registered
   - CSS fallbacks are flagged

   The Sales selector gate (`assert-harness-selectors.mjs`) is the starting point for the "mounted template" analysis.
2. **Replay.** The `Verify` director walks each tour headless: it resolves every anchor, runs every `Prepare`, and follows the default path. It runs under the Testing Framework as a Playwright-backed test type, so tours become smoke tests. Sales' `20-demo-tour.spec.ts` is already a tour written as a spec.
3. **CodeGen diff.** When a regenerated form drops or renames a field or section, tours anchored to it are flagged.
4. **Runtime telemetry.** `AnchorResolution` and misses are recorded per step. Crossing a threshold pauses that tour's unrequested offers and notifies its owner. There is no silent self-healing, because it hides breakage.
5. **External surfaces.** The static gate cannot scan a page MJ does not build, so web surfaces rely on two things: the Verify director run against a URL (`mj tours verify --surface <key> --url <url>`), and runtime telemetry.

---

## 14. Analytics

The primary metric is the goal, not completion. Tour Studio's dashboard uses standard MJ queries over Tour Runs and Run Steps joined to domain data:
- **Funnel per tour:** offered, started, each step, completed, and the step where people leave.
- **Goal conversion within N days:** completers against non-starters against a **holdout** (per-tour %, `IsHoldout` on the run).
- **Guide-mode comparison:** visual against chat against voice, on completion, time and goal rate.
- **Question themes** from agent-guided runs, clustered, which surface content gaps.
- **Anchor health** per step and per release.

---

## 15. Accessibility, Light DOM isolation and localization

- **Light DOM isolation (`@layer` + `mjt-`).** All tour UI renders in Light DOM using `@layer mj-tours-defaults` (`TourGlobalStylesComponent`) and the `mjt-` CSS prefix so Font Awesome, `mjButton`, CDK overlays, and host `--mj-*` themes work without Shadow DOM ARIA boundaries.
- **Modal vs non-modal.** `Spotlight` and `Modal` steps are modal: apply `inert` only to sibling subtrees outside the overlay and spotlighted target subtree (never an ancestor of the spotlighted target, keeping it in the accessibility tree). `Action` and `Beacon` steps are non-modal, with F6 to move between tour and page (Firefox Feature Callout precedent).
- **Cutout and popover sync.** SVG `evenodd` spotlight cutouts and Floating UI (`autoUpdate`) popover coordinates wait for `FormAnchorNavigator` rail-switch/expand/scroll settle and track layout shifts via `ResizeObserver` so popovers never detach or cover the focused element (WCAG 2.4.11).
- Focus moves into each step and is restored on close. Esc dismisses. Arrow keys are opt-in and never captured in form fields.
- `aria-labelledby` and `aria-describedby` on the step. On action steps the target points at the instruction.
- Polite live region announces cross-screen `Prepare` navigation, "Step 3 of 5", and completion (WCAG 4.1.3). No timed auto-advance (2.2.1). Beacons stop within 5 s (2.2.2). `prefers-reduced-motion` is respected.
- Ring contrast is at least 3:1, targets at least 24 px, and steps reflow at 320 px.
- **Design tokens and z-index ladder.** Colours use `--mj-*` tokens only. Tokenize the undocumented high rungs above `--mj-z-dialog` (1200) in `packages/Angular/Generic/shared/src/lib/_tokens.scss` (`--mj-z-window`, `--mj-z-dialog-service`, `--mj-z-confirm-service`, `--mj-z-omnibar`, `--mj-z-toast`) and add two tour layers documented in `.claude/rules/design-tokens.md`:
  - `--mj-z-tour-popover`: non-modal `Action` / `Beacon` layer (below modals/dialogs)
  - `--mj-z-tour-modal`: modal `Spotlight` / `Modal` backdrop and card layer (above dialogs, below omnibar and toasts)
- Voice has text parity, and every voice command has a keyboard equivalent. Tested with NVDA, JAWS and VoiceOver, plus axe in DOM tests.
- **Localization.** MJ has no framework i18n yet. Step text is stored with a `Localizations` JSON keyed by locale, ready for it. Agent modes can deliver a tour in the user's language live.

---

## 16. Default tours: MJ core

Each tour has five steps or fewer and states its goal. Keys are namespaced. App names and nav items are the current MJ core applications (`metadata/applications/`).

### 16.1 Everyone

| Key | Tour | Audience | Steps (outline) | Goal |
|---|---|---|---|---|
| `core.welcome` | **Welcome to MemberJunction** (intro to MJ) | All users, offered on first sign-in | Modal welcome → Spotlight app switcher → Spotlight omnibar → Spotlight Sage → Choice "what next?" (records, data, chat) | User opens any app from the switcher |
| `core.home` | Make Home yours | All | Spotlight pins → Action "pin something" → Spotlight recents and favorites | A pin saved |
| `core.records` | Working with a record (contextual: any entity form) | All | Spotlight sections and rail → Spotlight toolbar (history, tags, add to list, favorite) → Spotlight comments → AskAgent "Ask AI about this record" | User opens record history or adds a comment |
| `core.data-explorer` | Find, filter and save a view | All (Data Explorer) | Action open an entity (`Prepare`: Data) → Action add a filter → Action save the view → Spotlight Queries | A user view saved |
| `core.lists` | Build and share a list | All (Lists) | Action create a list (`Prepare`: Lists) → Action add records → Spotlight share | A list with at least one record |
| `core.chat` | Working with Sage | All (Chat) | Spotlight composer → Action ask a question → Spotlight artifacts → Spotlight start a voice session | A conversation started |
| `core.dashboards` | Open and share a dashboard | All (Dashboards) | Spotlight categories (`Prepare`: Library) → Action open one → Spotlight share | A dashboard opened |
| `core.workflows-run` | Run a workflow | All (Workflows) | Action start a run (`Prepare`: Workflows) → Spotlight run status (`Prepare`: Runs) | A workflow run started |
| `core.settings` | Your settings, notifications and tours | All | Spotlight user menu → Spotlight theme → Spotlight notification preferences → Spotlight tour preferences | — (orientation) |

### 16.2 Administrators

| Key | Tour | App and nav items | Goal |
|---|---|---|---|
| `admin.overview` | The Admin console | Admin: Identity & Access, Data & Schema, Monitoring, Developer Tools | Each area visited |
| `admin.users-roles` | Add a user and assign roles | Permissions: User Access | A user with a role saved |
| `admin.resource-access` | Grant access and review the audit log | Permissions: Resource Access, Audit Log | A resource permission saved |
| `admin.ai-setup` | Connect an AI model | AI: Models, Configuration; Credentials | A model credential saved |
| `admin.credentials` | Manage credentials | Credentials: Credentials, Types, Audit Log | — |
| `admin.scheduling` | Schedule a job | Scheduling: Jobs, Activity | A scheduled job active |
| `admin.communication` | Set up a provider and a template | Communication: Providers, Templates | A template saved |
| `admin.integrations` | Connect an integration | Integrations: Integrations, Schedules | An integration configured |
| `admin.knowledge-hub` | Set up Knowledge Hub | Knowledge Hub: Configuration, Classify, Vectors | A content source configured |
| `admin.tours` | Manage tours | Tour Studio: overrides, learning paths, analytics | A learning path assigned to a role |

### 16.3 Builders

| Key | Tour | App | Goal |
|---|---|---|---|
| `builder.first-agent` | Build your first agent (voice-capable; AskAgent steps) | AI: Agents, Prompts | An agent saved and run once |
| `builder.workflow` | Build a workflow | Workflows | A workflow saved |
| `builder.form-studio` | Customize a form | Component Studio: Form Studio | A form contribution saved |
| `builder.predictive-studio` | Train a prediction | Predictive Studio: Studio, Models | A model trained |
| `builder.testing` | Write and run a test | Testing: Explorer, Runs | A test run completed |
| `builder.theme-studio` | Brand MJ | Theme Studio | A theme saved |
| `builder.tour-authoring` | Author a tour | Tour Studio (meta tour) | A draft tour saved |

### 16.4 Learning paths
- **MJ Essentials** (all users): `core.welcome`, `core.home`, `core.records`, `core.data-explorer`, `core.chat`.
- **MJ Administrator** (admin roles): `admin.overview`, `admin.users-roles`, `admin.resource-access`, `admin.ai-setup`, `admin.scheduling`, `admin.communication`, `admin.tours`.
- **MJ Builder**: `builder.first-agent`, `builder.workflow`, `builder.form-studio`, `builder.testing`, `builder.tour-authoring`.

Every core tour adds the anchors it needs to core components in the same PR, starting with the shell chrome.

---

## 17. Downstream tours: Open Apps and More Cheese

Each repo gets its own PR, after phase 2 ships in an MJ release. Each PR:
1. adds `mjTourAnchor` keys and `TourSignals` to its key screens
2. adopts the `tour-anchors` standard in `.mj-standards.json`
3. adds `metadata/tours/` (and optionally `metadata/tour-step-types/` plus classes)
4. ships everything in its next release seed

Cross-app tours live in the top-most app of their dependency chain. Consumer blindness forbids Common from naming its consumers.

Public-facing pages are hosts too (§4.2). Candidate- and respondent-facing pages, such as Caliber's session widget and Forms' respondent widget, can carry tours through a tour surface where that helps.

### 17.1 Open Apps

| Repo | Tours | Extension it showcases |
|---|---|---|
| bizapps-common | `common.person-360` (People: relationships, activities, contact methods); `common.organizations` | Semantic `FormSection` anchors on custom forms |
| bizapps-tasks | `tasks.my-work` (my tasks and approvals); `tasks.template` (admin: build a task template) | `EntityEvent` completion on task approval |
| bizapps-sales | `sales.first-deal` (pipeline → stage → priced lines → schedule; goal: a deal with lines saved); `sales.board` (drag between stages); `sales.close-won` (goal: deal in a won status; shows the contract and order it created); **`bizapps.quote-to-cash`**, the cross-app tour Sales → Contracts → Orders → Accounting, which requires those apps installed | `DealBoardColumn` anchor resolver; `BoardDrag` step type; `QuoteToCashTourDriver`; signals from the existing `After*` events |
| bizapps-orders | `orders.lifecycle` (draft → confirm → payment → bill, along the stage stepper); `orders.receivables` (aging, overdue); `orders.catalog` (admin: price a product); `orders.checkout-widget` (admin) | `OrderReachedStatus` completion check |
| bizapps-accounting | `accounting.company-setup` (admin, incl. CFO approver); `accounting.batch` (pick → preview → approve → dispatch); `accounting.fix-failed-batch` | `BatchFailed` trigger; `BatchDispatched` check; "setup complete" eligibility policy |
| bizapps-contracts | `contracts.templates` (templates and provisions); `contracts.renewals` (renewals and notice terms) | — |
| bizapps-caliber | `caliber.first-blueprint` (steps, routes, publish a rubric); `caliber.review` (review an assessment) | `PracticeConversation` step type (a short roleplay inside the tour); `StudioDomain` resolver |
| bizapps-ats | `ats.publish-job` (setup bar to publish); `ats.candidate-360` (read an interview, decide) | Chat director over the 360 |
| bizapps-forms | `forms.first-form` (Build → Design → Distribute); `forms.conditional-logic` | `FillSampleForm` step type |
| bizapps-marketing | `marketing.brand-setup` (first-run brand setup into the strategy assistant) | Evaluate wrapping the strategy-onboarding agent as a `BaseTourDirector` |
| bizapps-sonar | `sonar.first-model` (setup → factors → bands → publish) | `SidePanel` presenter for a long builder |
| committees, credentialing, fpna, issues, secure-messaging | One starter tour each, on the app's primary screen | Baseline adoption |

### 17.2 More Cheese (demo association, ICF)

These run on the More Cheese generated world: members, creameries, competitions, academy, advocacy, Predictive Studio renewal risk, Sonar engagement. They double as **demo scripts** and, through the Verify director, as demo smoke tests. More Cheese ships them in its release seed (it is an Open App), and its demo user is assigned the learning path.

| Key | Tour | Story |
|---|---|---|
| `icf.welcome` | Welcome to the ICF | The association at a glance: dashboards, members, what this demo shows |
| `icf.membership-manager` | A day as membership manager | Renewal-risk prediction → engagement score explanation → an at-risk member's 360 → outreach via Communication |
| `icf.world-cheese-cup` | Run the World Cheese Cup | Competition, entries, judging rounds, medals |
| `icf.academy` | Academy and certifications | Coursework, apprenticeships, credentials |
| `icf.advocacy` | Advocacy campaigns | Campaigns and legislative monitoring |
| `icf.ask-sage` | Ask Sage about the ICF (voice director showcase) | Sage narrates the association live, grounded in Knowledge Hub content and real data |
| `icf.website-visitor` | Explore the ICF (public website, script host) | A visitor tour on the More Cheese public site (`website/`), loaded with `mj-tours.js` and a guest surface key, with the realtime widget offered as a voice guide |

Learning path **ICF Staff Onboarding**: `icf.welcome`, `icf.membership-manager`, `icf.world-cheese-cup`, `icf.academy`. A branded `ICFWelcomePresenter` demonstrates the presenter extension point.

---

## 18. Implementation plan

```mermaid
flowchart LR
    P0["Phase 0<br/>Anchors"] -->|"Gate: Sales + one core app anchored; gate in CI"| P1["Phase 1<br/>Visual tours on host contracts"]
    P1 -->|"Gate: 3 core tours pass a11y; same tours replay in a non-Explorer Angular harness"| P2["Phase 2<br/>Smart offering + Tour Studio"]
    P2 -->|"Gate: funnel and goal lift measured"| P3["Phase 3<br/>Two-stage element, script, surfaces"]
    P3 -->|"Gate: one tour JSON replays in Explorer, an Angular app, the element and a plain page"| P4["Phase 4<br/>Chat guide"]
    P4 -->|"Gate: chat-guided goal rate ≥ visual"| P5["Phase 5<br/>Voice + Do mode"]
    P2 --> P6["Phase 6<br/>Open Apps + More Cheese tours"]
    P3 --> P6
```

No durations are given here; sizing follows review of this plan. Host independence is built in from phase 0, not retrofitted in phase 3. Phase 3 adds packaging and public surfaces on top of contracts that already exist.

### Phase 0 — Anchors (runtime + Angular directive + CI gate)
1. **Extract `GraphTraversalEngine`** from `@memberjunction/ai-core-plus` (`packages/AI/CorePlus/src/task-graph/graph-traversal-engine.ts`) to `@memberjunction/global` (`packages/MJGlobal`, zero dependencies), updating internal MJ consumers directly so `tours-runtime` never pulls `core-entities`.
2. **`@memberjunction/tours-runtime`** (`packages/Tours/Runtime`, `"mjUILayer": "runtime"`): `ITourAnchor` types, `BaseTourAnchorResolver` (logic), `ITourHost` / `ITourDefinitionSource` / `ITourProgressStore` / capability contracts, and anchor-key/namespace conventions.
3. **`@memberjunction/ng-tours` Stage-0/Anchor foundation** (`packages/Angular/Generic/tours`, `"mjUILayer": "widgets"`):
   - `AnchorRegistry` with register/unregister events, `WaitFor(key, timeoutMs)`, `RegisterAnchor(key, element)`, and the `data-mj-tour-anchor` `MutationObserver` scanner
   - `MJTourAnchorDirective` (`[mjTourAnchor]`), which sets `data-mj-tour-anchor` and registers eagerly
   - DOM halves of semantic resolvers (`FormField`, `FormSection`, `FormRailGroup`, `FormToolbarAction`, `NavItem`, `RailPage`, `AppSwitcher`, `GridColumn`, `Omnibar`, `ChatComposer`, `Role`, `Selector`)
   - Compiled **core anchor manifest JSON** (`core.shell.*` and core form anchors) exported by `@memberjunction/ng-tours` for downstream `tour-anchors` checks
4. **Extract `FormAnchorNavigator`** from `RecordFormContainerComponent.OnNavigateToCommentAnchor` (`base-forms/src/lib/container/record-form-container.component.ts`), adding `data-rail-key` where needed. Comments and tours share "switch rail, expand section, scroll, pulse" plus a settled promise for cutout/popover alignment.
5. **Shell anchors.** Add anchors to the app switcher (`explorer-core/.../header/app-switcher.component.ts`), omnibar toggle, chat overlay, notifications, user menu, tab strip and Home.
6. **Stable nav-item keys.** Add an optional `Key` to `NavItem` (`base-application/src/lib/interfaces/nav-item.interface.ts`). Resolve `NavItem` anchors by `Key`, then by `DriverClass`, never by `Label`.
7. **`NavigationService.ResourceLoaded$`.** Emit it from the tab container when `LoadCompleteEvent` fires (`explorer-core/.../tabs/tab-container.component.ts`).
8. **`tour-anchors` standard.** `packages/Standards/src/checks/tour-anchors.ts`, with fixtures, adopted in `.mj-standards.json`. Recognizes both `[mjTourAnchor]` and `data-mj-tour-anchor`, loads the core anchor manifest for downstream repos, and allows `{{Context...}}` template expressions.
9. **Design tokens.** Tokenize the high z-index rungs above `--mj-z-dialog` in `packages/Angular/Generic/shared/src/lib/_tokens.scss` and add `--mj-z-tour-popover` and `--mj-z-tour-modal`, documenting both in `.claude/rules/design-tokens.md`.

### Phase 1 — Visual tours on the host contracts, and agents can start them
1. **Migration.** `migrations/v6/V<YYYYMMDDHHMM>__v6.<minor>.x__Guided_Tours.sql` creates the 14 tables in §6 (including `TourSurfaceTour` and `Tour.RunInAuthenticatedHosts`, sketch in §19), followed by the appended CodeGen output.
2. **JSONType interfaces** in `metadata/entities/JSONType-interfaces/`: `ITourAnchor`, `ITourCompletion`, `ITourGoal`, `ITourStartLocation`, `ITourStepPrepare`, `ITourLaunchPolicy`, `ITourVersionDefinition`, plus one config interface per standard step type (9 primitives).
3. **CodeGen** after `mj sync push` of the JSONType definitions.
4. **`TourEngine`** (`packages/MJCoreEntities/src/engines/tours.ts`) on the `InteractiveFormsEngine` model, implementing `ITourDefinitionSource` and `ITourProgressStore`, and always resolved via `TourEngine.GetProviderInstance(this.ProviderToUse, TourEngine)` in L2 widgets.
5. **Runtime (`@memberjunction/tours-runtime`):**
   - `TourSession`, `tour-graph-compiler.ts` (over `GraphTraversalEngine`), `Before*` / `After*` event-args classes, `TourSignals`
   - `BaseTourDriver` (`Default`), standard logic halves for the 9 step types (`Prepare`-based navigation, `Action` absorbing field entry and signals, `Modal` absorbing checkpoint recaps, `Choice` absorbing knowledge checks) and completion checks, and the `Visual` director
   - `InlineTourSource`, `MemoryProgressStore` and `TourAgentToolkit`
6. **`@memberjunction/ng-tours` UI layer (Light DOM, `@layer` + `mjt-`):**
   - `TourGlobalStylesComponent` (`@layer mj-tours-defaults`, `--mj-*` tokens, `mjButton`, Font Awesome)
   - SVG `evenodd` spotlight mask + sibling-subtree `inert` (leaving the target in the a11y tree)
   - `@floating-ui/dom` `autoUpdate` + `ResizeObserver` synced with `FormAnchorNavigator` settle
   - focus management, live region (`Prepare` navigation + step progress), keyboard (Esc, opt-in arrows, F6)
   - `BaseTourStepRenderer`, standard Light DOM renderers and `Overlay` presenter, `mj-tour-host` and `MJ_TOUR_HOST` token
   - DOM tests (`vitest.dom`) and axe checks
7. **Explorer:** `ExplorerTourHost`; mount `mj-tour-host` in the shell; header launcher; `OmnibarToursProvider`; the notification type `tour` in `user-notifications.component.ts`; the Home learning-path card.
8. **A second host from day one.** A minimal non-Explorer Angular harness (`packages/Tours/examples/angular-host`) uses `ng-tours` with its own `ITourHost`, catching Explorer coupling in phase 1 instead of phase 3.
9. **Server package (`@memberjunction/tours-server`, `packages/Tours/Server`):**
   - Remote Operations `Tours.RecordEvents` (batched) and `Tours.EvaluatePredicates`, plus `metadata/remote-operations/` rows
   - server entity subclasses: `TourVersion` immutability, auto-snapshotting `TourVersion` + updating `CurrentVersionID` whenever an `Active` tour's steps/paths change (on save or `mj sync push`), and step `Configuration` validation against `ConfigSchema`
   - `HasRecords`, `QueryReturnsRows`, and `AuthorizationHeld` predicates
10. **Agents can start tours:**
    - global tour client tools from `TourAgentToolkit`, attached by `ExplorerTourHost.AttachAgentBridge` (`explorer-app.component.ts` `registerClientTools`, plus `metadata/client-tool-definitions/` rows bound to Sage)
    - the `start:tour` UI command in `ui-commands.ts`
    - `AppContextSnapshot.ActiveTour` and `AvailableTours`
    - the Actions `Start Tour For User`, `Suggest Tours` and `Get Tour Progress`
11. **Seeds.** `metadata/tour-step-types/` (9 primitives) and the first core tours: `core.welcome`, `core.records`, `core.chat`.

### Phase 2 — Smart offering, Tour Studio, health
1. **Triggers.** `BaseTourTrigger`: `FirstVisit`, `EntityFormOpened`, `Signal`, `AppUpgraded`, `Schedule`, `AgentSuggested`.
2. **Eligibility.** `BaseTourEligibilityPolicy` chain and `InterruptionBudgetPolicy`, aware of dirty forms, open dialogs and live sessions.
3. **Prerequisites and paths.** Prerequisites, Learning Paths with checklist rendering, permission-derived prerequisites, and the `Assign Learning Path` Action.
4. **Overrides.** Tour Overrides merge in `TourEngine`.
5. **What's new.** Detect Open App version changes and offer tours tagged with that version.
6. **Tour Studio** app and dashboard (`packages/Angular/Explorer/dashboards/src/TourStudio/`, following `plans/explorer-chrome-conventions.md` with `<mj-page-layout>`, `<mj-page-header>` `[toolbar]` `<mj-page-search>`/`<mj-filter-popover>`, `<mj-page-body>`, and `SetAgentContext`/`SetAgentClientTools`):
   - step editor generated from `ConfigSchema`
   - graph editor
   - element picker and `Recorder` director
   - preview as a role or user
   - `RunInAuthenticatedHosts` toggle, surface assignment (`MJ: Tour Surface Tours`), capability warnings, and explicit publish
   - analytics and holdouts
7. **`Verify` director.** Testing Framework Playwright-backed test type. Add replay tests for core tours in `e2e/` and the Angular harness.
8. **Runtime health.** Anchor-health telemetry and auto-pause, plus CodeGen-diff flagging.
9. **Remaining 9-type renderers & presenters:** `Media`, `EmbeddedComponent`, `AskAgent` (plus `FieldState`/`WaitForSignal` configuration in `Action` and feedback modes in `Choice`), along with `SidePanel` and `Embedded` presenters.
10. **Content.** Remaining core tours (§16) and the three core learning paths.

### Phase 3 — Embedding: two-stage custom element, script tag, surfaces
1. **Shared embed-surface identity (`MJServer`):**
   - generalize `WidgetSessionService` + `widgetCore.ts` + `visitorIdentity.ts` (`packages/MJServer/src/realtimeWidget/`) into a shared embed-surface session service supporting both `MJ: Conversation Widget Instances` and `MJ: Tour Surfaces` (reusing `IsIsolatedGuestRole`, DPoP `cnf.jkt`, 12h cap, `ParseAllowedOrigins`, `HostIdentity`)
   - the "Tour Guest" role (zero entity CRUD)
   - scoped Remote Operations `Tours.GetSurfaceTours`, guest `Tours.RecordEvents` (deriving `SurfaceID` and `VisitorKey`/`mj_sid` strictly from verified JWT claims), and RV4 `Tours.ClaimGuestRuns` + RV5 `ForgetVisitor` run erasure
   - `MJ: Tour Surface Tours` M:N routing, allowed-origin checks and rate-limit enforcement
2. **Two-stage custom element & script bundle inside `@memberjunction/ng-tours` (`packages/Angular/Generic/tours/scripts/build-element.mjs`):**
   - **Stage-1 shell (`mj-tours.js`, ~10 KB gzipped vanilla IIFE, `FORBIDDEN_IN_SHELL` blocking Angular/RxJS/MJ):** `RegisterTourElements()` guarded `customElements.define('mj-tour-host', ...)`, `MountTours()`, `RegisterAnchor()`, `AnchorRegistry` (`MutationObserver`), and lightweight guest trigger evaluation
   - **Stage-2 session bundle (`mj-tours-session.js` + `chunks/`):** lazy-loaded via `import()` only when a tour starts or opens a beacon; `createApplication()`, Light DOM `TourGlobalStylesComponent`, CSP `csp-nonce`, `SurfaceTourSource` / `SurfaceProgressStore`, `WebTourHost`, and static inline mode
   - **Lazy chunks + size budget:** split `AskAgent`, `Media`, and `EmbeddedComponent` into separate lazy chunks so basic web tours stay lightweight, enforced by CI bundle-size and shell-isolation tests
3. **Capability checks.** `RequiredCapabilities` on every plugin, eligibility filtering, Tour Studio warnings, and surface assignment.
4. **Web start locations.** URL-pattern start locations and URL-pattern `FirstVisit` trigger for web hosts.
5. **Examples and docs:**
   - `packages/Tours/examples/web-host/`: blank HTML page, React snippet using `<script>` / `MountTours()`, and static mode
   - `<mj-tour-host>` custom-element demo in `packages/AngularElements/`
   - embedding chapter in `guides/GUIDED_TOURS_GUIDE.md` with CSP guidance
6. **External verify.** `mj tours verify --surface <key> --url <url>` for pages MJ does not build.

### Phase 4 — Chat guide
1. **Guided Tour skill.** Add to `metadata/ai-skills/` (`ActivationScope = 'Conversation'`) and activate when a chat-mode run starts.
2. **Session tools** in `TourAgentToolkit`: `TourGetState`, `TourGetVisibleAnchors`, `TourHighlight`, `TourGoToStep`, `TourPrepareStep`, `TourPerformStep`, `TourMarkKnown`, `TourSuggest`, plus step-type tools via `DescribeForAgent`. Enforce director-only rights in the runtime.
3. **Attach toolkit to `ng-conversations`** in any Angular host, not only Explorer's chat overlay.
4. **Grounding.** Step guide notes, metadata descriptions, Knowledge Hub and scoped search.
5. **How-do-I matching.** Entity-search index over tours, plus `start:tour` ("Show me") UI command.
6. **Unscripted tours.** Ephemeral tours composed from nav, rail and anchors, savable as drafts. Retire `BuildTourGuidanceClause` for scripted tours.
7. **AI drafting** in Tour Studio, and headless/MCP authoring.
8. **Hybrid agent mode.** Require `NativeOnly: false` on Guided Tour agents so skills and client tools stay enabled (§10.3).

### Phase 5 — Voice and Do mode
1. **Voice director** over a headless realtime Tour channel (`BaseRealtimeChannelClient` descriptor with `DisplayPolicy: 'headless'` and `ClientOnlyChannelServer`), forwarding completion events via `RequestSpokenResponse` and mirroring every spoken line as text.
2. **Voice on external surfaces** through `<mj-realtime-widget>` linked to the surface (`TourSurface.ConversationWidgetInstanceID`), sharing the embed guest JWT/visitor session and server-side client-tool validation (`bizapps-caliber` pattern).
3. **Do mode.** `TourPerformStep` through typed client tools and Actions, gated by `AllowAgentActions` + **per-mutation confirmation**, excluding hard-banned destructive action classes, and audited via Record Changes.
4. **Struggle trigger.** High-signal indicators only (repeated validation failures on Save and `"how do I"` omnibar searches), offered quietly through the Sage orb or linked widget.
5. **Holdout experiments** surfaced in analytics.
6. **Mobile host renderers** under the same ClassFactory keys (`packages/MobileApp`).

### Phase 6 — Downstream content (one PR per repo, after an MJ release ships phase 2; public pages after phase 3)
1. **Each Open App in §17.1:** anchors, signals, the `tour-anchors` standard, tours, and any custom step types, triggers or checks.
2. **More Cheese (§17.2):**
   - the in-app tours, the ICF learning path and `ICFWelcomePresenter`
   - the public-website visitor tour through a tour surface
   - Verify replay as a demo smoke test

---

## 19. Migration and data

The DDL follows `migrations/CLAUDE.md`:
- plain DDL, no existence guards
- no `__mj_CreatedAt` / `__mj_UpdatedAt` columns and no FK indexes (CodeGen adds both)
- `sp_addextendedproperty` on every column
- 50 blank lines, then the appended CodeGen output, with no literal `Sequence` on `EntityField` inserts

PostgreSQL comes from the release-time converter. The sketch below shows four key tables and abbreviates the descriptions:

```sql
CREATE TABLE ${flyway:defaultSchema}.TourStepType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DriverClass NVARCHAR(255) NOT NULL,
    RendererClass NVARCHAR(255) NULL,
    ConfigSchema NVARCHAR(MAX) NULL,
    SupportedModes NVARCHAR(100) NOT NULL DEFAULT 'Show,Guide',
    IsAgentCapable BIT NOT NULL DEFAULT 1,
    Icon NVARCHAR(100) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_TourStepType PRIMARY KEY (ID),
    CONSTRAINT UQ_TourStepType_Name UNIQUE (Name),
    CONSTRAINT CK_TourStepType_Status CHECK (Status IN ('Active', 'Deprecated', 'Disabled'))
);

CREATE TABLE ${flyway:defaultSchema}.Tour (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    TourKey NVARCHAR(150) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    ApplicationID UNIQUEIDENTIFIER NULL,
    RunInAuthenticatedHosts BIT NOT NULL DEFAULT 1,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    CurrentVersionID UNIQUEIDENTIFIER NULL,
    EstimatedMinutes INT NULL,
    AudienceFilter NVARCHAR(MAX) NULL,
    LaunchPolicy NVARCHAR(MAX) NULL,
    Priority INT NOT NULL DEFAULT 100,
    ThrottleTags NVARCHAR(500) NULL,
    DefaultGuideMode NVARCHAR(20) NOT NULL DEFAULT 'Visual',
    AllowAgentActions BIT NOT NULL DEFAULT 0,
    GuideAgentID UNIQUEIDENTIFIER NULL,
    DriverClass NVARCHAR(255) NULL,
    PresenterClass NVARCHAR(255) NULL,
    Goal NVARCHAR(MAX) NULL,
    StartLocation NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Tour PRIMARY KEY (ID),
    CONSTRAINT UQ_Tour_TourKey UNIQUE (TourKey),
    CONSTRAINT FK_Tour_Application FOREIGN KEY (ApplicationID) REFERENCES ${flyway:defaultSchema}.Application(ID),
    CONSTRAINT FK_Tour_GuideAgent FOREIGN KEY (GuideAgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT CK_Tour_Status CHECK (Status IN ('Draft', 'Active', 'Retired')),
    CONSTRAINT CK_Tour_DefaultGuideMode CHECK (DefaultGuideMode IN ('Visual', 'Chat', 'Voice', 'User Choice'))
);
-- CurrentVersionID's FK to TourVersion is added after TourVersion is created (circular reference).

CREATE TABLE ${flyway:defaultSchema}.TourSurfaceTour (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SurfaceID UNIQUEIDENTIFIER NOT NULL,
    TourID UNIQUEIDENTIFIER NOT NULL,
    IsDefault BIT NOT NULL DEFAULT 0,
    Sequence INT NOT NULL DEFAULT 0,
    StartLocationOverride NVARCHAR(MAX) NULL,
    CONSTRAINT PK_TourSurfaceTour PRIMARY KEY (ID),
    CONSTRAINT UQ_TourSurfaceTour_Surface_Tour UNIQUE (SurfaceID, TourID),
    CONSTRAINT FK_TourSurfaceTour_Surface FOREIGN KEY (SurfaceID) REFERENCES ${flyway:defaultSchema}.TourSurface(ID),
    CONSTRAINT FK_TourSurfaceTour_Tour FOREIGN KEY (TourID) REFERENCES ${flyway:defaultSchema}.Tour(ID)
);

CREATE TABLE ${flyway:defaultSchema}.TourRun (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    UserID UNIQUEIDENTIFIER NULL,
    VisitorKey NVARCHAR(100) NULL,
    SurfaceID UNIQUEIDENTIFIER NULL,
    TourID UNIQUEIDENTIFIER NOT NULL,
    TourVersionID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'In Progress',
    GuideMode NVARCHAR(20) NOT NULL DEFAULT 'Visual',
    DirectorType NVARCHAR(100) NOT NULL DEFAULT 'Visual',
    CurrentStepKey NVARCHAR(100) NULL,
    PathTaken NVARCHAR(MAX) NULL,
    LaunchSource NVARCHAR(30) NOT NULL,
    LaunchedByAgentRunID UNIQUEIDENTIFIER NULL,
    StartedAt DATETIMEOFFSET NULL,
    CompletedAt DATETIMEOFFSET NULL,
    GoalMetAt DATETIMEOFFSET NULL,
    SnoozedUntil DATETIMEOFFSET NULL,
    ConversationID UNIQUEIDENTIFIER NULL,
    AgentSessionID UNIQUEIDENTIFIER NULL,
    IsHoldout BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_TourRun PRIMARY KEY (ID),
    CONSTRAINT FK_TourRun_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_TourRun_Surface FOREIGN KEY (SurfaceID) REFERENCES ${flyway:defaultSchema}.TourSurface(ID),
    CONSTRAINT CK_TourRun_Principal CHECK (UserID IS NOT NULL OR VisitorKey IS NOT NULL),
    CONSTRAINT FK_TourRun_Tour FOREIGN KEY (TourID) REFERENCES ${flyway:defaultSchema}.Tour(ID),
    CONSTRAINT FK_TourRun_TourVersion FOREIGN KEY (TourVersionID) REFERENCES ${flyway:defaultSchema}.TourVersion(ID),
    CONSTRAINT CK_TourRun_Status CHECK (Status IN ('Pending', 'In Progress', 'Completed', 'Dismissed', 'Snoozed', 'Abandoned', 'Failed')),
    CONSTRAINT CK_TourRun_LaunchSource CHECK (LaunchSource IN ('Launcher', 'Omnibar', 'Agent', 'Trigger', 'Notification', 'Link', 'Learning Path'))
);
-- TourSurface is created before TourSurfaceTour and TourRun. Remaining tables (TourSurface, TourVersion, TourStep,
-- TourStepPath, TourPrerequisite, TourTrigger, LearningPath, LearningPathTour, TourRunStep, TourOverride) follow §6.
```

- **Row-level security & guest scoping:** Tour Runs and Run Steps are readable by their user. Guest runs are reachable only through scoped surface Remote Operations (`Tours.GetSurfaceTours`, `Tours.RecordEvents`, `Tours.ClaimGuestRuns`) running under `Tour Guest`; `Tours.RecordEvents` derives `SurfaceID` and `VisitorKey` (falling back to `mj_sid`) strictly from verified JWT claims. Aggregates go to an admin role through a dedicated permission or query.
- **Metadata seeds**, not SQL INSERTs: `metadata/tour-step-types/`, `metadata/tours/`, `metadata/learning-paths/`, `metadata/client-tool-definitions/` (the new tools), `metadata/ai-skills/` (Guided Tour), `metadata/remote-operations/`, `metadata/actions/`, `metadata/notifications/` (tour type), `metadata/applications/.tour-studio-application.json`, `metadata/instance-configurations/` (`Tours.*`). Every record has a `primaryKey` from `uuidgen` and no `sync` block. New directories go in `metadata/.mj-sync.json` `directoryOrder` after what they look up: step types before tours, tours before learning paths.
- **Ordering:** run `mj sync push` before `mj codegen`, because CodeGen reads JSONType definitions from the database. The PR carries the JSON; the release seed carries the rows.

---

## 20. Risks, resolved decisions and open questions

**Risks**
- **Anchor coverage lags.** Tours are only as good as their anchors. *Mitigation:* phase 0 first, the `tour-anchors` gate in CI (with exported core anchor manifest), and semantic anchors cover generated forms for free.
- **Tour fatigue.** *Mitigation:* offer first, the interruption budget, five-step cap, low-noise struggle signals, measurement against holdouts.
- **Agent drift or invented UI.** *Mitigation:* the runtime owns the cursor; agents cite only registry anchors; highlights fail loudly; agent evals in the Testing Framework.
- **Performance and bundle weight on public pages.** *Mitigation:* eligibility runs over cached data with no polling; Stage-1 shell (`mj-tours.js`) is ~10 KB vanilla JS with Angular/RxJS/MJ forbidden (`FORBIDDEN_IN_SHELL` test); Stage-2 Angular UI loads only on tour launch/beacon, with `AskAgent`/`Media`/`EmbeddedComponent` split into lazy chunks under CI size budgets.
- **Modal backdrop & focus traps hiding targets.** *Mitigation:* sibling-subtree `inert` keeps spotlighted targets interactive/accessible; `FormAnchorNavigator` settle + `ResizeObserver` + `autoUpdate` prevent detached popovers.
- **Plugin sprawl.** *Mitigation:* step-type registry in metadata with `Status`; `tour-anchors` gate reports unknown keys; Tour Studio shows plugin provenance.
- **Guest abuse on public surfaces.** *Mitigation:* allowed origins, rate limits, JWT-claimed `SurfaceID`/`VisitorKey` enforcement in Remote Operations, and a `Tour Guest` role with zero entity CRUD.

**Resolved design decisions (post-review)**
- **Naming & placement:** `Tour` in schema/API naming, presented as **"Tours & Help"** in Explorer UI; tables live in core `__mj` (`MJ: Tour*`).
- **Two-stage Light DOM embed (`ng-tours`), no `tours-dom` or `packages/Web/Tours`:** `@memberjunction/tours-runtime` stays strictly DOM-free (`runtime`), while `@memberjunction/ng-tours` (`widgets`) owns the single Angular Light DOM renderer set + two-stage `@angular/elements` / `mj-tours.js` build (mirroring `ng-realtime-widget`), removing Shadow DOM boundaries.
- **`GraphTraversalEngine` extraction:** move zero-dependency `GraphTraversalEngine` from `AI/CorePlus` to `@memberjunction/global`, eliminating any `core-entities` transitive dependency from `tours-runtime`.
- **9 step primitives:** fold `Navigate` → `Prepare` + live announcement, `FieldEntry` + `WaitForSignal` → `Action`, `Checkpoint` → `Modal`, and `KnowledgeCheck` → `Choice`.
- **Surface assignment:** M:N `MJ: Tour Surface Tours` + `Tour.RunInAuthenticatedHosts`, replacing single `Tour.SurfaceID`.
- **Guest sessions:** generalize `WidgetSessionService` + `visitorIdentity.ts` into a shared embed-surface session service; add `mj_sid` fallback, RV4 `Tours.ClaimGuestRuns`, and RV5 `ForgetVisitor` erasure.
- **Agent modes:** Guided Tour agents run in hybrid mode (`NativeOnly: false`); Voice director uses a headless `BaseRealtimeChannelClient` descriptor (`DisplayPolicy: 'headless'`, `ClientOnlyChannelServer`); Do mode enforces **per-mutation confirmation** and hard-bans deletes, financial posting, permission grants, and outbound messages.
- **Z-index ladder:** tokenize high rungs above `--mj-z-dialog` in `_tokens.scss` and split `--mj-z-tour-popover` vs `--mj-z-tour-modal`.
- **Practice sandbox:** deferred out of scope for this initiative.

**Remaining operational open questions**
- [ ] Retention policies: archive/purge window for `TourRunStep` telemetry and agent-guided tour transcripts.
- [ ] Localization rollout: validate `Localizations` JSON schema timing alongside MJ framework i18n.
- [ ] Cross-app namespace governance: designate collision reviewer for `<app>.<area>.<thing>` anchor and signal keys.
- [ ] Runtime interactive step components: evaluate allowing compiled Form-Contribution-style interactive components as dynamic step types after Phase 2.

---

## 21. Testing strategy

- **Unit (vitest)** in `@memberjunction/global` (`GraphTraversalEngine`) and `@memberjunction/tours-runtime` (Node environment, zero DOM, zero `core-entities`): session state machine, graph compiler (branches, optional steps, exclusive groups, skip cascade), condition evaluation, completion checks, eligibility chain and interruption budget, director-only enforcement, Do-mode confirmation & ban guard, version pinning, `Before*` cancelation.
- **DOM & two-stage element tests** (`vitest.dom` + Vite build tests) in `@memberjunction/ng-tours`: directive and `AnchorRegistry` register/unregister/`WaitFor`, `FormAnchorNavigator` settle sync, sibling `inert` + focus restoration, keyboard (Esc, F6), live region, reduced motion, axe checks, `FORBIDDEN_IN_SHELL` import isolation check, and Stage-1/Stage-2 bundle-size budget checks.
- **Standards check fixtures** for `tour-anchors`: missing key, core manifest `core.shell.*` key acceptance in downstream fixture, `{{Context...}}` template acceptance, unknown step type, selector fallback, semantic anchor naming a non-existent field.
- **Integration tier:** a deterministic bundle, "IT — Guided Tours lifecycle". It starts a run, records events, completes it on an `EntityEvent` goal, verifies version auto-snapshotting and pinning, and verifies override precedence and guest run claiming (`Tours.ClaimGuestRuns`) through the client transport (`guides/INTEGRATION_TESTING_QUICKSTART.md`).
- **Replay:** `Verify` director tests for every shipped core tour in `e2e/`. Each Open App adds its own.
- **Host conformance:** the same tour JSON replays in Explorer, `packages/Tours/examples/angular-host`, `<mj-tour-host>`, and `packages/Tours/examples/web-host` (plain HTML).
- **Agent evals** (Testing Framework): guide cites only registry anchors, follows authored edges only, answers off-path questions and offers to return, and enforces per-mutation consent & banned actions in Do mode.
- **Accessibility audit** before phase 1's gate, with NVDA, JAWS and VoiceOver.

---

## 22. Files to modify or create

| File | Change |
|---|---|
| `packages/MJGlobal/src/generic/graph-traversal-engine.ts` (moved from `AI/CorePlus`) | Zero-dependency `GraphTraversalEngine` shared by Flow agents and `tours-runtime` |
| `packages/Tours/Runtime/**` (new) | `@memberjunction/tours-runtime`: session, compiler, base classes, 9 step logic plugins, events, signals, host/source/store contracts, agent toolkit |
| `packages/Angular/Generic/tours/**` (new) | `@memberjunction/ng-tours`: Light DOM renderers/presenters, `TourGlobalStylesComponent` (`@layer`), `AnchorRegistry`, `[mjTourAnchor]`, `mj-tour-host`, `MJ_TOUR_HOST`, `RegisterTourElements()`, two-stage `build-element.mjs` (`mj-tours.js` + `mj-tours-session.js`), `WebTourHost`, exported core anchor manifest JSON |
| `packages/Tours/examples/angular-host/**` (new) | Non-Explorer Angular reference host |
| `packages/Tours/examples/web-host/**` (new) | Plain HTML, React snippet, and static-mode embed examples |
| `packages/MJServer/src/realtimeWidget/WidgetSessionService.ts` + `visitorIdentity.ts` | Shared embed-surface guest-session minting, RV4 run claim, RV5 `ForgetVisitor` across widgets and tour surfaces |
| `packages/AngularElements/**` | `<mj-tour-host>` element demo |
| `packages/Tours/Server/**` (new) | `@memberjunction/tours-server`: Remote Operations (`RecordEvents`, `EvaluatePredicates`, `GetSurfaceTours`, `ClaimGuestRuns`), Actions, server predicates, entity server subclasses (auto-snapshot `TourVersion`, config validation) |
| `packages/MJCoreEntities/src/engines/tours.ts` (new) | `TourEngine` (`ITourDefinitionSource` / `ITourProgressStore`) |
| `packages/Angular/Generic/base-forms/src/lib/container/record-form-container.component.ts` (+ `FormAnchorNavigator`) | Extract `FormAnchorNavigator`; comments and tours both use it |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/**` | Mount `mj-tour-host`; header launcher; shell anchors |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/components/header/app-switcher.component.ts` | Anchors |
| `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts` | Emit `ResourceLoaded$` |
| `packages/Angular/Explorer/shared/src/lib/navigation.service.ts` | `ResourceLoaded$`; nav-item `Key` resolution |
| `packages/Angular/Explorer/base-application/src/lib/interfaces/nav-item.interface.ts` | Optional `Key` |
| `packages/Angular/Explorer/explorer-core/src/lib/omnibar/providers/omnibar-tours.provider.ts` (new) | Tours omnibar provider |
| `packages/Angular/Explorer/explorer-core/src/lib/user-notifications/user-notifications.component.ts` | Handle `tour` notifications |
| `packages/Angular/Explorer/explorer-app/src/lib/explorer-app.component.ts` | Global tour client tools; feed `ActiveTour` into the app context |
| `packages/Angular/Explorer/dashboards/src/Home/home-dashboard.component.ts` | Learning-path card |
| `packages/Angular/Explorer/dashboards/src/TourStudio/**` (new) | Tour Studio (`plans/explorer-chrome-conventions.md`) |
| `packages/AI/CorePlus/src/app-context.ts` | `ActiveTour`, `AvailableTours`, note formatting |
| `packages/AI/CorePlus/src/ui-commands.ts` | `start:tour` command |
| `packages/AI/Agents/src/realtime/realtime-tool-broker.ts` | Defer to the Guided Tour skill for scripted tours |
| `packages/Angular/Generic/conversations/src/lib/components/realtime/channels/tour-channel.ts` (new) | Headless Tour realtime channel (`DisplayPolicy: 'headless'`, `ClientOnlyChannelServer`) |
| `packages/Angular/Generic/shared/src/lib/_tokens.scss` + `.claude/rules/design-tokens.md` | Tokenize high z-index rungs; add `--mj-z-tour-popover` and `--mj-z-tour-modal` |
| `packages/Standards/src/checks/tour-anchors.ts` (new) + `.mj-standards.json` | Anchor gate (core manifest + `{{Context...}}` template support) |
| `migrations/v6/V<ts>__v6.<minor>.x__Guided_Tours.sql` (new) | Tables (`TourSurfaceTour`, `Tour.RunInAuthenticatedHosts`, etc.), plus CodeGen output |
| `metadata/entities/JSONType-interfaces/ITour*.ts` (new) | Typed JSON fields |
| `metadata/tour-step-types/`, `metadata/tours/`, `metadata/learning-paths/` (new) | Seeds (9 primitives) and core tours |
| `metadata/client-tool-definitions/`, `metadata/ai-skills/`, `metadata/remote-operations/`, `metadata/actions/`, `metadata/notifications/`, `metadata/instance-configurations/`, `metadata/applications/` | New rows |
| `metadata/.mj-sync.json` | `directoryOrder` entries |
| `guides/GUIDED_TOURS_GUIDE.md` (new) + `guides/README.md` | Authoring, embedding and extension guide |
| Each Open App repo and `more-cheese` (phase 6) | Anchors, signals, standards adoption, `metadata/tours/`, optional plugins |

---

## 23. References

- Companion design doc: <https://claude.ai/artifact/R2s29bJUkhy2iboGB2qmxQ>
- MJ guides: `guides/UI_LAYERING_GUIDE.md`, `guides/FILTER_BUILDER_AND_EVALUATION.md`, `guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md`, `guides/REALTIME_CO_AGENTS_GUIDE.md`, `guides/REALTIME_CHANNELS_GUIDE.md`, `guides/CHAT_EXTENSIBILITY_GUIDE.md`, `guides/RELEASE_METADATA_MIGRATIONS_GUIDE.md`, `guides/WORKFLOW_AND_TASK_GRAPH_GUIDE.md`, `guides/FORMS_ARCHITECTURE_GUIDE.md`
- Related plans: `plans/realtime-client-context-coagent/`, `plans/form-contributions.md`, `plans/task-graph-primitive.md`
- Research (vendor figures are directional):
  - [Chameleon 2024 benchmark](https://www.chameleon.io/benchmark-report-24) · [Chameleon on tour length and triggers](https://www.chameleon.io/blog/mastering-product-tours) · [Chameleon Smart Delay](https://www.chameleon.io/whats-new/notify-users-without-interrupting-them-with-smart-delay)
  - [Produktly 2026 onboarding benchmarks](https://produktly.com/research/saas-onboarding-benchmarks-2026)
  - [Khurana et al., CHI 2025](https://arxiv.org/html/2504.15549) · [Kelleher & Pausch, Stencils](https://profiles.wustl.edu/en/publications/stencils-based-tutorials-design-and-evaluation/) · [NN/g on tutorials](https://www.nngroup.com/articles/mobile-tutorials/)
  - [Whatfix auto-reselection](https://support.whatfix.com/docs/element-reselection-automation) · [Userflow Action Flows](https://help.userflow.com/docs/action-flows) · [Userflow Adoption Agent](https://www.userflow.com/adoption-agent)
  - [Pendo Novus](https://www.pendo.io/pendo-blog/introducing-novus/) · [Pendo guide throttling](https://www.pendo.io/pendo-blog/introducing-guide-throttling-ordering/)
  - [Appcues MCP](https://docs.appcues.com/integration-documents/appcues-mcp-server) · [Amplitude headless Guides & Surveys](https://amplitude.com/releases/headless-guides-and-surveys-manage-guides-and-surveys-from-the-developer-api-cli-and-mcp) · [Frigade Assist API](https://frigade.com/updates/assist-api)
  - [ngx-ui-tour](https://github.com/hakimio/ngx-ui-tour) · [Driver.js](https://github.com/kamranahmedse/driver.js) · [Shepherd.js](https://github.com/shipshapecode/shepherd) · [Usertour](https://github.com/usertour/usertour)
  - [WCAG 2.2 Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured) · [Firefox Feature Callout a11y](https://bugzilla.mozilla.org/show_bug.cgi?id=1781088)
