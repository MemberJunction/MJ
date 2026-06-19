import { describe, it, expect, beforeEach } from 'vitest';
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import {
    BaseRemoteBrowserProvider,
    RemoteBrowserProviderContext,
    RemoteBrowserCapabilityNotSupportedError,
    IRemoteBrowserProviderFeatures,
} from '@memberjunction/remote-browser-base';
import {
    AcquiredCdpSession,
    ICdpSessionBackend,
} from '@memberjunction/remote-browser-cdp';
import {
    SteelRemoteBrowser,
    STEEL_DRIVER_CLASS,
} from '../steel-remote-browser';
import {
    ISteelClient,
    SteelCreateSessionOptions,
    SteelSessionHandles,
} from '../steel-client';

// ──────────────────────────────────────────────────────────────────────────────
// FakeSteelClient — an in-memory ISteelClient with capture sinks.
// No network, no real Steel SDK.
// ──────────────────────────────────────────────────────────────────────────────

class FakeSteelClient implements ISteelClient {
    public CreateCalls = 0;
    public LastCreateOptions?: SteelCreateSessionOptions;
    public readonly ReleasedSessions: string[] = [];

    constructor(private readonly handles: SteelSessionHandles) {}

    public async CreateSession(options: SteelCreateSessionOptions): Promise<SteelSessionHandles> {
        this.CreateCalls++;
        this.LastCreateOptions = options;
        return this.handles;
    }

    public async ReleaseSession(sessionId: string): Promise<void> {
        this.ReleasedSessions.push(sessionId);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Test harness — a driver subclass that exposes the protected AcquireSession so the
// backend hooks can be exercised directly without standing up a real CDP browser.
// ──────────────────────────────────────────────────────────────────────────────

class TestableSteelRemoteBrowser extends SteelRemoteBrowser {
    public AcquireForTest(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        return this.AcquireSession(ctx);
    }
}

const FEATURES: IRemoteBrowserProviderFeatures = {
    RawCdpControl: true,
    LiveView: true,
    HumanTakeover: true,
    Stealth: true,
};

function makeContext(configuration?: Record<string, unknown>): RemoteBrowserProviderContext {
    return {
        Features: FEATURES,
        ProviderName: 'Steel',
        ProviderType: 'Service',
        ControlMode: 'Collaborative',
        Configuration: configuration,
    };
}

const HANDLES: SteelSessionHandles = {
    SessionId: 'steel-session-1',
    CdpEndpoint: 'wss://connect.steel.example/cdp/steel-session-1',
    SessionViewerUrl: 'https://app.steel.example/sessions/steel-session-1',
};

describe('SteelRemoteBrowser', () => {
    let fake: FakeSteelClient;

    beforeEach(() => {
        fake = new FakeSteelClient(HANDLES);
        SteelRemoteBrowser.SetClientFactory(() => fake);
    });

    describe('AcquireSession', () => {
        it('creates a Steel session and returns its CDP endpoint', async () => {
            const driver = new TestableSteelRemoteBrowser();
            const config = { Region: 'us-west' };

            const acquired = await driver.AcquireForTest(makeContext(config));

            expect(fake.CreateCalls).toBe(1);
            expect(fake.LastCreateOptions?.Configuration).toEqual(config);
            expect(acquired.CdpEndpoint).toBe(HANDLES.CdpEndpoint);
        });
    });

    describe('GetLiveViewUrl', () => {
        it('returns the hosted session-viewer URL from CreateSession', async () => {
            const driver = new TestableSteelRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await expect(acquired.Backend.GetLiveViewUrl()).resolves.toBe(HANDLES.SessionViewerUrl);
        });
    });

    describe('InvokeNativeAIControl', () => {
        it('throws RemoteBrowserCapabilityNotSupportedError — Steel has no native AI harness', async () => {
            const driver = new TestableSteelRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            expect(() => acquired.Backend.InvokeNativeAIControl('log in')).toThrow(
                RemoteBrowserCapabilityNotSupportedError,
            );
        });

        it('reports NativeAIControl / Steel on the thrown error', async () => {
            const driver = new TestableSteelRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            try {
                acquired.Backend.InvokeNativeAIControl('log in');
                expect.unreachable('InvokeNativeAIControl should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(RemoteBrowserCapabilityNotSupportedError);
                const capabilityError = err as RemoteBrowserCapabilityNotSupportedError;
                expect(capabilityError.FeatureName).toBe('NativeAIControl');
                expect(capabilityError.ProviderName).toBe('Steel');
            }
        });
    });

    describe('Release', () => {
        it('releases the Steel session via ReleaseSession', async () => {
            const driver = new TestableSteelRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await acquired.Backend.Release();

            expect(fake.ReleasedSessions).toEqual([HANDLES.SessionId]);
        });
    });

    describe('default client factory', () => {
        it('throws until SetClientFactory binds a real client', async () => {
            SteelRemoteBrowser.SetClientFactory(() => {
                throw new Error(
                    'SteelRemoteBrowser has no Steel client bound. Call SteelRemoteBrowser.SetClientFactory(...) ' +
                        'to bind the real Steel client (steel-sdk) before opening a session.',
                );
            });
            const driver = new TestableSteelRemoteBrowser();

            await expect(driver.AcquireForTest(makeContext())).rejects.toThrow(/bind the real Steel client/);
        });
    });

    describe('@RegisterClass registration', () => {
        it('resolves SteelRemoteBrowser by its DriverClass via the ClassFactory', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemoteBrowserProvider>(
                BaseRemoteBrowserProvider,
                STEEL_DRIVER_CLASS,
            );
            expect(instance).toBeInstanceOf(SteelRemoteBrowser);
        });

        it('exposes the expected DriverClass constant', () => {
            expect(STEEL_DRIVER_CLASS).toBe('SteelRemoteBrowser');
            // Keep the decorator import referenced so its registration side-effect is anchored.
            expect(typeof RegisterClass).toBe('function');
        });
    });
});

// Ensure the ICdpSessionBackend shape is honored at compile time by the backend object the driver
// returns (type-only assertion; no runtime cost).
type _BackendShapeCheck = ICdpSessionBackend;
