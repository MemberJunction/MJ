/**
 * Process-wide singleton that manages a single shared Playwright Browser
 * and provides key-based checkout/checkin of isolated BrowserContexts.
 *
 * Consumers request either a fresh adapter (new context every time) or a
 * recycled adapter (reuses an existing context for the given key). Recycled
 * contexts preserve Auth state (localStorage, cookies) across tests, so the
 * first test in a key's lifecycle logs in and subsequent tests skip login.
 *
 * Usage:
 *   const engine = HeadlessBrowserEngine.Instance;
 *   await engine.Initialize(true);
 *
 *   // Fresh — new context every call, caller manages lifecycle
 *   const fresh = await engine.GetNew(config);
 *
 *   // Recycled — same context returned for same key, auth persists
 *   const shared = await engine.GetRecycled('suite:abc:worker-0', config);
 *
 *   // Release a specific key (closes context)
 *   await engine.Release('suite:abc:worker-0');
 *
 *   // Shut down everything (all contexts + browser)
 *   await engine.Shutdown();
 */

import { BaseSingleton } from '@memberjunction/global';
import type { Browser, BrowserContext } from 'playwright';
import { BrowserConfig } from '../types/browser.js';
import { SharedContextBrowserAdapter } from './SharedContextBrowserAdapter.js';
import { ClassifyConnectEndpoint } from './connect-endpoint.js';

interface RecycledEntry {
    Context: BrowserContext;
    Adapter: SharedContextBrowserAdapter;
    UseCount: number;
    /** The browser this context was created on — see `releaseBrowserRef`. */
    Browser: Browser;
}

/**
 * The shape returned by `BrowserContext.storageState()` — cookies + per-origin
 * localStorage. Inferred from Playwright's return type so we don't need to
 * import the named export (which can vary across Playwright versions).
 */
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/**
 * Tracking entry for an isolated adapter — links the public adapter back to
 * its underlying context and the worker key it should checkpoint storage
 * state into on release.
 */
interface IsolatedEntry {
    Context: BrowserContext;
    WorkerKey: string;
    /** The browser this context was created on — see `releaseBrowserRef`. */
    Browser: Browser;
}

/**
 * Tracking entry for a `GetNew` adapter. The context and browser are retained
 * alongside the adapter because `GetNew` hands the caller only the adapter, and
 * `adapter.Close()` closes the page alone — so nothing else knows how to close
 * the context or release its hold on the browser.
 */
interface FreshEntry {
    Context: BrowserContext;
    Adapter: SharedContextBrowserAdapter;
    Browser: Browser;
}

export class HeadlessBrowserEngine extends BaseSingleton<HeadlessBrowserEngine> {
    public static get Instance(): HeadlessBrowserEngine {
        return super.getInstance<HeadlessBrowserEngine>();
    }

    // ─── State ─────────────────────────────────────────────

    private _browser: Browser | null = null;
    /** True when we attached to an external browser rather than launching one. */
    private _connected: boolean = false;
    private _recycled: Map<string, RecycledEntry> = new Map();
    private _fresh: FreshEntry[] = [];
    private _cleanupRegistered: boolean = false;

    /**
     * Per-worker cached `storageState` (cookies + localStorage). The isolated
     * path captures the previous context's state on Release, then replays it
     * into the next freshly-created context for the same worker — preserving
     * auth (Auth0 tokens, session cookies) without preserving page mutations.
     *
     * Result: the controller LLM doesn't pay the Auth0 round-trip on every
     * test in a worker, but still gets a clean BrowserContext (no
     * IndexedDB cache, no in-progress SPA state, no leaked sessionStorage).
     */
    private _workerStorageState: Map<string, StorageState> = new Map();

    /**
     * Live tracking of isolated adapters — used by `ReleaseIsolated` to find
     * the underlying context and worker key when the driver hands back an
     * adapter for checkpoint+close. `WeakMap` so dropped references get GC'd.
     */
    private _isolatedAdapters: WeakMap<SharedContextBrowserAdapter, IsolatedEntry> = new WeakMap();

