import { describe, it, expect, vi } from 'vitest';

// base-remote-browser-provider uses `UserInfo` only as a TYPE (erased) and the features interface as a
// TYPE alias (also erased). Neither produces a runtime import. We still stub the two packages minimally
// so the module graph resolves without pulling heavy deps.
vi.mock('@memberjunction/core', () => ({ UserInfo: class {} }));
vi.mock('@memberjunction/core-entities', () => ({}));

import {
    BaseRemoteBrowserProvider,
    RemoteBrowserProviderContext,
} from '../base-remote-browser-provider';
import { IRemoteBrowserProviderFeatures } from '../remote-browser-features';
import { IRemoteBrowserSession, RemoteBrowserActionResult } from '../remote-browser-session';
import { RemoteBrowserCapabilityNotSupportedError } from '../capability-errors';

/**
 * A trivial session stub — the provider base contract only needs Connect to return *something*
 * shaped like IRemoteBrowserSession; the base never calls into it.
 */
const stubSession: IRemoteBrowserSession = {
    GetCdpEndpoint: () => 'ws://localhost:9222/devtools/browser/abc',
    Navigate: async (url: string): Promise<RemoteBrowserActionResult> => ({ Success: true, CurrentUrl: url }),
    ExecuteAction: async (): Promise<RemoteBrowserActionResult> => ({ Success: true }),
    CaptureScreenshot: async () => 'AAAA',
    GetCurrentUrl: () => 'about:blank',
    Close: async () => undefined,
    GetLiveViewUrl: async () => 'https://live.example/abc',
    StartScreencast: async () => undefined,
    StopScreencast: async () => undefined,
    RouteHumanInput: () => undefined,
    InvokeNativeAIControl: async (): Promise<RemoteBrowserActionResult> => ({ Success: true }),
};

/**
 * Minimal driver implementing only the two abstract methods. Used to verify the base lifecycle +
 * the protected RequireFeature / notSupported helpers (exercised via a thin public probe).
 */
class BareProvider extends BaseRemoteBrowserProvider {
    public connected = false;

    public async Connect(ctx: RemoteBrowserProviderContext): Promise<IRemoteBrowserSession> {
        this.applyContext(ctx);
        this.connected = true;
        return stubSession;
    }

    public async Disconnect(): Promise<void> {
        this.connected = false;
    }

    // Test-only probes that exercise the protected helpers exactly as a real driver would.
    public probeRequireFeature(flag: keyof IRemoteBrowserProviderFeatures): void {
        this.RequireFeature(flag);
    }
    public probeNotSupported(name: string): RemoteBrowserCapabilityNotSupportedError {
        return this.notSupported(name);
    }
}

function ctxWith(
    features: IRemoteBrowserProviderFeatures,
    providerName = 'TestBackend',
): RemoteBrowserProviderContext {
    return {
        Features: features,
        ProviderName: providerName,
        ProviderType: 'Service',
        ControlMode: 'AgentOnly',
    };
}

describe('BaseRemoteBrowserProvider — abstract lifecycle', () => {
    it('Connect records context and returns a live session', async () => {
        const p = new BareProvider();
        const session = await p.Connect(ctxWith({ RawCdpControl: true }, 'Browserbase'));
        expect(p.connected).toBe(true);
        expect(session.GetCdpEndpoint()).toContain('ws://');
        expect(p.Features.RawCdpControl).toBe(true);
    });

    it('Disconnect tears down', async () => {
        const p = new BareProvider();
        await p.Connect(ctxWith({}));
        await p.Disconnect();
        expect(p.connected).toBe(false);
    });

    it('applyContext falls back to the class name when ProviderName is empty', async () => {
        const p = new BareProvider();
        await p.Connect(ctxWith({}, ''));
        const err = p.probeNotSupported('SomeFeature');
        expect(err.ProviderName).toBe('BareProvider');
    });
});

describe('BaseRemoteBrowserProvider — RequireFeature defense-in-depth', () => {
    it('throws when the flag is omitted', async () => {
        const p = new BareProvider();
        await p.Connect(ctxWith({}, 'Steel'));
        expect(() => p.probeRequireFeature('LiveView')).toThrow(RemoteBrowserCapabilityNotSupportedError);
    });

    it('throws when the flag is explicitly false', async () => {
        const p = new BareProvider();
        await p.Connect(ctxWith({ HumanTakeover: false }, 'Steel'));
        expect(() => p.probeRequireFeature('HumanTakeover')).toThrow(RemoteBrowserCapabilityNotSupportedError);
    });

    it('passes when the flag is true', async () => {
        const p = new BareProvider();
        await p.Connect(ctxWith({ LiveView: true }, 'Steel'));
        expect(() => p.probeRequireFeature('LiveView')).not.toThrow();
    });

    it('the thrown error carries the feature + provider name', async () => {
        const p = new BareProvider();
        await p.Connect(ctxWith({}, 'Browserbase'));
        try {
            p.probeRequireFeature('NativeAIControl');
            throw new Error('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(RemoteBrowserCapabilityNotSupportedError);
            if (e instanceof RemoteBrowserCapabilityNotSupportedError) {
                expect(e.FeatureName).toBe('NativeAIControl');
                expect(e.ProviderName).toBe('Browserbase');
            }
        }
    });
});

describe('BaseRemoteBrowserProvider — notSupported helper', () => {
    it('builds an error stamped with the provider name', async () => {
        const p = new BareProvider();
        await p.Connect(ctxWith({}, 'Hyperbrowser'));
        const err = p.probeNotSupported('GetLiveViewUrl');
        expect(err).toBeInstanceOf(RemoteBrowserCapabilityNotSupportedError);
        expect(err.FeatureName).toBe('GetLiveViewUrl');
        expect(err.ProviderName).toBe('Hyperbrowser');
    });
});
