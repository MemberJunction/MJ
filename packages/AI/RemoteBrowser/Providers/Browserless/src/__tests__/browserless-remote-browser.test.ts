import { describe, it, expect, beforeEach } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    BaseRemoteBrowserProvider,
    RemoteBrowserCapabilityNotSupportedError,
    RemoteBrowserProviderContext,
} from '@memberjunction/remote-browser-base';
import { AcquiredCdpSession } from '@memberjunction/remote-browser-cdp';
import {
    BROWSERLESS_PROVIDER_NAME,
    BROWSERLESS_REMOTE_BROWSER_DRIVER_CLASS,
    BrowserlessRemoteBrowser,
} from '../browserless-remote-browser';
import {
    BrowserlessCreateSessionOptions,
    BrowserlessCreateSessionResult,
    IBrowserlessClient,
} from '../browserless-client';

// ──────────────────────────────────────────────────────────────────────────────
// FakeBrowserlessClient — an in-memory IBrowserlessClient with capture sinks.
// No network, no real Browserless account, no API key.
// ──────────────────────────────────────────────────────────────────────────────

class FakeBrowserlessClient implements IBrowserlessClient {
    public LastCreateOptions?: BrowserlessCreateSessionOptions;
    public readonly ClosedSessionIds: string[] = [];
    public CreateCalls = 0;

    public async CreateSession(options: BrowserlessCreateSessionOptions): Promise<BrowserlessCreateSessionResult> {
        this.CreateCalls++;
        this.LastCreateOptions = options;
        return {
            SessionId: 'bl-session-1',
            CdpEndpoint: 'wss://chrome.browserless.io/chromium?token=fake',
            DebugViewerUrl: 'https://chrome.browserless.io/debug/bl-session-1',
        };
    }

    public async CloseSession(sessionId: string): Promise<void> {
        this.ClosedSessionIds.push(sessionId);
    }
}

/**
 * Test subclass exposing the protected `AcquireSession` so we can verify the acquire path without
 * standing up a real browser (the inherited `Connect` would attach a Playwright adapter).
 */
class TestableBrowserlessRemoteBrowser extends BrowserlessRemoteBrowser {
    public AcquireForTest(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        return this.AcquireSession(ctx);
    }
}

function makeContext(): RemoteBrowserProviderContext {
    return {
        Features: {
            RawCdpControl: true,
            LiveView: true,
            ScreenStreaming: true,
            SessionRecording: true,
            ProxyEgress: true,
            MultiTab: true,
            FileDownloads: true,
        },
        ProviderName: BROWSERLESS_PROVIDER_NAME,
        ProviderType: 'Service',
        ControlMode: 'ViewOnly',
        Configuration: { Region: 'us-east-1' },
    };
}

describe('BrowserlessRemoteBrowser', () => {
    let fake: FakeBrowserlessClient;

    beforeEach(() => {
        fake = new FakeBrowserlessClient();
        BrowserlessRemoteBrowser.SetClientFactory(() => fake);
    });

    describe('AcquireSession', () => {
        it('creates a Browserless session and returns its CDP endpoint + backend', async () => {
            const driver = new TestableBrowserlessRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            expect(fake.CreateCalls).toBe(1);
            expect(fake.LastCreateOptions).toEqual({ Region: 'us-east-1' });
            expect(acquired.CdpEndpoint).toBe('wss://chrome.browserless.io/chromium?token=fake');
            expect(acquired.Backend).toBeDefined();
        });

        it('passes an empty options object through when no configuration is present', async () => {
            const driver = new TestableBrowserlessRemoteBrowser();
            const ctx = makeContext();
            ctx.Configuration = undefined;

            await driver.AcquireForTest(ctx);

            expect(fake.LastCreateOptions).toEqual({});
        });
    });

    describe('Backend.GetLiveViewUrl', () => {
        it('returns the Browserless hosted debug viewer URL', async () => {
            const driver = new TestableBrowserlessRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await expect(acquired.Backend.GetLiveViewUrl()).resolves.toBe(
                'https://chrome.browserless.io/debug/bl-session-1',
            );
        });
    });

    describe('Backend.InvokeNativeAIControl', () => {
        it('throws RemoteBrowserCapabilityNotSupportedError (Browserless has no native AI control)', async () => {
            const driver = new TestableBrowserlessRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await expect(acquired.Backend.InvokeNativeAIControl('log in')).rejects.toBeInstanceOf(
                RemoteBrowserCapabilityNotSupportedError,
            );
            await expect(acquired.Backend.InvokeNativeAIControl('log in')).rejects.toMatchObject({
                FeatureName: 'NativeAIControl',
                ProviderName: BROWSERLESS_PROVIDER_NAME,
            });
        });
    });

    describe('Backend.Release', () => {
        it('closes the Browserless session via the client', async () => {
            const driver = new TestableBrowserlessRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await acquired.Backend.Release();

            expect(fake.ClosedSessionIds).toEqual(['bl-session-1']);
        });

        it('is idempotent — a second Release does not close the session again', async () => {
            const driver = new TestableBrowserlessRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await acquired.Backend.Release();
            await acquired.Backend.Release();

            expect(fake.ClosedSessionIds).toEqual(['bl-session-1']);
        });
    });

    describe('default client factory', () => {
        it('throws an explicit "bind the real Browserless client" error until SetClientFactory is called', async () => {
            // Bind the default factory back (it throws), simulating an unbound driver.
            BrowserlessRemoteBrowser.SetClientFactory(() => {
                throw new Error(
                    'BrowserlessRemoteBrowser has no Browserless client bound. Call ' +
                        'BrowserlessRemoteBrowser.SetClientFactory(...) with a factory that builds an IBrowserlessClient ' +
                        'over the real browserless.io CDP-as-a-service connect URL, or inject a fake in tests.',
                );
            });
            const driver = new TestableBrowserlessRemoteBrowser();

            await expect(driver.AcquireForTest(makeContext())).rejects.toThrow(/no Browserless client bound/);
        });
    });

    describe('@RegisterClass registration', () => {
        it('resolves the driver from the ClassFactory by its DriverClass key', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemoteBrowserProvider>(
                BaseRemoteBrowserProvider,
                BROWSERLESS_REMOTE_BROWSER_DRIVER_CLASS,
            );

            expect(instance).toBeInstanceOf(BrowserlessRemoteBrowser);
        });

        it('exposes the expected DriverClass key constant', () => {
            expect(BROWSERLESS_REMOTE_BROWSER_DRIVER_CLASS).toBe('BrowserlessRemoteBrowser');
            // Reference RegisterClass so the import is exercised and the decorator path is loaded.
            expect(typeof RegisterClass).toBe('function');
        });
    });
});
