import { describe, it, expect } from 'vitest';
import {
    IRemoteBrowserSession,
    RemoteBrowserProviderContext,
} from '@memberjunction/remote-browser-base';
import { BrowserConfig, PlaywrightBrowserAdapter } from '@memberjunction/computer-use';
import {
    AcquiredCdpSession,
    BaseCdpRemoteBrowserProvider,
} from '../base-cdp-remote-browser-provider';
import { FakeCdpSessionBackend, FakePlaywrightBrowserAdapter } from './fakes';

/**
 * A concrete test driver exercising the abstract base. It overrides the `createAdapter` factory seam to
 * return a {@link FakePlaywrightBrowserAdapter} (so no real browser is launched), scripts
 * `AcquireSession`, and records what the base did. It also captures the built config for assertions.
 */
class TestCdpProvider extends BaseCdpRemoteBrowserProvider {
    public AcquiredEndpoint = 'ws://acquired.test/cdp';
    public TestBackend = new FakeCdpSessionBackend();
    public Adapter = new FakePlaywrightBrowserAdapter();
    public AcquireCount = 0;
    public LastContext: RemoteBrowserProviderContext | null = null;
    public BuiltConfig: BrowserConfig | null = null;

    protected override createAdapter(): PlaywrightBrowserAdapter {
        return this.Adapter;
    }

    protected async AcquireSession(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        this.AcquireCount++;
        this.LastContext = ctx;
        return { CdpEndpoint: this.AcquiredEndpoint, Backend: this.TestBackend };
    }

    protected override buildBrowserConfig(
        cdpEndpoint: string,
        ctx: RemoteBrowserProviderContext,
    ): BrowserConfig {
        this.BuiltConfig = super.buildBrowserConfig(cdpEndpoint, ctx);
        return this.BuiltConfig;
    }
}

/** Alias used by the config-focused tests; same fake-adapter driver. */
class FakeAdapterProvider extends TestCdpProvider {
    constructor() {
        super();
        this.AcquiredEndpoint = 'ws://fake.test/cdp';
    }
}

/** Minimal valid context for Connect. */
function buildContext(
    overrides: Partial<RemoteBrowserProviderContext> = {},
): RemoteBrowserProviderContext {
    return {
        Features: { ScreenStreaming: true },
        ProviderName: 'TestProvider',
        ProviderType: 'Service',
        ControlMode: 'AgentOnly',
        ...overrides,
    };
}

describe('BaseCdpRemoteBrowserProvider.Connect', () => {
    it('applies context, acquires a session, and returns a wired CdpRemoteBrowserSession', async () => {
        const provider = new TestCdpProvider();
        const ctx = buildContext();

        const session: IRemoteBrowserSession = await provider.Connect(ctx);

        expect(provider.AcquireCount).toBe(1);
        expect(provider.LastContext).toBe(ctx);
        // applyContext ran: features captured onto the provider.
        expect(provider.Features.ScreenStreaming).toBe(true);
        // The session is wired to the acquired endpoint.
        expect(session.GetCdpEndpoint()).toBe('ws://acquired.test/cdp');
    });

    it('builds a CDP-attach BrowserConfig with ConnectType "cdp" and viewport hints from config', async () => {
        const provider = new FakeAdapterProvider();
        const ctx = buildContext({
            Configuration: { ViewportWidth: 1600, ViewportHeight: 900 },
        });

        await provider.Connect(ctx);

        expect(provider.BuiltConfig).not.toBeNull();
        const config = provider.BuiltConfig as BrowserConfig;
        expect(config.Connect).toBe('ws://fake.test/cdp');
        expect(config.ConnectType).toBe('cdp');
        expect(config.ViewportWidth).toBe(1600);
        expect(config.ViewportHeight).toBe(900);
    });

    it('ignores non-numeric viewport config values, keeping BrowserConfig defaults', async () => {
        const provider = new FakeAdapterProvider();
        const defaults = new BrowserConfig();
        const ctx = buildContext({
            Configuration: { ViewportWidth: 'wide', ViewportHeight: NaN },
        });

        await provider.Connect(ctx);

        const config = provider.BuiltConfig as BrowserConfig;
        expect(config.ViewportWidth).toBe(defaults.ViewportWidth);
        expect(config.ViewportHeight).toBe(defaults.ViewportHeight);
    });
});

describe('BaseCdpRemoteBrowserProvider.Disconnect', () => {
    it('closes the adapter and releases the backend after a Connect', async () => {
        const provider = new TestCdpProvider();
        await provider.Connect(buildContext());

        await provider.Disconnect();

        expect(provider.TestBackend.ReleaseCount).toBe(1);
    });

    it('is a safe no-op when nothing was connected', async () => {
        const provider = new TestCdpProvider();
        await expect(provider.Disconnect()).resolves.toBeUndefined();
        expect(provider.TestBackend.ReleaseCount).toBe(0);
    });

    it('clears retained references so a second Disconnect does not re-release', async () => {
        const provider = new TestCdpProvider();
        await provider.Connect(buildContext());
        await provider.Disconnect();
        await provider.Disconnect();
        expect(provider.TestBackend.ReleaseCount).toBe(1);
    });
});
