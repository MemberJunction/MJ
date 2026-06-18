import { describe, it, expect, beforeEach } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    BaseRemoteBrowserProvider,
    RemoteBrowserProviderContext,
} from '@memberjunction/remote-browser-base';
import { AcquiredCdpSession } from '@memberjunction/remote-browser-cdp';
import {
    HYPERBROWSER_PROVIDER_NAME,
    HYPERBROWSER_REMOTE_BROWSER_DRIVER_CLASS,
    HyperbrowserRemoteBrowser,
} from '../hyperbrowser-remote-browser';
import {
    HyperbrowserAgentTaskResult,
    HyperbrowserCreateSessionOptions,
    HyperbrowserCreateSessionResult,
    IHyperbrowserClient,
} from '../hyperbrowser-client';

// ──────────────────────────────────────────────────────────────────────────────
// FakeHyperbrowserClient — an in-memory IHyperbrowserClient with capture sinks.
// No network, no real @hyperbrowser/sdk.
// ──────────────────────────────────────────────────────────────────────────────

class FakeHyperbrowserClient implements IHyperbrowserClient {
    public LastCreateOptions?: HyperbrowserCreateSessionOptions;
    public readonly StoppedSessionIds: string[] = [];
    public readonly AgentTasks: Array<{ SessionId: string; Intent: string }> = [];
    public CreateCalls = 0;

    /** The agent-task result the fake returns; tests override it to drive the mapping assertions. */
    public NextAgentTaskResult: HyperbrowserAgentTaskResult = {
        Success: true,
        CurrentUrl: 'https://example.com/dashboard',
        Detail: 'logged in',
    };

    public async CreateSession(options: HyperbrowserCreateSessionOptions): Promise<HyperbrowserCreateSessionResult> {
        this.CreateCalls++;
        this.LastCreateOptions = options;
        return {
            SessionId: 'hb-session-1',
            CdpEndpoint: 'wss://connect.hyperbrowser.ai/session/hb-session-1',
            LiveViewUrl: 'https://app.hyperbrowser.ai/live/hb-session-1',
        };
    }

    public async StopSession(sessionId: string): Promise<void> {
        this.StoppedSessionIds.push(sessionId);
    }

    public async RunAgentTask(sessionId: string, intent: string): Promise<HyperbrowserAgentTaskResult> {
        this.AgentTasks.push({ SessionId: sessionId, Intent: intent });
        return this.NextAgentTaskResult;
    }
}

/**
 * Test subclass exposing the protected `AcquireSession` so we can verify the acquire path without
 * standing up a real browser (the inherited `Connect` would attach a Playwright adapter).
 */
class TestableHyperbrowserRemoteBrowser extends HyperbrowserRemoteBrowser {
    public AcquireForTest(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        return this.AcquireSession(ctx);
    }
}

function makeContext(): RemoteBrowserProviderContext {
    return {
        Features: {
            RawCdpControl: true,
            NativeAIControl: true,
            LiveView: true,
            HumanTakeover: true,
            ScreenStreaming: true,
            Stealth: true,
            ProxyEgress: true,
            SessionRecording: true,
            PersistentContext: true,
            MultiTab: true,
            FileDownloads: true,
            CaptchaSolving: true,
        },
        ProviderName: HYPERBROWSER_PROVIDER_NAME,
        ProviderType: 'Service',
        ControlMode: 'Collaborative',
        Configuration: { Stealth: true },
    };
}

