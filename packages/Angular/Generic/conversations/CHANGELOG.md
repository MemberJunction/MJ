# @memberjunction/ng-conversations

## 5.37.0

### Patch Changes

- 86a9d0e: Make the floating chat-agents overlay bubble user-draggable (mouse, touch, or pen) so it can be moved out of the way of underlying app buttons it would otherwise occlude. Position persists per-user; the expanded panel anchors to the bubble's location and clamps so the chat interface always stays visible. MJExplorer passes its shell-header height as a top boundary so the bubble cannot be dragged into the header.
- 22b775f: Add `client:capture-data-snapshot` actionable command so agents can request the user's live view of an artifact (including client-side filter/sort/selection state) before answering. Wires the command through SkipProxyAgent and adds a chat-UI handler that captures the snapshot, attaches it as a Data Snapshot artifact, and auto-sends the followup question.
- 4f15f31: Add Feedback Explorer dashboard with 1–10 conversation-rating modal persisting to ConversationDetail, plus a migration granting the UI role Create/Update on MJ: User Settings so user-scoped preferences (e.g. Agent Feedback consent) stop silently failing.
- Updated dependencies [dadbde9]
- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ai-agent-client@5.37.0
  - @memberjunction/ng-testing@5.37.0
  - @memberjunction/ng-artifacts@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/ng-forms@5.37.0
  - @memberjunction/ng-tasks@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-code-editor@5.37.0
  - @memberjunction/ng-container-directives@5.37.0
  - @memberjunction/ng-resource-permissions@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-agent-client@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/ng-markdown@5.37.0
  - @memberjunction/ng-ui-components@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [f29b7c0]
- Updated dependencies [1c0fce9]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/ng-ui-components@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-agent-client@5.36.0
  - @memberjunction/ng-testing@5.36.0
  - @memberjunction/ng-artifacts@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ng-forms@5.36.0
  - @memberjunction/ng-resource-permissions@5.36.0
  - @memberjunction/ai-engine-base@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-code-editor@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-tasks@5.36.0
  - @memberjunction/ng-container-directives@5.36.0
  - @memberjunction/ng-agent-client@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/ng-markdown@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- 2c905e3: Fix Save-to-Collection dialog so a new collection can be created from the empty state. Previously the "Create new collection…" affordance only rendered inside the collection tree, which is hidden when the user has no editable collections — leaving no way to create the first one.
- 32c4a02: Unify artifact and attachment delivery paths for AI agents. Seperate artifact storage from rendering. Every attachement now creates paired Artifact + ArtifactVersion and routing functions exist to replace hardcoded MIME allowlist. Unregistered file types are rejected at upload time unless the agent opts into AcceptUnregisteredFiles. Adds wildecard MIME resolver. `mj artifacts reclassify` for legacy rows
- Updated dependencies [6fa8e13]
- Updated dependencies [ee380f7]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [77e4782]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/ng-ui-components@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/graphql-dataprovider@5.35.0
  - @memberjunction/ai-agent-client@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/ng-testing@5.35.0
  - @memberjunction/ng-artifacts@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-code-editor@5.35.0
  - @memberjunction/ng-container-directives@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-resource-permissions@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0
  - @memberjunction/ng-tasks@5.35.0
  - @memberjunction/ng-forms@5.35.0
  - @memberjunction/ng-agent-client@5.35.0
  - @memberjunction/ai@5.35.0
  - @memberjunction/ng-markdown@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-agent-client@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/ng-testing@5.34.1
  - @memberjunction/ng-artifacts@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-code-editor@5.34.1
  - @memberjunction/ng-container-directives@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-resource-permissions@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/ng-tasks@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/ng-forms@5.34.1
  - @memberjunction/ng-agent-client@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/ng-markdown@5.34.1
  - @memberjunction/ng-ui-components@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- a6a16fa: Conversation sidebar now uses MJ design tokens for all text, borders, popovers, and status colors instead of hardcoded `rgba(255,255,255,X)` / `rgba(239,68,68,X)` / `#fb923c` / `rgba(0,0,0,0.4)` values. The "Pinned" and "Messages" section headers share the same style (no special background on Pinned), and the thumbtack icon no longer rotates when the section is collapsed/expanded.
- 389d356: Fix XSS vulnerability in search-result highlighters across form-field labels, collapsible-panel section names, and conversation search snippets. Extracted shared `HighlightSearchMatches` helper in `@memberjunction/global` that escapes each text segment individually after a literal-string match, so HTML in the source can never leak into `[innerHTML]` as live markup. Also restored multi-match highlighting that had regressed to single-match.
- ad61267: no migration
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [11ae7e6]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [ad61267]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-artifacts@5.34.0
  - @memberjunction/ng-markdown@5.34.0
  - @memberjunction/ai-agent-client@5.34.0
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/ng-testing@5.34.0
  - @memberjunction/ng-agent-client@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-code-editor@5.34.0
  - @memberjunction/ng-container-directives@5.34.0
  - @memberjunction/ng-forms@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/ng-resource-permissions@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/ng-tasks@5.34.0
  - @memberjunction/ng-ui-components@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ai-agent-client@5.33.0
  - @memberjunction/ng-testing@5.33.0
  - @memberjunction/ng-artifacts@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-code-editor@5.33.0
  - @memberjunction/ng-container-directives@5.33.0
  - @memberjunction/ng-resource-permissions@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/ng-tasks@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/ai@5.33.0
  - @memberjunction/ng-agent-client@5.33.0
  - @memberjunction/ng-forms@5.33.0
  - @memberjunction/ng-markdown@5.33.0
  - @memberjunction/ng-ui-components@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-agent-client@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/ng-testing@5.32.0
  - @memberjunction/ng-artifacts@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-code-editor@5.32.0
  - @memberjunction/ng-container-directives@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-resource-permissions@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/ng-tasks@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/ng-agent-client@5.32.0
  - @memberjunction/ng-forms@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/ng-markdown@5.32.0
  - @memberjunction/ng-ui-components@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 6779c1e: Lazy field hydration in BaseEntity + smarter engine startup (~30x warm-load speedup, ~14s to ~470ms). Defers per-row Field construction until something mutates or walks Fields, removes a speculative per-view fast-start path, adds a `deferred` flag to `@RegisterForStartup` and an `EnsureLoaded()` shortcut on `BaseEngine` / `AIEngine`. DeveloperModeService and WorkspaceStateManager swapped weak `Get`/`Set` calls for typed accessors. EnsureLoaded calls added at AI engine consumption sites.
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
  - @memberjunction/ai-agent-client@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/ng-testing@5.31.0
  - @memberjunction/ng-agent-client@5.31.0
  - @memberjunction/ng-artifacts@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-code-editor@5.31.0
  - @memberjunction/ng-container-directives@5.31.0
  - @memberjunction/ng-forms@5.31.0
  - @memberjunction/ng-markdown@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-resource-permissions@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/ng-tasks@5.31.0
  - @memberjunction/ng-ui-components@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-agent-client@5.30.1
- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/ng-testing@5.30.1
- @memberjunction/ng-agent-client@5.30.1
- @memberjunction/ng-artifacts@5.30.1
- @memberjunction/ng-base-types@5.30.1
- @memberjunction/ng-code-editor@5.30.1
- @memberjunction/ng-container-directives@5.30.1
- @memberjunction/ng-forms@5.30.1
- @memberjunction/ng-markdown@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-resource-permissions@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/ng-tasks@5.30.1
- @memberjunction/ng-ui-components@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.
- 216ddc3: Wrap sequential Save/Delete looops in atomic transcatoins (TransactionGroup client-side BeginTransaction/Commit/Rollback server-side)
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [a00af98]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/ng-artifacts@5.30.0
  - @memberjunction/ng-resource-permissions@5.30.0
  - @memberjunction/ng-testing@5.30.0
  - @memberjunction/ng-base-types@5.30.0
  - @memberjunction/ng-code-editor@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-tasks@5.30.0
  - @memberjunction/ai-agent-client@5.30.0
  - @memberjunction/ng-container-directives@5.30.0
  - @memberjunction/ng-forms@5.30.0
  - @memberjunction/ng-agent-client@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/ng-markdown@5.30.0
  - @memberjunction/ng-ui-components@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- 98bad3a: Auto-populate ContentSizeBytes on artifact version saves; redesign non-image attachement tiles with type badge and restore click-to-open/download behavior
- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-agent-client@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/ng-testing@5.29.0
  - @memberjunction/ng-artifacts@5.29.0
  - @memberjunction/ng-base-types@5.29.0
  - @memberjunction/ng-code-editor@5.29.0
  - @memberjunction/ng-container-directives@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/ng-tasks@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0
  - @memberjunction/ng-agent-client@5.29.0
  - @memberjunction/ng-forms@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/ng-markdown@5.29.0
  - @memberjunction/ng-ui-components@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-testing@5.28.0
  - @memberjunction/ai-agent-client@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/ng-artifacts@5.28.0
  - @memberjunction/ng-base-types@5.28.0
  - @memberjunction/ng-code-editor@5.28.0
  - @memberjunction/ng-container-directives@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-tasks@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0
  - @memberjunction/ng-agent-client@5.28.0
  - @memberjunction/ng-forms@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/ng-markdown@5.28.0
  - @memberjunction/ng-ui-components@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/global@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/ai-agent-client@5.27.1
  - @memberjunction/ai-engine-base@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/ng-testing@5.27.1
  - @memberjunction/ng-agent-client@5.27.1
  - @memberjunction/ng-artifacts@5.27.1
  - @memberjunction/ng-base-types@5.27.1
  - @memberjunction/ng-code-editor@5.27.1
  - @memberjunction/ng-container-directives@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/ng-tasks@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/ng-forms@5.27.1
  - @memberjunction/ng-markdown@5.27.1
  - @memberjunction/ng-ui-components@5.27.1

## 5.27.0

### Patch Changes

- 4357090: Repair three query composition pipeline regressions surfaced by Skip-Brain, clear test feedback dialog state when switching conversations, strip tag IDs from taxonomy context injected into LLM prompts, exclude in-progress runs from last-run-date lookups, and replace direct UUID equality checks with `UUIDsEqual()` in the AI analytics dashboards to comply with the cross-platform UUID compliance test.
  - @memberjunction/ng-artifacts@5.27.0
  - @memberjunction/ai-agent-client@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/ng-testing@5.27.0
  - @memberjunction/ng-agent-client@5.27.0
  - @memberjunction/ng-base-types@5.27.0
  - @memberjunction/ng-code-editor@5.27.0
  - @memberjunction/ng-container-directives@5.27.0
  - @memberjunction/ng-forms@5.27.0
  - @memberjunction/ng-markdown@5.27.0
  - @memberjunction/ng-notifications@5.27.0
  - @memberjunction/ng-shared-generic@5.27.0
  - @memberjunction/ng-tasks@5.27.0
  - @memberjunction/ng-ui-components@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
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
  - @memberjunction/ng-tasks@5.26.0
  - @memberjunction/ng-ui-components@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/ng-testing@5.26.0
  - @memberjunction/ng-artifacts@5.26.0
  - @memberjunction/ng-base-types@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/ng-forms@5.26.0
  - @memberjunction/ai-agent-client@5.26.0
  - @memberjunction/ng-container-directives@5.26.0
  - @memberjunction/ng-agent-client@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/ng-markdown@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- 008a62d: Add file based artifact I/O

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/ng-artifacts@5.25.0
  - @memberjunction/ai-agent-client@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/ng-testing@5.25.0
  - @memberjunction/ng-base-types@5.25.0
  - @memberjunction/ng-code-editor@5.25.0
  - @memberjunction/ng-container-directives@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-tasks@5.25.0
  - @memberjunction/ng-agent-client@5.25.0
  - @memberjunction/ng-forms@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/ng-markdown@5.25.0
  - @memberjunction/ng-ui-components@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/graphql-dataprovider@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-artifacts@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/ng-forms@5.24.0
  - @memberjunction/ng-tasks@5.24.0
  - @memberjunction/ai-agent-client@5.24.0
  - @memberjunction/ng-testing@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/ng-base-types@5.24.0
  - @memberjunction/ng-code-editor@5.24.0
  - @memberjunction/ng-container-directives@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-agent-client@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/ng-markdown@5.24.0
  - @memberjunction/ng-ui-components@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [58af481]
- Updated dependencies [fb0c69f]
- Updated dependencies [1d1e02e]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ng-artifacts@5.23.0
  - @memberjunction/graphql-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-ui-components@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-agent-client@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/ng-testing@5.23.0
  - @memberjunction/ng-base-types@5.23.0
  - @memberjunction/ng-code-editor@5.23.0
  - @memberjunction/ng-container-directives@5.23.0
  - @memberjunction/ng-notifications@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0
  - @memberjunction/ng-tasks@5.23.0
  - @memberjunction/ai@5.23.0
  - @memberjunction/ng-agent-client@5.23.0
  - @memberjunction/ng-forms@5.23.0
  - @memberjunction/ng-markdown@5.23.0

## 5.22.0

### Minor Changes

- a42aba6: metadata

### Patch Changes

- 6a5093b: no migration
- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-artifacts@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/ng-forms@5.22.0
  - @memberjunction/ng-tasks@5.22.0
  - @memberjunction/graphql-dataprovider@5.22.0
  - @memberjunction/ng-testing@5.22.0
  - @memberjunction/ng-base-types@5.22.0
  - @memberjunction/ng-code-editor@5.22.0
  - @memberjunction/ng-container-directives@5.22.0
  - @memberjunction/ng-notifications@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/ai@5.22.0
  - @memberjunction/ng-markdown@5.22.0

## 5.21.0

### Patch Changes

