# @memberjunction/ng-bootstrap

## 5.34.0

### Patch Changes

- b03bfb4: Replace hardcoded colors with semantic design tokens across Angular components and shared styles, restoring correct dark-mode behavior and enabling white-labeling. Also maps the System Diagnostics PerfMon chrome (background, borders, text, controls) to MJ semantic tokens so the panel adapts to the active theme; series colors stay categorical.
- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [11ae7e6]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [ad61267]
- Updated dependencies [72cb92e]
- Updated dependencies [e13dd99]
  - @memberjunction/ng-core-entity-forms@5.34.0
  - @memberjunction/ng-dashboards@5.34.0
  - @memberjunction/ng-explorer-core@5.34.0
  - @memberjunction/ng-artifacts@5.34.0
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/ai-vectors-memory@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/ng-auth-services@5.34.0
  - @memberjunction/ng-explorer-settings@5.34.0
  - @memberjunction/ng-shared@5.34.0
  - @memberjunction/ng-dashboard-viewer@5.34.0
  - @memberjunction/ng-file-storage@5.34.0
  - @memberjunction/communication-types@5.34.0
  - @memberjunction/entity-communications-base@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/ng-explorer-core@5.33.0
  - @memberjunction/ng-dashboards@5.33.0
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/ng-core-entity-forms@5.33.0
  - @memberjunction/ng-explorer-settings@5.33.0
  - @memberjunction/ng-shared@5.33.0
  - @memberjunction/ng-artifacts@5.33.0
  - @memberjunction/ng-file-storage@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/ng-auth-services@5.33.0
  - @memberjunction/ng-dashboard-viewer@5.33.0
  - @memberjunction/communication-types@5.33.0
  - @memberjunction/entity-communications-base@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/ng-auth-services@5.32.0
  - @memberjunction/ng-core-entity-forms@5.32.0
  - @memberjunction/ng-dashboards@5.32.0
  - @memberjunction/ng-explorer-core@5.32.0
  - @memberjunction/ng-explorer-settings@5.32.0
  - @memberjunction/ng-shared@5.32.0
  - @memberjunction/ng-artifacts@5.32.0
  - @memberjunction/ng-dashboard-viewer@5.32.0
  - @memberjunction/ng-file-storage@5.32.0
  - @memberjunction/communication-types@5.32.0
  - @memberjunction/entity-communications-base@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/core-entities@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- cc2dea9: Add service worker app-shell pre-cache for MJExplorer-style apps via new shipped package `@memberjunction/ng-explorer-service-worker`. Targets ~700ms perceived warm-load improvement by serving the JS/CSS/HTML shell from a local cache on subsequent visits.

  **New package** `@memberjunction/ng-explorer-service-worker`:
  - `MJServiceWorkerModule.forRoot({ enabled, pollIntervalMs })` wraps `ServiceWorkerModule.register` with `registerWhenStable:30000`.
  - `UpdateNotificationService` — RxJS wrapper around `SwUpdate.versionUpdates`. Auto-polls every 15 minutes (default) while the tab is visible; suspends polling when hidden; fires an immediate check when the tab regains visibility. Exposes `window.__mjUpdateNotificationService__` debug hook for ops/QA console use.
  - `<mj-update-notification>` standalone toast — slide-up entrance, pulsing brand-tinted icon, two-line title/subtitle, "Reload now" + "Later" + × close. All MJ design tokens, `prefers-reduced-motion` aware.
  - `ngsw-config.json` shipped at the package root — pre-tuned (app-shell prefetch, lazy assets, GraphQL/auth/MSAL exclusions). Cache strategy updates flow to consumers via `npm update`.

  **Wired into `@memberjunction/ng-explorer-app`**: `MJExplorerAppModule.forRoot(environment)` now internally calls `MJServiceWorkerModule.forRoot({ enabled: production && enableServiceWorker })` and renders `<mj-update-notification />` in the shell. Consumers get SW + UI transparently — no `app.module.ts` / `app.component.ts` edits required. Adds `@memberjunction/ng-explorer-service-worker` as a regular dep (transitively pulls in `@angular/service-worker`).

  **Typed kill switch**: `enableServiceWorker?: boolean` added to `MJEnvironmentConfig` in `@memberjunction/ng-bootstrap` with JSDoc. When false (default) or `production: false`, no SW is registered — app behaves exactly as today. Combined gate is `production && enableServiceWorker`.

  **Consumer enablement (two opt-in edits, both required)**:
  1. `angular.json` production config: `"serviceWorker": "../../node_modules/@memberjunction/ng-explorer-service-worker/ngsw-config.json"`
  2. `environment.ts`: `enableServiceWorker: true`

  Either omitted = no SW. No code changes required in MJExplorer or any downstream consumer.

  **Safety**: Single-line kill switch in `environment.ts` plus removal of the `serviceWorker` line from `angular.json` fully disables the system. Worst-case incident response is one config flip + redeploy. Failure mode is bounded — users see the previous working version until reload.

  **Verified end-to-end locally** across multiple successive prod-build cycles: SW registration, asset caching, manifest detection on tab refocus, manual `checkForUpdate()` from console, downloaded-version waiting state, reload-to-activate, wipe-and-reinstall recovery. 11 unit tests cover the service. See plan doc `plans/service-worker-app-shell.md` for design rationale, mermaid diagrams, and honest pros/cons review.

  Remaining work (post-merge, tracked in plan doc): ops runbook, cross-browser smoke (Safari iOS, Firefox, Edge), staged production rollout, copy cleanup of `(test build #N)` markers left in toast text from verification cycles.

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
  - @memberjunction/ng-dashboards@5.31.0
  - @memberjunction/ng-core-entity-forms@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/ng-auth-services@5.31.0
  - @memberjunction/ng-explorer-core@5.31.0
  - @memberjunction/ng-explorer-settings@5.31.0
  - @memberjunction/ng-shared@5.31.0
  - @memberjunction/ng-artifacts@5.31.0
  - @memberjunction/ng-dashboard-viewer@5.31.0
  - @memberjunction/ng-file-storage@5.31.0
  - @memberjunction/communication-types@5.31.0
  - @memberjunction/entity-communications-base@5.31.0
  - @memberjunction/core@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/ng-auth-services@5.30.1
