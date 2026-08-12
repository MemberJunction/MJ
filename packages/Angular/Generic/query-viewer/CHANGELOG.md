# @memberjunction/ng-query-viewer

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/ng-ui-components@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ng-base-types@6.1.0-edge.1
  - @memberjunction/ng-code-editor@6.1.0-edge.1
  - @memberjunction/ng-export-service@6.1.0-edge.1
  - @memberjunction/ng-markdown@6.1.0-edge.1
  - @memberjunction/ng-notifications@6.1.0-edge.1
  - @memberjunction/ng-pagination@6.1.0-edge.1
  - @memberjunction/ng-shared-generic@6.1.0-edge.1
  - @memberjunction/export-engine@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- b895f92: Angular DOM unit-testing — Phase 4 coverage push. Dev-only (test files + test-config/CI-gate scoping); no runtime change.

  Drives the Generic DOM-coverage ratchet (`scripts/dom-test-report.mjs … --max-none`) from **185 → 137** by writing DOM specs, in usage-ranked order, for every Generic Angular component appropriate for a DOM unit test. Highlights:
  - **Highest-leverage primitives** — `MjFormFieldComponent` (the field renderer behind ~4,000 usages) across its read/edit type matrix; the `ui-components` design system (`MJEmptyStateComponent`, the `mj-page-*` chrome family, `MJDropdown`/`MJCombobox`/`MJFilterPopover` via a new CDK-overlay test helper in `ng-test-utils`, the `mj-dialog` family, tabs, filter panel, left-nav).
  - **Form host stack** — `MjRecordFormContainer`, `MjFormToolbar`, `MjEntityFormHost`, `MjIsaRelatedPanel`, `FormPanelSlot`, `ExplorerEntityDataGrid`, `InteractiveForm`.
  - **Viewers, grids & dialogs** — `EntityDataGrid` + `QueryDataGrid` (AG-Grid chrome), `EntityViewer`, `ArtifactViewerPanel`, the ERD component family (`ERDComposite`/`MJEntityERD`/`ERDDiagram`), plus a broad set of panels/editors/dialogs across agents, artifacts, search, composer, list-management, scheduling, record-process-studio, user-routines, entity-action-ux, actions, and testing.
  - **`Angular/Bootstrap` onboarded** — the last untracked library tree gains a DOM test tier (`MJAuthShell`, `MJBootstrap`) and its own `--max-none=0` CI gate, so every shipped Angular library tree (Explorer, Generic, Bootstrap) is now gated.

  Reusable patterns established for the harder components: drive internal state before the first render (`setup`) rather than mutating post-render (unreliable under zoneless CD); stub the heavy core (AG-Grid, React bridge, SVG layout, plugin viewers) and spy async loaders so specs exercise the component's own chrome/wiring; add each component **and its injected services** to enumerated `tsconfig.spec.json` files (or AOT drops decorator metadata → NG0202).

  Deliberately **not** covered, and left at the 137 floor: five integration/e2e-tier orchestrators (`ConversationChatArea`, `MessageInput`, `RealtimeWhiteboardBoard`, `AITestHarness`, `RealtimeSessionOverlay`) — 1,800–4,600-line components with realtime/WebRTC/canvas cores or 14–30 dependencies, which belong in the browser regression suite rather than DOM units.