- 5e2f54a: Clean up chat UI
- c0347d3: Chat UI fix
- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/ng-testing@5.21.0
  - @memberjunction/ng-artifacts@5.21.0
  - @memberjunction/ng-base-types@5.21.0
  - @memberjunction/ng-code-editor@5.21.0
  - @memberjunction/ng-container-directives@5.21.0
  - @memberjunction/ng-notifications@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/ng-tasks@5.21.0
  - @memberjunction/graphql-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/ng-forms@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/ng-markdown@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/ng-testing@5.20.0
  - @memberjunction/ng-artifacts@5.20.0
  - @memberjunction/ng-base-types@5.20.0
  - @memberjunction/ng-code-editor@5.20.0
  - @memberjunction/ng-container-directives@5.20.0
  - @memberjunction/ng-notifications@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/ng-tasks@5.20.0
  - @memberjunction/graphql-dataprovider@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/ng-forms@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/ng-markdown@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/ng-testing@5.19.0
- @memberjunction/ng-artifacts@5.19.0
- @memberjunction/ng-base-types@5.19.0
- @memberjunction/ng-code-editor@5.19.0
- @memberjunction/ng-container-directives@5.19.0
- @memberjunction/ng-forms@5.19.0
- @memberjunction/ng-markdown@5.19.0
- @memberjunction/ng-notifications@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/ng-tasks@5.19.0
- @memberjunction/graphql-dataprovider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [de310bc]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ng-markdown@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/ng-forms@5.18.0
  - @memberjunction/ng-tasks@5.18.0
  - @memberjunction/graphql-dataprovider@5.18.0
  - @memberjunction/ng-artifacts@5.18.0
  - @memberjunction/ng-testing@5.18.0
  - @memberjunction/ng-notifications@5.18.0
  - @memberjunction/ai@5.18.0
  - @memberjunction/ng-base-types@5.18.0
  - @memberjunction/ng-code-editor@5.18.0
  - @memberjunction/ng-container-directives@5.18.0
  - @memberjunction/ng-shared-generic@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [9881045]
  - @memberjunction/graphql-dataprovider@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-testing@5.17.0
  - @memberjunction/ng-notifications@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/ng-artifacts@5.17.0
  - @memberjunction/ng-base-types@5.17.0
  - @memberjunction/ng-code-editor@5.17.0
  - @memberjunction/ng-container-directives@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/ng-tasks@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/ng-forms@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/ng-markdown@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [179a4ce]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/graphql-dataprovider@5.16.0
  - @memberjunction/ai-engine-base@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/ng-testing@5.16.0
  - @memberjunction/ng-artifacts@5.16.0
  - @memberjunction/ng-base-types@5.16.0
  - @memberjunction/ng-code-editor@5.16.0
  - @memberjunction/ng-container-directives@5.16.0
  - @memberjunction/ng-notifications@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/ng-tasks@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/ng-forms@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/ng-markdown@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/ng-testing@5.15.0
  - @memberjunction/ng-artifacts@5.15.0
  - @memberjunction/ng-base-types@5.15.0
  - @memberjunction/ng-code-editor@5.15.0
  - @memberjunction/ng-container-directives@5.15.0
  - @memberjunction/ng-notifications@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/ng-tasks@5.15.0
  - @memberjunction/graphql-dataprovider@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/ng-forms@5.15.0
  - @memberjunction/ng-markdown@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/graphql-dataprovider@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/ng-testing@5.14.0
  - @memberjunction/ng-artifacts@5.14.0
  - @memberjunction/ng-base-types@5.14.0
  - @memberjunction/ng-code-editor@5.14.0
  - @memberjunction/ng-container-directives@5.14.0
  - @memberjunction/ng-notifications@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/ng-tasks@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/ng-forms@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/ng-markdown@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/ng-testing@5.13.0
  - @memberjunction/ng-artifacts@5.13.0
  - @memberjunction/ng-base-types@5.13.0
  - @memberjunction/ng-code-editor@5.13.0
  - @memberjunction/ng-container-directives@5.13.0
  - @memberjunction/ng-notifications@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/ng-tasks@5.13.0
  - @memberjunction/graphql-dataprovider@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/ai@5.13.0
  - @memberjunction/ng-forms@5.13.0
  - @memberjunction/ng-markdown@5.13.0

## 5.12.0

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-artifacts@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/ng-testing@5.12.0
  - @memberjunction/ng-code-editor@5.12.0
  - @memberjunction/ng-markdown@5.12.0
  - @memberjunction/ng-tasks@5.12.0
  - @memberjunction/graphql-dataprovider@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/ng-base-types@5.12.0
  - @memberjunction/ng-container-directives@5.12.0
  - @memberjunction/ng-notifications@5.12.0
  - @memberjunction/ng-forms@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/graphql-dataprovider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-artifacts@5.11.0
  - @memberjunction/ng-testing@5.11.0
  - @memberjunction/ng-notifications@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/ng-base-types@5.11.0
  - @memberjunction/ng-code-editor@5.11.0
  - @memberjunction/ng-container-directives@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/ng-tasks@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/ng-markdown@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/ng-testing@5.10.1
- @memberjunction/ng-artifacts@5.10.1
- @memberjunction/ng-base-types@5.10.1
- @memberjunction/ng-code-editor@5.10.1
- @memberjunction/ng-container-directives@5.10.1
- @memberjunction/ng-markdown@5.10.1
- @memberjunction/ng-notifications@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/ng-tasks@5.10.1
- @memberjunction/graphql-dataprovider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [4e298b7]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/graphql-dataprovider@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/ng-testing@5.10.0
  - @memberjunction/ng-artifacts@5.10.0
  - @memberjunction/ng-base-types@5.10.0
  - @memberjunction/ng-code-editor@5.10.0
  - @memberjunction/ng-container-directives@5.10.0
  - @memberjunction/ng-notifications@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/ng-tasks@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/ng-markdown@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-engine-base@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/ng-testing@5.9.0
  - @memberjunction/ng-artifacts@5.9.0
  - @memberjunction/ng-base-types@5.9.0
  - @memberjunction/ng-code-editor@5.9.0
  - @memberjunction/ng-notifications@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/ng-tasks@5.9.0
  - @memberjunction/graphql-dataprovider@5.9.0
  - @memberjunction/ai@5.9.0
  - @memberjunction/ng-container-directives@5.9.0
  - @memberjunction/ng-markdown@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [de9f2c0]
- Updated dependencies [0753249]
  - @memberjunction/graphql-dataprovider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-testing@5.8.0
  - @memberjunction/ng-notifications@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/ng-artifacts@5.8.0
  - @memberjunction/ng-base-types@5.8.0
  - @memberjunction/ng-code-editor@5.8.0
  - @memberjunction/ng-container-directives@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/ng-tasks@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/ng-markdown@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- f52e156: Fix agent infinite retry loop and OOM crash when API credentials are missing by adding NoCredentials error classification, max consecutive failure safety net, and descriptive error propagation to the UI. Fix artifact collection removal UI update, artifact pane width reset on conversation switch, and component spec caching to survive render errors.
- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/ng-artifacts@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-testing@5.7.0
  - @memberjunction/ng-base-types@5.7.0
  - @memberjunction/ng-code-editor@5.7.0
  - @memberjunction/ng-container-directives@5.7.0
  - @memberjunction/ng-notifications@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/ng-tasks@5.7.0
  - @memberjunction/graphql-dataprovider@5.7.0
  - @memberjunction/ng-markdown@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/graphql-dataprovider@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/ng-testing@5.6.0
  - @memberjunction/ng-artifacts@5.6.0
  - @memberjunction/ng-base-types@5.6.0
  - @memberjunction/ng-code-editor@5.6.0
  - @memberjunction/ng-container-directives@5.6.0
  - @memberjunction/ng-notifications@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/ng-tasks@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/ng-markdown@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- a1648c5: Add MiniMax AI provider package, add MiniMax and Gemini 3.1 Pro models to AI model catalog, fix ng-conversations to prevent client from overwriting server-completed conversation details, and align metadata files with SQL logger output to prevent phantom mj-sync updates
- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/graphql-dataprovider@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/ng-testing@5.5.0
  - @memberjunction/ng-artifacts@5.5.0
  - @memberjunction/ng-base-types@5.5.0
  - @memberjunction/ng-code-editor@5.5.0
  - @memberjunction/ng-container-directives@5.5.0
  - @memberjunction/ng-markdown@5.5.0
  - @memberjunction/ng-notifications@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0
  - @memberjunction/ng-tasks@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ng-testing@5.4.1
- @memberjunction/ai-engine-base@5.4.1
- @memberjunction/ai@5.4.1
- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/ng-artifacts@5.4.1
- @memberjunction/ng-base-types@5.4.1
- @memberjunction/ng-code-editor@5.4.1
- @memberjunction/ng-container-directives@5.4.1
- @memberjunction/ng-markdown@5.4.1
- @memberjunction/ng-notifications@5.4.1
- @memberjunction/ng-shared-generic@5.4.1
- @memberjunction/ng-tasks@5.4.1
- @memberjunction/graphql-dataprovider@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- 8a11457: Add centralized fire-and-forget pattern for all long-running GraphQL mutations (RunTest, RunTestSuite, RunAIAgent, RunAIAgentFromConversationDetail) to avoid Azure's ~230s HTTP proxy timeout. Use fire-and-forget mutation to avoid Azure proxy timeouts on agent execution, allow \_\_ prefixed schema names in Open App manifest validation, add inlineSources to Angular tsconfig for vendor sourcemap support, and add .env.\* to gitignore
- Updated dependencies [8a11457]
- Updated dependencies [c9a760c]
  - @memberjunction/graphql-dataprovider@5.4.0
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-testing@5.4.0
  - @memberjunction/ng-notifications@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/ng-artifacts@5.4.0
  - @memberjunction/ng-base-types@5.4.0
  - @memberjunction/ng-code-editor@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/ng-tasks@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/ng-container-directives@5.4.0
  - @memberjunction/ng-markdown@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/ng-testing@5.3.1
- @memberjunction/ng-artifacts@5.3.1
- @memberjunction/ng-base-types@5.3.1
- @memberjunction/ng-code-editor@5.3.1
- @memberjunction/ng-container-directives@5.3.1
- @memberjunction/ng-markdown@5.3.1
- @memberjunction/ng-notifications@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/ng-tasks@5.3.1
- @memberjunction/graphql-dataprovider@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- a6aea29: Fix artifact auto-open for delegated sub-agent completions, add SSE-aware request method and fire-and-forget GraphQL mutation to prevent Azure proxy timeouts, fix WebSocket reconnection catch-up check, and remove crossOrigin CORS enforcement with fallback CDN support in React runtime
- Updated dependencies [a6aea29]
- Updated dependencies [1692c53]
- Updated dependencies [7af1846]
  - @memberjunction/graphql-dataprovider@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-artifacts@5.3.0
  - @memberjunction/ng-testing@5.3.0
  - @memberjunction/ng-notifications@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/ng-base-types@5.3.0
  - @memberjunction/ng-code-editor@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/ng-tasks@5.3.0
  - @memberjunction/ai@5.3.0
  - @memberjunction/ng-container-directives@5.3.0
  - @memberjunction/ng-markdown@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- 4618227: Fix Angular 21/zone.js 0.15 change detection regressions, improve conversation caching performance, and resolve blank tabs in artifacts and entity viewer
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/graphql-dataprovider@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/ng-tasks@5.2.0
  - @memberjunction/ng-artifacts@5.2.0
  - @memberjunction/ng-testing@5.2.0
  - @memberjunction/ng-base-types@5.2.0
  - @memberjunction/ng-code-editor@5.2.0
  - @memberjunction/ng-notifications@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-container-directives@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/ng-markdown@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/ng-testing@5.1.0
  - @memberjunction/ng-artifacts@5.1.0
  - @memberjunction/ng-base-types@5.1.0
  - @memberjunction/ng-code-editor@5.1.0
  - @memberjunction/ng-container-directives@5.1.0
  - @memberjunction/ng-notifications@5.1.0
  - @memberjunction/graphql-dataprovider@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/ng-tasks@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0
  - @memberjunction/ng-markdown@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/graphql-dataprovider@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/ng-testing@5.0.0
  - @memberjunction/ng-artifacts@5.0.0
  - @memberjunction/ng-base-types@5.0.0
  - @memberjunction/ng-code-editor@5.0.0
  - @memberjunction/ng-container-directives@5.0.0
  - @memberjunction/ng-markdown@5.0.0
  - @memberjunction/ng-notifications@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/ng-tasks@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/ng-testing@4.4.0
  - @memberjunction/ng-artifacts@4.4.0
  - @memberjunction/ng-base-types@4.4.0
  - @memberjunction/ng-code-editor@4.4.0
  - @memberjunction/ng-container-directives@4.4.0
  - @memberjunction/ng-notifications@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/ng-tasks@4.4.0
  - @memberjunction/graphql-dataprovider@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/ng-markdown@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-engine-base@4.3.1
- @memberjunction/ai@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/ng-testing@4.3.1
- @memberjunction/ng-artifacts@4.3.1
- @memberjunction/ng-base-types@4.3.1
- @memberjunction/ng-code-editor@4.3.1
- @memberjunction/ng-container-directives@4.3.1
- @memberjunction/ng-markdown@4.3.1
- @memberjunction/ng-notifications@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/ng-tasks@4.3.1
- @memberjunction/graphql-dataprovider@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/graphql-dataprovider@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-testing@4.3.0
  - @memberjunction/ng-notifications@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/ng-artifacts@4.3.0
  - @memberjunction/ng-base-types@4.3.0
  - @memberjunction/ng-code-editor@4.3.0
  - @memberjunction/ng-container-directives@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/ng-tasks@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/ng-markdown@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-engine-base@4.2.0