- @memberjunction/ng-core-entity-forms@5.30.1
- @memberjunction/ng-dashboards@5.30.1
- @memberjunction/ng-explorer-core@5.30.1
- @memberjunction/ng-explorer-settings@5.30.1
- @memberjunction/ng-shared@5.30.1
- @memberjunction/ng-artifacts@5.30.1
- @memberjunction/ng-dashboard-viewer@5.30.1
- @memberjunction/ng-file-storage@5.30.1
- @memberjunction/communication-types@5.30.1
- @memberjunction/entity-communications-base@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1

## 5.30.0

### Patch Changes

- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.
- Updated dependencies [735a618]
- Updated dependencies [8980b38]
- Updated dependencies [c2c5892]
- Updated dependencies [11df18d]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [a00af98]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/ng-dashboards@5.30.0
  - @memberjunction/ng-core-entity-forms@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/ng-dashboard-viewer@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/ng-artifacts@5.30.0
  - @memberjunction/ng-explorer-core@5.30.0
  - @memberjunction/ng-explorer-settings@5.30.0
  - @memberjunction/ng-shared@5.30.0
  - @memberjunction/ng-file-storage@5.30.0
  - @memberjunction/communication-types@5.30.0
  - @memberjunction/entity-communications-base@5.30.0
  - @memberjunction/ng-auth-services@5.30.0

## 5.29.0

### Patch Changes

- 5c7a57f: Add in-app feedback system with mj-dialog UI, GitHub App authentication for issue creation, and shell header integration. Feedback submissions create formatted GitHub issues with labels, severity, environment info, and browser details.
- Updated dependencies [5c7a57f]
- Updated dependencies [e02e24e]
- Updated dependencies [5585961]
- Updated dependencies [7006276]
- Updated dependencies [90a0fec]
  - @memberjunction/ng-explorer-core@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/ng-dashboards@5.29.0
  - @memberjunction/ng-core-entity-forms@5.29.0
  - @memberjunction/ng-file-storage@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/ng-auth-services@5.29.0
  - @memberjunction/ng-explorer-settings@5.29.0
  - @memberjunction/ng-shared@5.29.0
  - @memberjunction/ng-artifacts@5.29.0
  - @memberjunction/ng-dashboard-viewer@5.29.0
  - @memberjunction/communication-types@5.29.0
  - @memberjunction/entity-communications-base@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [2542615]
- Updated dependencies [115e4da]
  - @memberjunction/ng-dashboards@5.28.0
  - @memberjunction/ng-shared@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-explorer-core@5.28.0
  - @memberjunction/ng-core-entity-forms@5.28.0
  - @memberjunction/ng-explorer-settings@5.28.0
  - @memberjunction/ng-file-storage@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/ng-auth-services@5.28.0
  - @memberjunction/ng-artifacts@5.28.0
  - @memberjunction/ng-dashboard-viewer@5.28.0
  - @memberjunction/communication-types@5.28.0
  - @memberjunction/entity-communications-base@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/ng-dashboard-viewer@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/ng-explorer-core@5.27.1
  - @memberjunction/ai-engine-base@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/ng-auth-services@5.27.1
  - @memberjunction/ng-core-entity-forms@5.27.1
  - @memberjunction/ng-dashboards@5.27.1
  - @memberjunction/ng-explorer-settings@5.27.1
  - @memberjunction/ng-shared@5.27.1
  - @memberjunction/ng-artifacts@5.27.1
  - @memberjunction/ng-file-storage@5.27.1
  - @memberjunction/communication-types@5.27.1
  - @memberjunction/entity-communications-base@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [348decb]
