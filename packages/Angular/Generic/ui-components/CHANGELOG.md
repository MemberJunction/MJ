# @memberjunction/ng-ui-components

## 5.46.0

## 5.45.1

## 5.45.0

### Minor Changes

- 13716e4: Add the canonical confirm-prompt primitives to `@memberjunction/ng-ui-components` and migrate every native `window.confirm()` in MJ Explorer onto them.

  **`@memberjunction/ng-ui-components` (new capability):**
  - New **`<mj-confirm-dialog>`** — the canonical confirmation dialog (danger/warning/info/default variants, title + message + detail lines, MJ left-confirm button order, `Processing` state, Esc/backdrop dismissal inherited from `mj-dialog`).
  - New **`MJConfirmService`** — the imperative, Promise-based replacement for `window.confirm()`: `await confirm.Confirm('Discard changes?')` / `ConfirmDelete({ message, detail, confirmText })`. Mounts the dialog on `document.body`, resolves `true`/`false`, tears down on settle.
  - **Layering fix:** service-spawned dialogs are lifted into their own stacking context (z-index 20000) so a confirm launched over a drawer, slide-panel, or `mj-window` renders above that overlay instead of dimmed and unclickable beneath its backdrop (previously each swallowed click could re-trigger the caller and stack another dialog). Declarative template usage is unchanged.

  **Consumers — 47 native `confirm()` prompts migrated** across 23 files in 6 packages: dashboards (Credentials, MCP, Tags/Autotagging/Prompts, QueryBrowser, FormBuilder, ComponentStudio, DatabaseDesigner), core-entity-forms (Queries, Templates, Tests, Lists, template editor), artifacts (version restore), ai-test-harness (save/clear/delete/import), conversations (collection + artifact share modals, collection tree/view — whose ten native `alert()`s were also replaced with `MJNotificationService` toasts), and credentials (the credential/type/category edit-panel deletes, adding the package's missing `ng-ui-components` dependency). Deletes route through `ConfirmDelete` (red confirm, "Delete"/"Remove" labels); discards and overwrite warnings through `Confirm`. Handlers that gate on the answer were made async only after verifying every caller is fire-and-forget.

  The single intentional exception is DatabaseDesigner's `ModifyPanelCanClose` — a synchronous `[CanClose]` guard that must return a boolean immediately, documented as such in `MJConfirmService`'s docs.

  No public API changes in the consumer packages. Verified with per-package unit test runs (~2,200 tests across touched packages), full-page light+dark state screenshots of 8 distinct surfaces, and live end-to-end executions of the true paths.

- c1f2d3d: User Routines (P1.5): user-owned scheduled/monitoring routines that run an Agent, Action, or Prompt on a cron schedule. New UserRoutine/UserRoutineRecipient/UserRoutineRun schema; UserRoutineDispatcherDriver scheduled-job driver (1-minute sweep, claim-before-run, bounded concurrency, per-routine isolation, runs as the owner, Template-driven notifications with OnChange result-hash detection, RequestedSkillIDs pre-arming for Agent targets); pure UserRoutineProcessor schedule/notify primitives shared with MJUserRoutineEntityServer (NextRunAt on save, cron validation) and MJUserRoutineRecipientEntityServer (User-xor-Email); lazy non-startup UserRoutineEngine; new @memberjunction/ng-user-routines widget set (list/editor/history + command-center composite + slide-in, cancelable Before/After events, Agent-only creation with categorical ng-trees picker); conversations bottom-sidebar Routines section gated by ShowRoutines input AND entity-Read permission (hosted in both the generic workspace sidebar and Explorer's Chat wrapper); Routines Explorer app; pure cron preset/describe helpers now in @memberjunction/global (CronUtils); mj-tree gains a DefaultExpansion input ('first-level' | 'all' | 'none'); BaseScheduledJob gains IsHighFrequencyByDesign so by-design pollers (the routine dispatcher) opt out of the high-frequency cron warning; Agent-target routines run inside a dedicated per-routine Conversation (Application-scoped via the Routines app so it stays out of the default chat list; RunAgentInConversation writes proper user/assistant turns; standalone fallback when the app is absent); UserRoutine.ConversationID schema + open-conversation and open-execution-record event chains through the conversations hosts; server-side cascade delete (recipients + run bookkeeping) so routines that have run delete cleanly; agent picker is a compact mj-tree-dropdown (DefaultExpansion pass-through added); mj-slide-panel settles to transform:none when open so position:fixed descendants (dropdown panels) keep true viewport coordinates; time-relative sidebar/card/history text is snapshot-based (NG0100 fix); 16-test live integration suite + live Playwright E2E; Explorer notifications page rebuilt (day-grouped cards, sanitized HTML + Markdown message rendering with expand/collapse previews, snapshot relative times, removal of a test harness that created junk Conversations on Mark-All-Read) and the seeded routine notification template gains a compact Markdown Text body that the dispatcher now prefers for in-app delivery (the HTML document stays for email); new @memberjunction/ng-composer package extracts the conversations message composer (mention editor + dropdown + message input box) so the routine editor's InitialMessage field uses the mention editor without an ng-conversations dependency cycle — and the composer's mention/command triggers are PLUGGABLE: a generic ComposerTriggerProvider contract (TriggerChar/Key/Priority/GetSuggestions, generic MentionSuggestion with provider-supplied presets) with two supply modes (explicit [TriggerProviders] list, or ClassFactory discovery via @RegisterClass(ComposerTriggerProvider,'<key>') filtered by [ExcludedTriggerKeys]), leaving ng-composer with ZERO AI knowledge; the AI plugins moved to ng-conversations (composer-plugins: 'agent-mentions' '@' agents+users w/ configuration presets, 'record-mentions' '#' entities+queries, 'skill-commands' '/' skills — tree-shake-guarded by LoadComposerPlugins(); MentionAutocompleteService moved back to ng-conversations as a BaseSingleton engine shared by plugins and components) plus a new mj-ai-composer wrapped component that proxies the full mj-message-input-box surface with the AI triggers built in and familiar EnableAgentMentions/EnableEntityMentions/EnableSkillCommands convenience flags (the chat composer now uses it); the routine editor uses discovery mode with agent-mentions excluded.

## 5.44.0

### Minor Changes

- f8be8a0: Consolidate collapsible/disclosure UI onto the canonical `<mj-accordion-panel>` across MJ Explorer, and level up the accordion component itself.

  **`@memberjunction/ng-ui-components` (the component):**
  - New **`MJAccordionModule`** — bundles the panel + all three slot directives (`mjAccordionTitle`, `mjAccordionActions`, `mjAccordionBody`) so consumers import one symbol instead of four (works in both NgModule and standalone `imports`). An NgModule is used because AOT can't expand a value-array across a compiled-package boundary (NG1010) and an `as const` tuple is rejected by the `imports` type (TS2322).
  - New lazy **`[mjAccordionBody]`** slot — heavy bodies (code editors, grids, charts) instantiate on first expand and stay alive for animated re-toggle, so consumers don't have to reason about content weight or hand-write `@if (expanded)`.
  - Hardening: `--sm`/`--disabled`/`--muted-icon` modifiers scoped to child combinators (no nested-panel style bleed); `hasBeenExpanded` made non-public per naming conventions; added a DOM test proving the module exposes every declarable.

  **~50 disclosure surfaces migrated** from bespoke `<div (click)>`-header + `@if` markup to `<mj-accordion-panel>` across 20 Angular packages — dashboard-viewer config panels, DevTools Class Registry, Version History diff/snapshot groups, the test-run dialog, Explorer section toggles (about-dialog, sql-logging, SystemDiagnostics, App Roles, Home add-pin, Integration activity, Actions/Permissions/Credentials/Testing/ComponentStudio), and Generic components (agents, clustering, conversations, search, entity-viewer, filter-builder, record-tags, resource-permissions, core-entity-forms). Each replaces a non-focusable `<div (click)>` header with a real `<button [attr.aria-expanded]>` — a genuine accessibility improvement, not cosmetic — and deletes the per-consumer collapse chrome CSS. Card-based collapsibles, trees, and fill-panes are intentionally out of scope (they route to their own primitives).

  No public API changes in the consumer packages (internal refactor). Verified: all affected package test suites pass, CI UI gates green (design tokens + button overrides), and a full audit confirmed side-effects preserved with two visual regressions caught and fixed (SystemDiagnostics severity tint restored with semantic tokens; cluster-scatter members list scroll-confined via `[Fill]`).
  </content>

- 1e5e449: Add `<mj-alert>` — the canonical inline alert/banner component — and migrate the bespoke inline alerts across MJ Explorer onto it.

  **New component** (`@memberjunction/ng-ui-components`): `MJAlertComponent` is the standardized, persistent in-flow message box (info / success / warning / error) — distinct from the transient corner toast (`NotificationService`). Standalone, design-token-driven, dark-mode-safe.
  - Inputs: `Variant` (info/success/warning/error), `Size` (sm/md), `Title`, `Message`, `Icon` (per-variant default, overridable), `Dismissible` (+ `Dismissed` output), `Role` (auto ARIA `alert`/`status`).
  - An `[actions]` content slot for buttons, default `<ng-content>` for rich bodies, dynamic `[Variant]` for state-driven banners.
  - Backgrounds use an **opaque** status tint (`color-mix` into the surface) so an alert renders identically regardless of the backdrop behind it, plus a default bottom margin so it drops into flow content cleanly.

  **Migration**: replaced the hand-rolled alert `<div>`s (`.alert`, `*-banner`, `error-message`/`info-box`/etc.) across the entire dashboards package and explorer-settings, explorer-core, core-entity-forms, and the Generic packages (artifacts, list-management, entity-viewer, agents, conversations, testing, actions, base-forms, resource-permissions). Dead per-component box CSS removed; original top/horizontal margins preserved via positioning-only classes. A `check:alerts` CI gate measures adoption and prevents new hand-rolled alerts from regressing.

### Patch Changes

- 0476455: Migrate inline empty-state placeholders to the canonical `<mj-empty-state>` component across Explorer and Generic Angular packages (UI-consistency objective O4), wiring the component into the packages that needed it (and adding `@memberjunction/ng-ui-components` as a dependency where missing). Also fixes reset-filter CTA correctness in three picker dialogs (sub-agent selector, add-action, action gallery) where the handler cleared only a subset of the active filter dimensions, and refines the UI adoption measurement script with a transparent three-tier empty-state count (raw widened → non-placeholder false-positives → wrappers-around-migrated → genuine).

## 5.43.0

### Patch Changes

- 54183aa: Add the Angular DOM unit-testing foundation: a new `@memberjunction/ng-test-utils` package providing `renderComponentFixture` (standalone/leaf components) and `renderTemplate` (compound / module-declared components) helpers, the Vitest + jsdom DOM-testing harness, coverage reporting in the DOM preset, a `scaffold-tests.mjs --dom` flag (with a spaces-in-path fix), and DOM specs across `ng-ui-components`, `ng-pagination`, `ng-tabstrip`, and `ng-livekit-room`.

  `ng-livekit-room` is the headline pilot (now that PR #2860 is on `next`): DOM specs for the media-free leaf components (`control-bar`, `agent-state`, `connection-overlay`, `chat-panel`, `device-menu`) plus `participant-tile` as the §7 media-split worked example — the media-free surface is tested while `track.attach()` and the audio-meter `requestAnimationFrame` loop are left to live tests — on a dual node+dom preset that preserves the package's existing logic specs. The `LiveKitRoomComponent` injectable-controller refactor (the one production-code change) is deferred to the Phase 2 component rollout; the injected-fake-container pattern it would prove is already demonstrated via the `providers` seam.

  Also hardens the harness wiring flagged in review: correct `@memberjunction/ng-test-utils` devDependency declarations (`ng-tabstrip`, `ng-livekit-room`) and Turbo cache inputs covering `tsconfig.spec.json` + the root shared-harness files. Code-only, no schema changes.

## 5.42.0

### Patch Changes

- 313c1c5: Make Explorer's primary navigation perceivable to assistive tech and DOM/accessibility-tree agents (computer-use) — a dual accessibility + agent-usability win.
  - **New `mjClickable` directive** (`@memberjunction/ng-ui-components`): retrofits an existing clickable `<div>`/`<span>` into an accessible, keyboard-operable control without changing its tag or styling — adds `role` (button/link), `tabindex`, an `aria-label` accessible name, Enter/Space activation (dispatches a native click, so existing `(click)` handlers run for both mouse and keyboard), and an optional `data-testid` hook. Prefer a real `<button mjButton>`/`<a>` for new markup; use `mjClickable` to fix existing widgets cheaply.
  - **`mjButton` gains `[ariaLabel]`** (applied without clobbering a directly-authored `aria-label`) and a dev-mode warning when an icon-only button ends up with no accessible name.
  - **Adopted on the nav surfaces that were invisible to a DOM agent**: the Home dashboard app tiles (the reported "agent can't find the app to click" case), sidebar items (notifications/favorites/recents), and the header `app-nav` items + `app-switcher` (trigger gets `aria-expanded`/`aria-haspopup`, items/active get `aria-current`). Icon-only buttons on the Home dashboard get accessible names. Seeds a `data-testid` convention on these surfaces.

  Tests added for both directives (host bindings, keyboard activation, label clobber-safety, dev warnings).

## 5.41.0

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

### Minor Changes

- bd95e83: feat(explorer): concise-chrome filter model + mobile chrome overhaul

  Reworked MJ Explorer's shared page chrome for mobile and rolled out the
  "concise filter model" across every filter-bearing dashboard.

  **Concise filter model** — one Filter button holds all filters (popover on
  desktop, bottom sheet on mobile); search is persistent. Inline quick-filter
  chips and the applied-filter chip row are gone. The control bar reads
  `search · Filter · view` and lives in the header `[toolbar]` slot, right-aligned
  on desktop and left-aligned on mobile (where search grows to fill). Sections
  converted: Identity & Access, Lists, Testing, AI, Actions (Action Explorer
  folds Sort into the popover), Scheduling, Integration, Credentials, Version
  History, MCP, and Communication — with categorical/time-range chips folded
  into the single Filter popover.

  **Mobile chrome** — shared primitives now carry the mobile behaviors so pages
  get them for free: `mj-left-nav` off-canvas drawer, `mj-filter-popover` bottom
  sheet, icon-only action buttons and refresh, `mj-page-body` row→column reflow,
  and `mj-page-header`/`-interior` compaction. `mj-filter-panel` gains
  multi-select fields.

  **Shell fixes** — keep the header right-edge cluster (chat/nav-bar app icons +
  avatar) on one row at mobile widths instead of stacking, and anchor the mobile
  nav drawer's notification badge to the Notifications button instead of the
  drawer corner.

- 3b29882: feat: render any entity form as a tab, dialog, or slide-in (Generic, no regeneration)

  Adds a presentation-agnostic form stack to `@memberjunction/ng-base-forms`:
  - **`MjEntityFormHostComponent`** — headless host that resolves the form
    (generated / custom / interactive override + variants), loads the record,
    dynamically creates + binds the form, re-emits its events, and tears down.
    Extracted from Explorer's `SingleRecordComponent`, which is now a thin wrapper.
  - **`MjFormDialogComponent` / `MjFormSlideInComponent`** + **`MJFormPresenterService`**
    — declarative and imperative ways to open any entity form as a modal dialog or
    slide-in panel.
  - **`EntityFormConfig`** + presets — per-instance control over toolbar visibility,
    related-entity sections, section collapsibility, width, and in-form navigation.
    Applied via the form reference so existing generated forms honor it **without
    regeneration**.
  - **`FormResolverService`** moved from `ng-explorer-core` into `ng-base-forms`
    (it had no Explorer/Router coupling), making the interactive-form + variant
    pathway first-class on every surface.
  - **`MjSlidePanelComponent`** relocated from `ng-versions` into `ng-ui-components`
    as a first-class shared primitive; `ng-versions` and the other consumers
    (record-changes, record-tags, entity-viewer, dashboards, core-entity-forms) now
    import it from there.

  Phase-1 consumer migrations: the Query Categories create flow now uses
  `<mj-form-dialog>`, and editing the selected category uses `MJFormPresenterService`
  slide-in — replacing the bespoke `query-category-dialog`.

## 5.38.0

## 5.37.0

## 5.36.0

### Patch Changes

- 1c0fce9: Section 10 interior chrome pattern applied to every MJ Explorer left-rail shell (Admin × 4, AI Analytics, Knowledge Hub × 4, Testing Explorer, Database Designer, SQL Logging, Dev Tools inspectors, API Keys, App Roles). New shared primitives — `<mj-left-nav>` with optional tree support, two-row `<mj-page-header-interior>`, paired `<mj-page-body-interior>` — replace bespoke per-shell sidebar and chrome implementations across ~25 sub-pages. Chrome slot discipline audit standardizes tab-nav placement, `[meta]` badge content, and `[actions]` ordering across ~65 dashboards; two pre-existing bugs fixed along the way (nested `:has()` SyntaxError that silently hid the interior toolbar row, and an invisible page-header drop shadow).

## 5.35.0

### Patch Changes

- ee380f7: Consolidate MJ Explorer's page header chrome onto a shared component library: ~50 dashboards across 14 sections (AI, Knowledge Hub, Admin, Actions, Scheduling, Testing, MCP, Lists, Communication, Credentials, Version History, File Browser, Integrations, Archive) migrated to `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>` with design-token-driven styling, replacing ~200 lines of bespoke per-section CSS (including hardcoded brand gradients). Adds the shared chrome components used throughout the migration: `mj-stat-badge`, `mj-refresh-button`, `mj-page-search`, `mj-filter-popover`, `mj-filter-panel`, `mj-filter-field`, `mj-filter-chip`, `mj-tab-nav`, `mj-view-toggle`. Removes two redundant/unused exports from `@memberjunction/ng-ui-components`: `MJFilterToggleComponent` (zero template usages — replaced by `<mj-filter-popover>`) and `MJResultCountComponent` (merged into `<mj-stat-badge>` — pass the optional `[Total]` input for the "X of Y" rendering). External consumers using either removed export must migrate to the noted replacement. Conventions documented in `plans/explorer-chrome-conventions.md`.
- ac4b9a5: **Multi-tenant switching** (`@memberjunction/global`, `@memberjunction/ng-explorer-core`): Add `TenantChanged` event type to `MJEventType`. Add `clearCacheByPredicate()` on `ComponentCacheManager` for selective tenant-scoped cache clearing. Add `ClearComponentCache()` and `ReloadAllTabs()` on `TabContainerComponent` — destroys cached components and reloads the active tab immediately (inactive tabs reload lazily). Shell subscribes to `TenantChanged` with two-phase protocol: `TenantChanging` shows the loading screen, `TenantChanged` reloads tabs and hides it. Loading screen CSS made `position: fixed` with `z-index: 99999` to fully cover viewport during switches.

  **Open App fixes** (`@memberjunction/open-app-engine`): Make `mj app upgrade` idempotent when already at target version. Allow mixed-case schema names in Open App manifest validation.

  **CodeGen fix** (`@memberjunction/codegen-lib`): Emit `override` modifier on generated `Save()` method to satisfy strict TypeScript when entity subclasses override the base `Save()`.

  **AI Agents dashboard** (`@memberjunction/ng-dashboards`): Fix category filter not filtering results, make category filter extraction defensive, fix Reset Filters button. Rename Actions `ExecutionMonitoringComponent` to avoid name collision with dashboards package.

  **Scheduling** (`@memberjunction/server`): Warn loudly when a scheduled job is configured to run more often than every 5 minutes.

  **Palette** (`@memberjunction/ng-ui-components`): Add ARIA labels to icon-only buttons in dialogs and slides for accessibility compliance.

## 5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

## 5.33.0

## 5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

## 5.29.0

## 5.28.0

## 5.27.1

## 5.27.0

## 5.26.0

### Patch Changes

- 55de456: Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.

## 5.25.0

## 5.24.0

## 5.23.0

### Patch Changes

- 58af481: Remove all remaining Kendo references — fix 3 templates, clean 19 CSS files, remove @progress deps from MJExplorer
- fb0c69f: Phase 2.1: Complete Kendo UI removal — replace all @progress/kendo-\* dependencies with custom MJ components, AG Grid, and angular-split
