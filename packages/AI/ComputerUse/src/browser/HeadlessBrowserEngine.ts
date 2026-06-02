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
import { classifyConnectEndpoint } from './connect-endpoint.js';

interface RecycledEntry {
    Context: BrowserContext;
    Adapter: SharedContextBrowserAdapter;
    UseCount: number;
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
    private _fresh: SharedContextBrowserAdapter[] = [];
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
            const method = classifyConnectEndpoint(connect, connectType);
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
        const context = await this.createContext(cfg);
        const adapter = new SharedContextBrowserAdapter(context);
        this._fresh.push(adapter);
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
        const context = await this.createContext(cfg);
        const adapter = new SharedContextBrowserAdapter(context);
        this._recycled.set(key, { Context: context, Adapter: adapter, UseCount: 1 });
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
        await this.ensureBrowser();
        const cfg = config ?? new BrowserConfig();
        const cachedState = this._workerStorageState.get(workerKey);
        const context = await this._browser!.newContext({
            viewport: {
                width: cfg.ViewportWidth,
                height: cfg.ViewportHeight,
            },
            userAgent: cfg.UserAgent,
            storageState: cachedState,
        });
        const adapter = new SharedContextBrowserAdapter(context);
        this._isolatedAdapters.set(adapter, { Context: context, WorkerKey: workerKey });
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
        // Close all fresh adapters
        for (const adapter of this._fresh) {
            try { if (adapter.IsOpen) await adapter.Close(); } catch { /* swallow */ }
        }
        this._fresh = [];

        // Release all recycled
        await this.ReleaseAll();

        // Drop all cached storage states — they belong to a previous process
        // lifetime and the auth tokens may have expired anyway.
        this._workerStorageState.clear();

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
        this._connected = false;
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

    private async ensureBrowser(): Promise<void> {
        if (!this._browser) {
            await this.Initialize(true);
        }
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
