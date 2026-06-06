# @memberjunction/ng-artifacts

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [f60e340]
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
  - @memberjunction/graphql-dataprovider@5.39.0
  - @memberjunction/ng-ui-components@5.39.0
  - @memberjunction/ng-base-forms@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ng-markdown@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-code-editor@5.39.0
  - @memberjunction/ng-notifications@5.39.0
  - @memberjunction/ng-query-viewer@5.39.0
  - @memberjunction/ng-react@5.39.0
  - @memberjunction/ng-trees@5.39.0
  - @memberjunction/interactive-component-types@5.39.0
  - @memberjunction/ng-export-service@5.39.0
  - @memberjunction/ng-pagination@5.39.0

## 5.38.0

### Minor Changes

- 8bd97f3: fix: image display + artifact/attachment unification cleanup
  - Add ImageArtifactViewerPlugin for raster image artifacts
  - Remove persist gate so agent-generated media always persists as artifacts
  - AgentRunner writes media artifacts directly (bypass deprecated ConversationDetailAttachment)
  - Remove deprecated SuggestedResponses feature (superseded by ResponseForm)
  - Backfill migration for legacy ConversationDetailAttachment rows
  - Remove all back-compat reads from deprecated ConversationDetailAttachment

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

- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [6a571d3]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [b26d0ee]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ng-base-forms@5.38.0
  - @memberjunction/ng-react@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/ng-code-editor@5.38.0
  - @memberjunction/ng-query-viewer@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-notifications@5.38.0
  - @memberjunction/ng-shared-generic@5.38.0
  - @memberjunction/ng-trees@5.38.0
  - @memberjunction/ng-export-service@5.38.0
  - @memberjunction/ng-markdown@5.38.0
  - @memberjunction/ng-pagination@5.38.0
  - @memberjunction/ng-ui-components@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [dadbde9]
- Updated dependencies [4f15f31]
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ng-react@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-code-editor@5.37.0
  - @memberjunction/ng-query-viewer@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-trees@5.37.0
  - @memberjunction/interactive-component-types@5.37.0
  - @memberjunction/ng-export-service@5.37.0
  - @memberjunction/ng-markdown@5.37.0
  - @memberjunction/ng-pagination@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [f29b7c0]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ng-react@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-code-editor@5.36.0
  - @memberjunction/ng-query-viewer@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-trees@5.36.0
  - @memberjunction/interactive-component-types@5.36.0
  - @memberjunction/ng-export-service@5.36.0
  - @memberjunction/ng-markdown@5.36.0
  - @memberjunction/ng-pagination@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [77e4782]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/graphql-dataprovider@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-code-editor@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-query-viewer@5.35.0
  - @memberjunction/ng-react@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0
  - @memberjunction/ng-trees@5.35.0
  - @memberjunction/interactive-component-types@5.35.0
  - @memberjunction/ng-export-service@5.35.0
  - @memberjunction/ng-markdown@5.35.0
  - @memberjunction/ng-pagination@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
  - @memberjunction/core@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-code-editor@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-query-viewer@5.34.1
  - @memberjunction/ng-react@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/ng-trees@5.34.1
  - @memberjunction/interactive-component-types@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/ng-export-service@5.34.1
  - @memberjunction/ng-markdown@5.34.1
  - @memberjunction/ng-pagination@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- b03bfb4: Replace hardcoded colors with semantic design tokens across Angular components and shared styles, restoring correct dark-mode behavior and enabling white-labeling. Also maps the System Diagnostics PerfMon chrome (background, borders, text, controls) to MJ semantic tokens so the panel adapts to the active theme; series colors stay categorical.
- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- 11ae7e6: no migration
- ad61267: no migration
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
  - @memberjunction/ng-query-viewer@5.34.0
  - @memberjunction/ng-react@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/ng-trees@5.34.0
  - @memberjunction/interactive-component-types@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [3e84676]
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-react@5.33.0
  - @memberjunction/interactive-component-types@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-code-editor@5.33.0
  - @memberjunction/ng-query-viewer@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/ng-trees@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/ng-export-service@5.33.0
  - @memberjunction/ng-markdown@5.33.0
  - @memberjunction/ng-pagination@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-code-editor@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-query-viewer@5.32.0
  - @memberjunction/ng-react@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/ng-trees@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/interactive-component-types@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/ng-export-service@5.32.0
  - @memberjunction/ng-markdown@5.32.0
  - @memberjunction/ng-pagination@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- c8b6f8a: Component Studio: React runtime now keys cached components by content fingerprint so artifact versions sharing `(name, namespace, version)` but differing in code coexist as separate cache entries — fixes the conversation panel's version dropdown showing stale compiled code when toggling between Skip-authored registry-reference stubs and Studio-authored inline-code exports of the same component. Adds change-detection fixes to the artifact-load and artifact-selection dialogs, wires the React bridge's `(initialized)` event into `UpdateWithResolvedSpec` so registry-resolved code populates the code editor on first load, and unwraps Skip's `componentOptions` envelope when reading from the artifact `Content` field.
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [c8b6f8a]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/graphql-dataprovider@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-code-editor@5.31.0
  - @memberjunction/ng-export-service@5.31.0
  - @memberjunction/ng-markdown@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-pagination@5.31.0
  - @memberjunction/ng-query-viewer@5.31.0
  - @memberjunction/ng-react@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/ng-trees@5.31.0
  - @memberjunction/interactive-component-types@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ng-base-types@5.30.1
- @memberjunction/ng-code-editor@5.30.1
- @memberjunction/ng-export-service@5.30.1
- @memberjunction/ng-markdown@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-pagination@5.30.1
- @memberjunction/ng-query-viewer@5.30.1
- @memberjunction/ng-react@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/ng-trees@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/interactive-component-types@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- a00af98: no migration/metadata
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [00b5c26]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/ng-react@5.30.0
  - @memberjunction/interactive-component-types@5.30.0
  - @memberjunction/ng-base-types@5.30.0
  - @memberjunction/ng-code-editor@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-query-viewer@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-trees@5.30.0
  - @memberjunction/ng-export-service@5.30.0
  - @memberjunction/ng-markdown@5.30.0
  - @memberjunction/ng-pagination@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/ng-trees@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-base-types@5.29.0
  - @memberjunction/ng-code-editor@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-query-viewer@5.29.0
  - @memberjunction/ng-react@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0
  - @memberjunction/interactive-component-types@5.29.0
  - @memberjunction/ng-export-service@5.29.0
  - @memberjunction/ng-markdown@5.29.0
  - @memberjunction/ng-pagination@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-base-types@5.28.0
  - @memberjunction/ng-code-editor@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-query-viewer@5.28.0
  - @memberjunction/ng-react@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-trees@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0
  - @memberjunction/interactive-component-types@5.28.0
  - @memberjunction/ng-export-service@5.28.0
  - @memberjunction/ng-markdown@5.28.0
  - @memberjunction/ng-pagination@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/global@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/ng-base-types@5.27.1
  - @memberjunction/ng-code-editor@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-query-viewer@5.27.1
  - @memberjunction/ng-react@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/ng-trees@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/interactive-component-types@5.27.1
  - @memberjunction/ng-export-service@5.27.1
  - @memberjunction/ng-markdown@5.27.1
  - @memberjunction/ng-pagination@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [35cf7d4]
  - @memberjunction/ng-trees@5.27.0
  - @memberjunction/ng-base-types@5.27.0
  - @memberjunction/ng-code-editor@5.27.0
  - @memberjunction/ng-export-service@5.27.0
  - @memberjunction/ng-markdown@5.27.0
  - @memberjunction/ng-notifications@5.27.0
  - @memberjunction/ng-pagination@5.27.0
  - @memberjunction/ng-query-viewer@5.27.0
  - @memberjunction/ng-react@5.27.0
  - @memberjunction/ng-shared-generic@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
  - @memberjunction/interactive-component-types@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-code-editor@5.26.0
  - @memberjunction/ng-shared-generic@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ng-base-types@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/ng-query-viewer@5.26.0
  - @memberjunction/ng-react@5.26.0
  - @memberjunction/ng-trees@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/interactive-component-types@5.26.0
  - @memberjunction/ng-export-service@5.26.0
  - @memberjunction/ng-markdown@5.26.0
  - @memberjunction/ng-pagination@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- 008a62d: Add file based artifact I/O

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
- Updated dependencies [c5426c5]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/interactive-component-types@5.25.0
  - @memberjunction/ng-query-viewer@5.25.0
  - @memberjunction/ng-trees@5.25.0
  - @memberjunction/ng-base-types@5.25.0
  - @memberjunction/ng-code-editor@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-react@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-export-service@5.25.0
  - @memberjunction/ng-markdown@5.25.0
  - @memberjunction/ng-pagination@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [f9792d1]
- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ng-react@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/interactive-component-types@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/ng-base-types@5.24.0
  - @memberjunction/ng-code-editor@5.24.0
  - @memberjunction/ng-query-viewer@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-trees@5.24.0
  - @memberjunction/ng-export-service@5.24.0
  - @memberjunction/ng-markdown@5.24.0
  - @memberjunction/ng-pagination@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- c17be20: no migration/metadata
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-react@5.23.0
  - @memberjunction/ng-base-types@5.23.0
  - @memberjunction/ng-code-editor@5.23.0
  - @memberjunction/ng-notifications@5.23.0
  - @memberjunction/ng-query-viewer@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0
  - @memberjunction/ng-trees@5.23.0
  - @memberjunction/interactive-component-types@5.23.0
  - @memberjunction/ng-export-service@5.23.0
  - @memberjunction/ng-markdown@5.23.0
  - @memberjunction/ng-pagination@5.23.0

## 5.22.0

### Patch Changes

- f2a6bec: Universal lazy loading via ClassFactory async API. Fixes HomeApplication being tree-shaken by moving lazy loading from consumer-specific retry patterns into ClassFactory itself with RegisterLazyLoader, CreateInstanceAsync, and GetRegistrationAsync. Lazy config now uses compound keys (BaseClassName::Key) to support any base class. Adds coverage audit to codegen to detect gaps.
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-base-types@5.22.0
  - @memberjunction/ng-code-editor@5.22.0
  - @memberjunction/ng-notifications@5.22.0
  - @memberjunction/ng-query-viewer@5.22.0
  - @memberjunction/ng-react@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/ng-trees@5.22.0
  - @memberjunction/interactive-component-types@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/ng-export-service@5.22.0
  - @memberjunction/ng-markdown@5.22.0
  - @memberjunction/ng-pagination@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/ng-react@5.21.0
  - @memberjunction/interactive-component-types@5.21.0
  - @memberjunction/ng-base-types@5.21.0
  - @memberjunction/ng-code-editor@5.21.0
  - @memberjunction/ng-notifications@5.21.0
  - @memberjunction/ng-query-viewer@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/ng-trees@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/ng-export-service@5.21.0
  - @memberjunction/ng-markdown@5.21.0
  - @memberjunction/ng-pagination@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ng-base-types@5.20.0
  - @memberjunction/ng-code-editor@5.20.0
  - @memberjunction/ng-notifications@5.20.0
  - @memberjunction/ng-query-viewer@5.20.0
  - @memberjunction/ng-react@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/ng-trees@5.20.0
  - @memberjunction/interactive-component-types@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/ng-export-service@5.20.0
  - @memberjunction/ng-markdown@5.20.0
  - @memberjunction/ng-pagination@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ng-base-types@5.19.0