    /**
     * Optional process-wide `storageState` seed shared by ALL isolated
     * contexts, regardless of worker. When set, every `GetIsolated` context is
     * seeded from this state and the per-worker capture is bypassed entirely —
     * so a single up-front login (captured once into this slot) authenticates
     * the whole suite without any test re-running a login flow.
     *
     * This is the "single login" mode: it overrides `_workerStorageState`
     * (which otherwise forces one login per worker, plus a re-login whenever a
     * per-test capture fails). With a shared seed, each test starts from the
     * same pristine authenticated state, so a test that corrupts or logs out of
     * its own context can never poison the next test.
     */
    private _sharedSeedState: StorageState | null = null;

    /** Path the current `_sharedSeedState` was loaded from (memoizes file loads). */
    private _sharedSeedLoadedFrom: string | null = null;

    // ─── Browser rotation (memory reclamation) ─────────────
    /** Isolated contexts handed out since the browser last (re)launched. */
    private _contextsSinceLaunch: number = 0;

    /**
     * How many live contexts each browser still owns — the current one plus any
     * retired browsers awaiting their last context. A browser is only safe to
     * close at zero.
     */
    private _browserRefs: Map<Browser, number> = new Map();

    /**
     * Browsers that no longer serve new contexts and will be closed as soon as
     * their ref count reaches zero. See {@link retireBrowserIfDue}.
     */
    private _retiring: Set<Browser> = new Set();

    /** The single in-flight launch, so concurrent workers share one process. */
    private _launchInFlight: Promise<void> | null = null;

    /**
     * Isolated contexts to serve before rotating the whole Chromium process.
     *
     * Closing a BrowserContext does NOT return its memory to the OS — Chromium's
     * RSS only ever grows within a process. `ReleaseIsolated` closes every context
     * correctly, and RSS still climbed 1.4 GB → 9.3 GB across 93 tests in
     * run-20260729T172418Z (~85 MB/test, monotonic, no plateau), which starved the
     * runner's own JS heap and killed a 155-test suite twice. Only replacing the
     * process reclaims it. `RotateAfterUses` does not cover this — that rotates
     * *recycled contexts*, and the default 'new' session strategy never touches
     * that path.
     */
    public RotateBrowserAfterContexts: number = 25;

    // ─── Lifecycle ─────────────────────────────────────────