- @memberjunction/ai@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/ng-testing@4.2.0
- @memberjunction/ng-artifacts@4.2.0
- @memberjunction/ng-base-types@4.2.0
- @memberjunction/ng-code-editor@4.2.0
- @memberjunction/ng-container-directives@4.2.0
- @memberjunction/ng-markdown@4.2.0
- @memberjunction/ng-notifications@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/ng-tasks@4.2.0
- @memberjunction/graphql-dataprovider@4.2.0
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
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/ng-testing@4.1.0
  - @memberjunction/ng-artifacts@4.1.0
  - @memberjunction/ng-base-types@4.1.0
  - @memberjunction/ng-code-editor@4.1.0
  - @memberjunction/ng-container-directives@4.1.0
  - @memberjunction/ng-notifications@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/ng-tasks@4.1.0
  - @memberjunction/graphql-dataprovider@4.1.0
  - @memberjunction/ai@4.1.0
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

- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/graphql-dataprovider@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/ng-testing@4.0.0
  - @memberjunction/ng-artifacts@4.0.0
  - @memberjunction/ng-base-types@4.0.0
  - @memberjunction/ng-code-editor@4.0.0
  - @memberjunction/ng-container-directives@4.0.0
  - @memberjunction/ng-markdown@4.0.0
  - @memberjunction/ng-notifications@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/ng-tasks@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ai-engine-base@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/ng-testing@3.4.0
  - @memberjunction/ng-artifacts@3.4.0
  - @memberjunction/ng-base-types@3.4.0
  - @memberjunction/ng-code-editor@3.4.0
  - @memberjunction/ng-notifications@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/ng-tasks@3.4.0
  - @memberjunction/graphql-dataprovider@3.4.0
  - @memberjunction/ng-container-directives@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/ng-markdown@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ai-engine-base@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/ng-testing@3.3.0
  - @memberjunction/ng-artifacts@3.3.0
  - @memberjunction/ng-base-types@3.3.0
  - @memberjunction/ng-code-editor@3.3.0
  - @memberjunction/ng-notifications@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/ng-tasks@3.3.0
  - @memberjunction/graphql-dataprovider@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/ng-container-directives@3.3.0
  - @memberjunction/ng-markdown@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [cbd2714]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/graphql-dataprovider@3.2.0
  - @memberjunction/ng-artifacts@3.2.0
  - @memberjunction/ai-engine-base@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/ng-testing@3.2.0
  - @memberjunction/ng-base-types@3.2.0
  - @memberjunction/ng-code-editor@3.2.0
  - @memberjunction/ng-notifications@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/ng-tasks@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/ng-container-directives@3.2.0
  - @memberjunction/ng-markdown@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [8c0b624]
  - @memberjunction/graphql-dataprovider@3.1.1
  - @memberjunction/ng-testing@3.1.1
  - @memberjunction/ng-notifications@3.1.1
  - @memberjunction/ng-artifacts@3.1.1
  - @memberjunction/ai-engine-base@3.1.1
  - @memberjunction/ai@3.1.1
  - @memberjunction/ai-core-plus@3.1.1
  - @memberjunction/ng-base-types@3.1.1
  - @memberjunction/ng-code-editor@3.1.1
  - @memberjunction/ng-container-directives@3.1.1
  - @memberjunction/ng-markdown@3.1.1
  - @memberjunction/ng-shared-generic@3.1.1
  - @memberjunction/ng-tasks@3.1.1
  - @memberjunction/core@3.1.1
  - @memberjunction/core-entities@3.1.1
  - @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai-engine-base@3.0.0
- @memberjunction/ai@3.0.0
- @memberjunction/ai-core-plus@3.0.0
- @memberjunction/ng-testing@3.0.0
- @memberjunction/ng-artifacts@3.0.0
- @memberjunction/ng-base-types@3.0.0
- @memberjunction/ng-code-editor@3.0.0
- @memberjunction/ng-container-directives@3.0.0
- @memberjunction/ng-markdown@3.0.0
- @memberjunction/ng-notifications@3.0.0
- @memberjunction/ng-shared-generic@3.0.0
- @memberjunction/ng-tasks@3.0.0
- @memberjunction/graphql-dataprovider@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-engine-base@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/ng-testing@2.133.0
  - @memberjunction/ng-artifacts@2.133.0
  - @memberjunction/ng-base-types@2.133.0
  - @memberjunction/ng-code-editor@2.133.0
  - @memberjunction/ng-container-directives@2.133.0
  - @memberjunction/ng-notifications@2.133.0
  - @memberjunction/ng-shared-generic@2.133.0
  - @memberjunction/ng-tasks@2.133.0
  - @memberjunction/graphql-dataprovider@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/ng-markdown@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-engine-base@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/ng-testing@2.132.0
  - @memberjunction/ng-artifacts@2.132.0
  - @memberjunction/ng-base-types@2.132.0
  - @memberjunction/ng-code-editor@2.132.0
  - @memberjunction/ng-container-directives@2.132.0
  - @memberjunction/ng-notifications@2.132.0
  - @memberjunction/ng-shared-generic@2.132.0
  - @memberjunction/ng-tasks@2.132.0
  - @memberjunction/graphql-dataprovider@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/ng-markdown@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- 3604aa1: Fix Conversations Performance: Replace Timer Polling with PubSub + Fix Race Conditions
- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-engine-base@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/ng-testing@2.131.0
  - @memberjunction/ng-artifacts@2.131.0
  - @memberjunction/ng-base-types@2.131.0
  - @memberjunction/ng-code-editor@2.131.0
  - @memberjunction/ng-container-directives@2.131.0
  - @memberjunction/ng-notifications@2.131.0
  - @memberjunction/ng-shared-generic@2.131.0
  - @memberjunction/ng-tasks@2.131.0
  - @memberjunction/graphql-dataprovider@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/ng-markdown@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- d01c028: Revert broken conversation UI changes
- Updated dependencies [8884553]
- Updated dependencies [0dcb9cb]
  - @memberjunction/ng-testing@2.130.1
  - @memberjunction/ng-markdown@2.130.1
  - @memberjunction/ng-artifacts@2.130.1
  - @memberjunction/ai-engine-base@2.130.1
  - @memberjunction/ai@2.130.1
  - @memberjunction/ai-core-plus@2.130.1
  - @memberjunction/ng-base-types@2.130.1
  - @memberjunction/ng-code-editor@2.130.1
  - @memberjunction/ng-container-directives@2.130.1
  - @memberjunction/ng-notifications@2.130.1
  - @memberjunction/ng-shared-generic@2.130.1
  - @memberjunction/ng-tasks@2.130.1
  - @memberjunction/graphql-dataprovider@2.130.1
  - @memberjunction/core@2.130.1
  - @memberjunction/core-entities@2.130.1
  - @memberjunction/global@2.130.1

## 2.130.0

### Patch Changes

- 83d81ad: Fix conversation UI performance
- f4e1f05: Fix Conversation UI issue after browser refresh
- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai-engine-base@2.130.0
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/graphql-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/ng-tasks@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/ng-testing@2.130.0
  - @memberjunction/ng-notifications@2.130.0
  - @memberjunction/ng-artifacts@2.130.0
  - @memberjunction/ng-base-types@2.130.0
  - @memberjunction/ng-code-editor@2.130.0
  - @memberjunction/ng-container-directives@2.130.0
  - @memberjunction/ng-shared-generic@2.130.0
  - @memberjunction/ng-markdown@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- 573179f: Fix Conversation UI issues with Browser Refresh
