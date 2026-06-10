# @memberjunction/ng-base-forms

## 5.40.2

### Patch Changes

- @memberjunction/ng-base-types@5.40.2
- @memberjunction/ng-code-editor@5.40.2
- @memberjunction/ng-entity-viewer@5.40.2
- @memberjunction/ng-list-management@5.40.2
- @memberjunction/ng-markdown@5.40.2
- @memberjunction/ng-notifications@5.40.2
- @memberjunction/ng-react@5.40.2
- @memberjunction/ng-record-changes@5.40.2
- @memberjunction/ng-record-tags@5.40.2
- @memberjunction/ng-shared-generic@5.40.2
- @memberjunction/ng-ui-components@5.40.2
- @memberjunction/interactive-component-types@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-code-editor@5.40.1
  - @memberjunction/ng-entity-viewer@5.40.1
  - @memberjunction/ng-list-management@5.40.1
  - @memberjunction/ng-notifications@5.40.1
  - @memberjunction/ng-react@5.40.1
  - @memberjunction/ng-record-changes@5.40.1
  - @memberjunction/ng-record-tags@5.40.1
  - @memberjunction/ng-shared-generic@5.40.1
  - @memberjunction/interactive-component-types@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/ng-markdown@5.40.1
  - @memberjunction/ng-ui-components@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-entity-viewer@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-code-editor@5.40.0
  - @memberjunction/ng-list-management@5.40.0
  - @memberjunction/ng-notifications@5.40.0
  - @memberjunction/ng-react@5.40.0
  - @memberjunction/ng-record-changes@5.40.0
  - @memberjunction/ng-record-tags@5.40.0
  - @memberjunction/ng-shared-generic@5.40.0
  - @memberjunction/interactive-component-types@5.40.0
  - @memberjunction/ng-markdown@5.40.0
  - @memberjunction/ng-ui-components@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- 4bc6fb4: feat(forms): FK dropdown scope picker, per-user persistence, and a centralized search-highlight theme token

  Enhancements to `<mj-form-field>`'s foreign-key autocomplete in `@memberjunction/ng-base-forms`:
  - **Search-field scope picker** — a pill (shown only while focused) lets the user
    choose which related-entity field the dropdown searches: the Name field by
    default, any shown column, or other searchable fields like ID. Exactly one
    targeted `LIKE` (DB) or one in-memory scan (cached) — never all columns.
  - **Configurable visible columns** — an eye toggle per field shows/hides it as a
    grid column, letting users surface normally-hidden fields (e.g. ID) or drop
    defaults.
  - **Per-user persistence** via a new `LinkedFieldOptionsStore` (backed by
    `UserInfoEngine`, one settings key): search scope, sort column/direction,
    column widths, and visible-column set are remembered per (entity, FK field).
    Nothing is written unless the user customizes.
  - **Column resize** — drag a header's edge; widths persist.
  - Plus polish: muted (theme-token) search highlight, fixed whitespace clipping in
    highlighted cells, body-portal render-timing fix for cached fields, and a
    scope/column menu that overlays the results list.

  Design-token addition in `@memberjunction/ng-shared-generic`: new semantic
  `--mj-search-highlight-bg` / `--mj-search-highlight-text` tokens (light + dark) so
  the typed-query `<mark>` highlight is muted and theme-controlled in one place.

  Also migrates the remaining primitive token usages in `ng-base-forms` CSS to
  semantic tokens (package is now 100% semantic tokens), and adds
  `STANDALONE_USAGE.md` documenting how to use these components as general-purpose
  data-bindable controls outside the forms architecture.

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

- ae74fd5: Auto-detect and render Markdown/HTML in long-text form fields. `MjFormFieldComponent`
  now honors an explicit `EntityField.ExtendedType` (`Markdown`/`HTML`/`Code`) and, when it
  is null, runs lightweight client-side content detection on eligible long-text fields
  (TS-type string with `MaxLength >= 255` or unlimited — generic across SQL Server/PostgreSQL).
  Read mode renders `<mj-markdown>` for Markdown, DOMPurify-sanitized `[innerHTML]` for HTML
  (via the new `mjSafeRichHtml` pipe — see below), and a read-only `<mj-code-editor>` for code;
  edit mode uses `<mj-code-editor>` with syntax highlighting for non-plain modes (mode frozen at
  edit entry), while plain fields keep the existing textbox/textarea.

  Widens the `EntityFieldExtendedType` union and the `CK_EntityField_ExtendedType` CHECK
  constraint to include `Markdown` and `HTML` (migration included — run CodeGen after applying
  to regenerate `EntityFieldEntity` types and metadata).

  Adds a reusable, dependency-free `detectRichTextFormat(value, maxScanLength?)` text classifier
  to `@memberjunction/global` (defaults to scanning the first 500 characters) so any consumer can
  sniff Markdown/HTML/plain content.

  Adds reusable safe-HTML rendering to `@memberjunction/ng-shared-generic`: a `PurifyRichTextHtml()`
  function and an `mjSafeRichHtml` pure pipe backed by DOMPurify (HTML + SVG profiles). Unlike
  Angular's built-in `[innerHTML]` sanitizer (which strips all SVG and inline styles), this keeps
  safe inline SVG and richer markup while still removing `<script>`, `on*` handlers, and
  `javascript:`/`data:` URLs — so it's safe for untrusted content yet renders richer HTML. Any
  Angular component can use `[innerHTML]="value | mjSafeRichHtml"`.

