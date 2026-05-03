import { NgModule, ModuleWithProviders } from '@angular/core';
import { ServiceWorkerModule } from '@angular/service-worker';
import { UpdateNotificationComponent } from './update-notification.component';

/**
 * Options for configuring `MJServiceWorkerModule.forRoot()`.
 */
export interface MJServiceWorkerOptions {
    /**
     * Master enable flag — when `false`, no service worker is registered and
     * `SwUpdate.isEnabled` resolves to `false`. The toast component is always
     * exported, but it renders nothing when SW is disabled.
     *
     * Wire this to something like `environment.production && environment.enableServiceWorker`
     * so dev builds and ops kill-switches both turn it off cleanly.
     */
    enabled: boolean;

    /**
     * The path to the generated SW worker script, relative to the deployed
     * app root. Defaults to `'ngsw-worker.js'` (the Angular CLI default).
     * Override only if you've customized the build output.
     */
    scriptPath?: string;

    /**
     * Registration strategy passed to `ServiceWorkerModule.register`.
     * Defaults to `'registerWhenStable:30000'` — defer registration until
     * the app is idle for 30s OR 30s have elapsed, whichever first. Avoids
     * competing with initial app boot for network bandwidth.
     */
    registrationStrategy?: string;

    /**
     * How often (in ms) UpdateNotificationService should ask the SW to check
     * for a new manifest while the tab is visible. Defaults to 15 minutes.
     * Pass `0` to disable periodic checking entirely (the SW's internal poll
     * still runs, but on a much longer cadence — typically hours).
     *
     * Note: this is wired by `UpdateNotificationService` itself in its
     * constructor; we don't currently provide a DI token for it. To override
     * at runtime, inject `UpdateNotificationService` and call
     * `service.startAutoCheck(yourIntervalMs)`.
     */
    pollIntervalMs?: number;
}

/**
 * Bundles MJ Explorer's service worker concerns into one module:
 *   - Conditionally registers `@angular/service-worker` based on `enabled`
 *   - Exports `UpdateNotificationComponent` (standalone toast)
 *   - Exposes `UpdateNotificationService` via `providedIn: 'root'`
 *
 * Consumers should call `MJServiceWorkerModule.forRoot({ enabled: ... })`
 * exactly once in their root NgModule. Typically this is done internally by
 * `MJExplorerAppModule.forRoot(environment)` so MJExplorer (and downstream
 * Explorer-style apps) don't have to wire it themselves.
 *
 * Pre-built `ngsw-config.json` ships at the package root; consumers point
 * their `angular.json` `serviceWorker` field at:
 *   `node_modules/@memberjunction/ng-explorer-service-worker/ngsw-config.json`
 *
 * If a consumer doesn't update `angular.json` (no SW worker built) AND
 * doesn't flip `enabled` true in their environment, this module is a no-op.
 * The app keeps working exactly as if the SW didn't exist.
 */
@NgModule({
    imports: [UpdateNotificationComponent],
    exports: [UpdateNotificationComponent]
})
export class MJServiceWorkerModule {
    static forRoot(options: MJServiceWorkerOptions): ModuleWithProviders<MJServiceWorkerModule> {
        // ServiceWorkerModule.register is always called — the `enabled` flag
        // tells Angular whether to actually attempt registration. We pass the
        // module reference into the providers chain so the SwUpdate token tree
        // is set up regardless (so injection always succeeds; it just reports
        // isEnabled = false when disabled).
        const swModule = ServiceWorkerModule.register(options.scriptPath ?? 'ngsw-worker.js', {
            enabled: options.enabled,
            registrationStrategy: options.registrationStrategy ?? 'registerWhenStable:30000'
        });

        return {
            ngModule: MJServiceWorkerModule,
            providers: [
                ...(swModule.providers ?? [])
            ]
        };
    }
}