- a39946c: no migration
- 3458156: Fix conversation UI stale state after navigation
- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [a39946c]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/graphql-dataprovider@2.129.0
  - @memberjunction/ng-artifacts@2.129.0
  - @memberjunction/ai-engine-base@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/ng-testing@2.129.0
  - @memberjunction/ng-base-types@2.129.0
  - @memberjunction/ng-code-editor@2.129.0
  - @memberjunction/ng-container-directives@2.129.0
  - @memberjunction/ng-notifications@2.129.0
  - @memberjunction/ng-shared-generic@2.129.0
  - @memberjunction/ng-tasks@2.129.0
  - @memberjunction/ai@2.129.0
  - @memberjunction/ng-markdown@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
- Updated dependencies [3dde14d]
- Updated dependencies [0863f85]
- Updated dependencies [e41becd]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ng-notifications@2.128.0
  - @memberjunction/ng-markdown@2.128.0
  - @memberjunction/ng-artifacts@2.128.0
  - @memberjunction/ai-engine-base@2.128.0
  - @memberjunction/ai-core-plus@2.128.0
  - @memberjunction/ng-testing@2.128.0
  - @memberjunction/ng-base-types@2.128.0
  - @memberjunction/ng-code-editor@2.128.0
  - @memberjunction/ng-container-directives@2.128.0
  - @memberjunction/ng-shared-generic@2.128.0
  - @memberjunction/ng-tasks@2.128.0
  - @memberjunction/graphql-dataprovider@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Minor Changes

- 65318c4: migration

### Patch Changes

- c7c3378: Fix memory leaks and improve conversation naming performance
- Updated dependencies [65318c4]
- Updated dependencies [0e56e97]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/ng-artifacts@2.127.0
  - @memberjunction/ai-core-plus@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/graphql-dataprovider@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/ai-engine-base@2.127.0
  - @memberjunction/ng-testing@2.127.0
  - @memberjunction/ng-base-types@2.127.0
  - @memberjunction/ng-code-editor@2.127.0
  - @memberjunction/ng-container-directives@2.127.0
  - @memberjunction/ng-notifications@2.127.0
  - @memberjunction/ng-shared-generic@2.127.0
  - @memberjunction/ng-tasks@2.127.0
  - @memberjunction/ai@2.127.0
  - @memberjunction/ng-markdown@2.127.0

## 2.126.1

### Patch Changes

- Updated dependencies [d6ae2a0]
- Updated dependencies [8fa1aa2]
  - @memberjunction/graphql-dataprovider@2.126.1
  - @memberjunction/ng-artifacts@2.126.1
  - @memberjunction/ng-testing@2.126.1
  - @memberjunction/ng-notifications@2.126.1
  - @memberjunction/ai-engine-base@2.126.1
  - @memberjunction/ai@2.126.1
  - @memberjunction/ai-core-plus@2.126.1
  - @memberjunction/ng-base-types@2.126.1
  - @memberjunction/ng-code-editor@2.126.1
  - @memberjunction/ng-container-directives@2.126.1
  - @memberjunction/ng-markdown@2.126.1
  - @memberjunction/ng-shared-generic@2.126.1
  - @memberjunction/ng-tasks@2.126.1
  - @memberjunction/core@2.126.1
  - @memberjunction/core-entities@2.126.1
  - @memberjunction/global@2.126.1

## 2.126.0

### Minor Changes

- d424fce: migration for metadata for Sage change
- 389183e: migration

### Patch Changes

- eae1a1f: Add Phase B component linter fixtures, reorganize test structure, refactor financial analytics components, and fix OpenEntityRecord event propagation in artifacts and collections
- Updated dependencies [eae1a1f]
- Updated dependencies [389183e]
- Updated dependencies [703221e]
  - @memberjunction/ng-artifacts@2.126.0
  - @memberjunction/ng-markdown@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ai-engine-base@2.126.0
  - @memberjunction/ai-core-plus@2.126.0
  - @memberjunction/ng-testing@2.126.0
  - @memberjunction/ng-base-types@2.126.0
  - @memberjunction/ng-code-editor@2.126.0
  - @memberjunction/ng-container-directives@2.126.0
  - @memberjunction/ng-notifications@2.126.0
  - @memberjunction/ng-shared-generic@2.126.0
  - @memberjunction/ng-tasks@2.126.0
  - @memberjunction/graphql-dataprovider@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/ng-artifacts@2.125.0
  - @memberjunction/graphql-dataprovider@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/ai-engine-base@2.125.0
  - @memberjunction/ai-core-plus@2.125.0
  - @memberjunction/ng-testing@2.125.0
  - @memberjunction/ng-base-types@2.125.0
  - @memberjunction/ng-code-editor@2.125.0
  - @memberjunction/ng-container-directives@2.125.0
  - @memberjunction/ng-notifications@2.125.0
  - @memberjunction/ng-shared-generic@2.125.0
  - @memberjunction/ng-tasks@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
- Updated dependencies [cabe329]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ai-core-plus@2.124.0
  - @memberjunction/ai-engine-base@2.124.0
  - @memberjunction/ng-testing@2.124.0
  - @memberjunction/ng-artifacts@2.124.0
  - @memberjunction/ng-base-types@2.124.0
  - @memberjunction/ng-code-editor@2.124.0
  - @memberjunction/ng-container-directives@2.124.0
  - @memberjunction/ng-notifications@2.124.0
  - @memberjunction/ng-shared-generic@2.124.0
  - @memberjunction/ng-tasks@2.124.0
  - @memberjunction/graphql-dataprovider@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-engine-base@2.123.1
- @memberjunction/ai@2.123.1
- @memberjunction/ai-core-plus@2.123.1
- @memberjunction/ng-testing@2.123.1
- @memberjunction/ng-artifacts@2.123.1
- @memberjunction/ng-base-types@2.123.1
- @memberjunction/ng-code-editor@2.123.1
- @memberjunction/ng-container-directives@2.123.1
- @memberjunction/ng-notifications@2.123.1
- @memberjunction/ng-shared-generic@2.123.1
- @memberjunction/ng-tasks@2.123.1
- @memberjunction/graphql-dataprovider@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- 52cf482: Fix conversation state reference after service refactor, improve component linter test structure, and fix chart ordering
- Updated dependencies [0944f59]
  - @memberjunction/ai-core-plus@2.123.0
  - @memberjunction/graphql-dataprovider@2.123.0
  - @memberjunction/ng-testing@2.123.0
  - @memberjunction/ng-notifications@2.123.0
  - @memberjunction/ng-artifacts@2.123.0
  - @memberjunction/ai-engine-base@2.123.0
  - @memberjunction/ai@2.123.0
  - @memberjunction/ng-shared-generic@2.123.0
  - @memberjunction/ng-base-types@2.123.0
  - @memberjunction/ng-code-editor@2.123.0
  - @memberjunction/ng-container-directives@2.123.0
  - @memberjunction/ng-tasks@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- 3d763e9: Fix MJExplorer UI rendering issues including conversation messages not displaying, collections page showing duplicate items on reload, dialog containers for deletions, loading spinner flashes during navigation, and improve JWT token handling for WebSocket connections
- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [3d763e9]
- Updated dependencies [81f0c44]
  - @memberjunction/graphql-dataprovider@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ng-artifacts@2.122.2
  - @memberjunction/ng-code-editor@2.122.2
  - @memberjunction/ng-container-directives@2.122.2
  - @memberjunction/ng-testing@2.122.2
  - @memberjunction/ng-notifications@2.122.2
  - @memberjunction/ai-engine-base@2.122.2
  - @memberjunction/ai-core-plus@2.122.2
  - @memberjunction/ng-base-types@2.122.2
  - @memberjunction/ng-shared-generic@2.122.2
  - @memberjunction/ng-tasks@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- 699a480: Fix missing @memberjunction dependencies in 24 Angular packages
- Updated dependencies [699a480]
  - @memberjunction/ng-artifacts@2.122.1
  - @memberjunction/ng-testing@2.122.1
  - @memberjunction/ai-engine-base@2.122.1
  - @memberjunction/ai@2.122.1
  - @memberjunction/ai-core-plus@2.122.1
  - @memberjunction/ng-base-types@2.122.1
  - @memberjunction/ng-code-editor@2.122.1
  - @memberjunction/ng-container-directives@2.122.1
  - @memberjunction/ng-notifications@2.122.1
  - @memberjunction/ng-shared-generic@2.122.1
  - @memberjunction/ng-tasks@2.122.1
  - @memberjunction/graphql-dataprovider@2.122.1
  - @memberjunction/core@2.122.1
  - @memberjunction/core-entities@2.122.1
  - @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/graphql-dataprovider@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ai-engine-base@2.122.0
  - @memberjunction/ai-core-plus@2.122.0
  - @memberjunction/ng-testing@2.122.0
  - @memberjunction/ng-artifacts@2.122.0
  - @memberjunction/ng-base-types@2.122.0
  - @memberjunction/ng-code-editor@2.122.0
  - @memberjunction/ng-container-directives@2.122.0
  - @memberjunction/ng-notifications@2.122.0
  - @memberjunction/ng-tasks@2.122.0
  - @memberjunction/ai@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai@2.121.0
  - @memberjunction/ai-engine-base@2.121.0
  - @memberjunction/ai-core-plus@2.121.0
  - @memberjunction/ng-testing@2.121.0
  - @memberjunction/ng-artifacts@2.121.0
  - @memberjunction/ng-base-types@2.121.0
  - @memberjunction/ng-code-editor@2.121.0
  - @memberjunction/ng-container-directives@2.121.0
  - @memberjunction/ng-notifications@2.121.0
  - @memberjunction/ng-tasks@2.121.0
  - @memberjunction/graphql-dataprovider@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/graphql-dataprovider@2.120.0
  - @memberjunction/ai-engine-base@2.120.0
  - @memberjunction/ai-core-plus@2.120.0
  - @memberjunction/ng-testing@2.120.0
  - @memberjunction/ng-artifacts@2.120.0
  - @memberjunction/ng-base-types@2.120.0
  - @memberjunction/ng-code-editor@2.120.0
  - @memberjunction/ng-container-directives@2.120.0
  - @memberjunction/ng-notifications@2.120.0
  - @memberjunction/ng-tasks@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/ai@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- 0a133df: Agent Conversation UI Improvement
- Updated dependencies [7dd7cca]
- Updated dependencies [0a133df]
  - @memberjunction/core@2.119.0
  - @memberjunction/ng-testing@2.119.0
  - @memberjunction/ai-core-plus@2.119.0
  - @memberjunction/ai-engine-base@2.119.0
  - @memberjunction/ng-artifacts@2.119.0
  - @memberjunction/ng-base-types@2.119.0
  - @memberjunction/ng-code-editor@2.119.0
  - @memberjunction/ng-container-directives@2.119.0
  - @memberjunction/ng-notifications@2.119.0
  - @memberjunction/ng-tasks@2.119.0
  - @memberjunction/graphql-dataprovider@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/ai@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
- Updated dependencies [1bb5c29]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/ai-core-plus@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/ng-testing@2.118.0
  - @memberjunction/ai-engine-base@2.118.0
  - @memberjunction/ng-artifacts@2.118.0
  - @memberjunction/ng-base-types@2.118.0
  - @memberjunction/ng-code-editor@2.118.0
  - @memberjunction/ng-notifications@2.118.0
  - @memberjunction/ng-tasks@2.118.0
  - @memberjunction/graphql-dataprovider@2.118.0
  - @memberjunction/ng-container-directives@2.118.0
  - @memberjunction/ai@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/ai-engine-base@2.117.0
  - @memberjunction/ai-core-plus@2.117.0
  - @memberjunction/ng-artifacts@2.117.0
  - @memberjunction/ng-base-types@2.117.0
  - @memberjunction/ng-code-editor@2.117.0
  - @memberjunction/ng-container-directives@2.117.0
  - @memberjunction/ng-notifications@2.117.0
  - @memberjunction/ng-tasks@2.117.0
  - @memberjunction/graphql-dataprovider@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/ai@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Minor Changes

- b80fe44: Migration

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/ai-engine-base@2.116.0
  - @memberjunction/ai-core-plus@2.116.0
  - @memberjunction/ng-artifacts@2.116.0
  - @memberjunction/ng-base-types@2.116.0
  - @memberjunction/ng-code-editor@2.116.0
  - @memberjunction/ng-container-directives@2.116.0
  - @memberjunction/ng-notifications@2.116.0
  - @memberjunction/ng-tasks@2.116.0
  - @memberjunction/graphql-dataprovider@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/ai@2.116.0

## 2.115.0

### Minor Changes

- 751e3d1: Fixed Conversations Hamburger Functionality
- 5b7d788: Migration

### Patch Changes

- dffe12f: code fixes
- 1a96840: Conversation UI Improvement
  - @memberjunction/ai-engine-base@2.115.0
  - @memberjunction/ai@2.115.0
  - @memberjunction/ai-core-plus@2.115.0
  - @memberjunction/ng-artifacts@2.115.0
  - @memberjunction/ng-base-types@2.115.0
  - @memberjunction/ng-code-editor@2.115.0
  - @memberjunction/ng-container-directives@2.115.0
  - @memberjunction/ng-notifications@2.115.0
  - @memberjunction/ng-tasks@2.115.0
  - @memberjunction/graphql-dataprovider@2.115.0
  - @memberjunction/core@2.115.0
  - @memberjunction/core-entities@2.115.0
  - @memberjunction/global@2.115.0

## 2.114.0

### Minor Changes

- a17ec8e: Migration

### Patch Changes