### Patch Changes

- 3c53858: feat(forms): inline "create new" from FK fields (event-based) + fold Allow\*API into entity permissions

  When the related record you need isn't in a foreign-key dropdown, you can now create it
  inline. A sticky "➕ Create …" footer (always visible at the bottom of the dropdown,
  prefilled with whatever you typed) requests creation; the new record is auto-selected into
  the field once saved. Gated on create permission + a new `@Input() AllowFKCreate` (default
  true); surface configurable via `@Input() FKCreatePresentation: 'dialog' | 'slide-in'`.

  **`@memberjunction/ng-base-forms`** — the Generic FK field stays generic: it only _emits_ a
  new `create-related` `FormNavigationEvent` (carrying the entity, prefill `NewRecordValues`,
  preferred presentation, provider, and a `Complete(record)` callback). It does **not** open
  the form itself — that would couple a generic component to the app-level form presenter.

  **`@memberjunction/ng-explorer-core`** — `SingleRecordComponent` handles the new
  `create-related` event: opens the related entity's form via `MJFormPresenterService`
  (dialog/slide-in, prefilled), then calls `event.Complete(savedRecord)` so the field selects it.

  **`@memberjunction/core`** — `EntityInfo.GetUserPermisions()` now folds the entity's
  `Allow{Create,Update,Delete}API` flags into the corresponding `Can*` results. An API-driven
  action requires both a role grant **and** the entity allowing that action at all, so a user
  can no longer be reported as able to create/update/delete records of an entity whose API for
  that action is disabled. (Read is unchanged — it has no `Allow*API` flag.)

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [bd95e83]
- Updated dependencies [3c53858]
- Updated dependencies [4bc6fb4]
- Updated dependencies [3b29882]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [5b4102c]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ng-ui-components@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/ng-record-changes@5.39.0
  - @memberjunction/ng-record-tags@5.39.0
  - @memberjunction/ng-entity-viewer@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ng-markdown@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-code-editor@5.39.0
  - @memberjunction/ng-list-management@5.39.0
  - @memberjunction/ng-notifications@5.39.0
  - @memberjunction/ng-react@5.39.0
  - @memberjunction/interactive-component-types@5.39.0

## 5.38.0

### Minor Changes

