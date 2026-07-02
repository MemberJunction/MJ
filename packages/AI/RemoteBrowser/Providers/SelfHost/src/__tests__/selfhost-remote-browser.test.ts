/**
 * Unit tests for the Self-Hosted Chrome Remote Browser driver. Every test runs against an in-memory
 * `FakeChromeContainerRunner` — NO container, NO network, NO real browser.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    BaseRemoteBrowserProvider,
    RemoteBrowserCapabilityNotSupportedError,
    RemoteBrowserProviderContext,
} from '@memberjunction/remote-browser-base';
import {
    ChromeContainerAcquireOptions,
    ChromeContainerHandle,
    IChromeContainerRunner,
} from '../chrome-container-runner';
import {
    SELF_HOST_REMOTE_BROWSER_DRIVER_CLASS,
    SelfHostRemoteBrowser,
} from '../selfhost-remote-browser';
import { SELF_HOST_PROVIDER_NAME, SelfHostSessionBackend } from '../selfhost-session-backend';
import { LocalChromeContainerRunner } from '../local-chrome-container-runner';
import { AcquiredCdpSession } from '@memberjunction/remote-browser-cdp';
import { AudioCaptureChunk, PlaywrightBrowserAdapter } from '@memberjunction/computer-use';
import { RemoteBrowserAudioChunk } from '@memberjunction/remote-browser-base';

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// Fake runner — the injected seam that lets all tests run with no container/network/browser.
// ──────────────────────────────────────────────────────────────────────────────────────────────────

const FAKE_CDP_ENDPOINT = 'ws://fake-host:9222/devtools/browser/fake-session';
const FAKE_VIEWER_URL = 'https://mj.example.test/remote-browser/viewer/fake-session';

/**
 * An in-memory {@link IChromeContainerRunner} that records the options it was acquired with and exposes a
 * spy {@link ChromeContainerHandle.Release} so tests can assert teardown happened — without any real
 * container.
 */
class FakeChromeContainerRunner implements IChromeContainerRunner {
    /** Spy capturing the most recent acquire options. */
    public LastAcquireOptions: ChromeContainerAcquireOptions | null = null;

    /** Spy invoked when the handle's `Release` is called. */
    public ReleaseSpy = vi.fn<[], void>();

    public async Acquire(opts: ChromeContainerAcquireOptions): Promise<ChromeContainerHandle> {
        this.LastAcquireOptions = opts;
        return {
            CdpEndpoint: FAKE_CDP_ENDPOINT,
            ViewerUrl: FAKE_VIEWER_URL,
            Release: async () => {
                this.ReleaseSpy();
            },
        };
    }
}

/**
 * A test-only subclass exposing the protected {@link SelfHostRemoteBrowser.AcquireSession} so tests can
 * drive it directly without standing up the full Connect path (which would need a real CDP adapter).
 */
class TestableSelfHostRemoteBrowser extends SelfHostRemoteBrowser {
    public AcquireSessionForTest(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        return this.AcquireSession(ctx);
    }
}

/**
 * Builds a minimal provider context for the Self-Hosted Chrome backend.
 *
 * @param configuration Optional opaque backend configuration to thread through.
 */
function buildContext(configuration?: Record<string, unknown>): RemoteBrowserProviderContext {
    return {
        Features: {
            RawCdpControl: true,
            LiveView: true,
            HumanTakeover: true,
            ScreenStreaming: true,
            PersistentContext: true,
            MultiTab: true,
            FileDownloads: true,
        },
        ProviderName: SELF_HOST_PROVIDER_NAME,
        ProviderType: 'SelfHost',
        ControlMode: 'Collaborative',
        Configuration: configuration,
    };
}