- Updated dependencies [4357090]
- Updated dependencies [6fd2886]
  - @memberjunction/ng-dashboards@5.27.0
  - @memberjunction/ng-explorer-core@5.27.0
  - @memberjunction/ng-core-entity-forms@5.27.0
  - @memberjunction/ng-artifacts@5.27.0
  - @memberjunction/ng-dashboard-viewer@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/ng-auth-services@5.27.0
  - @memberjunction/ng-explorer-settings@5.27.0
  - @memberjunction/ng-shared@5.27.0
  - @memberjunction/ng-file-storage@5.27.0
  - @memberjunction/communication-types@5.27.0
  - @memberjunction/entity-communications-base@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-core-entity-forms@5.26.0
  - @memberjunction/ng-dashboard-viewer@5.26.0
  - @memberjunction/ng-dashboards@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/ng-explorer-core@5.26.0
  - @memberjunction/ng-explorer-settings@5.26.0
  - @memberjunction/ng-shared@5.26.0
  - @memberjunction/ng-artifacts@5.26.0
  - @memberjunction/ng-file-storage@5.26.0
  - @memberjunction/communication-types@5.26.0
  - @memberjunction/entity-communications-base@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/ng-auth-services@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [a24ff53]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [5e2a64f]
- Updated dependencies [1eb9f6e]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/ng-core-entity-forms@5.25.0
  - @memberjunction/ng-dashboards@5.25.0
  - @memberjunction/ng-explorer-core@5.25.0
  - @memberjunction/ng-dashboard-viewer@5.25.0
  - @memberjunction/ng-artifacts@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/ng-auth-services@5.25.0
  - @memberjunction/ng-explorer-settings@5.25.0
  - @memberjunction/ng-shared@5.25.0
  - @memberjunction/ng-file-storage@5.25.0
  - @memberjunction/communication-types@5.25.0
  - @memberjunction/entity-communications-base@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [3a35955]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ng-explorer-core@5.24.0
  - @memberjunction/graphql-dataprovider@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-auth-services@5.24.0
  - @memberjunction/ng-dashboards@5.24.0
  - @memberjunction/ng-artifacts@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/ng-core-entity-forms@5.24.0
  - @memberjunction/ng-explorer-settings@5.24.0
  - @memberjunction/ng-shared@5.24.0
  - @memberjunction/ng-file-storage@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/ng-dashboard-viewer@5.24.0
  - @memberjunction/communication-types@5.24.0
  - @memberjunction/entity-communications-base@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/ng-dashboards@5.23.0
  - @memberjunction/ng-explorer-core@5.23.0
  - @memberjunction/ng-artifacts@5.23.0
  - @memberjunction/ng-dashboard-viewer@5.23.0
  - @memberjunction/graphql-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/ng-auth-services@5.23.0
  - @memberjunction/ng-core-entity-forms@5.23.0
  - @memberjunction/ng-explorer-settings@5.23.0
  - @memberjunction/ng-shared@5.23.0
  - @memberjunction/ng-file-storage@5.23.0
  - @memberjunction/communication-types@5.23.0
  - @memberjunction/entity-communications-base@5.23.0

## 5.22.0

### Minor Changes

- a42aba6: metadata

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [e89c3bc]
- Updated dependencies [e5993ff]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ng-dashboards@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ng-explorer-core@5.22.0
  - @memberjunction/ng-artifacts@5.22.0
  - @memberjunction/ng-dashboard-viewer@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/ng-core-entity-forms@5.22.0
  - @memberjunction/graphql-dataprovider@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/ng-auth-services@5.22.0
  - @memberjunction/ng-explorer-settings@5.22.0
  - @memberjunction/ng-shared@5.22.0
  - @memberjunction/ng-file-storage@5.22.0
  - @memberjunction/communication-types@5.22.0
  - @memberjunction/entity-communications-base@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/ng-auth-services@5.21.0
  - @memberjunction/ng-core-entity-forms@5.21.0
  - @memberjunction/ng-dashboards@5.21.0
  - @memberjunction/ng-explorer-core@5.21.0
  - @memberjunction/ng-explorer-settings@5.21.0
  - @memberjunction/ng-shared@5.21.0
  - @memberjunction/ng-artifacts@5.21.0
  - @memberjunction/ng-dashboard-viewer@5.21.0
  - @memberjunction/ng-file-storage@5.21.0
  - @memberjunction/communication-types@5.21.0
  - @memberjunction/entity-communications-base@5.21.0
  - @memberjunction/graphql-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/ng-auth-services@5.20.0
  - @memberjunction/ng-core-entity-forms@5.20.0
  - @memberjunction/ng-dashboards@5.20.0
  - @memberjunction/ng-explorer-core@5.20.0
  - @memberjunction/ng-explorer-settings@5.20.0
  - @memberjunction/ng-shared@5.20.0
  - @memberjunction/ng-artifacts@5.20.0
  - @memberjunction/ng-dashboard-viewer@5.20.0
  - @memberjunction/ng-file-storage@5.20.0
  - @memberjunction/communication-types@5.20.0
  - @memberjunction/entity-communications-base@5.20.0
  - @memberjunction/graphql-dataprovider@5.20.0
  - @memberjunction/core-entities@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/ng-auth-services@5.19.0