- @memberjunction/ng-code-editor@5.19.0
- @memberjunction/ng-export-service@5.19.0
- @memberjunction/ng-markdown@5.19.0
- @memberjunction/ng-notifications@5.19.0
- @memberjunction/ng-pagination@5.19.0
- @memberjunction/ng-query-viewer@5.19.0
- @memberjunction/ng-react@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/ng-trees@5.19.0
- @memberjunction/interactive-component-types@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [de310bc]
  - @memberjunction/ng-markdown@5.18.0
  - @memberjunction/ng-query-viewer@5.18.0
  - @memberjunction/ng-notifications@5.18.0
  - @memberjunction/ng-react@5.18.0
  - @memberjunction/ng-base-types@5.18.0
  - @memberjunction/ng-code-editor@5.18.0
  - @memberjunction/ng-export-service@5.18.0
  - @memberjunction/ng-pagination@5.18.0
  - @memberjunction/ng-shared-generic@5.18.0
  - @memberjunction/ng-trees@5.18.0
  - @memberjunction/interactive-component-types@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-notifications@5.17.0
  - @memberjunction/ng-react@5.17.0
  - @memberjunction/ng-base-types@5.17.0
  - @memberjunction/ng-code-editor@5.17.0
  - @memberjunction/ng-query-viewer@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/ng-trees@5.17.0
  - @memberjunction/interactive-component-types@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/ng-export-service@5.17.0
  - @memberjunction/ng-markdown@5.17.0
  - @memberjunction/ng-pagination@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ng-base-types@5.16.0
  - @memberjunction/ng-code-editor@5.16.0
  - @memberjunction/ng-notifications@5.16.0
  - @memberjunction/ng-query-viewer@5.16.0
  - @memberjunction/ng-react@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/ng-trees@5.16.0
  - @memberjunction/interactive-component-types@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/ng-export-service@5.16.0
  - @memberjunction/ng-markdown@5.16.0
  - @memberjunction/ng-pagination@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/ng-base-types@5.15.0
  - @memberjunction/ng-code-editor@5.15.0
  - @memberjunction/ng-notifications@5.15.0
  - @memberjunction/ng-query-viewer@5.15.0
  - @memberjunction/ng-react@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/ng-trees@5.15.0
  - @memberjunction/interactive-component-types@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/ng-export-service@5.15.0
  - @memberjunction/ng-markdown@5.15.0
  - @memberjunction/ng-pagination@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ng-base-types@5.14.0
  - @memberjunction/ng-code-editor@5.14.0
  - @memberjunction/ng-notifications@5.14.0
  - @memberjunction/ng-query-viewer@5.14.0
  - @memberjunction/ng-react@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/ng-trees@5.14.0
  - @memberjunction/interactive-component-types@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/ng-export-service@5.14.0
  - @memberjunction/ng-markdown@5.14.0
  - @memberjunction/ng-pagination@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ng-base-types@5.13.0
  - @memberjunction/ng-code-editor@5.13.0
  - @memberjunction/ng-notifications@5.13.0
  - @memberjunction/ng-query-viewer@5.13.0
  - @memberjunction/ng-react@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/ng-trees@5.13.0
  - @memberjunction/interactive-component-types@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/ng-export-service@5.13.0
  - @memberjunction/ng-markdown@5.13.0
  - @memberjunction/ng-pagination@5.13.0

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
  - @memberjunction/ng-query-viewer@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/ng-pagination@5.12.0
  - @memberjunction/ng-code-editor@5.12.0
  - @memberjunction/ng-export-service@5.12.0
  - @memberjunction/ng-markdown@5.12.0
  - @memberjunction/ng-trees@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ng-base-types@5.12.0
  - @memberjunction/ng-notifications@5.12.0
  - @memberjunction/ng-react@5.12.0
  - @memberjunction/interactive-component-types@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
- Updated dependencies [457afcf]
  - @memberjunction/ng-query-viewer@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-notifications@5.11.0
  - @memberjunction/ng-react@5.11.0
  - @memberjunction/ng-base-types@5.11.0
  - @memberjunction/ng-code-editor@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/ng-trees@5.11.0
  - @memberjunction/interactive-component-types@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/ng-export-service@5.11.0
  - @memberjunction/ng-markdown@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ng-base-types@5.10.1
- @memberjunction/ng-code-editor@5.10.1
- @memberjunction/ng-export-service@5.10.1
- @memberjunction/ng-markdown@5.10.1
- @memberjunction/ng-notifications@5.10.1
- @memberjunction/ng-query-viewer@5.10.1
- @memberjunction/ng-react@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/ng-trees@5.10.1
- @memberjunction/interactive-component-types@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [3df5e4b]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-query-viewer@5.10.0
  - @memberjunction/ng-base-types@5.10.0
  - @memberjunction/ng-code-editor@5.10.0
  - @memberjunction/ng-notifications@5.10.0
  - @memberjunction/ng-react@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/ng-trees@5.10.0
  - @memberjunction/interactive-component-types@5.10.0
  - @memberjunction/ng-export-service@5.10.0
  - @memberjunction/ng-markdown@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ng-base-types@5.9.0
  - @memberjunction/ng-code-editor@5.9.0
  - @memberjunction/ng-notifications@5.9.0
  - @memberjunction/ng-query-viewer@5.9.0
  - @memberjunction/ng-react@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/ng-trees@5.9.0
  - @memberjunction/interactive-component-types@5.9.0
  - @memberjunction/ng-export-service@5.9.0
  - @memberjunction/ng-markdown@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-notifications@5.8.0
  - @memberjunction/ng-react@5.8.0
  - @memberjunction/ng-base-types@5.8.0
  - @memberjunction/ng-code-editor@5.8.0
  - @memberjunction/ng-query-viewer@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/ng-trees@5.8.0
  - @memberjunction/interactive-component-types@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/ng-export-service@5.8.0
  - @memberjunction/ng-markdown@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- f52e156: Fix agent infinite retry loop and OOM crash when API credentials are missing by adding NoCredentials error classification, max consecutive failure safety net, and descriptive error propagation to the UI. Fix artifact collection removal UI update, artifact pane width reset on conversation switch, and component spec caching to survive render errors.
- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-base-types@5.7.0
  - @memberjunction/ng-code-editor@5.7.0
  - @memberjunction/ng-notifications@5.7.0
  - @memberjunction/ng-query-viewer@5.7.0
  - @memberjunction/ng-react@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/ng-trees@5.7.0
  - @memberjunction/interactive-component-types@5.7.0
  - @memberjunction/ng-export-service@5.7.0
  - @memberjunction/ng-markdown@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-base-types@5.6.0
  - @memberjunction/ng-code-editor@5.6.0
  - @memberjunction/ng-notifications@5.6.0
  - @memberjunction/ng-query-viewer@5.6.0
  - @memberjunction/ng-react@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/ng-trees@5.6.0
  - @memberjunction/interactive-component-types@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/ng-export-service@5.6.0
  - @memberjunction/ng-markdown@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ng-react@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ng-base-types@5.5.0
  - @memberjunction/ng-code-editor@5.5.0
  - @memberjunction/ng-export-service@5.5.0
  - @memberjunction/ng-markdown@5.5.0
  - @memberjunction/ng-notifications@5.5.0
  - @memberjunction/ng-query-viewer@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0
  - @memberjunction/ng-trees@5.5.0
  - @memberjunction/interactive-component-types@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ng-base-types@5.4.1
- @memberjunction/ng-code-editor@5.4.1
- @memberjunction/ng-export-service@5.4.1
- @memberjunction/ng-markdown@5.4.1
- @memberjunction/ng-notifications@5.4.1
- @memberjunction/ng-query-viewer@5.4.1
- @memberjunction/ng-react@5.4.1
- @memberjunction/ng-shared-generic@5.4.1
- @memberjunction/ng-trees@5.4.1
- @memberjunction/interactive-component-types@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-notifications@5.4.0
  - @memberjunction/ng-react@5.4.0
  - @memberjunction/ng-base-types@5.4.0
  - @memberjunction/ng-code-editor@5.4.0
  - @memberjunction/ng-query-viewer@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/ng-trees@5.4.0
  - @memberjunction/ng-export-service@5.4.0
  - @memberjunction/ng-markdown@5.4.0
  - @memberjunction/interactive-component-types@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ng-base-types@5.3.1
- @memberjunction/ng-code-editor@5.3.1
- @memberjunction/ng-export-service@5.3.1
- @memberjunction/ng-markdown@5.3.1
- @memberjunction/ng-notifications@5.3.1
- @memberjunction/ng-query-viewer@5.3.1
- @memberjunction/ng-react@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/ng-trees@5.3.1
- @memberjunction/interactive-component-types@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- 7af1846: no migration
- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-notifications@5.3.0
  - @memberjunction/ng-react@5.3.0
  - @memberjunction/ng-base-types@5.3.0
  - @memberjunction/ng-code-editor@5.3.0
  - @memberjunction/ng-query-viewer@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/ng-trees@5.3.0
  - @memberjunction/ng-export-service@5.3.0
  - @memberjunction/ng-markdown@5.3.0
  - @memberjunction/interactive-component-types@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 4618227: Fix Angular 21/zone.js 0.15 change detection regressions, improve conversation caching performance, and resolve blank tabs in artifacts and entity viewer
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ng-query-viewer@5.2.0
  - @memberjunction/ng-react@5.2.0
  - @memberjunction/ng-base-types@5.2.0
  - @memberjunction/ng-code-editor@5.2.0
  - @memberjunction/ng-notifications@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-trees@5.2.0
  - @memberjunction/interactive-component-types@5.2.0
  - @memberjunction/ng-export-service@5.2.0
  - @memberjunction/ng-markdown@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ng-base-types@5.1.0
  - @memberjunction/ng-code-editor@5.1.0
  - @memberjunction/ng-notifications@5.1.0
  - @memberjunction/ng-react@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/interactive-component-types@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0
  - @memberjunction/ng-markdown@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/interactive-component-types@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ng-base-types@5.0.0
  - @memberjunction/ng-code-editor@5.0.0
  - @memberjunction/ng-markdown@5.0.0
  - @memberjunction/ng-notifications@5.0.0
  - @memberjunction/ng-react@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ng-base-types@4.4.0
  - @memberjunction/ng-code-editor@4.4.0
  - @memberjunction/ng-notifications@4.4.0
  - @memberjunction/ng-react@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/interactive-component-types@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/ng-markdown@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ng-base-types@4.3.1