- 30f598d: Two intertwined deliverables in one PR: the autotag-website overhaul, plus a new dynamic forms-extension architecture (`BaseFormPanel` slot system) that lets consumers extend generated entity forms without the heavyweight custom-form override pattern.

  ## Autotag website crawler overhaul

  Fixes the long-standing "only crawls the seed page" symptom and adds first-class run budgets, a streaming pipeline, and per-source UI knobs.

  **Fixes**
  - `AutotagWebsite` now respects `MaxDepth` out of the box — the recursive crawler was previously gated on a flag that defaulted to falsy, so most sources only ever scraped the start URL. Class-level defaults are now `MaxDepth=2`, `CrawlSitesInLowerLevelDomain=true`, `CrawlOtherSitesInTopLevelDomain=false`.
  - Change-detection (the "is this page changed?" short-circuit) was rewritten to fetch each URL once instead of two or three times, hash the **extracted body text** (not raw HTML — eliminates spurious "changed" verdicts from CSRF tokens / build hashes / server timestamps), and scope the dedup query to the current `ContentSourceID` (a 404 boilerplate from one site no longer masks real pages on another).
  - `visitedURLs` state is now reset per content source — was leaking across sources and silently deduping legitimate URLs.
  - Conservative URL normalization (strip fragment, collapse trailing slash, sort query params; path case preserved per RFC 3986) so common variants dedupe correctly.
  - Several smaller bugs: `URLPattern` regex now applied in the shallow path too, `Number.isFinite` guard prevents NaN-cascade in the depth check.

  **Features**
  - **Streaming pipeline.** `ExtractTextAndProcessWithLLM` now accepts `AsyncIterable<MJContentItemEntity>` in addition to arrays. The website crawler streams items into the LLM batcher as they pass change-detection — total wall-clock is `~max(crawl, classify)` instead of `crawl + classify`. Backwards-compatible: existing array callers (AutotagEntity, tests) are unchanged.
  - **`MaxItemsPerRun` run budget.** Most intuitive "do at most N this run, do the rest next time" cap. Wired into `AutotagWebsite` (which had no budget integration before) and `AutotagEntity` (which already had the other RunBudget knobs). Pause is graceful via the existing CancellationRequested machinery; next run picks up where it left off (change-detection skips already-tagged items).
  - **Per-source Website crawler UI.** New "Website Crawler Settings" section on the Content Source form (conditional on Website source type) with structured inputs for MaxDepth, RootURL, URLPattern (live regex validation), and toggles for the recursion + sibling-fan-out flags. The Tag Pipeline section gets a promoted "Max items / run" primary row.

  **Storage**
  - `IContentSourceConfiguration` extended with a typed `MaxItemsPerRun?: number` and `Website?: IContentSourceWebsiteConfiguration` sub-object. The new `MJContentSourceEntity_IContentSourceWebsiteConfiguration` interface is now exported from `@memberjunction/core-entities`.
  - `AutotagWebsite` reads website knobs from the typed `Configuration.Website` first, then overlays `ContentSourceParam` rows as a sharper-per-instance override (legacy sources configured the old way keep working).
  - Per-key coercion at the param-overlay boundary fixes a latent bug where DB-stored strings were silently stuffed into number/boolean-typed instance fields.

  **Tests**

  162 tests pass (up from 119). New coverage spans URL normalization, fetch-once / extracted-text hashing, the streaming engine path (AsyncIterable batching, partial-batch flush, resume), `MaxItemsPerRun` budget enforcement, and the `Configuration.Website` overlay.

  **Docs**

  `packages/ContentAutotagging/README.md` documents the new streaming diagram, the Website Crawl Settings table, the Run Budgets table with priority order, and the resume semantics.

  **Known follow-ups** (not in this PR)
  - True crawl-side resume that persists discovered URLs so re-runs skip the HTTP re-discovery — today's resume is "functional via change-detection dedup."
  - `ETag` / `If-Modified-Since` conditional GETs on re-crawls (needs new columns on `MJContentItem`).

  ## `BaseFormPanel` slot system (`@memberjunction/ng-base-forms`)

  Generated entity forms can now be extended **without** replacing them via a `*Extended` custom-form override. Author a standalone Angular component extending `BaseFormPanel`, decorate with `@RegisterClassEx(BaseFormPanel, { metadata: { entity, slot, sortKey } })`, declare in any module. `<mj-form-panel-slot>` hosts in the generated form discover matching panels at runtime and dynamically mount them.

  **Slot positions** (top → bottom): `top-area`, `before-fields`, `after-fields`, `after-related`, `after-everything`.

  **Fallback chain** via `FormSlotCoordinator`: if the registered slot is missing because CodeGen hasn't been rerun against the new template emitter, the panel walks forward in the chain until it finds an existing slot. `MjRecordFormContainer` ALWAYS emits `after-everything` in its template, so panels never dead-end — pre-CodeGen-regen forms display every panel (at the bottom); post-regen forms display them in the preferred position.

  New public exports from `@memberjunction/ng-base-forms`:
  - `BaseFormPanel<TRecord>` abstract directive
  - `FormPanelSlot` type union
  - `FormPanelRegistrationMetadata` interface
  - `<mj-form-panel-slot>` component
  - `FormSlotCoordinator` service
  - `FORM_SLOT_CHAIN` constant

  Custom `*Extended` forms (e.g. `AIAgentFormComponentExtended`) remain a first-class pattern for truly bespoke layouts where the generated form is the wrong starting point entirely.

  Full authoring guide in `packages/Angular/Generic/base-forms/PANELS.md`.

  ## `@RegisterClassEx` + ClassFactory metadata (`@memberjunction/global`)

  Existing `@RegisterClass` keeps its exact positional signature (zero breaking changes) but also accepts an optional 6th `metadata` arg for parity. New `@RegisterClassEx(baseClass, options)` is the modern form when you have anything beyond `(baseClass, key, priority)` to specify — options-bag avoids positional-boolean noise and is the right place to attach `metadata`.

  New public exports from `@memberjunction/global`:
  - `RegisterClassEx` decorator
  - `RegisterClassOptions` interface
  - `ClassRegistration.Metadata` field (optional, additive)
  - `ClassFactory.GetAllRegistrationsByKeyPrefix(base, prefix)` — common structured-key case (case-insensitive, trimmed)
  - `ClassFactory.GetAllRegistrationsByKeyPattern(base, regex)` — nuanced key matching
  - `ClassFactory.GetAllRegistrationsByMetadata(base, predicate)` — recommended for structured discriminators

  The `Ex` suffix follows MJ's existing `Foo`/`FooAsync`/`FooEx` convention. Not a true TS overload — JS overloads are hacky compared to true OOP, and sibling decorators give cleaner IntelliSense + a clean deprecation path if we ever consolidate.

  MJGlobal README adds a "Structured registration" section documenting both decorators + all three lookup helpers.

  ## Knowledge Hub dashboard quick-edit (`@memberjunction/ng-dashboards`)

  The AI > Autotagging Pipeline dashboard's "Edit Content Source" slide-in is intentionally a **quick-edit surface**, not a full form. Added the most-useful subset of the new knobs:
  - `MaxItemsPerRun` (always shown — most-asked-for budget cap)
  - `MaxDepth` + 2 crawl toggles (Website-source-conditional)
  - **"Open advanced settings →"** link that calls `NavigationService.OpenEntityRecord('MJ: Content Sources', id)` to land in the full entity form, where every panel is available via the slot system.

  ## Documentation
  - `packages/Angular/Generic/base-forms/PANELS.md` (NEW) — comprehensive BaseFormPanel authoring guide.
  - `packages/Angular/CLAUDE.md` — restructured "Extending Entity Forms" section. Both patterns first-class.
  - `packages/Angular/Explorer/core-entity-forms/README.md` — new "Two Patterns" section above the existing custom-form guide.
  - `guides/CONTENT_AUTOTAGGING_GUIDE.md` — extended config table (all budget caps + `Website` sub-object) + UI section pointing at PANELS.md.
  - `packages/MJGlobal/README.md` — new "Structured registration: `@RegisterClassEx` + metadata" section.
  - Root `CLAUDE.md` — new "Nested CLAUDE.md Index" pointing at every sub-directory CLAUDE.md.

  ## Follow-ups (not in this PR)
  - Promote source-type-specific form sections to a registered class extension point when the count grows past 2-3 (e.g., RSS, Cloud Storage). Today's `IsWebsiteSourceType` template gate works fine for 1-2 source types.

