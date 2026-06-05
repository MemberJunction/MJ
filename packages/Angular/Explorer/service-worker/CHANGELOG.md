# @memberjunction/ng-explorer-service-worker

## 5.39.0

## 5.38.0

## 5.37.0

## 5.36.0

## 5.35.0

## 5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

## 5.33.0

## 5.32.0

## 5.31.0

### Patch Changes

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

- 0e3365f: Unify the theme storage system to a single localStorage key (`mj-theme`) and eliminate the brief light-mode flash dark-mode users saw on every page load.

  **Root cause of the original flash:** the inline pre-paint script in `index.html` correctly set `data-theme` on first paint based on the user's preference, but `MJExplorerAppComponent.applyLoginTheme()` then ran during Angular bootstrap and re-read a _different_ localStorage key (`'mj-login-theme'`), overriding the script's correct decision before `ThemeService` eventually overrode it back. Result: visible flash on every reload.

  **Fix:** all three theme-aware paths now read/write the same `mj-theme` key.

  `@memberjunction/ng-shared-generic`:
  - `ThemeService.applyBaseThemeAttribute()` mirrors the resolved base theme (`light` or `dark`) to `localStorage['mj-theme']` on every theme application — including initial load from server preference, manual `SetTheme()` calls, and OS-change responses for `'system'` preference. The mirrored value is the _resolved_ base, so the inline pre-paint script can apply the right theme synchronously without needing to read server preference or evaluate `'system'`.
  - `ThemeService.Reset()` deliberately preserves the key (commented why) so the login screen retains the correct theme through logout.

  `@memberjunction/ng-auth-services`:
  - `MJExplorerAuthBase.preservedLocalStorageKeys` now contains `'mj-theme'` (was `'mj-login-theme'`) so the unified key survives logout.

  `@memberjunction/ng-explorer-app`:
  - `MJExplorerAppComponent.THEME_STORAGE_KEY` changed from `'mj-login-theme'` to `'mj-theme'`. The login-screen toggle (`ToggleTheme()`) now writes the unified key. `applyLoginTheme()` reads the unified key with the same lookup the inline script uses, so Angular bootstrap doesn't override the script's decision.

  `@memberjunction/ng-explorer-service-worker`:
  - README backport snippet updated to read only `mj-theme`.

  **Migration impact:** Users with `mj-theme` already populated (most logged-in users after the previous Option B work) see zero impact and instant correct theme on every reload. Users with only the legacy `mj-login-theme` from older versions see one flash on their first visit after this lands; `ThemeService` then writes `mj-theme` on next theme application and they're flash-free forever after. The legacy fallback read was deliberately dropped for code simplicity — the one-time migration flash is an acceptable cost.

  Verified end-to-end via Playwright in a logged-in browser session against a production build: `data-theme` is correctly set at `DOMContentLoaded` and stays consistent through Angular bootstrap. No flash observed. Logout/preserve unit tests in `@memberjunction/ng-auth-services` updated and all 5 pass.