- @memberjunction/ng-code-editor@4.3.1
- @memberjunction/ng-markdown@4.3.1
- @memberjunction/ng-notifications@4.3.1
- @memberjunction/ng-react@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/interactive-component-types@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-notifications@4.3.0
  - @memberjunction/ng-react@4.3.0
  - @memberjunction/ng-base-types@4.3.0
  - @memberjunction/ng-code-editor@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/interactive-component-types@4.3.0
  - @memberjunction/ng-markdown@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ng-base-types@4.2.0
- @memberjunction/ng-code-editor@4.2.0
- @memberjunction/ng-markdown@4.2.0
- @memberjunction/ng-notifications@4.2.0
- @memberjunction/ng-react@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/interactive-component-types@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ng-base-types@4.1.0
  - @memberjunction/ng-code-editor@4.1.0
  - @memberjunction/ng-notifications@4.1.0
  - @memberjunction/ng-react@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/interactive-component-types@4.1.0
  - @memberjunction/ng-markdown@4.1.0
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
  - @memberjunction/ng-base-types@4.0.0
  - @memberjunction/ng-code-editor@4.0.0
  - @memberjunction/ng-markdown@4.0.0
  - @memberjunction/ng-notifications@4.0.0
  - @memberjunction/ng-react@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/interactive-component-types@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-base-types@3.4.0
  - @memberjunction/ng-code-editor@3.4.0
  - @memberjunction/ng-notifications@3.4.0
  - @memberjunction/ng-react@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/interactive-component-types@3.4.0
  - @memberjunction/ng-markdown@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ng-base-types@3.3.0
  - @memberjunction/ng-code-editor@3.3.0
  - @memberjunction/ng-notifications@3.3.0
  - @memberjunction/ng-react@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/ng-markdown@3.3.0
  - @memberjunction/interactive-component-types@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- cbd2714: Improve error handling and stability across Skip integration, component artifacts, and metadata sync
- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [cbd2714]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/interactive-component-types@3.2.0
  - @memberjunction/ng-base-types@3.2.0
  - @memberjunction/ng-code-editor@3.2.0
  - @memberjunction/ng-notifications@3.2.0
  - @memberjunction/ng-react@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/ng-markdown@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ng-notifications@3.1.1
- @memberjunction/ng-react@3.1.1
- @memberjunction/ng-base-types@3.1.1
- @memberjunction/ng-code-editor@3.1.1
- @memberjunction/ng-markdown@3.1.1
- @memberjunction/ng-shared-generic@3.1.1
- @memberjunction/interactive-component-types@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ng-base-types@3.0.0
- @memberjunction/ng-code-editor@3.0.0
- @memberjunction/ng-markdown@3.0.0
- @memberjunction/ng-notifications@3.0.0
- @memberjunction/ng-react@3.0.0
- @memberjunction/ng-shared-generic@3.0.0
- @memberjunction/interactive-component-types@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ng-base-types@2.133.0
  - @memberjunction/ng-code-editor@2.133.0
  - @memberjunction/ng-notifications@2.133.0
  - @memberjunction/ng-react@2.133.0
  - @memberjunction/ng-shared-generic@2.133.0
  - @memberjunction/interactive-component-types@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/ng-markdown@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ng-base-types@2.132.0
  - @memberjunction/ng-code-editor@2.132.0
  - @memberjunction/ng-notifications@2.132.0
  - @memberjunction/ng-react@2.132.0
  - @memberjunction/ng-shared-generic@2.132.0
  - @memberjunction/interactive-component-types@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/ng-markdown@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ng-base-types@2.131.0
  - @memberjunction/ng-code-editor@2.131.0
  - @memberjunction/ng-notifications@2.131.0
  - @memberjunction/ng-react@2.131.0
  - @memberjunction/ng-shared-generic@2.131.0
  - @memberjunction/interactive-component-types@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/ng-markdown@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- Updated dependencies [0dcb9cb]
  - @memberjunction/ng-markdown@2.130.1
  - @memberjunction/ng-base-types@2.130.1
  - @memberjunction/ng-code-editor@2.130.1
  - @memberjunction/ng-notifications@2.130.1
  - @memberjunction/ng-react@2.130.1
  - @memberjunction/ng-shared-generic@2.130.1
  - @memberjunction/interactive-component-types@2.130.1
  - @memberjunction/core@2.130.1
  - @memberjunction/core-entities@2.130.1
  - @memberjunction/global@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/ng-notifications@2.130.0
  - @memberjunction/ng-react@2.130.0
  - @memberjunction/ng-base-types@2.130.0
  - @memberjunction/ng-code-editor@2.130.0
  - @memberjunction/ng-shared-generic@2.130.0
  - @memberjunction/interactive-component-types@2.130.0
  - @memberjunction/ng-markdown@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- a39946c: no migration
- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [f7267c3]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/ng-react@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/ng-base-types@2.129.0
  - @memberjunction/ng-code-editor@2.129.0
  - @memberjunction/ng-notifications@2.129.0
  - @memberjunction/ng-shared-generic@2.129.0
  - @memberjunction/interactive-component-types@2.129.0
  - @memberjunction/ng-markdown@2.129.0

## 2.128.0

### Patch Changes

- e41becd: no migration file
- Updated dependencies [f407abe]
- Updated dependencies [3dde14d]
- Updated dependencies [0863f85]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ng-notifications@2.128.0
  - @memberjunction/ng-markdown@2.128.0
  - @memberjunction/ng-base-types@2.128.0
  - @memberjunction/ng-code-editor@2.128.0
  - @memberjunction/ng-react@2.128.0
  - @memberjunction/ng-shared-generic@2.128.0
  - @memberjunction/interactive-component-types@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Minor Changes

- 65318c4: migration

### Patch Changes

- Updated dependencies [65318c4]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/interactive-component-types@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/ng-react@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/ng-base-types@2.127.0
  - @memberjunction/ng-code-editor@2.127.0
  - @memberjunction/ng-notifications@2.127.0
  - @memberjunction/ng-shared-generic@2.127.0
  - @memberjunction/ng-markdown@2.127.0

## 2.126.1

### Patch Changes

- 8fa1aa2: no migration
  - @memberjunction/ng-notifications@2.126.1
  - @memberjunction/ng-react@2.126.1
  - @memberjunction/ng-base-types@2.126.1
  - @memberjunction/ng-code-editor@2.126.1
  - @memberjunction/ng-markdown@2.126.1
  - @memberjunction/ng-shared-generic@2.126.1
  - @memberjunction/interactive-component-types@2.126.1
  - @memberjunction/core@2.126.1
  - @memberjunction/core-entities@2.126.1
  - @memberjunction/global@2.126.1

## 2.126.0

### Minor Changes

- 389183e: migration

### Patch Changes

- eae1a1f: Add Phase B component linter fixtures, reorganize test structure, refactor financial analytics components, and fix OpenEntityRecord event propagation in artifacts and collections
- Updated dependencies [389183e]
- Updated dependencies [703221e]
  - @memberjunction/ng-markdown@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ng-base-types@2.126.0
  - @memberjunction/ng-code-editor@2.126.0
  - @memberjunction/ng-notifications@2.126.0
  - @memberjunction/ng-react@2.126.0
  - @memberjunction/ng-shared-generic@2.126.0
  - @memberjunction/interactive-component-types@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [1115143]
- Updated dependencies [bd4aa3d]
  - @memberjunction/interactive-component-types@2.125.0
  - @memberjunction/core@2.125.0
  - @memberjunction/ng-react@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/ng-base-types@2.125.0
  - @memberjunction/ng-code-editor@2.125.0
  - @memberjunction/ng-notifications@2.125.0
  - @memberjunction/ng-shared-generic@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ng-base-types@2.124.0
  - @memberjunction/ng-code-editor@2.124.0
  - @memberjunction/ng-notifications@2.124.0
  - @memberjunction/ng-react@2.124.0
  - @memberjunction/ng-shared-generic@2.124.0
  - @memberjunction/interactive-component-types@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ng-base-types@2.123.1
- @memberjunction/ng-code-editor@2.123.1
- @memberjunction/ng-notifications@2.123.1
- @memberjunction/ng-react@2.123.1
- @memberjunction/ng-shared-generic@2.123.1
- @memberjunction/interactive-component-types@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/ng-notifications@2.123.0
- @memberjunction/ng-react@2.123.0
- @memberjunction/ng-shared-generic@2.123.0
- @memberjunction/ng-base-types@2.123.0
- @memberjunction/ng-code-editor@2.123.0
- @memberjunction/interactive-component-types@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ng-code-editor@2.122.2
  - @memberjunction/ng-notifications@2.122.2
  - @memberjunction/ng-react@2.122.2
  - @memberjunction/ng-base-types@2.122.2
  - @memberjunction/ng-shared-generic@2.122.2
  - @memberjunction/interactive-component-types@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- 699a480: Fix missing @memberjunction dependencies in 24 Angular packages
