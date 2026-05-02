---
"@memberjunction/ng-explorer-service-worker": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-bootstrap": patch
---

Add service worker app-shell pre-cache for MJExplorer-style apps via new shipped package `@memberjunction/ng-explorer-service-worker`. Targets ~700ms perceived warm-load improvement by serving the JS/CSS/HTML shell from a local cache on subsequent visits.

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