- b895f92: Angular DOM unit-testing — Phase 4 (gates, guardrails & spec hygiene). Dev-only; no runtime change.
  - **`test:types` spec type-check gate**: each DOM-testing package gains a
    `"test:types": "tsc --noEmit -p tsconfig.spec.json"` script, run as a cached turbo task in CI
    before the vitest suite (both the affected and full-suite paths). Closes the Phase-3 hole where
    vitest/esbuild's transpile-only path let real spec type errors (broken `import type` paths,
    `Subject`-vs-`EventEmitter`) ride green until the `ngc` build failed.
  - **DOM-spec placement guard** (`scripts/check-dom-spec-placement.mjs`, fast pre-build CI step):
    fails when a `*.dom.test.ts` sits inside `__tests__/`, where a dual-preset package silently runs
    it in neither vitest project. Its one real finding — `ng-markdown`'s service DOM spec — was
    relocated next to its source (test-file move only).
  - Fixes the pre-existing latent 2-args-of-3 `MCPDashboardComponent` constructor call in the
    dashboards node test (the gate's prerequisite).
  - **Anti-pattern lint** (`scripts/check-spec-antipatterns.mjs`, CI): bans vacuous assertions,
    skipped specs, blanket schemas, and `any`/`as never` casts in `*.dom.test.ts`. Enabling it drove
    the spec-hygiene cleanup across `ng-agent-requests` / `ng-query-viewer` / `ng-scheduling` /
    `ng-agents` / `ng-record-changes` (blanket schemas → explicit child stubs; `as never` → typed
    doubles) and the Explorer specs (real DOM clicks instead of handler calls, SVG prototype-patch
    teardown, typed context doubles).
  - **Explorer DOM coverage gate**: `classify-explorer-components.mjs --min 85` in CI — a testable
    Explorer component shipped without a DOM spec now fails the PR.

- Updated dependencies [b895f92]
- Updated dependencies [b895f92]
- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [d26e202]
- Updated dependencies [27e4d09]
  - @memberjunction/ng-ui-components@6.1.0-edge.0
  - @memberjunction/ng-markdown@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ng-base-types@6.1.0-edge.0
  - @memberjunction/ng-code-editor@6.1.0-edge.0
  - @memberjunction/ng-notifications@6.1.0-edge.0
  - @memberjunction/ng-shared-generic@6.1.0-edge.0
  - @memberjunction/ng-export-service@6.1.0-edge.0
  - @memberjunction/ng-pagination@6.1.0-edge.0
  - @memberjunction/export-engine@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ng-base-types@6.0.0
  - @memberjunction/ng-code-editor@6.0.0
  - @memberjunction/ng-notifications@6.0.0
  - @memberjunction/ng-shared-generic@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ng-export-service@6.0.0
  - @memberjunction/ng-markdown@6.0.0
  - @memberjunction/ng-pagination@6.0.0
  - @memberjunction/ng-ui-components@6.0.0
  - @memberjunction/export-engine@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ng-base-types@5.51.0
  - @memberjunction/ng-code-editor@5.51.0
  - @memberjunction/ng-notifications@5.51.0
  - @memberjunction/ng-shared-generic@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ng-export-service@5.51.0
  - @memberjunction/ng-markdown@5.51.0
  - @memberjunction/ng-pagination@5.51.0
  - @memberjunction/ng-ui-components@5.51.0
  - @memberjunction/export-engine@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- 0ba33b3: Client-issue batch fixes. Exports (Query viewer, Data Explorer, and User Views) now cover the FULL result set — capped at 100k with an over-cap warning — instead of just the on-screen page, and the Data Explorer toolbar Export button opens a unified Excel/CSV/JSON dialog for every view type (Grid/Cards/Map/Timeline). UI-role users can now create and manage Lists, with owner-scoped delete (or Developer/Integration) enforced server-side on BOTH Lists and List Details — a List Detail's authorization is scoped through its parent List's owner, so a user can't delete membership rows of lists they don't own. Also: grid quick-filter matches hidden columns, primary-key integer columns render without thousands separators, the Queries search-box icon/placeholder overlap is fixed, and the streaming thinking-tag stripper no longer leaks partial `<think>`/`</think>` tags split across chunks — and now flushes a genuine trailing tag-prefix (e.g. a response ending in `<`) at end of stream instead of dropping it.
- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ng-base-types@5.50.0
  - @memberjunction/ng-code-editor@5.50.0
  - @memberjunction/ng-notifications@5.50.0
  - @memberjunction/ng-shared-generic@5.50.0
  - @memberjunction/ng-export-service@5.50.0
  - @memberjunction/ng-markdown@5.50.0
  - @memberjunction/ng-ui-components@5.50.0
  - @memberjunction/ng-pagination@5.50.0
  - @memberjunction/export-engine@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- b5a8e3f: Fix Query Builder ad-hoc query results being capped at 100 rows with no working pager. The ad-hoc query resolver now paginates the first page (StartRow 0) and reports the true total row count via a COUNT(\*) query instead of a TOP-N cap, and the data grid no longer collapses value-identical rows from queries without an ID column. The artifact viewer title and grid toolbar now show the true total row count.
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ng-export-service@5.49.0
  - @memberjunction/ng-markdown@5.49.0
  - @memberjunction/ng-shared-generic@5.49.0
  - @memberjunction/ng-ui-components@5.49.0
  - @memberjunction/ng-base-types@5.49.0
  - @memberjunction/ng-code-editor@5.49.0
  - @memberjunction/ng-notifications@5.49.0
  - @memberjunction/ng-pagination@5.49.0
  - @memberjunction/export-engine@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ng-base-types@5.48.0
  - @memberjunction/ng-code-editor@5.48.0
  - @memberjunction/ng-notifications@5.48.0
  - @memberjunction/ng-shared-generic@5.48.0
  - @memberjunction/ng-markdown@5.48.0
  - @memberjunction/ng-export-service@5.48.0
  - @memberjunction/ng-pagination@5.48.0
  - @memberjunction/ng-ui-components@5.48.0
  - @memberjunction/export-engine@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ng-base-types@5.47.0
  - @memberjunction/ng-code-editor@5.47.0
  - @memberjunction/ng-notifications@5.47.0
  - @memberjunction/ng-shared-generic@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/ng-export-service@5.47.0
  - @memberjunction/ng-markdown@5.47.0
  - @memberjunction/ng-pagination@5.47.0
  - @memberjunction/ng-ui-components@5.47.0
  - @memberjunction/export-engine@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ng-base-types@5.46.0
  - @memberjunction/ng-code-editor@5.46.0
  - @memberjunction/ng-notifications@5.46.0
  - @memberjunction/ng-shared-generic@5.46.0
  - @memberjunction/ng-export-service@5.46.0
  - @memberjunction/ng-markdown@5.46.0
  - @memberjunction/ng-pagination@5.46.0
  - @memberjunction/ng-ui-components@5.46.0
  - @memberjunction/export-engine@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ng-notifications@5.45.1
- @memberjunction/ng-base-types@5.45.1
- @memberjunction/ng-code-editor@5.45.1
- @memberjunction/ng-export-service@5.45.1
- @memberjunction/ng-markdown@5.45.1
- @memberjunction/ng-pagination@5.45.1
- @memberjunction/ng-shared-generic@5.45.1
- @memberjunction/ng-ui-components@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/export-engine@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [13716e4]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/ng-ui-components@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ng-base-types@5.45.0
  - @memberjunction/ng-code-editor@5.45.0
  - @memberjunction/ng-notifications@5.45.0
  - @memberjunction/ng-shared-generic@5.45.0
  - @memberjunction/ng-export-service@5.45.0
  - @memberjunction/ng-markdown@5.45.0
  - @memberjunction/ng-pagination@5.45.0
  - @memberjunction/export-engine@5.45.0

## 5.44.0

### Patch Changes

- f8be8a0: Consolidate collapsible/disclosure UI onto the canonical `<mj-accordion-panel>` across MJ Explorer, and level up the accordion component itself.

  **`@memberjunction/ng-ui-components` (the component):**
  - New **`MJAccordionModule`** — bundles the panel + all three slot directives (`mjAccordionTitle`, `mjAccordionActions`, `mjAccordionBody`) so consumers import one symbol instead of four (works in both NgModule and standalone `imports`). An NgModule is used because AOT can't expand a value-array across a compiled-package boundary (NG1010) and an `as const` tuple is rejected by the `imports` type (TS2322).
  - New lazy **`[mjAccordionBody]`** slot — heavy bodies (code editors, grids, charts) instantiate on first expand and stay alive for animated re-toggle, so consumers don't have to reason about content weight or hand-write `@if (expanded)`.
  - Hardening: `--sm`/`--disabled`/`--muted-icon` modifiers scoped to child combinators (no nested-panel style bleed); `hasBeenExpanded` made non-public per naming conventions; added a DOM test proving the module exposes every declarable.

  **~50 disclosure surfaces migrated** from bespoke `<div (click)>`-header + `@if` markup to `<mj-accordion-panel>` across 20 Angular packages — dashboard-viewer config panels, DevTools Class Registry, Version History diff/snapshot groups, the test-run dialog, Explorer section toggles (about-dialog, sql-logging, SystemDiagnostics, App Roles, Home add-pin, Integration activity, Actions/Permissions/Credentials/Testing/ComponentStudio), and Generic components (agents, clustering, conversations, search, entity-viewer, filter-builder, record-tags, resource-permissions, core-entity-forms). Each replaces a non-focusable `<div (click)>` header with a real `<button [attr.aria-expanded]>` — a genuine accessibility improvement, not cosmetic — and deletes the per-consumer collapse chrome CSS. Card-based collapsibles, trees, and fill-panes are intentionally out of scope (they route to their own primitives).

  No public API changes in the consumer packages (internal refactor). Verified: all affected package test suites pass, CI UI gates green (design tokens + button overrides), and a full audit confirmed side-effects preserved with two visual regressions caught and fixed (SystemDiagnostics severity tint restored with semantic tokens; cluster-scatter members list scroll-confined via `[Fill]`).
  </content>

- 0476455: Migrate inline empty-state placeholders to the canonical `<mj-empty-state>` component across Explorer and Generic Angular packages (UI-consistency objective O4), wiring the component into the packages that needed it (and adding `@memberjunction/ng-ui-components` as a dependency where missing). Also fixes reset-filter CTA correctness in three picker dialogs (sub-agent selector, add-action, action gallery) where the handler cleared only a subset of the active filter dimensions, and refines the UI adoption measurement script with a transparent three-tier empty-state count (raw widened → non-placeholder false-positives → wrappers-around-migrated → genuine).
- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [f8be8a0]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [1e5e449]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [0476455]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ng-ui-components@5.44.0
  - @memberjunction/ng-notifications@5.44.0
  - @memberjunction/ng-base-types@5.44.0
  - @memberjunction/ng-code-editor@5.44.0
  - @memberjunction/ng-shared-generic@5.44.0
  - @memberjunction/ng-export-service@5.44.0
  - @memberjunction/ng-markdown@5.44.0
  - @memberjunction/ng-pagination@5.44.0
  - @memberjunction/export-engine@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [54183aa]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ng-pagination@5.43.0
  - @memberjunction/ng-base-types@5.43.0
  - @memberjunction/ng-code-editor@5.43.0
  - @memberjunction/ng-notifications@5.43.0
  - @memberjunction/ng-shared-generic@5.43.0
  - @memberjunction/ng-export-service@5.43.0
  - @memberjunction/ng-markdown@5.43.0
  - @memberjunction/export-engine@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ng-base-types@5.42.0
  - @memberjunction/ng-code-editor@5.42.0
  - @memberjunction/ng-notifications@5.42.0
  - @memberjunction/ng-shared-generic@5.42.0
  - @memberjunction/ng-export-service@5.42.0
  - @memberjunction/ng-markdown@5.42.0
  - @memberjunction/ng-pagination@5.42.0
  - @memberjunction/export-engine@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ng-notifications@5.41.0
  - @memberjunction/ng-base-types@5.41.0
  - @memberjunction/ng-code-editor@5.41.0
  - @memberjunction/ng-shared-generic@5.41.0
  - @memberjunction/ng-export-service@5.41.0
  - @memberjunction/ng-markdown@5.41.0
  - @memberjunction/ng-pagination@5.41.0
  - @memberjunction/export-engine@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ng-base-types@5.40.2
- @memberjunction/ng-code-editor@5.40.2
- @memberjunction/ng-export-service@5.40.2
- @memberjunction/ng-markdown@5.40.2
- @memberjunction/ng-notifications@5.40.2
- @memberjunction/ng-pagination@5.40.2
- @memberjunction/ng-shared-generic@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/export-engine@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-code-editor@5.40.1
  - @memberjunction/ng-notifications@5.40.1
  - @memberjunction/ng-shared-generic@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/ng-export-service@5.40.1
  - @memberjunction/ng-markdown@5.40.1
  - @memberjunction/ng-pagination@5.40.1
  - @memberjunction/export-engine@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-code-editor@5.40.0
  - @memberjunction/ng-notifications@5.40.0
  - @memberjunction/ng-shared-generic@5.40.0
  - @memberjunction/ng-export-service@5.40.0
  - @memberjunction/ng-markdown@5.40.0
  - @memberjunction/ng-pagination@5.40.0
  - @memberjunction/export-engine@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [4bc6fb4]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [5b4102c]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ng-markdown@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-code-editor@5.39.0
  - @memberjunction/ng-notifications@5.39.0
  - @memberjunction/ng-export-service@5.39.0
  - @memberjunction/ng-pagination@5.39.0
  - @memberjunction/export-engine@5.39.0

## 5.38.0

### Patch Changes

- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ng-code-editor@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-notifications@5.38.0
  - @memberjunction/ng-shared-generic@5.38.0
  - @memberjunction/ng-export-service@5.38.0
  - @memberjunction/ng-markdown@5.38.0
  - @memberjunction/ng-pagination@5.38.0
  - @memberjunction/export-engine@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-code-editor@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-export-service@5.37.0
  - @memberjunction/ng-markdown@5.37.0
  - @memberjunction/ng-pagination@5.37.0
  - @memberjunction/export-engine@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-code-editor@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-export-service@5.36.0
  - @memberjunction/ng-markdown@5.36.0
  - @memberjunction/ng-pagination@5.36.0
  - @memberjunction/export-engine@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-code-editor@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0
  - @memberjunction/ng-export-service@5.35.0
  - @memberjunction/ng-markdown@5.35.0
  - @memberjunction/ng-pagination@5.35.0
  - @memberjunction/export-engine@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-code-editor@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/ng-export-service@5.34.1
  - @memberjunction/ng-markdown@5.34.1
  - @memberjunction/ng-pagination@5.34.1
  - @memberjunction/export-engine@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-markdown@5.34.0
  - @memberjunction/ng-pagination@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-code-editor@5.34.0
  - @memberjunction/ng-export-service@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/export-engine@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-code-editor@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/ng-export-service@5.33.0
  - @memberjunction/ng-markdown@5.33.0
  - @memberjunction/ng-pagination@5.33.0
  - @memberjunction/export-engine@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-code-editor@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/ng-export-service@5.32.0
  - @memberjunction/ng-markdown@5.32.0
  - @memberjunction/ng-pagination@5.32.0
  - @memberjunction/export-engine@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-code-editor@5.31.0
  - @memberjunction/ng-export-service@5.31.0
  - @memberjunction/ng-markdown@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-pagination@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/export-engine@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ng-code-editor@5.30.1
- @memberjunction/ng-export-service@5.30.1
- @memberjunction/ng-markdown@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-pagination@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/export-engine@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ng-code-editor@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-export-service@5.30.0
  - @memberjunction/ng-markdown@5.30.0
  - @memberjunction/ng-pagination@5.30.0
  - @memberjunction/export-engine@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-code-editor@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/ng-export-service@5.29.0
  - @memberjunction/ng-markdown@5.29.0
  - @memberjunction/ng-pagination@5.29.0
  - @memberjunction/export-engine@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-code-editor@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-export-service@5.28.0
  - @memberjunction/ng-markdown@5.28.0
  - @memberjunction/ng-pagination@5.28.0
  - @memberjunction/export-engine@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ng-code-editor@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/ng-export-service@5.27.1
  - @memberjunction/ng-markdown@5.27.1
  - @memberjunction/ng-pagination@5.27.1
  - @memberjunction/export-engine@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ng-code-editor@5.27.0
- @memberjunction/ng-export-service@5.27.0
- @memberjunction/ng-markdown@5.27.0
- @memberjunction/ng-notifications@5.27.0
- @memberjunction/ng-pagination@5.27.0
- @memberjunction/ng-shared-generic@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/export-engine@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-code-editor@5.26.0
  - @memberjunction/ng-shared-generic@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/ng-export-service@5.26.0
  - @memberjunction/ng-markdown@5.26.0
  - @memberjunction/ng-pagination@5.26.0
  - @memberjunction/export-engine@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ng-code-editor@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-export-service@5.25.0
  - @memberjunction/ng-markdown@5.25.0
  - @memberjunction/ng-pagination@5.25.0
  - @memberjunction/export-engine@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/ng-code-editor@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-export-service@5.24.0
  - @memberjunction/ng-markdown@5.24.0
  - @memberjunction/ng-pagination@5.24.0
  - @memberjunction/export-engine@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-code-editor@5.23.0
  - @memberjunction/ng-notifications@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0
  - @memberjunction/ng-export-service@5.23.0
  - @memberjunction/ng-markdown@5.23.0
  - @memberjunction/ng-pagination@5.23.0
  - @memberjunction/export-engine@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-code-editor@5.22.0
  - @memberjunction/ng-notifications@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/ng-export-service@5.22.0
  - @memberjunction/ng-markdown@5.22.0
  - @memberjunction/ng-pagination@5.22.0
  - @memberjunction/export-engine@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/ng-code-editor@5.21.0
  - @memberjunction/ng-notifications@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/ng-export-service@5.21.0
  - @memberjunction/ng-markdown@5.21.0
  - @memberjunction/ng-pagination@5.21.0
  - @memberjunction/export-engine@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ng-code-editor@5.20.0
  - @memberjunction/ng-notifications@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/ng-export-service@5.20.0
  - @memberjunction/ng-markdown@5.20.0
  - @memberjunction/ng-pagination@5.20.0
  - @memberjunction/export-engine@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ng-code-editor@5.19.0
- @memberjunction/ng-export-service@5.19.0
- @memberjunction/ng-markdown@5.19.0
- @memberjunction/ng-notifications@5.19.0
- @memberjunction/ng-pagination@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/export-engine@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [de310bc]
  - @memberjunction/ng-markdown@5.18.0
  - @memberjunction/ng-notifications@5.18.0
  - @memberjunction/ng-code-editor@5.18.0
  - @memberjunction/ng-export-service@5.18.0
  - @memberjunction/ng-pagination@5.18.0
  - @memberjunction/ng-shared-generic@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/export-engine@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-notifications@5.17.0
  - @memberjunction/ng-code-editor@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/ng-export-service@5.17.0
  - @memberjunction/ng-markdown@5.17.0
  - @memberjunction/ng-pagination@5.17.0
  - @memberjunction/export-engine@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ng-code-editor@5.16.0
  - @memberjunction/ng-notifications@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/ng-export-service@5.16.0
  - @memberjunction/ng-markdown@5.16.0
  - @memberjunction/ng-pagination@5.16.0
  - @memberjunction/export-engine@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/ng-code-editor@5.15.0
  - @memberjunction/ng-notifications@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/ng-export-service@5.15.0
  - @memberjunction/ng-markdown@5.15.0
  - @memberjunction/ng-pagination@5.15.0
  - @memberjunction/export-engine@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ng-code-editor@5.14.0
  - @memberjunction/ng-notifications@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/ng-export-service@5.14.0
  - @memberjunction/ng-markdown@5.14.0
  - @memberjunction/ng-pagination@5.14.0
  - @memberjunction/export-engine@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ng-code-editor@5.13.0
  - @memberjunction/ng-notifications@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/ng-export-service@5.13.0
  - @memberjunction/ng-markdown@5.13.0
  - @memberjunction/ng-pagination@5.13.0
  - @memberjunction/export-engine@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/ng-pagination@5.12.0
  - @memberjunction/ng-code-editor@5.12.0
  - @memberjunction/ng-export-service@5.12.0
  - @memberjunction/ng-markdown@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ng-notifications@5.12.0
  - @memberjunction/export-engine@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- 457afcf: Add create/edit query drawer to Query Browser; fix full record toolbar; suppress duplicate empty state in query grid
- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-notifications@5.11.0
  - @memberjunction/ng-code-editor@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/ng-export-service@5.11.0
  - @memberjunction/ng-markdown@5.11.0
  - @memberjunction/export-engine@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ng-export-service@5.10.1
- @memberjunction/ng-markdown@5.10.1
- @memberjunction/ng-notifications@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/export-engine@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- 3df5e4b: no migration
- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-notifications@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/ng-export-service@5.10.0
  - @memberjunction/ng-markdown@5.10.0
  - @memberjunction/export-engine@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ng-notifications@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/ng-export-service@5.9.0
  - @memberjunction/export-engine@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-notifications@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/ng-export-service@5.8.0
  - @memberjunction/export-engine@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-notifications@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/ng-export-service@5.7.0
  - @memberjunction/export-engine@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-notifications@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/ng-export-service@5.6.0
  - @memberjunction/export-engine@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ng-export-service@5.5.0
  - @memberjunction/ng-notifications@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0
  - @memberjunction/export-engine@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ng-export-service@5.4.1
- @memberjunction/ng-notifications@5.4.1
- @memberjunction/ng-shared-generic@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/export-engine@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-notifications@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/ng-export-service@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/export-engine@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ng-export-service@5.3.1
- @memberjunction/ng-notifications@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/export-engine@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-notifications@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/ng-export-service@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/export-engine@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Minor Changes

- 06d889c: metadata -> migration
- 3542cb6: metadata -> migration

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ng-notifications@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-export-service@5.2.0
  - @memberjunction/export-engine@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ng-notifications@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0
  - @memberjunction/ng-export-service@5.1.0
  - @memberjunction/export-engine@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ng-export-service@5.0.0
  - @memberjunction/ng-notifications@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/export-engine@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ng-notifications@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/ng-export-service@4.4.0
  - @memberjunction/export-engine@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ng-export-service@4.3.1
- @memberjunction/ng-notifications@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/export-engine@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-notifications@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/ng-export-service@4.3.0
  - @memberjunction/export-engine@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ng-export-service@4.2.0
- @memberjunction/ng-notifications@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/export-engine@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/export-engine@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ng-notifications@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/ng-export-service@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-export-service@4.0.0
  - @memberjunction/ng-notifications@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/export-engine@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-notifications@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/ng-export-service@3.4.0
  - @memberjunction/export-engine@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ng-notifications@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/ng-export-service@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/export-engine@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/ng-notifications@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/ng-export-service@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/export-engine@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ng-notifications@3.1.1
- @memberjunction/ng-export-service@3.1.1
- @memberjunction/ng-shared-generic@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/export-engine@3.1.1
- @memberjunction/global@3.1.1