- @memberjunction/ng-core-entity-forms@5.19.0
- @memberjunction/ng-dashboards@5.19.0
- @memberjunction/ng-explorer-core@5.19.0
- @memberjunction/ng-explorer-settings@5.19.0
- @memberjunction/ng-shared@5.19.0
- @memberjunction/ng-artifacts@5.19.0
- @memberjunction/ng-dashboard-viewer@5.19.0
- @memberjunction/ng-file-storage@5.19.0
- @memberjunction/communication-types@5.19.0
- @memberjunction/entity-communications-base@5.19.0
- @memberjunction/graphql-dataprovider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0

## 5.18.0

### Patch Changes

- 931740a: Fix SQLParser to extract parameters from Jinja2 control flow conditions ({% if %}/{% elif %}) and remove hardcoded golden-queries reusability check from QueryEntityServer.
- Updated dependencies [322dac6]
- Updated dependencies [ee4bf94]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ng-core-entity-forms@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/ng-dashboards@5.18.0
  - @memberjunction/ng-explorer-core@5.18.0
  - @memberjunction/graphql-dataprovider@5.18.0
  - @memberjunction/ng-artifacts@5.18.0
  - @memberjunction/ng-shared@5.18.0
  - @memberjunction/ng-explorer-settings@5.18.0
  - @memberjunction/ng-file-storage@5.18.0
  - @memberjunction/ng-dashboard-viewer@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/ng-auth-services@5.18.0
  - @memberjunction/communication-types@5.18.0
  - @memberjunction/entity-communications-base@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [001fd3e]
- Updated dependencies [9881045]
  - @memberjunction/graphql-dataprovider@5.17.0
  - @memberjunction/ng-core-entity-forms@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-dashboards@5.17.0
  - @memberjunction/ng-explorer-core@5.17.0
  - @memberjunction/ng-explorer-settings@5.17.0
  - @memberjunction/ng-shared@5.17.0
  - @memberjunction/ng-file-storage@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/ng-auth-services@5.17.0
  - @memberjunction/ng-artifacts@5.17.0
  - @memberjunction/ng-dashboard-viewer@5.17.0
  - @memberjunction/communication-types@5.17.0
  - @memberjunction/entity-communications-base@5.17.0
  - @memberjunction/core-entities@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [179a4ce]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/graphql-dataprovider@5.16.0
  - @memberjunction/ai-engine-base@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/ng-auth-services@5.16.0
  - @memberjunction/ng-core-entity-forms@5.16.0
  - @memberjunction/ng-dashboards@5.16.0
  - @memberjunction/ng-explorer-core@5.16.0
  - @memberjunction/ng-explorer-settings@5.16.0
  - @memberjunction/ng-shared@5.16.0
  - @memberjunction/ng-artifacts@5.16.0
  - @memberjunction/ng-dashboard-viewer@5.16.0
  - @memberjunction/ng-file-storage@5.16.0
  - @memberjunction/communication-types@5.16.0
  - @memberjunction/entity-communications-base@5.16.0
  - @memberjunction/core-entities@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/ng-core-entity-forms@5.15.0
  - @memberjunction/core@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ng-dashboards@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/ng-auth-services@5.15.0
  - @memberjunction/ng-explorer-core@5.15.0
  - @memberjunction/ng-explorer-settings@5.15.0
  - @memberjunction/ng-shared@5.15.0
  - @memberjunction/ng-artifacts@5.15.0
  - @memberjunction/ng-dashboard-viewer@5.15.0
  - @memberjunction/ng-file-storage@5.15.0
  - @memberjunction/communication-types@5.15.0
  - @memberjunction/entity-communications-base@5.15.0
  - @memberjunction/graphql-dataprovider@5.15.0
  - @memberjunction/core-entities@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [8fe1124]
- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/ng-auth-services@5.14.0
  - @memberjunction/core@5.14.0
  - @memberjunction/graphql-dataprovider@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/ng-explorer-core@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/ng-core-entity-forms@5.14.0
  - @memberjunction/ng-dashboards@5.14.0
  - @memberjunction/ng-explorer-settings@5.14.0
  - @memberjunction/ng-shared@5.14.0
  - @memberjunction/ng-artifacts@5.14.0
  - @memberjunction/ng-dashboard-viewer@5.14.0
  - @memberjunction/ng-file-storage@5.14.0
  - @memberjunction/communication-types@5.14.0
  - @memberjunction/entity-communications-base@5.14.0
  - @memberjunction/core-entities@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [1bb9b86]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/ng-core-entity-forms@5.13.0
  - @memberjunction/ng-explorer-core@5.13.0
  - @memberjunction/ng-dashboards@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/ng-auth-services@5.13.0
  - @memberjunction/ng-explorer-settings@5.13.0
  - @memberjunction/ng-shared@5.13.0
  - @memberjunction/ng-artifacts@5.13.0
  - @memberjunction/ng-dashboard-viewer@5.13.0
  - @memberjunction/ng-file-storage@5.13.0
  - @memberjunction/communication-types@5.13.0
  - @memberjunction/entity-communications-base@5.13.0
  - @memberjunction/graphql-dataprovider@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Minor Changes

- 1e5d181: migration

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- 7def002: Fix ExternalChangeDetection unquoted string IDs and log spam, add /healthcheck endpoint before auth middleware, return TechnicalDescription in CreateQuery/UpdateQuery mutations, and improve MJCLI config validation errors with env var hints
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-artifacts@5.12.0
  - @memberjunction/ng-core-entity-forms@5.12.0
  - @memberjunction/ng-dashboards@5.12.0
  - @memberjunction/ng-explorer-core@5.12.0
  - @memberjunction/ng-explorer-settings@5.12.0
  - @memberjunction/ng-dashboard-viewer@5.12.0
  - @memberjunction/ng-file-storage@5.12.0
  - @memberjunction/graphql-dataprovider@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/ng-auth-services@5.12.0
  - @memberjunction/ng-shared@5.12.0
  - @memberjunction/communication-types@5.12.0
  - @memberjunction/entity-communications-base@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
- Updated dependencies [fc2bd47]
- Updated dependencies [457afcf]
  - @memberjunction/graphql-dataprovider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-explorer-core@5.11.0
  - @memberjunction/ng-core-entity-forms@5.11.0
  - @memberjunction/ng-dashboards@5.11.0
  - @memberjunction/ng-artifacts@5.11.0
  - @memberjunction/ng-dashboard-viewer@5.11.0
  - @memberjunction/ng-explorer-settings@5.11.0
  - @memberjunction/ng-shared@5.11.0
  - @memberjunction/ng-file-storage@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/ng-auth-services@5.11.0
  - @memberjunction/communication-types@5.11.0
  - @memberjunction/entity-communications-base@5.11.0
  - @memberjunction/core-entities@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/ng-auth-services@5.10.1
- @memberjunction/ng-core-entity-forms@5.10.1
- @memberjunction/ng-dashboards@5.10.1
- @memberjunction/ng-explorer-core@5.10.1
- @memberjunction/ng-explorer-settings@5.10.1
- @memberjunction/ng-shared@5.10.1
- @memberjunction/ng-artifacts@5.10.1
- @memberjunction/ng-dashboard-viewer@5.10.1
- @memberjunction/ng-file-storage@5.10.1
- @memberjunction/communication-types@5.10.1
- @memberjunction/entity-communications-base@5.10.1
- @memberjunction/graphql-dataprovider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [3df5e4b]
- Updated dependencies [4e298b7]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-core-entity-forms@5.10.0
  - @memberjunction/ng-dashboards@5.10.0
  - @memberjunction/graphql-dataprovider@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/ng-auth-services@5.10.0
  - @memberjunction/ng-explorer-core@5.10.0
  - @memberjunction/ng-explorer-settings@5.10.0
  - @memberjunction/ng-shared@5.10.0
  - @memberjunction/ng-artifacts@5.10.0
  - @memberjunction/ng-dashboard-viewer@5.10.0
  - @memberjunction/ng-file-storage@5.10.0
  - @memberjunction/communication-types@5.10.0
  - @memberjunction/entity-communications-base@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-engine-base@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/ng-core-entity-forms@5.9.0
  - @memberjunction/ng-dashboards@5.9.0
  - @memberjunction/ng-explorer-core@5.9.0
  - @memberjunction/ng-explorer-settings@5.9.0
  - @memberjunction/ng-shared@5.9.0
  - @memberjunction/ng-artifacts@5.9.0
  - @memberjunction/ng-dashboard-viewer@5.9.0
  - @memberjunction/ng-file-storage@5.9.0
  - @memberjunction/communication-types@5.9.0
  - @memberjunction/entity-communications-base@5.9.0
  - @memberjunction/graphql-dataprovider@5.9.0
  - @memberjunction/ng-auth-services@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [de9f2c0]