- 918d663: Interactive Forms — runtime authoring loop is now closed end-to-end.

  **Versioning lifecycle (server-side actions).** The single `Create Interactive Form` action has been split into a versioning-aware family:
  - `Create Interactive Form` — net-new only; returns `ALREADY_EXISTS` if the user already has an Active override for the entity.
  - `Modify Interactive Form` — branches on the pointed-to Component's status: Pending → modify the row in place (no version proliferation during chat refinement); Active → insert a new Component v(N+1) with `Status='Pending'` and a sibling Pending Override, leaving the live form untouched.
  - `Activate Interactive Form Version` — flips a Pending override to Active and atomically demotes the prior Active to Inactive.
  - `Revert Interactive Form` — re-points an Active override at an older Component in the same Name lineage. Pure UPDATE; old rows preserved.
  - `Get Active Form For Entity` — read-only; returns the resolved override + the full applicable-variants list.
  - `Get Default Form Scaffold For Entity` — new read-only action that produces a working `ComponentSpec` mirroring the CodeGen Angular default layout. Replaces "write JSX from scratch" as the agent's baseline.

  **Form-aware artifact viewer.** When a component artifact's spec declares `componentRole: 'form'`, the viewer auto-loads a Top-1 record from the declared entity, mounts via `<mj-interactive-form>` (with `componentSpec` + `record` now `@Input()`s), and exposes a search-as-you-type record picker plus an **Apply to my form** action. Falls back to a synthetic `NewRecord()` when the entity has no rows yet.

  **Variant switcher.** `FormResolverService` now returns the full applicable-variants list alongside the resolved override. `<mj-record-form-container>` renders a compact "Form: \<name\> ▾" picker between the toolbar and the form body when more than one variant applies; selection is persisted per-user per-entity in localStorage.

  **Cockpit reshape.** Form Builder dashboard is no longer canvas-first: 4-pane layout with a forms list + versions rail on the left, a Preview/Code/Layout tabbed center, and a Form Builder AI pane on the right. Both side rails collapse to a strip with state persisted in localStorage.

  **Shared fixture.** `buildFixtureFormHostProps` promoted from Component Studio to `@memberjunction/interactive-component-types/forms` so the artifact viewer and Studio share one implementation.

  **Migration.** `EntityFormOverride.Notes` column (NVARCHAR(MAX), nullable) for human commentary on overrides. Validator audited against the CHECK constraint — no patch required.

  **Agent prompt.** `form-builder.template.md` rewritten around the new action toolbox; teaches the agent to call `Get Active Form For Entity` first and branch between Create / Modify (new-version) / Modify (in-place). Sage's prompt gets a one-line routing rule to delegate form requests to Form Builder.

### Patch Changes

