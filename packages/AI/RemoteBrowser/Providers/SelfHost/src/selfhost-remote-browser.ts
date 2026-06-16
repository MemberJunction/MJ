/**
 * @fileoverview `SelfHostRemoteBrowser` — the Self-Hosted Chrome backend driver for the Remote Browser
 * channel. It connects the shared CDP control kit
 * ({@link BaseCdpRemoteBrowserProvider}) to a lightweight, MJ-orchestrated headless-Chrome container.
 *
 * The driver itself is intentionally trivial: the shared kit implements the entire generic path
 * (Connect/Disconnect, adapter-attach over CDP, action mapping, screencast, human takeover, capability
 * gating). This driver fills the ONE backend-specific hook — {@link AcquireSession} — by leasing a Chrome
 * container through an injectable {@link IChromeContainerRunner} seam and wrapping its handle in a
 * {@link SelfHostSessionBackend}.
 *
 * Capability coverage (per the `MJ: AI Remote Browser Providers` seed row "Self-Hosted Chrome"):
 * RawCdpControl, LiveView, HumanTakeover, ScreenStreaming, PersistentContext, MultiTab, FileDownloads —
 * and explicitly NOT NativeAIControl (self-host has no first-party AI harness).
 *
 * @module @memberjunction/remote-browser-selfhost
 * @author MemberJunction.com
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseRemoteBrowserProvider, RemoteBrowserProviderContext } from '@memberjunction/remote-browser-base';
import { AcquiredCdpSession, BaseCdpRemoteBrowserProvider } from '@memberjunction/remote-browser-cdp';
import {
    ChromeContainerAcquireOptions,
    ChromeContainerRunnerFactory,
    IChromeContainerRunner,
} from './chrome-container-runner';
import { LocalChromeContainerRunner } from './local-chrome-container-runner';
import { SelfHostSessionBackend } from './selfhost-session-backend';

/**
 * The `DriverClass` key {@link SelfHostRemoteBrowser} registers under. A `MJ: AI Remote Browser Providers`
 * row with `DriverClass = 'SelfHostRemoteBrowser'` resolves to this driver via the `ClassFactory`.
 */
export const SELF_HOST_REMOTE_BROWSER_DRIVER_CLASS = 'SelfHostRemoteBrowser';

/**
 * The DEFAULT Chrome-container-runner factory: a {@link LocalChromeContainerRunner} that launches a local
 * headless Chromium via Playwright (no Docker, no container orchestrator, no cloud account). This makes
 * Self-Hosted Chrome work OUT OF THE BOX — a deployment needs no `SetContainerRunnerFactory` call and no
 * external service to drive a real browser. A deployment that wants a real container backend overrides it
 * via {@link SelfHostRemoteBrowser.SetContainerRunnerFactory}; tests inject a `FakeChromeContainerRunner`.
 *
 * @returns A {@link LocalChromeContainerRunner}.
 */
const defaultContainerRunnerFactory: ChromeContainerRunnerFactory = () => new LocalChromeContainerRunner();

/**
 * The Self-Hosted Chrome Remote Browser driver. Subclasses {@link BaseCdpRemoteBrowserProvider} and
 * implements only {@link AcquireSession}; all connect/disconnect orchestration, action mapping, and
 * capability gating are inherited.
 *
 * Construct via the default constructor (the engine's `ClassFactory` path). By default it uses a
 * {@link LocalChromeContainerRunner} (local headless Chromium) so it works with no external service. The
 * container-runner seam is bound process-wide via the static {@link SetContainerRunnerFactory} — mirroring
 * how bridge drivers bind their real SDK — so a deployment that wants a real container backend overrides
 * the default once at startup and every resolved driver instance shares it.
 *
 * Registered via `@RegisterClass(BaseRemoteBrowserProvider, 'SelfHostRemoteBrowser')`.
 */
@RegisterClass(BaseRemoteBrowserProvider, SELF_HOST_REMOTE_BROWSER_DRIVER_CLASS)
export class SelfHostRemoteBrowser extends BaseCdpRemoteBrowserProvider {
    /**
     * The process-wide Chrome-container-runner factory. Defaults to {@link defaultContainerRunnerFactory}
     * (a local headless Chromium); a deployment overrides it via {@link SetContainerRunnerFactory}.
     */
    private static containerRunnerFactory: ChromeContainerRunnerFactory = defaultContainerRunnerFactory;

    /**
     * Overrides the {@link ChromeContainerRunnerFactory} every {@link SelfHostRemoteBrowser} instance uses
     * to acquire its Chrome container — the override seam, mirroring how bridge drivers bind their real
     * SDK. The default is a local-Chromium runner, so this is only needed to point self-host at a real
     * container backend; tests call it with a factory that returns a fake runner.
     *
     * @param factory The factory that constructs the Chrome-container runner.
     */
    public static SetContainerRunnerFactory(factory: ChromeContainerRunnerFactory): void {
        SelfHostRemoteBrowser.containerRunnerFactory = factory;
    }

    /**
     * Acquires a CDP endpoint by leasing a headless-Chrome container through the bound runner, then wraps
     * the container handle in a {@link SelfHostSessionBackend}. The shared base attaches its adapter to
     * the returned endpoint and delegates the backend-specific concerns (live view / native-AI / release)
     * to the backend.
     *
     * @param ctx The provider context (features, configuration, control mode, context user).
     * @returns A promise resolving to the acquired CDP endpoint + Self-Hosted Chrome backend hooks.
     */
    protected async AcquireSession(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        this.applyContext(ctx);

        const runner: IChromeContainerRunner = SelfHostRemoteBrowser.containerRunnerFactory();
        const options = this.buildAcquireOptions(ctx);
        const handle = await runner.Acquire(options);

        return {
            CdpEndpoint: handle.CdpEndpoint,
            Backend: new SelfHostSessionBackend(handle),
        };
    }

    /**
     * Builds the {@link ChromeContainerAcquireOptions} for a session from the provider context — carrying
     * the optional viewport hints and the full opaque backend configuration through to the runner.
     *
     * @param ctx The provider context whose `Configuration` may carry viewport + backend hints.
     * @returns The acquire options to hand the Chrome-container runner.
     */
    private buildAcquireOptions(ctx: RemoteBrowserProviderContext): ChromeContainerAcquireOptions {
        return {
            ViewportWidth: this.readNumberOption(ctx.Configuration, 'ViewportWidth'),
            ViewportHeight: this.readNumberOption(ctx.Configuration, 'ViewportHeight'),
            Configuration: ctx.Configuration,
        };
    }

    /**
     * Reads an optional numeric value from the opaque, backend-specific `Configuration` record without
     * resorting to `any`. Returns `undefined` when the key is absent or not a finite number.
     *
     * @param configuration The opaque configuration record (or undefined).
     * @param key The key to read.
     * @returns The numeric value, or `undefined` when absent/non-numeric.
     */
    private readNumberOption(
        configuration: Record<string, unknown> | undefined,
        key: string,
    ): number | undefined {
        const value = configuration?.[key];
        return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    }
}

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration of
 * {@link SelfHostRemoteBrowser} and may eliminate it. Import and call this no-op from a static code path
 * (the package entry point does) so the `ClassFactory` can resolve `'SelfHostRemoteBrowser'`.
 */
export function LoadSelfHostRemoteBrowser(): void {
    // Intentionally empty — referencing the module is what prevents tree-shaking.
}
