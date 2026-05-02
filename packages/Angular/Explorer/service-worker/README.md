# @memberjunction/ng-explorer-service-worker

Service worker app-shell pre-cache + update-notification toast for MJ Explorer-style apps.

## What this package gives you

- **`ngsw-config.json`** shipped at the package root — pre-tuned cache strategy (app-shell, lazy assets, GraphQL exclusions) that updates with `npm update`.
- **`MJServiceWorkerModule.forRoot({ enabled })`** — wraps `ServiceWorkerModule.register(...)` with sensible defaults (deferred registration so the SW doesn't fight initial boot for bandwidth).
- **`UpdateNotificationService`** — RxJS-friendly wrapper around `SwUpdate`.
- **`<mj-update-notification>`** — standalone toast component, MJ design tokens, OnPush.

If you're using `@memberjunction/ng-explorer-app`, `MJExplorerAppModule.forRoot(environment)` already wires this up internally. You only need to touch your shell directly if you're building a non-Explorer Angular app.

## Consumer setup

For a typical MJ Explorer-style app, you only edit two files:

### 1. `angular.json` — point the SW config at our shipped file

```json
{
  "projects": {
    "your-app": {
      "architect": {
        "build": {
          "configurations": {
            "production": {
              "serviceWorker": "node_modules/@memberjunction/ng-explorer-service-worker/ngsw-config.json"
            }
          }
        }
      }
    }
  }
}
```

### 2. `environment.ts` — opt-in kill switch

```typescript
export const environment = {
    production: true,
    enableServiceWorker: true,    // master kill switch — turn off in an emergency
    // ...
};
```

That's it. `MJExplorerAppModule.forRoot(environment)` reads `environment.enableServiceWorker` and turns the SW on when (and only when) `production && enableServiceWorker` are both true.

If you skip the angular.json edit, no `ngsw-worker.js` is built and the runtime registration silently no-ops. App behaves exactly as it does today.

## Optional consumer enhancements

These are recommended but not required. The SW works fine without them — they're polish items that depend on consumer-side files we can't reach from this npm package.

### Optional #1: Inline theme preload script (eliminates first-paint theme flash)

Without this, dark-mode users will see a brief light-mode flash on every load before MJ's bootstrap code applies their saved theme. The Angular bootstrap path is too late to set the theme before first paint — the script must be inline in `<head>` of `index.html`. Since we can't inject HTML into a consumer's `index.html` from an npm package, this lives on the consumer side.

Add to your app's `src/index.html` inside `<head>`, anywhere before any stylesheets:

```html
<script>
  (function () {
    try {
      var saved = localStorage.getItem('mj-login-theme');
      var isDark = saved
        ? saved === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
    } catch (e) { /* swallow — theme just falls back to light */ }
  })();
</script>
```

Reads the same `mj-login-theme` localStorage key that `MJExplorerAppComponent` writes when the user toggles theme. Falls back to OS `prefers-color-scheme`. Wrapped in try/catch so localStorage exceptions (Safari private mode, disabled storage) can never block app load.

Combined with the SW app-shell pre-cache, dark-mode users see correct theme paint within ~100ms of navigation start. Without it, the app still works — they just see a brief light flash.

### Optional #2: Build-time SW cache-shape gate

Optional safety net against future Angular releases that introduce new build-output filename prefixes (`runtime-*`, `vendor-*`, etc.) that our `ngsw-config.json` doesn't classify. Without this gate, such a change would silently bypass the SW cache for those new files. The gate fails the build with a diagnostic listing the unrecognized filenames so the issue is caught at consumer build time, not in production.

Add to your app's `package.json` scripts:

```json
{
  "scripts": {
    "postbuild": "node node_modules/@memberjunction/ng-explorer-service-worker/scripts/verify-sw-cache-shape.js dist/<your-app-name>/browser"
  }
}
```

Replace `<your-app-name>` with whatever Angular emits to (check your `angular.json` `outputPath`).

The script exits 0 when every root-level `.js` and `.css` file matches a known prefix (`main-`, `polyfills-`, `chunk-`, `styles-`) and ignores SW infrastructure files (`ngsw-worker.js`, `ngsw.json`, `safety-worker.js`, `worker-basic.min.js`). Exits 1 with a clear diagnostic on anything unrecognized.

Without this opt-in, the regression tests inside the SW package (`ngsw-config-shape.test.ts`, `verify-sw-cache-shape.test.ts`) still catch config-edit regressions at MJ-monorepo PR review time — but only consumer build-time invocation can catch downstream Angular naming changes.

## Manual wiring (non-Explorer apps)

If you're not using `MJExplorerAppModule`, wire it yourself:

```typescript
import { MJServiceWorkerModule } from '@memberjunction/ng-explorer-service-worker';

@NgModule({
    imports: [
        MJServiceWorkerModule.forRoot({
            enabled: environment.production && environment.enableServiceWorker
        })
    ]
})
export class AppModule {}
```

And drop the toast somewhere in your shell template:

```html
<mj-update-notification />
```

## How update notifications work

1. SW polls for new versions in the background (Angular default cadence).
2. When a new version is fully downloaded, `SwUpdate.versionUpdates` emits `VERSION_READY`.
3. `UpdateNotificationService` flips `updateAvailable$` to `true`.
4. `<mj-update-notification>` renders a bottom-right toast with **Reload** / **Later**.
5. **Reload** triggers `document.location.reload()`, which activates the new SW version.
6. **Later** dismisses for the session; next reload picks up the update naturally.

## Customization

To override the cache strategy for your app, copy `ngsw-config.json` into your repo and point `angular.json` at the local copy. You'll lose automatic updates to the cache rules but can tune freely.

## Ops runbook

See `docs/operations/SERVICE_WORKER_RUNBOOK.md` in the MJ repo for kill-switch procedures, cache invalidation, and rollback playbook.