- 6a571d3: Fix two new-record form lifecycle issues in MJ Explorer: add an entity-name discriminator to the component cache key so distinct "new record" tabs of different entities no longer collide (clicking "+ New Record" on one entity after opening another no longer reuses the wrong form), and close the tab when the user clicks Discard on a never-saved record (via a new 'dismiss' FormNavigationEvent kind that destroys the cached component so the next "Create New Record" click for the same entity gets a fresh edit-mode form instead of the stale view-mode one).
- d285996: Runtime forms substrate — Component-based entity forms swappable at runtime via EntityFormOverride. New form-role contract (FormHostProps, BeforeSave/Delete/EditModeChangeRequested events) in interactive-component-types. InteractiveFormComponent wrapper in ng-base-forms owns BaseEntity lifecycle while React stays pure. componentProps input on mj-react-component for host-supplied data context. FormResolverService + SingleRecordComponent wedge route entities to override Components with User > Role > Global scope precedence; zero behavior change when no override exists.
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ng-react@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-entity-viewer@5.38.0
  - @memberjunction/ng-list-management@5.38.0
  - @memberjunction/ng-notifications@5.38.0
  - @memberjunction/ng-record-changes@5.38.0
  - @memberjunction/ng-record-tags@5.38.0

## 5.37.0

### Patch Changes

- 0102dc6: Fix related-entity grids fetching data on form open when a record is opened already-loaded (e.g. double-clicking a row in Data Explorer). `IsSectionExpanded()` fell through to the global expanded default when a section wasn't yet in `sectionMap`; because `initSections()` runs after `await super.ngOnInit()`, the grids could render in the first change-detection pass before the seeded collapsed defaults existed, so `[AllowLoad]="IsSectionExpanded(key)"` read `true` and fired a `RunView` on open. A not-yet-seeded section now resolves to collapsed, so a missing section can never report as expanded.
- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-list-management@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ng-record-tags@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-entity-viewer@5.37.0
  - @memberjunction/ng-record-changes@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- e215af2: Stop related-entity grid panels in generated forms from fetching data on form open, and decouple panel-height persistence from expansion state.
  - `IsSectionExpanded()` now honors the collapsed default seeded by `initSections()` instead of falling back to the global expanded default, and the entity data grid defers its auto-load decision one microtask so a later `[AllowLoad]="false"` binding is applied before the load check runs.
  - Fixed the underlying bug where persisting a panel's height silently marked the section expanded: a `ResizeObserver` fired on initial measurement and `updateSectionState` merged `DEFAULT_SECTION_STATE` (`isExpanded: true`) into a height-only write, so on the next form open that persisted value won over the seeded collapsed default. `FormSectionState.isExpanded` is now optional (`undefined` = no explicit user choice), `updateSectionState` no longer seeds the default, and the `ResizeObserver` skips its initial fire and only persists while expanded.
  - Related-entity grids now lazy-load via an `IntersectionObserver` in `ExplorerEntityDataGridComponent`: a grid fetches only once its host scrolls into view, so off-screen and collapsed panels never fire a `RunView` on form open.
  - CodeGen now seeds all field panels expanded by default (except System Metadata), with related-entity grids collapsed. **Visible UX change:** generated forms that previously opened with related-entity sections expanded will now show those sections collapsed. Regenerate forms to pick up the new defaults.

- Updated dependencies [e215af2]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/ng-entity-viewer@5.36.0
  - @memberjunction/ng-list-management@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ng-record-tags@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-record-changes@5.36.0
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
  - @memberjunction/ng-entity-viewer@5.35.0
  - @memberjunction/ng-list-management@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-record-changes@5.35.0
  - @memberjunction/ng-record-tags@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-entity-viewer@5.34.1
  - @memberjunction/ng-list-management@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-record-changes@5.34.1
  - @memberjunction/ng-record-tags@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- 389d356: Fix XSS vulnerability in search-result highlighters across form-field labels, collapsible-panel section names, and conversation search snippets. Extracted shared `HighlightSearchMatches` helper in `@memberjunction/global` that escapes each text segment individually after a literal-string match, so HTML in the source can never leak into `[innerHTML]` as live markup. Also restored multi-match highlighting that had regressed to single-match.
- ae5cfbd: Search Scopes & RAG+ — multi-phase ship

  A bundled feature release across the search pipeline (Phases 2A–6 of
  the Search Scopes & RAG+ initiative). Highlights:

  **SearchEngine pipeline**
  - New `SimpleVectorDatabase` in-process driver — points
    `VectorDBBase` at any entity column with an `EmbeddingVector`
    field. Suitable for dev / agent-memory / small-medium corpora.
    Constructor accepts an empty/missing API key (in-process driver
    has no remote auth target).
  - `VectorDBBase.QueryIndex(params, contextUser?)` — `contextUser`
    is now a proper second parameter instead of being smuggled
    through `filter.__contextUser`. Pinecone/Qdrant/pgvector ignore
    it (they auth via API key); in-process drivers use it for
    RunView's server-side RLS guard. Method-level pattern matches
    MJ's `RunView(params, contextUser)` and `GetEntityObject(name,
