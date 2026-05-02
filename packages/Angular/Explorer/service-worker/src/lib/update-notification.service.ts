import { Injectable, OnDestroy, inject } from '@angular/core';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { BehaviorSubject, Observable, Subject, EMPTY } from 'rxjs';
import { catchError, filter, takeUntil } from 'rxjs/operators';

/**
 * Coordinates notifying the user when a new app-shell version has been
 * downloaded by the service worker and is waiting to activate.
 *
 * Background — the Angular service worker downloads new versions silently in
 * the background; the currently-loaded page keeps using the old cached version
 * until a navigation reload activates the new one. This service watches for
 * `VERSION_READY` events from `SwUpdate` and exposes them via an observable
 * the shell can subscribe to (e.g. to render an "Update available" toast).
 *
 * Use in MJExplorer:
 *   1. Inject this service in `AppComponent` (or wherever the shell lives)
 *   2. Subscribe to `updateAvailable$` and render UI when it emits
 *   3. Call `applyUpdate()` when the user accepts the prompt — this performs
 *      a full page reload, which causes the SW to activate the new version
 *
 * **Dev note**: when the service worker is disabled (development builds, or
 * `enableServiceWorker = false` in the environment), `SwUpdate.isEnabled`
 * returns `false` and this service is effectively a no-op. The shell can
 * always subscribe; it just never receives an emission.
 */
/**
 * How often (in ms) to ask the SW to check for a new manifest while the tab
 * is visible. 15 minutes balances responsiveness against pointless network
 * chatter on idle tabs. Checks are skipped while the tab is hidden (Page
 * Visibility API), and a check is also fired immediately when the tab becomes
 * visible after being backgrounded.
 *
 * Override via `MJServiceWorkerOptions.pollIntervalMs`.
 */
const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Window-attached debug handle. Type-safe accessor avoids polluting the global
 * namespace with `any`. Use from DevTools console:
 *   __mjUpdateNotificationService__.checkForUpdate()
 *   __mjUpdateNotificationService__.isUpdateAvailable
 */
const WINDOW_DEBUG_KEY = '__mjUpdateNotificationService__';

@Injectable({ providedIn: 'root' })
export class UpdateNotificationService implements OnDestroy {
    private readonly _updateAvailable$ = new BehaviorSubject<boolean>(false);
    private readonly _destroy$ = new Subject<void>();
    private readonly _swUpdate = inject(SwUpdate);

    /** Last `VERSION_READY` event captured (for diagnostics / tests). */
    private _lastVersionEvent: VersionReadyEvent | null = null;

    /** Handle from `setInterval` for the periodic poll; cleared in ngOnDestroy. */
    private _pollHandle: ReturnType<typeof setInterval> | null = null;

    /** Bound listener for `visibilitychange`; needs the same reference for removal. */
    private _visibilityListener: (() => void) | null = null;

    /** Effective poll interval — set in `startAutoCheck()`. */
    private _pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;

    constructor() {
        if (this._swUpdate.isEnabled) {
            // Subscribe to all version events; filter to ones that mean a new
            // version is fully downloaded and waiting to activate.
            this._swUpdate.versionUpdates
                .pipe(
                    filter((e: VersionEvent): e is VersionReadyEvent => e.type === 'VERSION_READY'),
                    catchError(err => {
                        // Defensive — observable should never error in practice, but if the
                        // SW connection breaks for any reason, swallow it. Caller can re-init
                        // the service later if needed.
                        // eslint-disable-next-line no-console
                        console.warn('[UpdateNotificationService] versionUpdates errored:', err);
                        return EMPTY;
                    }),
                    takeUntil(this._destroy$)
                )
                .subscribe((event: VersionReadyEvent) => {
                    this._lastVersionEvent = event;
                    this._updateAvailable$.next(true);
                });

            this.startAutoCheck(DEFAULT_POLL_INTERVAL_MS);
            this.exposeDebugHandle();
        }
    }

    /**
     * Start a periodic update check on the given interval. Called automatically
     * by the constructor with `DEFAULT_POLL_INTERVAL_MS`. Consumers may call
     * this again with a different interval to retune at runtime — the previous
     * timer is cleared first.
     *
     * Pass `0` (or any non-positive number) to disable periodic checking.
     * Polling is automatically suspended while the tab is hidden and resumed
     * (with an immediate check) when the tab becomes visible again.
     */
    public startAutoCheck(intervalMs: number): void {
        this.stopAutoCheck();
        this._pollIntervalMs = intervalMs;
        if (!this._swUpdate.isEnabled || intervalMs <= 0) return;

        this._pollHandle = setInterval(() => {
            // Only fire when visible. Hidden tabs catch up via the
            // visibilitychange handler.
            if (typeof document === 'undefined' || !document.hidden) {
                void this.checkForUpdate();
            }
        }, intervalMs);

        if (typeof document !== 'undefined') {
            this._visibilityListener = () => {
                if (!document.hidden) void this.checkForUpdate();
            };
            document.addEventListener('visibilitychange', this._visibilityListener);
        }
    }

