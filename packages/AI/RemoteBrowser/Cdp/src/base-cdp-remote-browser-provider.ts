/**
 * The shared base for every CDP-driven Remote Browser provider — the class the 5 backend drivers
 * subclass so they only have to answer ONE question: *how do I obtain a CDP endpoint (and its
 * teardown/live-view/native-AI hooks) for this backend?*
 *
 * {@link BaseCdpRemoteBrowserProvider} implements the entire generic connect path:
 * `applyContext` → `AcquireSession` (the driver's only required hook) → launch a
 * `PlaywrightBrowserAdapter` ATTACHED to the acquired CDP endpoint → wrap it in the shared
 * {@link CdpRemoteBrowserSession}. Self-hosted drivers fill `AcquireSession` by starting a container;
 * browser-as-a-service drivers fill it by calling their service SDK. Everything else — action mapping,
 * capability gating, screencast, teardown — is inherited.
 *
 * @see `base-remote-browser-provider.ts` (Base) for the abstract contract this satisfies.
 */

import {
    BaseRemoteBrowserProvider,
    IRemoteBrowserSession,
    RemoteBrowserProviderContext,
} from '@memberjunction/remote-browser-base';
import { BrowserConfig, PlaywrightBrowserAdapter } from '@memberjunction/computer-use';
import { LogError } from '@memberjunction/core';
import { CdpRemoteBrowserSession } from './cdp-remote-browser-session';
import { ICdpSessionBackend } from './cdp-session-backend';

/**
 * The result of a driver's {@link BaseCdpRemoteBrowserProvider.AcquireSession} hook: the CDP endpoint to
 * attach to, plus the {@link ICdpSessionBackend} hooks for the backend-specific session concerns. This
 * is the complete, consistent shape the 5 driver agents implement.
 */
export interface AcquiredCdpSession {
    /**
     * The Chrome DevTools Protocol connect endpoint the shared adapter attaches to. Either a raw CDP
     * websocket / `http(s)://…` DevTools endpoint or a Playwright browser-server `ws(s)://…` URL; the
     * shared provider attaches via CDP (`ConnectType: 'cdp'`).
     */
    CdpEndpoint: string;

    /**
     * The driver-supplied hooks for the backend-specific session concerns (hosted live-view URL, native
     * AI-control delegation, and backend release/teardown).
     */
    Backend: ICdpSessionBackend;
}

/**
 * Abstract base for CDP-driven Remote Browser providers. Subclasses implement only
 * {@link BaseCdpRemoteBrowserProvider.AcquireSession}; the connect/disconnect orchestration, the shared
 * session, and all action/capability handling are inherited.
 *
 * @abstract
 */
export abstract class BaseCdpRemoteBrowserProvider extends BaseRemoteBrowserProvider {
    /**
     * The connected computer-use adapter for the live session, retained so {@link Disconnect} can close
     * it. `null` before {@link Connect} (or after {@link Disconnect}).
     */
    private activeAdapter: PlaywrightBrowserAdapter | null = null;

    /**
     * The driver-supplied backend hooks for the live session, retained so {@link Disconnect} can release
     * the backend. `null` before {@link Connect} (or after {@link Disconnect}).
     */
    private activeBackend: ICdpSessionBackend | null = null;