- Updated dependencies [0753249]
  - @memberjunction/graphql-dataprovider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-core-entity-forms@5.8.0
  - @memberjunction/ng-dashboards@5.8.0
  - @memberjunction/ng-explorer-core@5.8.0
  - @memberjunction/ng-explorer-settings@5.8.0
  - @memberjunction/ng-shared@5.8.0
  - @memberjunction/ng-file-storage@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/ng-auth-services@5.8.0
  - @memberjunction/ng-artifacts@5.8.0
  - @memberjunction/ng-dashboard-viewer@5.8.0
  - @memberjunction/communication-types@5.8.0
  - @memberjunction/entity-communications-base@5.8.0
  - @memberjunction/core-entities@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ng-artifacts@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/ng-core-entity-forms@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-explorer-core@5.7.0
  - @memberjunction/ng-dashboard-viewer@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/ng-auth-services@5.7.0
  - @memberjunction/ng-dashboards@5.7.0
  - @memberjunction/ng-explorer-settings@5.7.0
  - @memberjunction/ng-shared@5.7.0
  - @memberjunction/ng-file-storage@5.7.0
  - @memberjunction/communication-types@5.7.0
  - @memberjunction/entity-communications-base@5.7.0
  - @memberjunction/graphql-dataprovider@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [d24a7ff]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-explorer-core@5.6.0
  - @memberjunction/ng-dashboards@5.6.0
  - @memberjunction/graphql-dataprovider@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/ng-auth-services@5.6.0
  - @memberjunction/ng-core-entity-forms@5.6.0
  - @memberjunction/ng-explorer-settings@5.6.0
  - @memberjunction/ng-shared@5.6.0
  - @memberjunction/ng-artifacts@5.6.0
  - @memberjunction/ng-dashboard-viewer@5.6.0
  - @memberjunction/ng-file-storage@5.6.0
  - @memberjunction/communication-types@5.6.0
  - @memberjunction/entity-communications-base@5.6.0
  - @memberjunction/core-entities@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
- Updated dependencies [6421543]
  - @memberjunction/core@5.5.0
  - @memberjunction/graphql-dataprovider@5.5.0
  - @memberjunction/ng-core-entity-forms@5.5.0
  - @memberjunction/ng-explorer-core@5.5.0
  - @memberjunction/ng-dashboards@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/ng-auth-services@5.5.0
  - @memberjunction/ng-explorer-settings@5.5.0
  - @memberjunction/ng-shared@5.5.0
  - @memberjunction/ng-artifacts@5.5.0
  - @memberjunction/ng-dashboard-viewer@5.5.0
  - @memberjunction/ng-file-storage@5.5.0
  - @memberjunction/communication-types@5.5.0
  - @memberjunction/entity-communications-base@5.5.0

## 5.4.1

### Patch Changes

- Updated dependencies [8789e86]
  - @memberjunction/ng-shared@5.4.1
  - @memberjunction/ng-core-entity-forms@5.4.1
  - @memberjunction/ng-explorer-core@5.4.1
  - @memberjunction/ng-explorer-settings@5.4.1
  - @memberjunction/ng-dashboards@5.4.1
  - @memberjunction/ng-file-storage@5.4.1
  - @memberjunction/ai-engine-base@5.4.1
  - @memberjunction/ai-core-plus@5.4.1
  - @memberjunction/actions-base@5.4.1
  - @memberjunction/ng-auth-services@5.4.1
  - @memberjunction/ng-artifacts@5.4.1
  - @memberjunction/ng-dashboard-viewer@5.4.1
  - @memberjunction/communication-types@5.4.1
  - @memberjunction/entity-communications-base@5.4.1
  - @memberjunction/graphql-dataprovider@5.4.1
  - @memberjunction/core@5.4.1
  - @memberjunction/core-entities@5.4.1

## 5.4.0

### Patch Changes

- c9a760c: no migration
- Updated dependencies [439129c]
- Updated dependencies [8a11457]
- Updated dependencies [c9a760c]
- Updated dependencies [081d657]
- Updated dependencies [6bcfa1c]
  - @memberjunction/ng-dashboards@5.4.0
  - @memberjunction/graphql-dataprovider@5.4.0
  - @memberjunction/ng-core-entity-forms@5.4.0
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-explorer-settings@5.4.0
  - @memberjunction/ng-explorer-core@5.4.0
  - @memberjunction/ng-shared@5.4.0
  - @memberjunction/ng-file-storage@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/ng-artifacts@5.4.0
  - @memberjunction/ng-dashboard-viewer@5.4.0
  - @memberjunction/communication-types@5.4.0
  - @memberjunction/entity-communications-base@5.4.0
  - @memberjunction/ng-auth-services@5.4.0
  - @memberjunction/core@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/ng-auth-services@5.3.1
