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

interface RecycledEntry {
    Context: BrowserContext;
    Adapter: SharedContextBrowserAdapter;
    UseCount: number;
}

export class HeadlessBrowserEngine extends BaseSingleton<HeadlessBrowserEngine> {
    public static get Instance(): HeadlessBrowserEngine {
        return super.getInstance<HeadlessBrowserEngine>();
    }

    // ─── State ─────────────────────────────────────────────

    private _browser: Browser | null = null;
    private _recycled: Map<string, RecycledEntry> = new Map();
    private _fresh: SharedContextBrowserAdapter[] = [];
    private _cleanupRegistered: boolean = false;

    // ─── Lifecycle ─────────────────────────────────────────

    /**
     * Launch the shared Chromium browser. Safe to call multiple times —
     * subsequent calls are no-ops if the browser is already running.
     */
    public async Initialize(headless: boolean = true): Promise<void> {
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

        this._browser = await chromium.launch({
            headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

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
     */
    public async Shutdown(): Promise<void> {
        // Close all fresh adapters
        for (const adapter of this._fresh) {
            try { if (adapter.IsOpen) await adapter.Close(); } catch { /* swallow */ }
        }
        this._fresh = [];

        // Release all recycled
        await this.ReleaseAll();

        // Close browser
        if (this._browser) {
            try { await this._browser.close(); } catch { /* swallow */ }
            this._browser = null;
        }
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
            // Synchronous best-effort — process is exiting
            this._browser?.close().catch(() => {});
        };
        process.on('exit', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
    }
}