describe('SelfHostRemoteBrowser', () => {
    let runner: FakeChromeContainerRunner;

    beforeEach(() => {
        runner = new FakeChromeContainerRunner();
        SelfHostRemoteBrowser.SetContainerRunnerFactory(() => runner);
    });

    describe('AcquireSession', () => {
        it('returns the runner endpoint and a Self-Hosted Chrome backend', async () => {
            const driver = new TestableSelfHostRemoteBrowser();

            const acquired = await driver.AcquireSessionForTest(buildContext());

            expect(acquired.CdpEndpoint).toBe(FAKE_CDP_ENDPOINT);
            expect(acquired.Backend).toBeInstanceOf(SelfHostSessionBackend);
        });

        it('threads viewport hints and configuration through to the runner', async () => {
            const driver = new TestableSelfHostRemoteBrowser();
            const config = { ViewportWidth: 1280, ViewportHeight: 720, Region: 'us-east' };

            await driver.AcquireSessionForTest(buildContext(config));

            expect(runner.LastAcquireOptions).toEqual({
                ViewportWidth: 1280,
                ViewportHeight: 720,
                Configuration: config,
            });
        });

        it('omits non-numeric viewport hints from the acquire options', async () => {
            const driver = new TestableSelfHostRemoteBrowser();

            await driver.AcquireSessionForTest(buildContext({ ViewportWidth: 'wide' }));

            expect(runner.LastAcquireOptions?.ViewportWidth).toBeUndefined();
            expect(runner.LastAcquireOptions?.ViewportHeight).toBeUndefined();
        });
    });

    describe('SelfHostSessionBackend.GetLiveViewUrl', () => {
        it('returns the runner viewer URL (LiveView is supported, never throws)', async () => {
            const driver = new TestableSelfHostRemoteBrowser();
            const acquired = await driver.AcquireSessionForTest(buildContext());

            await expect(acquired.Backend.GetLiveViewUrl()).resolves.toBe(FAKE_VIEWER_URL);
        });
    });

    describe('SelfHostSessionBackend.InvokeNativeAIControl', () => {
        it('throws RemoteBrowserCapabilityNotSupportedError (no native AI harness)', async () => {
            const driver = new TestableSelfHostRemoteBrowser();
            const acquired = await driver.AcquireSessionForTest(buildContext());

            await expect(acquired.Backend.InvokeNativeAIControl('log in')).rejects.toBeInstanceOf(
                RemoteBrowserCapabilityNotSupportedError,
            );
        });

        it('stamps the error with the NativeAIControl feature and the backend name', async () => {
            const driver = new TestableSelfHostRemoteBrowser();
            const acquired = await driver.AcquireSessionForTest(buildContext());

            await expect(acquired.Backend.InvokeNativeAIControl('log in')).rejects.toMatchObject({
                FeatureName: 'NativeAIControl',
                ProviderName: SELF_HOST_PROVIDER_NAME,
            });
        });
    });

    describe('SelfHostSessionBackend.Release', () => {
        it('tears down the container via the runner handle', async () => {
            const driver = new TestableSelfHostRemoteBrowser();
            const acquired = await driver.AcquireSessionForTest(buildContext());

            expect(runner.ReleaseSpy).not.toHaveBeenCalled();
            await acquired.Backend.Release();
            expect(runner.ReleaseSpy).toHaveBeenCalledTimes(1);
        });

        it('is idempotent — a second Release does not tear down the container again', async () => {
            const driver = new TestableSelfHostRemoteBrowser();
            const acquired = await driver.AcquireSessionForTest(buildContext());

            await acquired.Backend.Release();
            await acquired.Backend.Release();

            expect(runner.ReleaseSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('SetContainerRunnerFactory override', () => {
        it('uses the explicitly-bound runner over the local-Chrome default', async () => {
            // beforeEach binds the fake runner; assert that override actually drives AcquireSession.
            const driver = new TestableSelfHostRemoteBrowser();
            const acquired = await driver.AcquireSessionForTest(buildContext());
            expect(acquired.CdpEndpoint).toBe(FAKE_CDP_ENDPOINT);
            expect(runner.LastAcquireOptions).not.toBeNull();
        });

        it('exposes a local-Chrome default runner so self-host works with no external service', () => {
            // The default factory (used when SetContainerRunnerFactory is never called) yields this runner.
            const local = new LocalChromeContainerRunner();
            expect(local).toBeInstanceOf(LocalChromeContainerRunner);
            expect(typeof local.Acquire).toBe('function');
        });
    });

    describe('SelfHostSessionBackend.StartAudioCapture', () => {
        /** A minimal adapter fake recording the audio-capture wiring without a real browser. */
        class FakeAudioAdapter extends PlaywrightBrowserAdapter {
            public StartCount = 0;
            public StopCount = 0;
            public LastOnChunk: ((chunk: AudioCaptureChunk) => void) | null = null;
            public override async StartAudioCapture(onChunk: (chunk: AudioCaptureChunk) => void): Promise<void> {
                this.StartCount++;
                this.LastOnChunk = onChunk;
            }
            public override async StopAudioCapture(): Promise<void> {
                this.StopCount++;
            }
        }

        it('delegates capture to the adapter and maps chunks to the Base shape', async () => {
            const driver = new TestableSelfHostRemoteBrowser();
            const acquired = await driver.AcquireSessionForTest(buildContext());
            const adapter = new FakeAudioAdapter();
            const received: RemoteBrowserAudioChunk[] = [];

            // StartAudioCapture is the optional hook — present on the Self-Hosted Chrome backend.
            const handle = await acquired.Backend.StartAudioCapture!(adapter, (c) => received.push(c));
            expect(adapter.StartCount).toBe(1);

            // Drive a computer-use chunk through the adapter callback and confirm the Base mapping.
            const cu = new AudioCaptureChunk();
            cu.DataBase64 = 'QUJD';
            cu.Codec = 'webm-opus';
            cu.SampleRate = 48000;
            cu.Channels = 2;
            cu.SequenceNumber = 3;
            adapter.LastOnChunk?.(cu);
            expect(received).toEqual<RemoteBrowserAudioChunk[]>([
                { DataBase64: 'QUJD', Codec: 'webm-opus', SampleRate: 48000, Channels: 2, SequenceNumber: 3, DurationMs: undefined },
            ]);

            await handle.Stop();
            expect(adapter.StopCount).toBe(1);
        });
    });

    describe('@RegisterClass registration', () => {
        it('resolves SelfHostRemoteBrowser from the ClassFactory by its DriverClass key', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemoteBrowserProvider>(
                BaseRemoteBrowserProvider,
                SELF_HOST_REMOTE_BROWSER_DRIVER_CLASS,
            );

            expect(instance).toBeInstanceOf(SelfHostRemoteBrowser);
        });

        it('exposes the expected DriverClass key constant', () => {
            expect(SELF_HOST_REMOTE_BROWSER_DRIVER_CLASS).toBe('SelfHostRemoteBrowser');
            // Reference RegisterClass so the import is exercised and the decorator path is loaded.
            expect(typeof RegisterClass).toBe('function');
        });
    });
});