- Updated dependencies [699a480]
  - @memberjunction/ng-react@2.122.1
  - @memberjunction/ng-base-types@2.122.1
  - @memberjunction/ng-code-editor@2.122.1
  - @memberjunction/ng-notifications@2.122.1
  - @memberjunction/ng-shared-generic@2.122.1
  - @memberjunction/interactive-component-types@2.122.1
  - @memberjunction/core@2.122.1
  - @memberjunction/core-entities@2.122.1
  - @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ng-base-types@2.122.0
  - @memberjunction/ng-code-editor@2.122.0
  - @memberjunction/ng-notifications@2.122.0
  - @memberjunction/ng-react@2.122.0
  - @memberjunction/ng-shared-generic@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ng-base-types@2.121.0
  - @memberjunction/ng-code-editor@2.121.0
  - @memberjunction/ng-notifications@2.121.0
  - @memberjunction/ng-react@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ng-base-types@2.120.0
  - @memberjunction/ng-code-editor@2.120.0
  - @memberjunction/ng-notifications@2.120.0
  - @memberjunction/ng-react@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/ng-base-types@2.119.0
  - @memberjunction/ng-code-editor@2.119.0
  - @memberjunction/ng-notifications@2.119.0
  - @memberjunction/ng-react@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/ng-base-types@2.118.0
  - @memberjunction/ng-code-editor@2.118.0
  - @memberjunction/ng-notifications@2.118.0
  - @memberjunction/ng-react@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/ng-base-types@2.117.0
  - @memberjunction/ng-code-editor@2.117.0
  - @memberjunction/ng-notifications@2.117.0
  - @memberjunction/ng-react@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/ng-base-types@2.116.0
  - @memberjunction/ng-code-editor@2.116.0
  - @memberjunction/ng-notifications@2.116.0
  - @memberjunction/ng-react@2.116.0
  - @memberjunction/core-entities@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/ng-base-types@2.115.0
- @memberjunction/ng-code-editor@2.115.0
- @memberjunction/ng-notifications@2.115.0
- @memberjunction/ng-react@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/core-entities@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ng-base-types@2.114.0
- @memberjunction/ng-code-editor@2.114.0
- @memberjunction/ng-notifications@2.114.0
- @memberjunction/ng-react@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ng-base-types@2.113.2
  - @memberjunction/ng-code-editor@2.113.2
  - @memberjunction/ng-notifications@2.113.2
  - @memberjunction/ng-react@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Minor Changes

- 2ac2120: Migration

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0
  - @memberjunction/ng-base-types@2.112.0
  - @memberjunction/ng-code-editor@2.112.0
  - @memberjunction/ng-notifications@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/ng-react@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ng-base-types@2.110.1
- @memberjunction/ng-code-editor@2.110.1
- @memberjunction/ng-notifications@2.110.1
- @memberjunction/ng-react@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Minor Changes

- d2d7ab9: migration

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/ng-base-types@2.110.0
  - @memberjunction/ng-code-editor@2.110.0
  - @memberjunction/ng-notifications@2.110.0
  - @memberjunction/ng-react@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Minor Changes

- 6e45c17: migration

### Patch Changes

- Updated dependencies [6e45c17]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ng-base-types@2.109.0
  - @memberjunction/ng-code-editor@2.109.0
  - @memberjunction/ng-notifications@2.109.0
  - @memberjunction/ng-react@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [656d86c]
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/ng-base-types@2.108.0
  - @memberjunction/ng-code-editor@2.108.0
  - @memberjunction/ng-notifications@2.108.0
  - @memberjunction/ng-react@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ng-base-types@2.107.0
- @memberjunction/ng-code-editor@2.107.0
- @memberjunction/ng-notifications@2.107.0
- @memberjunction/ng-react@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ng-base-types@2.106.0
- @memberjunction/ng-code-editor@2.106.0
- @memberjunction/ng-notifications@2.106.0
- @memberjunction/ng-react@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Minor Changes

- 5c2119c: migration

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ng-base-types@2.105.0
  - @memberjunction/ng-code-editor@2.105.0
  - @memberjunction/ng-notifications@2.105.0
  - @memberjunction/ng-react@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0