- 12ae685: chat mobile fixes
  - @memberjunction/ai-engine-base@2.114.0
  - @memberjunction/ai@2.114.0
  - @memberjunction/ai-core-plus@2.114.0
  - @memberjunction/ng-artifacts@2.114.0
  - @memberjunction/ng-base-types@2.114.0
  - @memberjunction/ng-code-editor@2.114.0
  - @memberjunction/ng-container-directives@2.114.0
  - @memberjunction/ng-notifications@2.114.0
  - @memberjunction/ng-tasks@2.114.0
  - @memberjunction/graphql-dataprovider@2.114.0
  - @memberjunction/core@2.114.0
  - @memberjunction/core-entities@2.114.0
  - @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ai-engine-base@2.113.2
  - @memberjunction/ai-core-plus@2.113.2
  - @memberjunction/ng-artifacts@2.113.2
  - @memberjunction/ng-base-types@2.113.2
  - @memberjunction/ng-code-editor@2.113.2
  - @memberjunction/ng-container-directives@2.113.2
  - @memberjunction/ng-notifications@2.113.2
  - @memberjunction/ng-tasks@2.113.2
  - @memberjunction/graphql-dataprovider@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/ai@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Minor Changes

- 2ac2120: Migration
- 2ac2120: migration

### Patch Changes

- 621960a: Patch
- Updated dependencies [2ac2120]
- Updated dependencies [c126b59]
- Updated dependencies [ed74bb8]
  - @memberjunction/ng-artifacts@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/ai-core-plus@2.112.0
  - @memberjunction/ai-engine-base@2.112.0
  - @memberjunction/ai@2.112.0
  - @memberjunction/ng-base-types@2.112.0
  - @memberjunction/ng-code-editor@2.112.0
  - @memberjunction/ng-container-directives@2.112.0
  - @memberjunction/ng-notifications@2.112.0
  - @memberjunction/graphql-dataprovider@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/ng-tasks@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai-engine-base@2.110.1
- @memberjunction/ai@2.110.1
- @memberjunction/ai-core-plus@2.110.1
- @memberjunction/ng-artifacts@2.110.1
- @memberjunction/ng-base-types@2.110.1
- @memberjunction/ng-code-editor@2.110.1
- @memberjunction/ng-container-directives@2.110.1
- @memberjunction/ng-notifications@2.110.1
- @memberjunction/ng-tasks@2.110.1
- @memberjunction/graphql-dataprovider@2.110.1
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
  - @memberjunction/ng-artifacts@2.110.0
  - @memberjunction/graphql-dataprovider@2.110.0
  - @memberjunction/ai-core-plus@2.110.0
  - @memberjunction/ai-engine-base@2.110.0
  - @memberjunction/ng-base-types@2.110.0
  - @memberjunction/ng-code-editor@2.110.0
  - @memberjunction/ng-notifications@2.110.0
  - @memberjunction/ng-tasks@2.110.0
  - @memberjunction/ai@2.110.0
  - @memberjunction/ng-container-directives@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Minor Changes

- 6e45c17: migration

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [a38989b]
  - @memberjunction/ng-artifacts@2.109.0
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ai-core-plus@2.109.0
  - @memberjunction/ai-engine-base@2.109.0
  - @memberjunction/ng-base-types@2.109.0
  - @memberjunction/ng-code-editor@2.109.0
  - @memberjunction/ng-notifications@2.109.0
  - @memberjunction/ng-tasks@2.109.0
  - @memberjunction/graphql-dataprovider@2.109.0
  - @memberjunction/ai@2.109.0
  - @memberjunction/ng-container-directives@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- a4d545b: migration

### Patch Changes

- 687e2ae: UI Fixes for Conversation Artifacts and Refactoring of the Agent Embedding System
- Updated dependencies [d205a6c]
- Updated dependencies [656d86c]
  - @memberjunction/ai-core-plus@2.108.0
  - @memberjunction/ai@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/graphql-dataprovider@2.108.0
  - @memberjunction/ai-engine-base@2.108.0
  - @memberjunction/ng-artifacts@2.108.0
  - @memberjunction/ng-base-types@2.108.0
  - @memberjunction/ng-code-editor@2.108.0
  - @memberjunction/ng-notifications@2.108.0
  - @memberjunction/ng-tasks@2.108.0
  - @memberjunction/ng-container-directives@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Minor Changes

- effc77f: migration

### Patch Changes

- e2c4513: Fix Task Graph Execution 'Unknown Error' by Correcting GraphQL Response Parsing
  - @memberjunction/ai-engine-base@2.107.0
  - @memberjunction/ai@2.107.0
  - @memberjunction/ai-core-plus@2.107.0
  - @memberjunction/ng-artifacts@2.107.0
  - @memberjunction/ng-base-types@2.107.0
  - @memberjunction/ng-code-editor@2.107.0
  - @memberjunction/ng-container-directives@2.107.0
  - @memberjunction/ng-notifications@2.107.0
  - @memberjunction/ng-tasks@2.107.0
  - @memberjunction/graphql-dataprovider@2.107.0
  - @memberjunction/core@2.107.0
  - @memberjunction/core-entities@2.107.0
  - @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai-engine-base@2.106.0
- @memberjunction/ai@2.106.0
- @memberjunction/ai-core-plus@2.106.0
- @memberjunction/ng-artifacts@2.106.0
- @memberjunction/ng-base-types@2.106.0
- @memberjunction/ng-code-editor@2.106.0
- @memberjunction/ng-container-directives@2.106.0
- @memberjunction/ng-notifications@2.106.0
- @memberjunction/ng-tasks@2.106.0
- @memberjunction/graphql-dataprovider@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Minor Changes

- 5c2119c: migration

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [1d7a841]
- Updated dependencies [5c2119c]
- Updated dependencies [9b67e0c]
  - @memberjunction/ai-core-plus@2.105.0
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ai-engine-base@2.105.0
  - @memberjunction/ng-artifacts@2.105.0
  - @memberjunction/ai@2.105.0
  - @memberjunction/graphql-dataprovider@2.105.0
  - @memberjunction/ng-base-types@2.105.0
  - @memberjunction/ng-code-editor@2.105.0
  - @memberjunction/ng-notifications@2.105.0
  - @memberjunction/ng-tasks@2.105.0
  - @memberjunction/ng-container-directives@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Minor Changes

- 9ad6353: migrations

### Patch Changes

- 0d66490: tweaks on UI
- Updated dependencies [2ff5428]
- Updated dependencies [4567af3]
- Updated dependencies [9ad6353]
  - @memberjunction/global@2.104.0
  - @memberjunction/graphql-dataprovider@2.104.0
  - @memberjunction/ai-core-plus@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/ai-engine-base@2.104.0
  - @memberjunction/ai@2.104.0
  - @memberjunction/ng-base-types@2.104.0
  - @memberjunction/ng-code-editor@2.104.0
  - @memberjunction/ng-container-directives@2.104.0
  - @memberjunction/ng-notifications@2.104.0
  - @memberjunction/core@2.104.0
