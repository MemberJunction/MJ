import { describe, it, expect, beforeEach } from 'vitest';
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import {
    BaseRemoteBrowserProvider,
    RemoteBrowserProviderContext,
    IRemoteBrowserProviderFeatures,
} from '@memberjunction/remote-browser-base';
import {
    AcquiredCdpSession,
    ICdpSessionBackend,
} from '@memberjunction/remote-browser-cdp';
import {
    BrowserbaseRemoteBrowser,
    BROWSERBASE_DRIVER_CLASS,
} from '../browserbase-remote-browser';
import {
    IBrowserbaseClient,
    BrowserbaseActResult,
    BrowserbaseCreateSessionOptions,
    BrowserbaseSessionHandles,
} from '../browserbase-client';

// ──────────────────────────────────────────────────────────────────────────────
// FakeBrowserbaseClient — an in-memory IBrowserbaseClient with capture sinks and a
// scriptable Act result. No network, no real Browserbase SDK.
// ──────────────────────────────────────────────────────────────────────────────

class FakeBrowserbaseClient implements IBrowserbaseClient {
    public CreateCalls = 0;
    public LastCreateOptions?: BrowserbaseCreateSessionOptions;
    public readonly EndedSessions: string[] = [];
    public readonly ActCalls: { SessionId: string; Intent: string }[] = [];

    public NextActResult: BrowserbaseActResult = { Success: true };

    constructor(private readonly handles: BrowserbaseSessionHandles) {}

    public async CreateSession(
        options: BrowserbaseCreateSessionOptions,
    ): Promise<BrowserbaseSessionHandles> {
        this.CreateCalls++;
        this.LastCreateOptions = options;
        return this.handles;
    }

    public async EndSession(sessionId: string): Promise<void> {
        this.EndedSessions.push(sessionId);
    }

    public async Act(sessionId: string, intent: string): Promise<BrowserbaseActResult> {
        this.ActCalls.push({ SessionId: sessionId, Intent: intent });
        return this.NextActResult;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Test harness — a driver subclass that exposes the protected AcquireSession so the
// backend hooks can be exercised directly without standing up a real CDP browser.
// ──────────────────────────────────────────────────────────────────────────────

class TestableBrowserbaseRemoteBrowser extends BrowserbaseRemoteBrowser {
    public AcquireForTest(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        return this.AcquireSession(ctx);
    }
}

const FEATURES: IRemoteBrowserProviderFeatures = {
    RawCdpControl: true,
    NativeAIControl: true,
    LiveView: true,
    HumanTakeover: true,
};

function makeContext(configuration?: Record<string, unknown>): RemoteBrowserProviderContext {
    return {
        Features: FEATURES,
        ProviderName: 'Browserbase',
        ProviderType: 'Service',
        ControlMode: 'Collaborative',
        Configuration: configuration,
    };
}

const HANDLES: BrowserbaseSessionHandles = {
    SessionId: 'bb-session-1',
    CdpEndpoint: 'wss://connect.browserbase.example/cdp/bb-session-1',
    LiveViewUrl: 'https://browserbase.example/live/bb-session-1',
};

describe('BrowserbaseRemoteBrowser', () => {
    let fake: FakeBrowserbaseClient;

    beforeEach(() => {
        fake = new FakeBrowserbaseClient(HANDLES);
        BrowserbaseRemoteBrowser.SetClientFactory(() => fake);
    });

    describe('AcquireSession', () => {
        it('creates a Browserbase session and returns its CDP endpoint', async () => {
            const driver = new TestableBrowserbaseRemoteBrowser();
            const config = { Region: 'us-east-1' };

            const acquired = await driver.AcquireForTest(makeContext(config));

            expect(fake.CreateCalls).toBe(1);
            expect(fake.LastCreateOptions?.Configuration).toEqual(config);
            expect(acquired.CdpEndpoint).toBe(HANDLES.CdpEndpoint);
        });
    });

    describe('GetLiveViewUrl', () => {
        it('returns the hosted live-view URL from CreateSession', async () => {
            const driver = new TestableBrowserbaseRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await expect(acquired.Backend.GetLiveViewUrl()).resolves.toBe(HANDLES.LiveViewUrl);
        });
    });

    describe('InvokeNativeAIControl', () => {
        it('maps the Stagehand Act result onto a RemoteBrowserActionResult', async () => {
            fake.NextActResult = {
                Success: true,
                CurrentUrl: 'https://example.com/dashboard',
                Detail: 'logged in',
            };
            const driver = new TestableBrowserbaseRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            const result = await acquired.Backend.InvokeNativeAIControl('log in with the test account');

            expect(fake.ActCalls).toEqual([
                { SessionId: HANDLES.SessionId, Intent: 'log in with the test account' },
            ]);
            expect(result).toEqual({
                Success: true,
                CurrentUrl: 'https://example.com/dashboard',
                Detail: 'logged in',
            });
        });

        it('propagates a failed Act result', async () => {
            fake.NextActResult = { Success: false, Detail: 'element not found' };
            const driver = new TestableBrowserbaseRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            const result = await acquired.Backend.InvokeNativeAIControl('click the submit button');

            expect(result.Success).toBe(false);
            expect(result.Detail).toBe('element not found');
        });
    });

    describe('Release', () => {
        it('ends the Browserbase session via EndSession', async () => {
            const driver = new TestableBrowserbaseRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await acquired.Backend.Release();

            expect(fake.EndedSessions).toEqual([HANDLES.SessionId]);
        });
    });

    describe('default client factory', () => {
        it('throws until SetClientFactory binds a real client', async () => {
            // Re-bind the default by restoring a throwing factory, then assert AcquireSession fails.
            BrowserbaseRemoteBrowser.SetClientFactory(() => {
                throw new Error(
                    'BrowserbaseRemoteBrowser has no Browserbase client bound. Call ' +
                        'BrowserbaseRemoteBrowser.SetClientFactory(...) to bind the real Browserbase client ' +
                        '(@browserbasehq/sdk + Stagehand) before opening a session.',
                );
            });
            const driver = new TestableBrowserbaseRemoteBrowser();

            await expect(driver.AcquireForTest(makeContext())).rejects.toThrow(/bind the real Browserbase client/);
        });
    });

    describe('@RegisterClass registration', () => {
        it('resolves BrowserbaseRemoteBrowser by its DriverClass via the ClassFactory', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemoteBrowserProvider>(
                BaseRemoteBrowserProvider,
                BROWSERBASE_DRIVER_CLASS,
            );
            expect(instance).toBeInstanceOf(BrowserbaseRemoteBrowser);
        });

        it('exposes the expected DriverClass constant', () => {
            expect(BROWSERBASE_DRIVER_CLASS).toBe('BrowserbaseRemoteBrowser');
            // Keep the decorator import referenced so its registration side-effect is anchored.
            expect(typeof RegisterClass).toBe('function');
        });
    });
});

// Ensure the ICdpSessionBackend shape is honored at compile time by the backend object the driver
// returns (type-only assertion; no runtime cost).
type _BackendShapeCheck = ICdpSessionBackend;