    /**
     * Launch or attach to the shared Chromium browser. Safe to call multiple
     * times — subsequent calls are no-ops if the browser is already running.
     *
     * @param headless  Run launched browser without a visible window.
     *                  Ignored when `connect` is set (the external browser
     *                  already decided).
     * @param connect   Optional. Endpoint of an already-running browser to
     *                  attach to instead of launching one. `http(s)://…` uses
     *                  Chrome DevTools Protocol; `ws(s)://…` uses a Playwright
     *                  browser server. When set, `Shutdown()` will NOT close
     *                  the browser — the caller owns its lifecycle.
     * @param connectType Force the connect method. Defaults to `'auto'`
     *                  (scheme-based detection). Ignored when `connect` is unset.
     *
     * Note: this is a process-wide singleton. When the test driver runs
     * parallel workers and one of them passes `connect`, every worker that
     * subsequently calls `Initialize` (or hits `ensureBrowser` via `GetNew` /
     * `GetRecycled` / `GetIsolated`) will share the same attached browser —
     * the first call wins. Callers should ensure all workers agree on the
     * connect endpoint.
     */
    public async Initialize(
        headless: boolean = true,
        connect?: string,
        connectType?: 'cdp' | 'server' | 'auto'
    ): Promise<void> {
        if (this._browser) return;

        let chromium: Awaited<typeof import('playwright')>['chromium'];
        try {
            ({ chromium } = await import('playwright'));
        } catch {
            throw new Error(
                'Playwright is required for browser automation but is not installed. ' +
                'Install it with: npm install playwright'
            );
        }

        if (connect) {
            const method = ClassifyConnectEndpoint(connect, connectType);
            this._browser = method === 'server'
                ? await chromium.connect(connect)
                : await chromium.connectOverCDP(connect);
            this._connected = true;
        } else {
            this._browser = await chromium.launch({
                headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            this._connected = false;
        }

        this.registerProcessCleanup();
    }

    /**
     * Create a brand-new BrowserContext and adapter. The caller owns the
     * lifecycle — call adapter.Close() when done. The context is not
     * tracked by key and cannot be recycled.
     */
    public async GetNew(config?: BrowserConfig): Promise<SharedContextBrowserAdapter> {
        await this.ensureBrowser();
        const cfg = config ?? new BrowserConfig();
        const browser = this._browser!;
        const context = await this.createContext(cfg);
        const adapter = new SharedContextBrowserAdapter(context);
        this._fresh.push({ Context: context, Adapter: adapter, Browser: browser });
        this.retainBrowserRef(browser);
        return adapter;
    }

    /**
     * Maximum number of tests a recycled context can serve before being
     * automatically rotated (closed and recreated). Long-lived contexts
     * accumulate localStorage entries, dirty SPA state, and memory pressure
     * which leads to load failures after ~25 reuses.
     */
    public RotateAfterUses: number = 20;

    /**
     * Get a recycled adapter for the given key. If no context exists for
     * the key, a new one is created. If one already exists, the same
     * adapter is returned — auth state (localStorage, cookies) persists.
     *
     * After RotateAfterUses checkouts, the context is automatically rotated
     * (closed and a fresh one created) to prevent state accumulation.
     *
     * @param key - Identifies the shared session (e.g. "suite:abc:worker-0")
     * @param config - Browser config used only when creating a new context
     */
    public async GetRecycled(key: string, config?: BrowserConfig): Promise<SharedContextBrowserAdapter> {
        await this.ensureBrowser();

        const existing = this._recycled.get(key);
        if (existing) {
            if (existing.UseCount >= this.RotateAfterUses) {
                // Rotate: close stale context, fall through to create a fresh one
                await this.Release(key);
            } else {
                existing.UseCount++;
                return existing.Adapter;
            }
        }

        const cfg = config ?? new BrowserConfig();
        const browser = this._browser!;
        const context = await this.createContext(cfg);
        const adapter = new SharedContextBrowserAdapter(context);
        this._recycled.set(key, { Context: context, Adapter: adapter, UseCount: 1, Browser: browser });
        this.retainBrowserRef(browser);
        return adapter;
    }

    /**
     * Get an isolated adapter — a fresh `BrowserContext` seeded with the
     * cached `storageState` (cookies + localStorage) for the given worker
     * key, if any. Every call returns a NEW context, even within the same
     * worker, so test mutations cannot leak forward.
     *
     * Pair every `GetIsolated(key)` with `ReleaseIsolated(adapter)` after
     * the test completes — that's when the context's storage is captured
     * back into `_workerStorageState[key]` for the next test in the worker
     * to replay. Without the matching release, the cache won't update and
     * subsequent tests will start from the previous cached state (or empty).
     *
     * @param workerKey - Stable identifier for the worker (e.g. `worker-0`).
     *                    All tests run by this worker share the same cached
     *                    storage state.
     * @param config - Browser config used when constructing the context.
     */
    public async GetIsolated(
        workerKey: string,
        config?: BrowserConfig
    ): Promise<SharedContextBrowserAdapter> {
        this.retireBrowserIfDue();
        await this.ensureBrowser();
        const browser = this._browser!;
        const cfg = config ?? new BrowserConfig();
        // Shared seed (single-login mode) wins over the per-worker capture: every
        // worker's context starts from the same up-front authenticated state.
        const cachedState = this._sharedSeedState ?? this._workerStorageState.get(workerKey);
        const context = await browser.newContext({
            viewport: {
                width: cfg.ViewportWidth,
                height: cfg.ViewportHeight,
            },
            userAgent: cfg.UserAgent,
            storageState: cachedState,
        });
        const adapter = new SharedContextBrowserAdapter(context);
        this._isolatedAdapters.set(adapter, { Context: context, WorkerKey: workerKey, Browser: browser });
        this._contextsSinceLaunch++;
        this.retainBrowserRef(browser);
        return adapter;
    }

    /**
     * Release an isolated adapter — captures the context's `storageState`
     * back into the worker's cache (so the next isolated context for the
     * same worker replays auth + cookies + localStorage), then closes the
     * adapter's page and the underlying context.
     *
     * No-op when the adapter was not produced by `GetIsolated`. Best-effort
     * on failures — closing always proceeds.
     */
    public async ReleaseIsolated(adapter: SharedContextBrowserAdapter): Promise<void> {
        const entry = this._isolatedAdapters.get(adapter);
        if (!entry) return;
        this._isolatedAdapters.delete(adapter);

        try {
            // Single-login mode: when a shared seed is active, GetIsolated never
            // consults the per-worker cache, so capturing it is wasted work and
            // a poisoning risk (a logged-out/expired context would override the
            // pristine seed). Skip capture entirely and just close.
            if (this._sharedSeedState) return;

            // Capture state BEFORE closing — context.storageState() requires
            // the context to still be alive. Swallow errors (e.g. context
            // was already aborted) and just don't update the cache.
            const state = await entry.Context.storageState().catch(() => undefined);
            if (state) {
                this._workerStorageState.set(entry.WorkerKey, state);
            }
        } finally {
            try { if (adapter.IsOpen) await adapter.Close(); } catch { /* swallow */ }
            try { await entry.Context.close(); } catch { /* swallow */ }
            // Release AFTER the context is closed: this is what closes a retired
            // browser once its last context is gone, and doing it earlier would
            // kill the process while this context was still closing.
            await this.releaseBrowserRef(entry.Browser);
        }
    }

    /**
     * Forget the cached storage state for a worker — the next `GetIsolated`
     * call for the same key will create a context with no auth seed,
     * forcing the AuthHandler to run from scratch. Use when a token has
     * expired mid-suite or when an opt-out is desired.
     */
    public InvalidateStorageState(workerKey: string): void {
        this._workerStorageState.delete(workerKey);
    }

    /**
     * Diagnostic: how many workers have cached storage state. Used by tests
     * to verify that capture+replay is wired correctly.
     */
    public get IsolatedStorageStateCount(): number {
        return this._workerStorageState.size;
    }

    /**
     * Enable "single login" mode: seed EVERY isolated context from `state`
     * (cookies + per-origin localStorage), overriding the per-worker capture.
     * Pass `null` to disable. See {@link _sharedSeedState}.
     */
    public SetSharedStorageState(state: StorageState | null): void {
        this._sharedSeedState = state;
        if (!state) this._sharedSeedLoadedFrom = null;
    }

    /**
     * Load a shared `storageState` JSON file (the shape written by Playwright's
     * `context.storageState({ path })`) and use it as the shared seed for all
     * isolated contexts. Idempotent — repeat calls with the same path are
     * no-ops once loaded.
     *
     * @returns `true` if a shared seed is active after the call; `false` if the
     *          file was missing or unparseable (caller falls back to the normal
     *          per-worker login path — single-login mode degrades gracefully).
     */
    public async EnsureSharedStorageStateFromFile(path: string): Promise<boolean> {
        if (this._sharedSeedState && this._sharedSeedLoadedFrom === path) return true;
        try {
            // Dynamic import mirrors this module's lazy-Node pattern (see the
            // `import('playwright')` in Initialize): the engine is Node-only but
            // never eagerly binds Node built-ins at module top level.
            const { readFile } = await import('node:fs/promises');
            const raw = await readFile(path, 'utf8');
            this._sharedSeedState = JSON.parse(raw) as StorageState;
            this._sharedSeedLoadedFrom = path;
            return true;
        } catch {
            return false;
        }
    }

    /** Whether single-login mode is active (a shared seed is set). */
    public get HasSharedStorageState(): boolean {
        return this._sharedSeedState !== null;
    }

    /**
     * Release a single recycled key — closes the adapter's page and the
     * underlying BrowserContext. The key can be reused after release
     * (a new context will be created on next GetRecycled call).
     */
    public async Release(key: string): Promise<void> {
        const entry = this._recycled.get(key);
        if (!entry) return;

        try { if (entry.Adapter.IsOpen) await entry.Adapter.Close(); } catch { /* swallow */ }
        try { await entry.Context.close(); } catch { /* swallow */ }
        this._recycled.delete(key);
        await this.releaseBrowserRef(entry.Browser);
    }

    /**
     * Release all recycled contexts. Does not close the browser itself.
     */
    public async ReleaseAll(): Promise<void> {
        const keys = [...this._recycled.keys()];
        for (const key of keys) {
            await this.Release(key);
        }
    }

    /**
     * Full shutdown: close all fresh adapters, release all recycled contexts,
     * close the browser. Safe to call multiple times.
     *
     * When attached to an external browser (`_connected === true`), the
     * browser itself is NOT closed — the caller owns its lifecycle. All
     * contexts WE created (recycled, fresh, isolated) ARE closed.
     */
    public async Shutdown(): Promise<void> {
        // Close all fresh adapters (page) and their contexts
        for (const entry of this._fresh) {
            try { if (entry.Adapter.IsOpen) await entry.Adapter.Close(); } catch { /* swallow */ }
            try { await entry.Context.close(); } catch { /* swallow */ }
        }
        this._fresh = [];

        // Release all recycled
        await this.ReleaseAll();

        // Drop all cached storage states — they belong to a previous process
        // lifetime and the auth tokens may have expired anyway.
        this._workerStorageState.clear();
        this._sharedSeedState = null;
        this._sharedSeedLoadedFrom = null;

        // Close browser only if we launched it ourselves. When attached, the
        // external browser/server stays running — that's the whole point of
        // attach mode. Our Playwright client connection is released on
        // process exit.
        if (this._browser) {
            if (!this._connected) {
                try { await this._browser.close(); } catch { /* swallow */ }
            }
            this._browser = null;
        }

        // Retired browsers still awaiting a straggler's release. We launched every
        // one of them, so shutdown owns closing them regardless of ref counts —
        // otherwise a wedged context would leak a whole Chromium process.
        for (const retired of this._retiring) {
            try { await retired.close(); } catch { /* swallow */ }
        }
        this._retiring.clear();
        this._browserRefs.clear();
        this._connected = false;

        // Rotation bookkeeping belongs to the browser we just dropped.
        this._contextsSinceLaunch = 0;
    }

    // ─── Queries ───────────────────────────────────────────

    public get IsInitialized(): boolean {
        return this._browser !== null;
    }

    public get RecycledKeyCount(): number {
        return this._recycled.size;
    }

    public HasKey(key: string): boolean {
        return this._recycled.has(key);
    }

    // ─── Internal ──────────────────────────────────────────

    /**
     * Guarantee a current browser, launching one at most once even when several
     * workers arrive together.
     *
     * The in-flight guard is required, not defensive: `Initialize` checks
     * `_browser` and then `await`s the Playwright import, so N concurrent callers
     * all pass its guard and each launch a process — and every one but the last
     * would be orphaned, since each overwrites `_browser`. Retirement makes this
     * reachable on the hot path (it nulls `_browser` and returns synchronously, so
     * every worker in the retirement window lands here at once).
     */
    private async ensureBrowser(): Promise<void> {
        if (this._browser) {
            return;
        }
        if (this._launchInFlight) {
            await this._launchInFlight;
            return;
        }
        this._launchInFlight = this.Initialize(true);
        try {
            await this._launchInFlight;
        } finally {
            this._launchInFlight = null;
        }
    }

    /**
     * Stop serving new contexts from the current Chromium process once it has
     * handed out {@link RotateBrowserAfterContexts} isolated contexts, so the next
     * checkout launches a fresh one. The retired process is closed by
     * `releaseBrowserRef` as soon as its last context is released — which is the
     * only way to give back the RSS that closing contexts does not (see that
     * field's comment).
     *
     * **Retire, don't drain.** The previous implementation closed the browser
     * in-place and so had to wait for `_liveIsolatedContexts` to reach zero first.
     * That requires a moment when *every* worker is simultaneously idle, which
     * essentially never happens while N workers cycle continuously — each releases
     * its context and immediately checks out another. In run-20260730T200139Z that
     * drain timed out (60s) on nearly every attempt and rotation fired exactly
     * ONCE in 3.9 hours, letting Chromium RSS reach 17.5 GB. Retiring instead of
     * draining needs no global quiescent moment: the old and new process coexist
     * for at most one test's duration, and memory comes back as soon as the last
     * straggler finishes.
     *
     * Synchronous on purpose — no `await` before `_browser` is swapped, so
     * concurrent workers cannot each retire the same browser.
     *
     * Auth is preserved across retirement: `_sharedSeedState` /
     * `_workerStorageState` are plain captured data, deliberately NOT cleared here
     * (only `Shutdown` clears them), so the next context replays the same session
     * and no test pays for a re-login.
     *
     * Never retires an attached browser (`_connected`) — the caller owns that
     * process.
     */
    private retireBrowserIfDue(): void {
        if (this._contextsSinceLaunch < this.RotateBrowserAfterContexts) {
            return;
        }
        if (!this._browser || this._connected) {
            return;
        }

        const retired = this._browser;
        const served = this._contextsSinceLaunch;
        this._browser = null;          // next ensureBrowser launches a replacement
        this._contextsSinceLaunch = 0;
        this._retiring.add(retired);
        // eslint-disable-next-line no-console
        console.log(
            `[HeadlessBrowserEngine] Retiring Chromium after ${served} isolated context(s); ` +
            `new contexts use a fresh process, this one closes when its last context releases`
        );
        // Nothing outstanding — reclaim immediately rather than waiting for a
        // release that will never come.
        void this.closeIfRetiredAndIdle(retired);
    }

    /** Record that `browser` owns one more live context. */
    private retainBrowserRef(browser: Browser): void {
        this._browserRefs.set(browser, (this._browserRefs.get(browser) ?? 0) + 1);
    }

    /**
     * Record that one of `browser`'s contexts has closed, and close the browser
     * itself if it was retired and has nothing left. This is where a retired
     * Chromium's RSS actually returns to the OS.
     */
    private async releaseBrowserRef(browser: Browser): Promise<void> {
        const remaining = (this._browserRefs.get(browser) ?? 1) - 1;
        if (remaining > 0) {
            this._browserRefs.set(browser, remaining);
            return;
        }
        this._browserRefs.delete(browser);
        await this.closeIfRetiredAndIdle(browser);
    }

    /** Close a retired browser that no longer owns any context. No-op otherwise. */
    private async closeIfRetiredAndIdle(browser: Browser): Promise<void> {
        if (!this._retiring.has(browser) || (this._browserRefs.get(browser) ?? 0) > 0) {
            return;
        }
        this._retiring.delete(browser);
        try { await browser.close(); } catch { /* swallow — retired either way */ }
        // eslint-disable-next-line no-console
        console.log('[HeadlessBrowserEngine] Closed retired Chromium — RSS reclaimed');
    }

    private async createContext(config: BrowserConfig): Promise<BrowserContext> {
        return this._browser!.newContext({
            viewport: {
                width: config.ViewportWidth,
                height: config.ViewportHeight,
            },
            userAgent: config.UserAgent,
        });
    }

    private registerProcessCleanup(): void {
        if (this._cleanupRegistered) return;
        this._cleanupRegistered = true;

        const cleanup = () => {
            // Synchronous best-effort — process is exiting.
            // Don't close attached browsers — caller owns their lifecycle.
            if (this._browser && !this._connected) {
                this._browser.close().catch(() => {});
            }
        };
        process.on('exit', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
    }
}
