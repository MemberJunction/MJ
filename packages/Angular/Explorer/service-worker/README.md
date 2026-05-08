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

### Backport for older versions: inline theme preload script

**MJExplorer ships this by default starting with the same release as this package** — new installs get instant correct theming for free, no action required.

If you're maintaining an older MJExplorer-based app (or a non-Explorer app that uses MJ's theme system) and want the same benefit, add the snippet below to your app's `src/index.html` inside `<head>`, anywhere before any stylesheets. We can't inject HTML into your `index.html` from an npm package, so this lives on the consumer side.

Without this, dark-mode users see a brief light-mode flash on every load before MJ's bootstrap code applies their saved theme. The Angular bootstrap path is too late to set the theme before first paint — the script must be inline in `<head>`.

```html
<script>
  (function () {
    try {
      var saved = localStorage.getItem('mj-theme');
      var isDark = saved
        ? saved === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
    } catch (e) { /* swallow — theme just falls back to light */ }
  })();
</script>
```

Reads `mj-theme`, the unified theme key written by:

- `ThemeService.applyBaseThemeAttribute()` post-login — mirrors the resolved base theme (`light` or `dark`), including the OS-resolved value for `'system'` preference
- `MJExplorerAppComponent.ToggleTheme()` when the user toggles theme on the login screen

The three readers (this inline script, `MJExplorerAppComponent.applyLoginTheme`, `ThemeService`) all share `mj-theme` as the single source of truth, so they paint in sync with no flash.

`mj-theme` is preserved across logout by `MJExplorerAuthBase.preservedLocalStorageKeys` so the login screen continues to show the user's last theme without flashing back to OS default.

Falls back to OS `prefers-color-scheme` on true first visits with no saved preference. Wrapped in try/catch so localStorage exceptions (Safari private mode, disabled storage) can never block app load.

Combined with the SW app-shell pre-cache, dark-mode users see correct theme paint within ~100ms of navigation start.

### Backport for older versions: build-time SW cache-shape gate

**MJExplorer ships this by default starting with the same release as this package** — new installs get the build-time defense automatically.

If you're maintaining an older MJExplorer-based app and want the same safety net, add the snippet below to your `package.json`. The gate guards against future Angular releases that introduce new build-output filename prefixes (`runtime-*`, `vendor-*`, etc.) that our `ngsw-config.json` doesn't classify. Without it, such a change would silently bypass the SW cache for those new files. The gate fails the build with a diagnostic listing the unrecognized filenames so the issue is caught at your build time, not in production.

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