contextUser)` conventions.
  - `SearchFusion` — multi-provider score evidence is now preserved
    through RRF. Previously the second provider's `ScoreBreakdown`
    contribution was silently dropped when the same RecordID
    appeared in two provider lists, causing the merged item to
    rank below single-provider hits. Records that match in
    Vector + Entity now carry both contributions and rank
    correctly.
  - Defensive sanitation in `Fuse()` — items with non-finite Score
    (NaN, Infinity), empty/non-string RecordID, or null payloads are
    filtered before fusion. Closes a class of failure modes from
    misbehaving 3rd-party providers.
  - Tier-1 input edge cases hardened — null/undefined/non-string
    Query no longer TypeErrors, surfaces a clean Failure result.
    `EntitySearchProvider` now strips SQL LIKE wildcards (`%`, `_`,
    `[`, `]`) from user input — `Query="%"` no longer matches every
    row through the LIKE-injection vector.
  - Streaming search — `SearchEngine.streamSearch()` v2 emits
    provider events as soon as each provider promise settles
    (concurrent emission), not in registration order.

  **Permission gate (Phase 2A)**
  - `SearchScopePermissionResolver` enforces a 6-step decision tree:
    AgentNone → AgentAssignedNotListed → DirectGrant → RoleGrant →
    AgentUnscopedAll → NoGrant.
  - `AIAgent.SearchScopeAccess` enum (`'None' | 'All' | 'Assigned'`)
    controls agent-side fallback when no per-user/per-role grant
    applies. `BypassCache` propagates through the dedup-linger cache
    so freshly-revoked grants take effect immediately.
  - New tests + agent scenarios cover all 13 permission-matrix cells
    (PM-01..PM-13).

  **Reranker catalog (Phase 2D)**
  - 4 reranker drivers — Cohere, Voyage, OpenAI judge, BGE local —
    all with `@RegisterClass(BaseReRanker, ...)`. Per-search
    `RerankerBudgetGuard` caps API spend; `EstimateCostCents` and
    `CostReporter` per driver. Graceful degradation when the
    upstream SDK rejects/times out/returns malformed responses.

  **Observability (Phase 3)**
  - `MJSearchExecutionLog` — every `Search()` invocation writes one
    row with Status / ResultCount / TotalDurationMs / RerankerCostCents
    / ProvidersJSON (per-source hit counts) / AIAgentID attribution.
    Forbidden gate decisions log `Status='Forbidden'` rows.
  - Knowledge Hub Config dashboard subtab visualizes the log:
    hit-rate, p50/p95 latency, top failure reasons, top users, total
    reranker cost.

  **External providers (Phase 5)**
  - 4 search providers — Elasticsearch, Typesense, Azure AI Search,
    OpenSearch — all with `@RegisterClass(BaseSearchProvider, ...)`.
  - New `AvailableSearchProviders` GraphQL query exposes the
    `BaseSearchProvider.GetAvailableProviders()` runtime catalog to
    the SearchScope form's provider dropdown (P5.5).

  **Angular / UI**
  - Custom `MJSearchScopeFormComponentExtended` (P2D.7 / P4) — fusion
    weights sliders, reranker dropdown, live-preview panel, A/B
    Kendall-tau similarity, CSV export of last 500 invocations.
  - Custom `MJSearchScopeProviderFormComponentExtended` (P5.5) —
    provider dropdown sourced from `MJ: Search Providers` rows,
    annotated with whether each provider's DriverClass is currently
    registered with the server's ClassFactory.
  - Streaming search consumer in `SearchService.StreamSearch()` —
    Angular Observable surface for the `StreamScopedSearch`
    mutation + `SearchStreamEvents` subscription.

  **Migration**
  - `V202605081416__v5.34.x__Search_Scopes_And_RAG_Plus.sql` —
    consolidated. Contains six DDL sections (Phase 1 baseline,
    `SearchScopePermission`, `SearchScope.RerankerBudgetCents`,
    `SearchExecutionLog`, `SearchScopeTestQuery`, unique-constraint
    fix) followed by five CodeGen runs that regenerate the entity
    metadata, sprocs, views, and permission grants for all of the
    above.

  **Test suite**
  - 17 end-to-end agent scenarios (s01–s17) under `agent-scenarios/`,
    driving real LLM tool-calls (Sage agent) against the SearchEngine
    - multi-provider RRF + reranker pipeline. 95 assertions; all PASS.
  - `@memberjunction/search-engine` vitest: 237 unit tests across 21
    files, all PASS. Covers fusion, providers (real + external),
    rerankers, scope template renderer, parent-ID metadata,
    streaming, permission resolver, edge cases, mid-flight failures.

  **Documentation**
  - `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` — comprehensive guide
    covering scope creation, agent integration, permission resolution,
    multi-scope fusion, reranker catalog, observability, external
    providers, how-to templates for adding a new provider /
    reranker / artifact tool library / vector index over an
    embedded entity column. Documents the embedding-regeneration
    contract for ops.

  See `RAG_plan.md` for the full multi-phase plan and `plans/