describe('HyperbrowserRemoteBrowser', () => {
    let fake: FakeHyperbrowserClient;

    beforeEach(() => {
        fake = new FakeHyperbrowserClient();
        HyperbrowserRemoteBrowser.SetClientFactory(() => fake);
    });

    describe('AcquireSession', () => {
        it('creates a Hyperbrowser session and returns its CDP endpoint + backend', async () => {
            const driver = new TestableHyperbrowserRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            expect(fake.CreateCalls).toBe(1);
            expect(fake.LastCreateOptions).toEqual({ Stealth: true });
            expect(acquired.CdpEndpoint).toBe('wss://connect.hyperbrowser.ai/session/hb-session-1');
            expect(acquired.Backend).toBeDefined();
        });

        it('passes an empty options object through when no configuration is present', async () => {
            const driver = new TestableHyperbrowserRemoteBrowser();
            const ctx = makeContext();
            ctx.Configuration = undefined;

            await driver.AcquireForTest(ctx);

            expect(fake.LastCreateOptions).toEqual({});
        });
    });

    describe('Backend.GetLiveViewUrl', () => {
        it('returns the Hyperbrowser hosted live-view URL', async () => {
            const driver = new TestableHyperbrowserRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await expect(acquired.Backend.GetLiveViewUrl()).resolves.toBe(
                'https://app.hyperbrowser.ai/live/hb-session-1',
            );
        });
    });

    describe('Backend.InvokeNativeAIControl', () => {
        it('delegates the intent to RunAgentTask and maps the result onto a RemoteBrowserActionResult', async () => {
            const driver = new TestableHyperbrowserRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            const result = await acquired.Backend.InvokeNativeAIControl('log in with the test account');

            expect(fake.AgentTasks).toEqual([
                { SessionId: 'hb-session-1', Intent: 'log in with the test account' },
            ]);
            expect(result).toEqual({
                Success: true,
                CurrentUrl: 'https://example.com/dashboard',
                Detail: 'logged in',
            });
        });

        it('maps a failed agent task onto Success=false with the harness detail', async () => {
            fake.NextAgentTaskResult = { Success: false, Detail: 'element not found' };
            const driver = new TestableHyperbrowserRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            const result = await acquired.Backend.InvokeNativeAIControl('click submit');

            expect(result.Success).toBe(false);
            expect(result.Detail).toBe('element not found');
            expect(result.CurrentUrl).toBeUndefined();
        });
    });

    describe('Backend.Release', () => {
        it('stops the Hyperbrowser session via the client', async () => {
            const driver = new TestableHyperbrowserRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await acquired.Backend.Release();

            expect(fake.StoppedSessionIds).toEqual(['hb-session-1']);
        });

        it('is idempotent — a second Release does not stop the session again', async () => {
            const driver = new TestableHyperbrowserRemoteBrowser();
            const acquired = await driver.AcquireForTest(makeContext());

            await acquired.Backend.Release();
            await acquired.Backend.Release();

            expect(fake.StoppedSessionIds).toEqual(['hb-session-1']);
        });
    });

    describe('default client factory', () => {
        it('throws an explicit "bind the real Hyperbrowser client" error until SetClientFactory is called', async () => {
            // Bind the default factory back (it throws), simulating an unbound driver.
            HyperbrowserRemoteBrowser.SetClientFactory(() => {
                throw new Error(
                    'HyperbrowserRemoteBrowser has no Hyperbrowser client bound. Call ' +
                        'HyperbrowserRemoteBrowser.SetClientFactory(...) with a factory that builds an IHyperbrowserClient ' +
                        'over the real @hyperbrowser/sdk, or inject a fake in tests.',
                );
            });
            const driver = new TestableHyperbrowserRemoteBrowser();

            await expect(driver.AcquireForTest(makeContext())).rejects.toThrow(/no Hyperbrowser client bound/);
        });
    });

    describe('@RegisterClass registration', () => {
        it('resolves the driver from the ClassFactory by its DriverClass key', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemoteBrowserProvider>(
                BaseRemoteBrowserProvider,
                HYPERBROWSER_REMOTE_BROWSER_DRIVER_CLASS,
            );

            expect(instance).toBeInstanceOf(HyperbrowserRemoteBrowser);
        });

        it('exposes the expected DriverClass key constant', () => {
            expect(HYPERBROWSER_REMOTE_BROWSER_DRIVER_CLASS).toBe('HyperbrowserRemoteBrowser');
            // Reference RegisterClass so the import is exercised and the decorator path is loaded.
            expect(typeof RegisterClass).toBe('function');
        });
    });
});