- @memberjunction/ng-core-entity-forms@5.3.1
- @memberjunction/ng-dashboards@5.3.1
- @memberjunction/ng-explorer-core@5.3.1
- @memberjunction/ng-explorer-settings@5.3.1
- @memberjunction/ng-shared@5.3.1
- @memberjunction/ng-artifacts@5.3.1
- @memberjunction/ng-dashboard-viewer@5.3.1
- @memberjunction/ng-file-storage@5.3.1
- @memberjunction/communication-types@5.3.1
- @memberjunction/entity-communications-base@5.3.1
- @memberjunction/graphql-dataprovider@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [a6aea29]
- Updated dependencies [1692c53]
- Updated dependencies [7af1846]
  - @memberjunction/graphql-dataprovider@5.3.0
  - @memberjunction/ng-dashboards@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-artifacts@5.3.0
  - @memberjunction/ng-explorer-core@5.3.0
  - @memberjunction/ng-core-entity-forms@5.3.0
  - @memberjunction/ng-explorer-settings@5.3.0
  - @memberjunction/ng-shared@5.3.0
  - @memberjunction/ng-file-storage@5.3.0
  - @memberjunction/ng-dashboard-viewer@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/communication-types@5.3.0
  - @memberjunction/entity-communications-base@5.3.0
  - @memberjunction/ng-auth-services@5.3.0
  - @memberjunction/core@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/graphql-dataprovider@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/ng-core-entity-forms@5.2.0
  - @memberjunction/ng-dashboards@5.2.0
  - @memberjunction/ng-explorer-core@5.2.0
  - @memberjunction/ng-explorer-settings@5.2.0
  - @memberjunction/ng-shared@5.2.0
  - @memberjunction/ng-dashboard-viewer@5.2.0
  - @memberjunction/communication-types@5.2.0
  - @memberjunction/entity-communications-base@5.2.0
  - @memberjunction/ng-artifacts@5.2.0
  - @memberjunction/ng-file-storage@5.2.0
  - @memberjunction/ng-auth-services@5.2.0

## 5.1.0

### Patch Changes

- f426d43: Fix CodeGen to apply excludeSchemas filter consistently across all generators (TypeScript, Angular, GraphQL), not just SQL generation. Also adds cleanup for orphaned Angular entity form directories when entities are renamed or deleted.
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/ng-auth-services@5.1.0
  - @memberjunction/ng-core-entity-forms@5.1.0
  - @memberjunction/ng-dashboards@5.1.0
  - @memberjunction/ng-explorer-core@5.1.0
  - @memberjunction/ng-explorer-settings@5.1.0
  - @memberjunction/ng-shared@5.1.0
  - @memberjunction/ng-artifacts@5.1.0
  - @memberjunction/ng-dashboard-viewer@5.1.0
  - @memberjunction/ng-file-storage@5.1.0
  - @memberjunction/communication-types@5.1.0
  - @memberjunction/entity-communications-base@5.1.0
  - @memberjunction/graphql-dataprovider@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- 786a390: Remove explicit 3.0 references in several areas
- Updated dependencies [3cca644]
- Updated dependencies [786a390]
- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/ng-dashboards@5.0.0
  - @memberjunction/communication-types@5.0.0
  - @memberjunction/graphql-dataprovider@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/ng-auth-services@5.0.0
  - @memberjunction/ng-core-entity-forms@5.0.0
  - @memberjunction/ng-explorer-core@5.0.0
  - @memberjunction/ng-explorer-settings@5.0.0
  - @memberjunction/ng-shared@5.0.0
  - @memberjunction/ng-artifacts@5.0.0
  - @memberjunction/ng-dashboard-viewer@5.0.0
  - @memberjunction/ng-file-storage@5.0.0
  - @memberjunction/entity-communications-base@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/ng-auth-services@4.4.0
  - @memberjunction/ng-core-entity-forms@4.4.0
  - @memberjunction/ng-dashboards@4.4.0
  - @memberjunction/ng-explorer-core@4.4.0
  - @memberjunction/ng-explorer-settings@4.4.0
  - @memberjunction/ng-shared@4.4.0
  - @memberjunction/ng-artifacts@4.4.0
  - @memberjunction/ng-dashboard-viewer@4.4.0
  - @memberjunction/ng-file-storage@4.4.0
  - @memberjunction/communication-types@4.4.0
  - @memberjunction/entity-communications-base@4.4.0
  - @memberjunction/graphql-dataprovider@4.4.0
  - @memberjunction/core-entities@4.4.0

## 4.3.1

### Patch Changes