search-scopes-rag-plus/what-we-built.md` for the customer-facing
  summary.

- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-entity-viewer@5.34.0
  - @memberjunction/ng-list-management@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/ng-record-changes@5.34.0
  - @memberjunction/ng-record-tags@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [3e84676]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-entity-viewer@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ng-record-tags@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-list-management@5.33.0
  - @memberjunction/ng-record-changes@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-entity-viewer@5.32.0
  - @memberjunction/ng-list-management@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-record-changes@5.32.0
  - @memberjunction/ng-record-tags@5.32.0
  - @memberjunction/core-entities@5.32.0
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
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-entity-viewer@5.31.0
  - @memberjunction/ng-list-management@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-record-changes@5.31.0
  - @memberjunction/ng-record-tags@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ng-base-types@5.30.1
- @memberjunction/ng-entity-viewer@5.30.1
- @memberjunction/ng-list-management@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-record-changes@5.30.1
- @memberjunction/ng-record-tags@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
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
  - @memberjunction/ng-base-types@5.30.0
  - @memberjunction/ng-entity-viewer@5.30.0
  - @memberjunction/ng-list-management@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-record-changes@5.30.0
  - @memberjunction/ng-record-tags@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-base-types@5.29.0
  - @memberjunction/ng-entity-viewer@5.29.0
  - @memberjunction/ng-list-management@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-record-changes@5.29.0
  - @memberjunction/ng-record-tags@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-list-management@5.28.0
  - @memberjunction/ng-base-types@5.28.0
  - @memberjunction/ng-entity-viewer@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-record-changes@5.28.0
  - @memberjunction/ng-record-tags@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ng-base-types@5.27.1
  - @memberjunction/ng-entity-viewer@5.27.1
  - @memberjunction/ng-list-management@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-record-changes@5.27.1
  - @memberjunction/ng-record-tags@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ng-base-types@5.27.0
- @memberjunction/ng-entity-viewer@5.27.0
- @memberjunction/ng-list-management@5.27.0
- @memberjunction/ng-notifications@5.27.0
- @memberjunction/ng-record-changes@5.27.0
- @memberjunction/ng-record-tags@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ng-base-types@5.26.0
  - @memberjunction/ng-entity-viewer@5.26.0
  - @memberjunction/ng-list-management@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/ng-record-changes@5.26.0
  - @memberjunction/ng-record-tags@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [1eb9f6e]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ng-entity-viewer@5.25.0
  - @memberjunction/ng-base-types@5.25.0
  - @memberjunction/ng-list-management@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-record-changes@5.25.0
  - @memberjunction/ng-record-tags@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ng-record-tags@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/ng-base-types@5.24.0
  - @memberjunction/ng-entity-viewer@5.24.0
  - @memberjunction/ng-list-management@5.24.0
  - @memberjunction/ng-record-changes@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- 37dc301: Remove Kendo LayoutModule from CodeGen Angular form template, replace with angular-split
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-base-types@5.23.0
  - @memberjunction/ng-entity-viewer@5.23.0
  - @memberjunction/ng-list-management@5.23.0
  - @memberjunction/ng-record-changes@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-base-types@5.22.0
  - @memberjunction/ng-entity-viewer@5.22.0
  - @memberjunction/ng-list-management@5.22.0
  - @memberjunction/ng-record-changes@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/ng-base-types@5.21.0
  - @memberjunction/ng-entity-viewer@5.21.0
  - @memberjunction/ng-list-management@5.21.0
  - @memberjunction/ng-record-changes@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ng-base-types@5.20.0
  - @memberjunction/ng-entity-viewer@5.20.0
  - @memberjunction/ng-list-management@5.20.0
  - @memberjunction/ng-record-changes@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ng-base-types@5.19.0
- @memberjunction/ng-entity-viewer@5.19.0
- @memberjunction/ng-list-management@5.19.0
- @memberjunction/ng-record-changes@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ng-list-management@5.18.0
- @memberjunction/ng-record-changes@5.18.0
- @memberjunction/ng-base-types@5.18.0
- @memberjunction/ng-entity-viewer@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-base-types@5.17.0
  - @memberjunction/ng-entity-viewer@5.17.0
  - @memberjunction/ng-list-management@5.17.0
  - @memberjunction/ng-record-changes@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ng-base-types@5.16.0
  - @memberjunction/ng-entity-viewer@5.16.0
  - @memberjunction/ng-list-management@5.16.0
  - @memberjunction/ng-record-changes@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/ng-base-types@5.15.0
  - @memberjunction/ng-entity-viewer@5.15.0
  - @memberjunction/ng-list-management@5.15.0
  - @memberjunction/ng-record-changes@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ng-base-types@5.14.0
  - @memberjunction/ng-entity-viewer@5.14.0
  - @memberjunction/ng-list-management@5.14.0
  - @memberjunction/ng-record-changes@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ng-base-types@5.13.0
  - @memberjunction/ng-entity-viewer@5.13.0
  - @memberjunction/ng-list-management@5.13.0
  - @memberjunction/ng-record-changes@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

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
  - @memberjunction/ng-entity-viewer@5.12.0
  - @memberjunction/ng-list-management@5.12.0
  - @memberjunction/ng-record-changes@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ng-base-types@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-base-types@5.11.0
  - @memberjunction/ng-entity-viewer@5.11.0
  - @memberjunction/ng-list-management@5.11.0
  - @memberjunction/ng-record-changes@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ng-base-types@5.10.1
- @memberjunction/ng-entity-viewer@5.10.1
- @memberjunction/ng-list-management@5.10.1
- @memberjunction/ng-record-changes@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-base-types@5.10.0
  - @memberjunction/ng-entity-viewer@5.10.0
  - @memberjunction/ng-list-management@5.10.0
  - @memberjunction/ng-record-changes@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ng-base-types@5.9.0
  - @memberjunction/ng-entity-viewer@5.9.0
  - @memberjunction/ng-list-management@5.9.0
  - @memberjunction/ng-record-changes@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-base-types@5.8.0
  - @memberjunction/ng-entity-viewer@5.8.0
  - @memberjunction/ng-list-management@5.8.0
  - @memberjunction/ng-record-changes@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- 7641cd2: Fix form field autocomplete to fall back to ID field
- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-base-types@5.7.0
  - @memberjunction/ng-entity-viewer@5.7.0
  - @memberjunction/ng-list-management@5.7.0
  - @memberjunction/ng-record-changes@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-base-types@5.6.0
  - @memberjunction/ng-entity-viewer@5.6.0
  - @memberjunction/ng-list-management@5.6.0
  - @memberjunction/ng-record-changes@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ng-entity-viewer@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ng-base-types@5.5.0
  - @memberjunction/ng-list-management@5.5.0
  - @memberjunction/ng-record-changes@5.5.0

## 5.4.1

### Patch Changes

- c28af42: base forms dep fix
  - @memberjunction/ng-list-management@5.4.1
  - @memberjunction/ng-base-types@5.4.1
  - @memberjunction/ng-entity-viewer@5.4.1
  - @memberjunction/ng-record-changes@5.4.1
  - @memberjunction/core@5.4.1
  - @memberjunction/core-entities@5.4.1
  - @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-base-types@5.4.0
  - @memberjunction/ng-entity-viewer@5.4.0
  - @memberjunction/ng-list-management@5.4.0
  - @memberjunction/ng-record-changes@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ng-base-types@5.3.1
- @memberjunction/ng-entity-viewer@5.3.1
- @memberjunction/ng-list-management@5.3.1
- @memberjunction/ng-record-changes@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/ng-entity-viewer@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-base-types@5.3.0
  - @memberjunction/ng-list-management@5.3.0
  - @memberjunction/ng-record-changes@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ng-entity-viewer@5.2.0
  - @memberjunction/ng-base-types@5.2.0
  - @memberjunction/ng-list-management@5.2.0
  - @memberjunction/ng-record-changes@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ng-base-types@5.1.0
  - @memberjunction/ng-entity-viewer@5.1.0
  - @memberjunction/ng-list-management@5.1.0
  - @memberjunction/ng-record-changes@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [3cca644]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
- Updated dependencies [90bfa37]
  - @memberjunction/ng-entity-viewer@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ng-base-types@5.0.0
  - @memberjunction/ng-list-management@5.0.0
  - @memberjunction/ng-record-changes@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ng-base-types@4.4.0
  - @memberjunction/ng-entity-viewer@4.4.0
  - @memberjunction/ng-list-management@4.4.0
  - @memberjunction/ng-record-changes@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- Updated dependencies [318c578]
  - @memberjunction/ng-record-changes@4.3.1
  - @memberjunction/ng-base-types@4.3.1
  - @memberjunction/ng-entity-viewer@4.3.1
  - @memberjunction/ng-list-management@4.3.1
  - @memberjunction/core@4.3.1
  - @memberjunction/core-entities@4.3.1
  - @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-base-types@4.3.0
  - @memberjunction/ng-entity-viewer@4.3.0
  - @memberjunction/ng-list-management@4.3.0
  - @memberjunction/ng-record-changes@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ng-base-types@4.2.0
- @memberjunction/ng-entity-viewer@4.2.0
- @memberjunction/ng-list-management@4.2.0
- @memberjunction/ng-record-changes@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Minor Changes

- 2ea241f: metadata

### Patch Changes

- Updated dependencies [f54a9e4]
- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/ng-record-changes@4.1.0
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ng-base-types@4.1.0
  - @memberjunction/ng-entity-viewer@4.1.0
  - @memberjunction/ng-list-management@4.1.0
  - @memberjunction/global@4.1.0
