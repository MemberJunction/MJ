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