- f1b4a98: Restore singleton packages as regular dependencies in Angular Bootstrap and Explorer packages, and fix false positive error detection in CLI migrate command.
- Updated dependencies [f1b4a98]
  - @memberjunction/ng-auth-services@4.3.1
  - @memberjunction/ng-explorer-core@4.3.1
  - @memberjunction/ng-core-entity-forms@4.3.1
  - @memberjunction/ng-explorer-settings@4.3.1
  - @memberjunction/ng-dashboards@4.3.1
  - @memberjunction/ai-engine-base@4.3.1
  - @memberjunction/ai-core-plus@4.3.1
  - @memberjunction/actions-base@4.3.1
  - @memberjunction/ng-shared@4.3.1
  - @memberjunction/ng-artifacts@4.3.1
  - @memberjunction/ng-dashboard-viewer@4.3.1
  - @memberjunction/ng-file-storage@4.3.1
  - @memberjunction/communication-types@4.3.1
  - @memberjunction/entity-communications-base@4.3.1
  - @memberjunction/graphql-dataprovider@4.3.1
  - @memberjunction/core@4.3.1
  - @memberjunction/core-entities@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/graphql-dataprovider@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-core-entity-forms@4.3.0
  - @memberjunction/ng-dashboards@4.3.0
  - @memberjunction/ng-explorer-core@4.3.0
  - @memberjunction/ng-explorer-settings@4.3.0
  - @memberjunction/ng-shared@4.3.0
  - @memberjunction/ng-file-storage@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/ng-artifacts@4.3.0
  - @memberjunction/ng-dashboard-viewer@4.3.0
  - @memberjunction/communication-types@4.3.0
  - @memberjunction/entity-communications-base@4.3.0

## 4.2.0

### Patch Changes

- Updated dependencies [d2938db]
  - @memberjunction/ng-auth-services@4.2.0
  - @memberjunction/ng-explorer-core@4.2.0
  - @memberjunction/ai-engine-base@4.2.0
  - @memberjunction/ai-core-plus@4.2.0
  - @memberjunction/actions-base@4.2.0
  - @memberjunction/ng-core-entity-forms@4.2.0
  - @memberjunction/ng-dashboards@4.2.0
  - @memberjunction/ng-explorer-settings@4.2.0
  - @memberjunction/ng-shared@4.2.0
  - @memberjunction/ng-artifacts@4.2.0
  - @memberjunction/ng-dashboard-viewer@4.2.0
  - @memberjunction/ng-file-storage@4.2.0
  - @memberjunction/communication-types@4.2.0
  - @memberjunction/entity-communications-base@4.2.0
  - @memberjunction/graphql-dataprovider@4.2.0
  - @memberjunction/core@4.2.0
  - @memberjunction/core-entities@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/ng-core-entity-forms@4.1.0
  - @memberjunction/ng-dashboards@4.1.0
  - @memberjunction/ng-explorer-core@4.1.0
  - @memberjunction/ng-explorer-settings@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/ng-auth-services@4.1.0
  - @memberjunction/ng-shared@4.1.0
  - @memberjunction/ng-artifacts@4.1.0
  - @memberjunction/ng-dashboard-viewer@4.1.0
  - @memberjunction/ng-file-storage@4.1.0
  - @memberjunction/communication-types@4.1.0
  - @memberjunction/entity-communications-base@4.1.0
  - @memberjunction/graphql-dataprovider@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 7aa23e7: 4.0
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [2f86270]
- Updated dependencies [4723079]
- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [0a0cda1]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-dashboards@4.0.0
  - @memberjunction/ng-core-entity-forms@4.0.0
  - @memberjunction/graphql-dataprovider@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/ng-auth-services@4.0.0
  - @memberjunction/ng-explorer-core@4.0.0
  - @memberjunction/ng-explorer-settings@4.0.0
  - @memberjunction/ng-shared@4.0.0
  - @memberjunction/ng-artifacts@4.0.0
  - @memberjunction/ng-dashboard-viewer@4.0.0
  - @memberjunction/ng-file-storage@4.0.0
  - @memberjunction/communication-types@4.0.0
  - @memberjunction/entity-communications-base@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0

## 3.4.0

### Patch Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values
- Updated dependencies [a3961d5]
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-shared@3.4.0
  - @memberjunction/graphql-dataprovider@3.4.0
  - @memberjunction/ng-auth-services@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ng-shared@3.3.0
- @memberjunction/graphql-dataprovider@3.3.0
- @memberjunction/ng-auth-services@3.3.0
- @memberjunction/core@3.3.0

## 3.2.0

### Patch Changes

- 470bc9d: Fix npm deployment issue with Angular/Bootstrap package
- Updated dependencies [6806a6c]
  - @memberjunction/graphql-dataprovider@3.2.0
  - @memberjunction/ng-shared@3.2.0
  - @memberjunction/ng-auth-services@3.2.0
  - @memberjunction/core@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [8c0b624]
  - @memberjunction/graphql-dataprovider@3.1.1
  - @memberjunction/ng-shared@3.1.1
  - @memberjunction/ng-auth-services@3.1.1
  - @memberjunction/core@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ng-auth-services@3.0.0
- @memberjunction/ng-shared@3.0.0
- @memberjunction/graphql-dataprovider@3.0.0
- @memberjunction/core@3.0.0