    // ──────────────────────────────────────────────────────────────────────────────
    // ABSTRACT — the ONE hook every CDP driver fills.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Obtains a CDP endpoint (and its backend hooks) for this backend — the only genuinely
     * backend-specific step. A self-hosted driver starts a headless-Chrome container and returns its
     * CDP endpoint; a browser-as-a-service driver calls its service SDK to create a session and returns
     * the service's CDP connect URL. The returned {@link ICdpSessionBackend} answers the backend's
     * live-view / native-AI / release concerns.
     *
     * Called by {@link BaseCdpRemoteBrowserProvider.Connect} after `applyContext(ctx)`.
     *
     * @param ctx The provider context (features, configuration, control mode, context user).
     * @returns A promise resolving to the acquired CDP endpoint + backend hooks.
     */
    protected abstract AcquireSession(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession>;

    // ──────────────────────────────────────────────────────────────────────────────
    // Generic connect / disconnect — implemented ONCE for all drivers.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Opens a session: captures the context, has the driver acquire a CDP endpoint, attaches a shared
     * {@link PlaywrightBrowserAdapter} to it over CDP, and returns the shared
     * {@link CdpRemoteBrowserSession}. The adapter + backend are retained for {@link Disconnect}.
     *
     * @param ctx The host services and connection parameters for this session.
     * @returns A promise resolving to the live remote-browser session handle.
     */
    public async Connect(ctx: RemoteBrowserProviderContext): Promise<IRemoteBrowserSession> {
        this.applyContext(ctx);

        const acquired = await this.AcquireSession(ctx);

        const adapter = this.createAdapter();
        const config = this.buildBrowserConfig(acquired.CdpEndpoint, ctx);
        await adapter.Launch(config);

        this.activeAdapter = adapter;
        this.activeBackend = acquired.Backend;

        return new CdpRemoteBrowserSession(
            adapter,
            acquired.CdpEndpoint,
            this.features,
            acquired.Backend,
            this.providerName,
        );
    }

    /**
     * Releases the driver's own backend resources for the live session: closes the attached adapter and
     * releases the backend. Both steps are best-effort and independent so teardown always completes; the
     * retained references are cleared regardless of outcome. Idempotent — safe to call when nothing is
     * connected.
     *
     * @returns A promise that resolves once teardown has run.
     */
    public async Disconnect(): Promise<void> {
        const adapter = this.activeAdapter;
        const backend = this.activeBackend;
        this.activeAdapter = null;
        this.activeBackend = null;

        if (adapter) {
            try {
                await adapter.Close();
            } catch (err) {
                LogError(`BaseCdpRemoteBrowserProvider.Disconnect: adapter.Close failed: ${this.errorDetail(err)}`);
            }
        }
        if (backend) {
            try {
                await backend.Release();
            } catch (err) {
                LogError(`BaseCdpRemoteBrowserProvider.Disconnect: backend.Release failed: ${this.errorDetail(err)}`);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Internal helpers.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Creates the {@link PlaywrightBrowserAdapter} the session will drive. A dedicated factory seam so
     * tests can substitute a fake adapter without a real browser, and so a specialized driver could
     * supply a pre-configured adapter if ever needed. Production drivers use the default.
     *
     * @returns A fresh, un-launched {@link PlaywrightBrowserAdapter}.
     */
    protected createAdapter(): PlaywrightBrowserAdapter {
        return new PlaywrightBrowserAdapter();
    }

    /**
     * Builds the {@link BrowserConfig} used to attach the shared adapter to the acquired CDP endpoint.
     * Always attaches via CDP (`ConnectType: 'cdp'`) — a raw CDP websocket would otherwise be
     * misclassified as a Playwright server by scheme auto-detection. Viewport hints come from the
     * context configuration when supplied.
     *
     * @param cdpEndpoint The CDP endpoint to attach to.
     * @param ctx The provider context, whose `Configuration` may carry viewport hints.
     * @returns The browser config for {@link PlaywrightBrowserAdapter.Launch}.
     */
    protected buildBrowserConfig(
        cdpEndpoint: string,
        ctx: RemoteBrowserProviderContext,
    ): BrowserConfig {
        const config = new BrowserConfig();
        config.Connect = cdpEndpoint;
        config.ConnectType = 'cdp';

        const width = this.readNumberConfig(ctx.Configuration, 'ViewportWidth');
        if (width !== undefined) {
            config.ViewportWidth = width;
        }
        const height = this.readNumberConfig(ctx.Configuration, 'ViewportHeight');
        if (height !== undefined) {
            config.ViewportHeight = height;
        }
        return config;
    }

    /**
     * Reads an optional numeric value from the opaque, backend-specific `Configuration` record without
     * resorting to `any`. Returns `undefined` when the key is absent or not a finite number.
     *
     * @param configuration The opaque configuration record (or undefined).
     * @param key The key to read.
     * @returns The numeric value, or `undefined` when absent/non-numeric.
     */
    private readNumberConfig(
        configuration: Record<string, unknown> | undefined,
        key: string,
    ): number | undefined {
        const value = configuration?.[key];
        return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    }

    /**
     * Extracts a human-readable detail string from an unknown thrown value.
     *
     * @param err The caught value.
     * @returns The error message when `err` is an `Error`, otherwise its string form.
     */
    private errorDetail(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}