    /** Stop the periodic poll started by `startAutoCheck()`. */
    public stopAutoCheck(): void {
        if (this._pollHandle !== null) {
            clearInterval(this._pollHandle);
            this._pollHandle = null;
        }
        if (this._visibilityListener && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this._visibilityListener);
            this._visibilityListener = null;
        }
    }

    /**
     * Attach this service to `window.__mjUpdateNotificationService__` so it can
     * be poked from the DevTools console. Useful for ops/QA verification of the
     * update-detection roundtrip without code changes.
     *
     * No-op in non-browser contexts.
     */
    private exposeDebugHandle(): void {
        if (typeof window === 'undefined') return;
        // Cast through unknown to avoid a global declaration just for the debug hook.
        (window as unknown as Record<string, unknown>)[WINDOW_DEBUG_KEY] = this;
    }

    /**
     * Emits `true` once a new SW-cached version is ready to activate.
     * Stays `true` until either `applyUpdate()` (which reloads the page) or
     * `dismissForSession()` (which resets the flag without reloading).
     */
    public get updateAvailable$(): Observable<boolean> {
        return this._updateAvailable$.asObservable();
    }

    /** Synchronous accessor for current update-available state. */
    public get isUpdateAvailable(): boolean {
        return this._updateAvailable$.value;
    }

    /** True if the underlying SwUpdate API is active (SW registered + supported). */
    public get isServiceWorkerEnabled(): boolean {
        return this._swUpdate.isEnabled;
    }

    /** The most recent `VERSION_READY` event, if any. Useful for diagnostics. */
    public get lastVersionEvent(): VersionReadyEvent | null {
        return this._lastVersionEvent;
    }

    /**
     * Reload the page to activate the newly-downloaded SW version.
     *
     * Implementation note: the SW activates new versions on the next
     * navigation, not via any in-process API. So we just reload — `SwUpdate`
     * doesn't expose a non-reload way to swap the running JS without losing
     * application state, and any such mechanism would be unsafe anyway.
     *
     * This method is split out (vs. inlining `location.reload()`) so consumers
     * can be tested without actually reloading the page.
     */
    public applyUpdate(): void {
        // Hide the prompt before reloading so it doesn't briefly flash again
        // on the new page if anything in the shell renders before the SW
        // activates.
        this._updateAvailable$.next(false);
        this.performReload();
    }

    /**
     * Dismiss the prompt for this session without reloading. The flag will
     * re-fire on the next page load if the SW is still pointing at the
     * pending version (which it will be, until something triggers a reload).
     *
     * Use case: a power user is in the middle of editing something and doesn't
     * want to interrupt; they'll get prompted again on their next reload.
     */
    public dismissForSession(): void {
        this._updateAvailable$.next(false);
    }

    /**
     * Manually nudge the SW to check for an update. The Angular SW polls
     * automatically on a schedule, but consumers can call this to force an
     * immediate check (e.g., from a "Check for updates" menu item).
     *
     * Returns `true` if a new version was found and downloaded; `false` if
     * we're already on the latest. Resolves to `false` if the SW is disabled.
     */
    public async checkForUpdate(): Promise<boolean> {
        if (!this._swUpdate.isEnabled) return false;
        try {
            return await this._swUpdate.checkForUpdate();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[UpdateNotificationService] checkForUpdate failed:', err);
            return false;
        }
    }

    /**
     * Indirection for test injection — overriding `location.reload` directly
     * is not possible in a JSDOM/happy-dom environment without warnings, and
     * spying on `globalThis.location` is brittle. This wrapper lets tests
     * mock the reload via a subclass / `vi.spyOn(service as any, 'performReload')`.
     */
    /* istanbul ignore next — exercised manually, hard to unit-test cleanly */
    protected performReload(): void {
        // Use document.location for cross-environment reliability. `window`
        // can be shadowed in test environments; `document.location` is more
        // consistently available.
        document.location.reload();
    }

    ngOnDestroy(): void {
        this.stopAutoCheck();
        this._destroy$.next();
        this._destroy$.complete();
        this._updateAvailable$.complete();
    }
}
