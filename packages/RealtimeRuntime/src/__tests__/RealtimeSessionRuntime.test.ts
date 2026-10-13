import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, MEDIA_PLACEMENTS, REQUESTED_TRACKS_SESSION_KEY, type RealtimeClientError } from '@memberjunction/ai-realtime-client';
import type { IMetadataProvider } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    DescribeCallEnd,
    REALTIME_CALL_TIME_LIMIT_END,
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type IRealtimeSessionRecorder,
    type StartRealtimeClientSessionResult,
} from '../index';

/**
 * A media host backed by nothing at all.
 *
 * This is the point of the extraction: a realtime session can be constructed and driven with no
 * browser, no microphone, and no audio hardware — which is what makes the runtime testable here,
 * and reusable from React Native and Node.
 */
class FakeMediaHost implements IRealtimeMediaHost {
    public AcquireMicrophoneCalls = 0;
    public recorder: FakeRecorder | null = null;

    constructor(private readonly failMic = false) {}

    public async AcquireMicrophone(): Promise<MediaStream> {
        this.AcquireMicrophoneCalls++;
        if (this.failMic) {
            throw new Error('permission denied');
        }
        // A structural stand-in — the runtime only forwards it to the driver and stops its tracks.
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }

    public CreateRecorder(): IRealtimeSessionRecorder | null {
        this.recorder = new FakeRecorder();
        return this.recorder;
    }
}

class FakeRecorder implements IRealtimeSessionRecorder {
    public IsRecording = true;
    public SampleRate = 24000;
    public MimeType = 'audio/wav';
    public StopCalls = 0;
    public Start = vi.fn();
    public AttachRemoteStream = vi.fn();
    public NowOffsetMs = () => 0;
    public GetPeaks = () => [0.1, 0.2];
    public async SnapshotNewSegmentBase64(): Promise<string | null> {
        return 'c2VnbWVudA==';
    }
    public async StopAndEncode(): Promise<string | null> {
        this.StopCalls++;
        return 'cmVjb3JkaW5n';
    }
}

/** A host that cannot record — a fully supported configuration, not a degraded one. */
class RecordinglessHost implements IRealtimeMediaHost {
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
}

describe('RealtimeSessionRuntime', () => {
    describe('construction without a browser', () => {
        it('constructs with only a media host — no DOM, no globals', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime).toBeInstanceOf(RealtimeSessionRuntime);
        });

        it('starts inactive, so a fresh runtime never looks like a live call', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime.IsActive).toBe(false);
        });

        it('reports no agent session before one is minted', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime.CurrentAgentSessionId).toBeNull();
        });

        it('exposes no channels before a session starts', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime.ActiveChannels).toEqual([]);
            expect(runtime.HasChannelBeenUsed('Whiteboard')).toBe(false);
        });
    });

    describe('host seam contract', () => {
        it('accepts a host that cannot record — CreateRecorder is optional', () => {
            const runtime = new RealtimeSessionRuntime(new RecordinglessHost());
            expect(runtime).toBeInstanceOf(RealtimeSessionRuntime);
        });

        it('a recording host satisfies the recorder contract structurally', async () => {
            const host = new FakeMediaHost();
            const recorder = host.CreateRecorder();
            expect(recorder).not.toBeNull();
            // The runtime only ever receives already-encoded bytes — never a Blob.
            await expect(recorder!.SnapshotNewSegmentBase64()).resolves.toBe('c2VnbWVudA==');
            await expect(recorder!.StopAndEncode()).resolves.toBe('cmVjb3JkaW5n');
            expect(typeof recorder!.MimeType).toBe('string');
        });

        it('surfaces microphone acquisition through the host, not navigator', async () => {
            const host = new FakeMediaHost();
            await host.AcquireMicrophone();
            expect(host.AcquireMicrophoneCalls).toBe(1);
        });

        it('lets a denied microphone reject, so the runtime can fail the start cleanly', async () => {
            const host = new FakeMediaHost(true);
            await expect(host.AcquireMicrophone()).rejects.toThrow('permission denied');
        });
    });

    describe('mute handling with no live stream', () => {
        it('returns false rather than throwing when there is no microphone yet', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime.ToggleMute()).toBe(false);
        });
    });

    describe('client tool registry', () => {
        it('registers and unregisters a handler by prefix without a live session', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            const handler = vi.fn(() => '{}');
            runtime.RegisterClientToolHandler('Whiteboard_', handler);
            runtime.UnregisterClientToolHandler('Whiteboard_');
            // The assertion that matters is that neither call requires a session or a browser.
            expect(handler).not.toHaveBeenCalled();
        });
    });
});

describe('host provider capability filter', () => {
    /** A host that can only carry WebRTC providers, like the React Native app. */
    class WebRtcOnlyRuntime extends RealtimeSessionRuntime {
        public Asked: string[] = [];
        protected override hostCanUseProvider(provider: string): boolean {
            this.Asked.push(provider);
            return provider === 'openai' || provider === 'openai-live';
        }
    }

    it('accepts everything by default, so existing hosts are unaffected', () => {
        const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
        // The default is deliberately permissive — a browser can run every shipped driver.
        const canUse = (runtime as unknown as { hostCanUseProvider(p: string): boolean }).hostCanUseProvider;
        expect(canUse.call(runtime, 'gemini')).toBe(true);
        expect(canUse.call(runtime, 'elevenlabs')).toBe(true);
    });

    it('lets a host narrow what it will connect to', () => {
        const runtime = new WebRtcOnlyRuntime(new FakeMediaHost());
        const canUse = (runtime as unknown as { hostCanUseProvider(p: string): boolean }).hostCanUseProvider;
        expect(canUse.call(runtime, 'openai-live')).toBe(true);
        expect(canUse.call(runtime, 'gemini')).toBe(false);
        expect(runtime.Asked).toEqual(['openai-live', 'gemini']);
    });
});

describe('session lifecycle, driven end to end with fakes', () => {
    /**
     * A realtime client that connects to nothing.
     *
     * Registered under a provider key so the runtime's real ClassFactory resolution runs — the same
     * lookup a device does — rather than being handed an instance.
     */
    @RegisterClass(BaseRealtimeClient, 'fake-provider')
    class FakeRealtimeClient extends BaseRealtimeClient {
        public static DisconnectCalls = 0;
        public static ConnectCalls = 0;
        public async Connect(): Promise<void> {
            FakeRealtimeClient.ConnectCalls++;
        }
        public SendText(): void {}
        public CancelActiveResponse(): void {}
        public SendContextNote(): void {}
        public RequestSpokenUpdate(): void {}
        public SendToolResult(): void {}
        public SetMuted(): void {}
        public async Disconnect(): Promise<void> {
            FakeRealtimeClient.DisconnectCalls++;
        }
        public get IsBusy(): boolean {
            return false;
        }
        public get IsAudioPlaying(): boolean {
            return false;
        }
    }

    /** A driver whose socket is already gone: Disconnect throws, as a dead WebSocket can. */
    @RegisterClass(BaseRealtimeClient, 'fake-throwing-disconnect')
    class ThrowingDisconnectClient extends FakeRealtimeClient {
        public override async Disconnect(): Promise<void> { throw new Error('socket already gone'); }
    }

    /**
     * Records every GraphQL relay the runtime makes, so teardown can be asserted on.
     *
     * `sessionId` + `PushStatusUpdates` stand in for the transport's delegated-run progress topic —
     * the runtime subscribes to it the moment a session goes live, so a provider without them
     * cannot get a session started at all.
     */
    class RecordingProvider {
        public Mutations: string[] = [];
        public readonly sessionId = 'transport-session-1';
        public async ExecuteGQL(query: string): Promise<unknown> {
            this.Mutations.push(query);
            return {};
        }
        public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
            return { subscribe: () => ({ unsubscribe: () => undefined }) };
        }
    }

    /** A host that also reports whether the runtime handed the microphone back. */
    class ReleasingHost extends FakeMediaHost {
        public ReleaseCalls = 0;
        public async ReleaseMicrophone(): Promise<void> {
            this.ReleaseCalls++;
        }
    }

    function mintedSession(provider: string, agentSessionId = 'session-1'): StartRealtimeClientSessionResult {
        return {
            AgentSessionId: agentSessionId,
            ConversationId: 'conv-1',
            Provider: provider,
            Model: 'model-1',
            EphemeralToken: 'token',
            ExpiresAt: '2030-01-01T00:00:00Z',
            SessionConfigJson: '{}',
            ModelName: 'Fake Realtime',
            NarrationInstructionsTemplate: null,
            PriorChannelStatesJson: null,
        };
    }

    /** Builds a runtime wired to a recording provider, with recording consent off. */
    function build(host: IRealtimeMediaHost) {
        const runtime = new RealtimeSessionRuntime(host);
        const provider = new RecordingProvider();
        runtime.Provider = provider as unknown as IMetadataProvider;
        return { runtime, provider };
    }

    /** The mutation names the runtime sent, for readable assertions. */
    function mutationNames(provider: RecordingProvider): string[] {
        return provider.Mutations.map((m) => m.match(/mutation (\w+)/)?.[1] ?? m.trim().slice(0, 20));
    }

    /**
     * A provider whose `UploadRealtimeRecording` never answers until the test settles it — what the
     * runtime sees when the tab closes while tens of MB of WAV are still on the wire. Every other
     * relay answers at once. `UploadStarted` resolves the moment the upload mutation arrives, so
     * tests never count microtask ticks.
     */
    class StalledUploadProvider extends RecordingProvider {
        private markStarted: () => void = () => undefined;
        public readonly UploadStarted = new Promise<void>((resolve) => { this.markStarted = resolve; });
        private settleUpload: (outcome: { ok: boolean }) => void = () => undefined;
        private readonly upload = new Promise<{ ok: boolean }>((resolve) => { this.settleUpload = resolve; });
        public override async ExecuteGQL(query: string): Promise<unknown> {
            this.Mutations.push(query);
            if (/mutation UploadRealtimeRecording\(/.test(query)) {
                this.markStarted();
                const { ok } = await this.upload; // never settles unless the test calls Finish/Fail
                if (!ok) { throw new Error('network gone'); }
                return { UploadRealtimeRecording: { Success: true, FileID: 'file-1' } };
            }
            return {};
        }
        public FinishUpload(): void { this.settleUpload({ ok: true }); }
        public FailUpload(): void { this.settleUpload({ ok: false }); }
    }

    function buildStalled(host: IRealtimeMediaHost = new FakeMediaHost()) {
        const runtime = new RealtimeSessionRuntime(host);
        const provider = new StalledUploadProvider();
        runtime.Provider = provider as unknown as IMetadataProvider;
        return { runtime, provider };
    }

    it('goes live through real driver resolution, then closes the server session once', async () => {
        const { runtime, provider } = build(new FakeMediaHost());
        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        expect(runtime.IsActive).toBe(true);
        expect(runtime.CurrentAgentSessionId).toBe('session-1');

        await runtime.EndRealtimeSession();
        expect(runtime.IsActive).toBe(false);
        expect(mutationNames(provider).filter((n) => n === 'CloseAgentSession')).toHaveLength(1);
    });

    it('coalesces concurrent teardowns instead of racing into two of everything', async () => {
        // An explicit stop followed by the host unmounting fires this twice. `teardown` flips the
        // active flag last, so without coalescing the second call passes the guard and runs
        // alongside the first: two Disconnects, two CloseAgentSession mutations, two ended events.
        const { runtime, provider } = build(new FakeMediaHost());
        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        FakeRealtimeClient.DisconnectCalls = 0;

        await Promise.all([runtime.EndRealtimeSession(), runtime.EndRealtimeSession()]);

        expect(FakeRealtimeClient.DisconnectCalls).toBe(1);
        expect(mutationNames(provider).filter((n) => n === 'CloseAgentSession')).toHaveLength(1);
    });

    it('hands the microphone back to the host on teardown', async () => {
        // Stopping the tracks is not the same thing: iOS stays in a record-and-play audio category
        // for the rest of the app's life unless something puts it back.
        const host = new ReleasingHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        await runtime.EndRealtimeSession();
        expect(host.ReleaseCalls).toBe(1);
    });

    it('releases a start the host abandoned while the microphone was being acquired', async () => {
        // The window is real: tapping back during the ~1-2s mint/permission sequence used to leave
        // a live microphone, a live provider connection and an Active server session behind.
        let releaseMic: (() => void) | null = null;
        class SlowHost extends ReleasingHost {
            public override async AcquireMicrophone(): Promise<MediaStream> {
                await new Promise<void>((resolve) => {
                    releaseMic = resolve;
                });
                return super.AcquireMicrophone();
            }
        }
        const host = new SlowHost();
        const { runtime, provider } = build(host);

        const starting = runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        await runtime.EndRealtimeSession();   // user leaves mid-start
        releaseMic!();                        // the microphone now arrives, for nobody
        await starting;

        expect(runtime.IsActive).toBe(false);
        expect(runtime.CurrentAgentSessionId).toBeNull();
        // Closed exactly once, by whichever half got there — never left Active for the janitor.
        expect(mutationNames(provider).filter((n) => n === 'CloseAgentSession')).toHaveLength(1);
    });

    describe('hands the microphone back once per opening, after it returns (#5386)', () => {
        /**
         * A host that logs, in order, each microphone opening and each release, and can hold an opening until the test
         * lets it return: the window in which the user ends a call that is still starting.
         */
        class OrderingHost extends FakeMediaHost {
            public readonly Events: string[] = [];
            /** What an opening rejects with once it returns. */
            public Failure: Error | null = null;
            private held: Promise<void> | null = null;

            /** Holds the next opening until the test calls the function this returns. */
            public HoldNextOpening(): () => void {
                let open: () => void = () => undefined;
                this.held = new Promise<void>((resolve) => (open = resolve));
                return open;
            }

            public override async AcquireMicrophone(): Promise<MediaStream> {
                const held = this.held;
                this.held = null;
                await held;
                if (this.Failure) {
                    this.Events.push('failed');
                    throw this.Failure;
                }
                this.Events.push('opened');
                return super.AcquireMicrophone();
            }

            public async ReleaseMicrophone(): Promise<void> {
                this.Events.push('released');
            }
        }

        /** A driver whose Connect says when it was reached and waits until the test lets it finish. */
        @RegisterClass(BaseRealtimeClient, 'held-connect-provider')
        class HeldConnectClient extends FakeRealtimeClient {
            public static Reached: () => void = () => undefined;
            public static Gate: Promise<void> | null = null;
            public override async Connect(): Promise<void> {
                HeldConnectClient.Reached();
                await HeldConnectClient.Gate;
            }
        }

        it('releases once, after the microphone opens, when the call ended while it was opening', async () => {
            // The React Native host puts iOS into the call audio category inside the opening, after the permission
            // prompt, so a release before the opening returns undoes nothing.
            const host = new OrderingHost();
            const open = host.HoldNextOpening();
            const { runtime } = build(host);

            const starting = runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
            await runtime.EndRealtimeSession();
            expect(host.Events).toEqual([]);
            open();
            await starting;

            expect(host.Events).toEqual(['opened', 'released']);
            expect(runtime.IsActive).toBe(false);
        });

        it('releases once, after the opening fails, when the call ended while it was opening', async () => {
            // The React Native host sets the call category before getUserMedia, which can still fail after it.
            const host = new OrderingHost();
            host.Failure = new Error('No microphone is available on this device.');
            const open = host.HoldNextOpening();
            const { runtime } = build(host);

            const starting = runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
            await runtime.EndRealtimeSession();
            open();
            await starting;

            expect(host.Events).toEqual(['failed', 'released']);
            expect(runtime.LastStartError).toBeNull();
        });

        it('releases once when the call ended while it was connecting', async () => {
            // The microphone was already open when the call ended: teardown hands it back, and the start's unwind
            // must not hand it back again.
            const host = new OrderingHost();
            const { runtime } = build(host);
            const reached = new Promise<void>((resolve) => (HeldConnectClient.Reached = resolve));
            let connect: () => void = () => undefined;
            HeldConnectClient.Gate = new Promise<void>((resolve) => (connect = resolve));
            try {
                const starting = runtime.StartRealtimeSessionFromResult(mintedSession('held-connect-provider'));
                await reached;
                await runtime.EndRealtimeSession();
                connect();
                await starting;
            } finally {
                HeldConnectClient.Gate = null;
            }

            expect(host.Events).toEqual(['opened', 'released']);
        });

        it('releases once when the call ended while it was connecting and the connection then fails', async () => {
            // Teardown hands the microphone back; the unwind after the failed connection must not hand it back again.
            const host = new OrderingHost();
            const { runtime } = build(host);
            const reached = new Promise<void>((resolve) => (HeldConnectClient.Reached = resolve));
            let fail: (reason: Error) => void = () => undefined;
            HeldConnectClient.Gate = new Promise<void>((_resolve, reject) => (fail = reject));
            try {
                const starting = runtime.StartRealtimeSessionFromResult(mintedSession('held-connect-provider'));
                await reached;
                await runtime.EndRealtimeSession();
                fail(new Error('The socket closed before setup.'));
                await starting;
            } finally {
                HeldConnectClient.Gate = null;
            }

            expect(host.Events).toEqual(['opened', 'released']);
        });

        it('releases nothing when the start ends before it opens the microphone', async () => {
            class DecliningRuntime extends RealtimeSessionRuntime {
                protected override hostCanUseProvider(): boolean {
                    return false;
                }
            }
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                const host = new OrderingHost();
                const runtime = new DecliningRuntime(host);
                runtime.Provider = new RecordingProvider() as unknown as IMetadataProvider;

                await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));

                expect(runtime.LastStartError).not.toBeNull();
                expect(host.Events).toEqual([]);
            } finally {
                error.mockRestore();
            }
        });

        it('releases once when the microphone fails to open and the start fails', async () => {
            const host = new OrderingHost();
            host.Failure = new Error('No microphone is available on this device.');
            const { runtime } = build(host);

            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));

            expect(runtime.LastStartError).toBe(host.Failure);
            expect(host.Events).toEqual(['failed', 'released']);
        });

        it('leaves the release to a newer call that opened the microphone since', async () => {
            // The audio category is shared by the whole app: releasing it for the abandoned start would take the newer
            // call out of it. The newer call's own end hands it back.
            const host = new OrderingHost();
            const { runtime } = build(host);
            const open = host.HoldNextOpening();
            const abandoned = runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider', 'session-1'));
            await runtime.EndRealtimeSession();
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider', 'session-2'));
            expect(runtime.IsActive).toBe(true);

            open();
            await abandoned;
            expect(host.Events).toEqual(['opened', 'opened']);

            await runtime.EndRealtimeSession();
            expect(host.Events).toEqual(['opened', 'opened', 'released']);
        });
    });

    describe('a call ended while it was connecting (#5420)', () => {
        /**
         * The provider handshake behind one Connect, which the test settles as the provider would. With
         * `DisconnectFails`, the driver's Disconnect fails a handshake still in flight, as the WebSocket drivers do.
         */
        class Handshake {
            public readonly Reached: Promise<void>;
            public readonly Done: Promise<void>;
            public Reach: () => void = () => undefined;
            public Succeed: () => void = () => undefined;
            public Fail: (error: Error) => void = () => undefined;

            constructor(public readonly DisconnectFails = false) {
                this.Reached = new Promise<void>((resolve) => (this.Reach = resolve));
                this.Done = new Promise<void>((resolve, reject) => {
                    this.Succeed = resolve;
                    this.Fail = reject;
                });
            }
        }

        /** A driver whose Connect waits on the handshake the test puts in `Next`. */
        @RegisterClass(BaseRealtimeClient, 'handshake-provider')
        class HandshakeClient extends FakeRealtimeClient {
            public static Next: Handshake | null = null;
            private handshake: Handshake | null = null;

            public override async Connect(): Promise<void> {
                const handshake = HandshakeClient.Next;
                HandshakeClient.Next = null;
                this.handshake = handshake;
                handshake?.Reach();
                await handshake?.Done;
            }

            public override async Disconnect(): Promise<void> {
                if (this.handshake?.DisconnectFails) {
                    this.handshake.Fail(new Error('Disconnected while connecting.'));
                }
                await super.Disconnect();
            }
        }

        /** A provider that can hold `CloseAgentSession`, so a test can act while the teardown that sent it runs. */
        class HoldingProvider extends RecordingProvider {
            private closeGate: Promise<void> | null = null;

            /** Holds every `CloseAgentSession` until the test calls the function this returns. */
            public HoldClose(): () => void {
                let release: () => void = () => undefined;
                this.closeGate = new Promise<void>((resolve) => (release = resolve));
                return release;
            }

            public override async ExecuteGQL(query: string): Promise<unknown> {
                const result = await super.ExecuteGQL(query);
                if (query.includes('CloseAgentSession')) {
                    await this.closeGate;
                }
                return result;
            }
        }

        /** A runtime on a holding provider, with what a host watching it sees from the start. */
        function buildWatched() {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            const provider = new HoldingProvider();
            runtime.Provider = provider as unknown as IMetadataProvider;
            const states: string[] = [];
            const active: boolean[] = [];
            const ended: { sessionId: string; reason: string }[] = [];
            runtime.ConnectionState$.subscribe((state) => states.push(state));
            runtime.Active$.subscribe((isActive) => active.push(isActive));
            runtime.SessionEnded$.subscribe((end) => ended.push(end));
            return { runtime, provider, states, active, ended };
        }

        /** How many times the server session was closed. */
        function closes(provider: RecordingProvider): number {
            return mutationNames(provider).filter((n) => n === 'CloseAgentSession').length;
        }

        /** Lets every pending promise step run. */
        function settle(): Promise<void> {
            return new Promise<void>((resolve) => setTimeout(resolve, 0));
        }

        afterEach(() => {
            HandshakeClient.Next = null;
            vi.restoreAllMocks();
        });

        it('stays closed, with no start error and one teardown, when the connection fails after the call was ended', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const handshake = (HandshakeClient.Next = new Handshake());
            const { runtime, provider, states, active, ended } = buildWatched();

            const starting = runtime.StartRealtimeSessionFromResult(mintedSession('handshake-provider'));
            await handshake.Reached;
            await runtime.EndRealtimeSession();
            handshake.Fail(new Error('The socket closed before setup.'));
            await starting;

            expect(states).not.toContain('error');
            expect(states.at(-1)).toBe('closed');
            expect(runtime.LastStartError).toBeNull();
            expect(error).not.toHaveBeenCalled();
            // Each teardown ends by reporting the session inactive, so one teardown is one `false` after `true`.
            expect(active).toEqual([false, true, false]);
            expect(ended).toEqual([{ sessionId: 'session-1', reason: 'explicit' }]);
            expect(closes(provider)).toBe(1);
        });

        it('leaves the end to the teardown when ending the call is what fails the connection', async () => {
            // A WebSocket driver's Disconnect fails a handshake still in flight, so the start hears of the failure
            // while the teardown is still closing the session.
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const handshake = (HandshakeClient.Next = new Handshake(true));
            const { runtime, provider, states, ended } = buildWatched();
            const letClose = provider.HoldClose();

            const starting = runtime.StartRealtimeSessionFromResult(mintedSession('handshake-provider'));
            await handshake.Reached;
            const ending = runtime.EndRealtimeSession();
            await settle();
            letClose();
            await Promise.all([starting, ending]);

            expect(states).not.toContain('error');
            expect(states.at(-1)).toBe('closed');
            expect(runtime.LastStartError).toBeNull();
            expect(error).not.toHaveBeenCalled();
            expect(ended).toEqual([{ sessionId: 'session-1', reason: 'explicit' }]);
            expect(closes(provider)).toBe(1);
        });

        it('leaves the server session to a teardown still running when the ended call connects after all', async () => {
            const handshake = (HandshakeClient.Next = new Handshake());
            const { runtime, provider, ended } = buildWatched();
            const letClose = provider.HoldClose();

            const starting = runtime.StartRealtimeSessionFromResult(mintedSession('handshake-provider'));
            await handshake.Reached;
            const ending = runtime.EndRealtimeSession();
            await settle();
            handshake.Succeed();
            await settle();
            letClose();
            await Promise.all([starting, ending]);

            expect(ended).toEqual([{ sessionId: 'session-1', reason: 'explicit' }]);
            expect(closes(provider)).toBe(1);
            expect(runtime.Client).toBeNull();
        });

        it("does not end a newer call when the ended call's connection fails", async () => {
            // A runtime can serve every call in an app (Explorer's is a root service), so a newer call can be live
            // by the time the ended call's provider answers.
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const abandoned = (HandshakeClient.Next = new Handshake());
            const { runtime, states, ended } = buildWatched();
            const first = runtime.StartRealtimeSessionFromResult(mintedSession('handshake-provider', 'session-1'));
            await abandoned.Reached;
            await runtime.EndRealtimeSession();
            const newer = (HandshakeClient.Next = new Handshake());
            const second = runtime.StartRealtimeSessionFromResult(mintedSession('handshake-provider', 'session-2'));
            await newer.Reached;
            newer.Succeed();
            await second;

            abandoned.Fail(new Error('The socket closed before setup.'));
            await first;

            expect(runtime.IsActive).toBe(true);
            expect(runtime.CurrentAgentSessionId).toBe('session-2');
            expect(runtime.LastStartError).toBeNull();
            expect(states).not.toContain('error');
            expect(error).not.toHaveBeenCalled();
            expect(ended).toEqual([{ sessionId: 'session-1', reason: 'explicit' }]);
            await runtime.EndRealtimeSession();
        });

        it("reports no start error, not even an earlier call's, when the connection fails after the call was ended (#5431)", async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const { runtime, states } = buildWatched();
            const refused = (HandshakeClient.Next = new Handshake());
            const failed = runtime.StartRealtimeSessionFromResult(mintedSession('handshake-provider', 'session-1'));
            await refused.Reached;
            refused.Fail(new Error('The provider refused the session.'));
            await failed;
            expect(runtime.LastStartError?.message).toBe('The provider refused the session.');

            const handshake = (HandshakeClient.Next = new Handshake());
            const starting = runtime.StartRealtimeSessionFromResult(mintedSession('handshake-provider', 'session-2'));
            await handshake.Reached;
            await runtime.EndRealtimeSession();
            handshake.Fail(new Error('The socket closed before setup.'));
            await starting;

            expect(runtime.LastStartError).toBeNull();
            expect(states.at(-1)).toBe('closed');
        });

        it('still reports a connection that fails while the call is starting', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const handshake = (HandshakeClient.Next = new Handshake());
            const { runtime, states, active, ended } = buildWatched();
            const failure = new Error('The provider refused the session.');

            const starting = runtime.StartRealtimeSessionFromResult(mintedSession('handshake-provider'));
            await handshake.Reached;
            handshake.Fail(failure);
            await starting;

            expect(states.at(-1)).toBe('error');
            expect(runtime.LastStartError).toBe(failure);
            expect(runtime.IsActive).toBe(false);
            expect(active).toEqual([false, true, false]);
            expect(ended).toEqual([{ sessionId: 'session-1', reason: 'error' }]);
        });
    });

    it('declines an unusable provider through the shared teardown, and says which one', async () => {
        class WebRtcOnly extends RealtimeSessionRuntime {
            protected override hostCanUseProvider(p: string): boolean {
                return p !== 'gemini';
            }
        }
        const runtime = new WebRtcOnly(new FakeMediaHost());
        const provider = new RecordingProvider();
        runtime.Provider = provider as unknown as IMetadataProvider;

        const states: string[] = [];
        runtime.ConnectionState$.subscribe((s) => states.push(s));

        await runtime.StartRealtimeSessionFromResult(mintedSession('gemini'));

        expect(runtime.IsActive).toBe(false);
        expect(states).toContain('error');
        expect(runtime.LastStartError?.message).toContain('gemini');
        // The minted row is durable, so declining still has to close it.
        expect(mutationNames(provider)).toContain('CloseAgentSession');
    });

    it("keeps the call's fatal client error, which says why it ended, until the next start clears it", async () => {
        /** A client that ends the call the way the relay's time limit does. */
        @RegisterClass(BaseRealtimeClient, 'fake-time-limit')
        class TimeLimitClient extends FakeRealtimeClient {
            public static Last: TimeLimitClient | null = null;
            public override async Connect(): Promise<void> {
                TimeLimitClient.Last = this;
            }
            public Fail(error: RealtimeClientError): void {
                this.emitError(error);
            }
        }
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const { runtime } = build(new FakeMediaHost());
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-time-limit', 'session-1'));
            expect(runtime.LastSessionError).toBeNull();
            TimeLimitClient.Last?.Fail({ Message: 'recoverable', Fatal: false });
            expect(runtime.LastSessionError).toBeNull();
            const ended: RealtimeClientError = { Message: 'Gemini Live session reached its time limit (4000)', Code: 'time-limit', Fatal: true };
            TimeLimitClient.Last?.Fail(ended);
            expect(runtime.LastSessionError).toEqual(ended);
            expect(DescribeCallEnd(runtime.LastSessionError)).toBe(REALTIME_CALL_TIME_LIMIT_END);
            expect(DescribeCallEnd({ Message: 'Gemini Live connection closed (1011)', Fatal: true })).toBeNull();
            expect(DescribeCallEnd(null)).toBeNull();
            await runtime.EndRealtimeSession();

            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-time-limit', 'session-2'));
            expect(runtime.LastSessionError).toBeNull();
            await runtime.EndRealtimeSession();
        } finally {
            error.mockRestore();
        }
    });

    it("keeps a failed start's error until the next start, which clears it before it reports connecting (#5431)", async () => {
        /** A host whose microphone stays blocked until the user allows it. */
        class BlockingHost extends FakeMediaHost {
            public Blocked: Error | null = null;
            public override async AcquireMicrophone(): Promise<MediaStream> {
                if (this.Blocked) {
                    throw this.Blocked;
                }
                return super.AcquireMicrophone();
            }
        }
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const host = new BlockingHost();
            const blocked = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
            host.Blocked = blocked;
            const { runtime } = build(host);
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider', 'session-1'));
            expect(runtime.LastStartError).toBe(blocked);

            // The user allows the microphone and tries again. Hosts read the error when the state changes, so record
            // what one would read at each change; subscribing replays the failed start's 'error' first.
            host.Blocked = null;
            const read: { state: string; error: Error | null }[] = [];
            const watch = runtime.ConnectionState$.subscribe((state) => read.push({ state, error: runtime.LastStartError }));
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider', 'session-2'));
            watch.unsubscribe();

            expect(runtime.IsActive).toBe(true);
            expect(read).toEqual([
                { state: 'error', error: blocked },
                { state: 'connecting', error: null },
            ]);
            expect(runtime.LastStartError).toBeNull();
            await runtime.EndRealtimeSession();
        } finally {
            error.mockRestore();
        }
    });

    it('reports a session active for its conversation only, comparing ids without case', async () => {
        const { runtime } = build(new FakeMediaHost());
        expect(runtime.IsActiveFor('conv-1')).toBe(false);

        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'), { conversationId: 'conv-1' });

        expect(runtime.IsActiveFor('CONV-1')).toBe(true);
        expect(runtime.IsActiveFor('conv-2')).toBe(false);
        expect(runtime.IsActiveFor(null)).toBe(false);

        await runtime.EndRealtimeSession();
        expect(runtime.IsActiveFor('conv-1')).toBe(false);
        expect(runtime['sessionConversationId']).toBeNull();
    });

    it('closes the minted session and goes no further when the host ends the start during the mint', async () => {
        // Teardown during the mint has no session id to close yet; the start must close the row the
        // mint returns, and must not open a microphone or a connection nobody is watching.
        const host = new FakeMediaHost();
        const runtime = new RealtimeSessionRuntime(host);
        const relays: Array<{ query: string; variables: Record<string, unknown> }> = [];
        let finishMint: ((value: unknown) => void) | null = null;
        const mintingProvider = {
            Entities: [],
            ExecuteGQL: (query: string, variables: Record<string, unknown>): Promise<unknown> => {
                relays.push({ query, variables });
                return query.includes('StartRealtimeClientSession')
                    ? new Promise<unknown>((resolve) => { finishMint = resolve; })
                    : Promise.resolve({});
            },
        };
        runtime.Provider = mintingProvider as unknown as IMetadataProvider;
        FakeRealtimeClient.ConnectCalls = 0;

        const starting = runtime.StartRealtimeSession('agent-1', 'conv-2', null, null, null, null, null, null, false);
        await vi.waitFor(() => expect(finishMint).not.toBeNull());
        expect(runtime.IsActiveFor('conv-2')).toBe(true);
        await runtime.EndRealtimeSession();   // user leaves mid-mint
        finishMint!({ StartRealtimeClientSession: mintedSession('fake-provider') });
        await starting;

        const closes = relays.filter((r) => r.query.includes('mutation CloseAgentSession'));
        expect(closes).toHaveLength(1);
        expect(closes[0].variables).toEqual({ agentSessionId: 'session-1' });
        expect(runtime.IsActive).toBe(false);
        expect(runtime.IsActiveFor('conv-2')).toBe(false);
        expect(runtime.CurrentAgentSessionId).toBeNull();
        expect(host.AcquireMicrophoneCalls).toBe(0);
        expect(FakeRealtimeClient.ConnectCalls).toBe(0);
    });

    it('leaves a newer session alone when an ended start\'s mint fails afterwards', async () => {
        // Start A is ended during its mint and start B goes live; A's failure must not tear B down.
        const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
        const relays: Array<{ query: string; variables: Record<string, unknown> }> = [];
        let failMintA: ((error: Error) => void) | null = null;
        const provider = {
            Entities: [],
            sessionId: 'transport-session-1',
            ExecuteGQL: (query: string, variables: Record<string, unknown>): Promise<unknown> => {
                relays.push({ query, variables });
                return query.includes('StartRealtimeClientSession')
                    ? new Promise<unknown>((_resolve, reject) => { failMintA = reject; })
                    : Promise.resolve({});
            },
            PushStatusUpdates: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
        };
        runtime.Provider = provider as unknown as IMetadataProvider;
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const startingA = runtime.StartRealtimeSession('agent-1', 'conv-a', null, null, null, null, null, null, false);
            await vi.waitFor(() => expect(failMintA).not.toBeNull());
            await runtime.EndRealtimeSession();   // user leaves A mid-mint
            await runtime.StartRealtimeSessionFromResult({ ...mintedSession('fake-provider'), AgentSessionId: 'session-b', ConversationId: 'conv-b' }, { conversationId: 'conv-b' });
            expect(runtime.IsActiveFor('conv-b')).toBe(true);
            const states: string[] = [];
            const watching = runtime.ConnectionState$.subscribe((state) => states.push(state));
            FakeRealtimeClient.DisconnectCalls = 0;

            failMintA!(new Error('mint A failed'));
            await startingA;
            watching.unsubscribe();

            expect(runtime.IsActive).toBe(true);
            expect(runtime.IsActiveFor('conv-b')).toBe(true);
            expect(runtime.CurrentAgentSessionId).toBe('session-b');
            expect(relays.filter((r) => r.query.includes('mutation CloseAgentSession'))).toHaveLength(0);
            expect(FakeRealtimeClient.DisconnectCalls).toBe(0);
            expect(states).not.toContain('error');
            expect(states).not.toContain('closed');
            expect(runtime.LastStartError).toBeNull();
            expect(error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'mint A failed' }));
        } finally {
            error.mockRestore();
            await runtime.EndRealtimeSession();
        }
    });

    it('reports a starting session active for the conversation it asked for while the mint runs', async () => {
        // The last session's conversation must not answer for the next start.
        const { runtime } = build(new FakeMediaHost());
        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'), { conversationId: 'conv-1' });
        await runtime.EndRealtimeSession();

        let failMint: ((error: Error) => void) | null = null;
        const mintingProvider = {
            Entities: [],
            sessionId: 'transport-session-1',
            ExecuteGQL: (query: string): Promise<unknown> => query.includes('StartRealtimeClientSession')
                ? new Promise<unknown>((_resolve, reject) => { failMint = reject; })
                : Promise.resolve({}),
            PushStatusUpdates: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
        };
        runtime.Provider = mintingProvider as unknown as IMetadataProvider;
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const starting = runtime.StartRealtimeSession('agent-1', 'conv-2', null, null, null, null, null, null, false);
            await vi.waitFor(() => expect(failMint).not.toBeNull());

            expect(runtime.IsActiveFor('conv-2')).toBe(true);
            expect(runtime.IsActiveFor('conv-1')).toBe(false);

            failMint!(new Error('mint failed'));
            await starting;
            expect(runtime.IsActiveFor('conv-2')).toBe(false);
        } finally {
            error.mockRestore();
        }
    });

    it('sends the fork the session starts on with the mint, and null for Main', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            for (const [fork, expected] of [['fork-1', 'fork-1'], [null, null]] as const) {
                const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
                const relays: Array<{ query: string; variables: Record<string, unknown> }> = [];
                runtime.Provider = {
                    Entities: [],
                    ExecuteGQL: async (query: string, variables: Record<string, unknown>): Promise<unknown> => {
                        relays.push({ query, variables });
                        return {};   // no ephemeral token: the start fails right after the mint
                    },
                } as unknown as IMetadataProvider;

                await runtime.StartRealtimeSession('agent-1', 'conv-2', null, null, null, null, null, null, false, null, null, null, { ConversationBranchID: fork });

                const mint = relays.find((r) => r.query.includes('mutation StartRealtimeClientSession'));
                expect(mint?.query).toContain('conversationBranchId: $conversationBranchId');
                expect(mint?.variables.conversationBranchId).toBe(expected);
            }
        } finally {
            error.mockRestore();
        }
    });

    describe('SendVideoFrame', () => {
        /** A realtime client whose control channel opens on connect and that takes video frames, answering with `Accepts`. */
        @RegisterClass(BaseRealtimeClient, 'fake-video-provider')
        class FakeVideoClient extends FakeRealtimeClient {
            public static Accepts = true;
            public static Frames: Array<{ Base64: string; MimeType?: string }> = [];
            public override async Connect(): Promise<void> {
                this.emitStateChange('listening');
            }
            public override SendVideoFrame(base64Image: string, mimeType?: string): boolean {
                FakeVideoClient.Frames.push({ Base64: base64Image, MimeType: mimeType });
                return FakeVideoClient.Accepts;
            }
        }

        it('returns false when no session is live', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime.SendVideoFrame('AAAA', 'image/jpeg')).toBe(false);
        });

        it('returns false when the client cannot take video frames', async () => {
            const { runtime } = build(new FakeMediaHost());
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
            expect(runtime.SendVideoFrame('AAAA', 'image/jpeg')).toBe(false);
            await runtime.EndRealtimeSession();
        });

        it("returns the live client's answer, and sends the frame", async () => {
            FakeVideoClient.Frames = [];
            const { runtime } = build(new FakeMediaHost());
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-video-provider'));

            FakeVideoClient.Accepts = true;
            expect(runtime.SendVideoFrame('AAAA', 'image/jpeg')).toBe(true);
            FakeVideoClient.Accepts = false;
            expect(runtime.SendVideoFrame('BBBB', 'image/png')).toBe(false);

            expect(FakeVideoClient.Frames).toEqual([{ Base64: 'AAAA', MimeType: 'image/jpeg' }, { Base64: 'BBBB', MimeType: 'image/png' }]);
            await runtime.EndRealtimeSession();
        });
    });

    describe('a page that dies during the end-of-call upload (#5195)', () => {
        it('closes the server session before the consolidated upload starts', async () => {
            const { runtime, provider } = buildStalled();
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'), { recordingConsent: true });

            void runtime.EndRealtimeSession();
            await provider.UploadStarted;

            const names = mutationNames(provider);
            expect(names).toContain('CloseAgentSession');
            expect(names.indexOf('CloseAgentSession')).toBeLessThan(names.indexOf('UploadRealtimeRecording'));
        });

        it('still closes the session when the driver fails to disconnect', async () => {
            expect(ThrowingDisconnectClient).toBeDefined();
            const { runtime, provider } = build(new FakeMediaHost());
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-throwing-disconnect'), { recordingConsent: true });

            await runtime.EndRealtimeSession();

            expect(mutationNames(provider)).toContain('CloseAgentSession');
            expect(mutationNames(provider)).toContain('UploadRealtimeRecording');
            expect(runtime.IsActive).toBe(false);
            expect(runtime.CurrentAgentSessionId).toBeNull();
        });
    });

    describe('SavingRecording$ (#5195)', () => {
        it('reports saving before the first teardown await', async () => {
            const { runtime } = buildStalled();
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'), { recordingConsent: true });
            void runtime.EndRealtimeSession();
            // Synchronous: no await between End and the arm.
            expect(runtime.IsSavingRecording).toBe(true);
        });

        it('stays saving while the upload is in flight and clears once it lands', async () => {
            const { runtime, provider } = buildStalled();
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'), { recordingConsent: true });
            const ending = runtime.EndRealtimeSession();
            await provider.UploadStarted;
            expect(runtime.IsSavingRecording).toBe(true);
            provider.FinishUpload();
            await ending;
            expect(runtime.IsSavingRecording).toBe(false);
        });

        it('disarms after a failed upload', async () => {
            const { runtime, provider } = buildStalled();
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'), { recordingConsent: true });
            const ending = runtime.EndRealtimeSession();
            await provider.UploadStarted;
            provider.FailUpload();
            await ending; // upload failures never reject teardown
            expect(runtime.IsSavingRecording).toBe(false);
        });

        it('never reports saving for an unrecorded session', async () => {
            const { runtime } = build(new FakeMediaHost());
            const seen: boolean[] = [];
            runtime.SavingRecording$.subscribe((s) => seen.push(s));
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider')); // no consent
            await runtime.EndRealtimeSession();
            expect(seen).toEqual([false]);
        });

        it('coalesced teardowns arm and clear once', async () => {
            const { runtime } = build(new FakeMediaHost());
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'), { recordingConsent: true });
            const seen: boolean[] = [];
            runtime.SavingRecording$.subscribe((s) => seen.push(s));
            await Promise.all([runtime.EndRealtimeSession(), runtime.EndRealtimeSession()]);
            expect(seen).toEqual([false, true, false]);
        });
    });

    describe('crash-recovery shard uploads (#5197)', () => {
        /** A recorder whose every snapshot is a distinct window, so a resent shard is recognisable. */
        let nextWindow = 0;
        class SequencedRecorder extends FakeRecorder {
            public override async SnapshotNewSegmentBase64(): Promise<string | null> {
                return btoa(`window-${nextWindow++}`);
            }
        }
        class SequencedHost extends FakeMediaHost {
            public override CreateRecorder(): IRealtimeSessionRecorder | null {
                this.recorder = new SequencedRecorder();
                return this.recorder;
            }
        }

        type ShardUpload = { agentSessionId: string; segmentIndex: number; audioBase64: string };
        /** What a shard upload does on the server: store it, refuse it (`false`), or throw on the wire. */
        type ShardOutcome = 'stored' | 'refused' | 'network-error';

        /**
         * A provider that records every shard upload attempt and, per attempt, answers with the next
         * scripted outcome (then `stored` once the script runs out). `Stored` is what the server
         * folder ends up holding: index → bytes.
         */
        class ShardProvider extends RecordingProvider {
            public Attempts: ShardUpload[] = [];
            /** When set, the next attempt waits on it and then answers with the outcome it resolves to. */
            public HoldNextAttempt: Promise<ShardOutcome> | null = null;
            public Stored = new Map<number, string>();
            constructor(private readonly script: ShardOutcome[] = []) {
                super();
            }
            public override async ExecuteGQL(query: string, variables?: ShardUpload): Promise<unknown> {
                if (!/mutation UploadRealtimeRecordingSegment\(/.test(query) || !variables) {
                    return super.ExecuteGQL(query);
                }
                this.Attempts.push({
                    agentSessionId: variables.agentSessionId,
                    segmentIndex: variables.segmentIndex,
                    audioBase64: variables.audioBase64,
                });
                const held = this.HoldNextAttempt;
                this.HoldNextAttempt = null;
                const outcome = held ? await held : (this.script.shift() ?? 'stored');
                if (outcome === 'network-error') {
                    throw new Error('network blip');
                }
                if (outcome === 'refused') {
                    // What the resolver answers when its ownership load hits a transient SQL error.
                    return { UploadRealtimeRecordingSegment: false };
                }
                this.Stored.set(variables.segmentIndex, variables.audioBase64);
                return { UploadRealtimeRecordingSegment: true };
            }
        }

        async function startRecorded(script: ShardOutcome[] = []) {
            nextWindow = 0;
            const runtime = new RealtimeSessionRuntime(new SequencedHost());
            const provider = new ShardProvider(script);
            runtime.Provider = provider as unknown as IMetadataProvider;
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'), { recordingConsent: true });
            // Bracket access drives the private flush the 15 s interval would call, without timers.
            const flush = () => runtime['flushRecordingSegment']();
            return { runtime, provider, flush };
        }

        /** The stored shards in index order, decoded. */
        const storedWindows = (provider: ShardProvider) =>
            [...provider.Stored.entries()].sort(([a], [b]) => a - b).map(([index, b64]) => `${index}:${atob(b64)}`);

        it('resends a shard the server refused, under its own index, so the folder has no gap', async () => {
            const { runtime, provider, flush } = await startRecorded(['stored', 'refused']);
            for (let i = 0; i < 4; i++) {
                await flush();
            }
            expect(storedWindows(provider)).toEqual(['0:window-0', '1:window-1', '2:window-2', '3:window-3']);
            await runtime.EndRealtimeSession();
        });

        it('resends a shard whose upload threw, under its own index', async () => {
            const { runtime, provider, flush } = await startRecorded(['network-error']);
            for (let i = 0; i < 3; i++) {
                await flush();
            }
            expect(storedWindows(provider)).toEqual(['0:window-0', '1:window-1', '2:window-2']);
            await runtime.EndRealtimeSession();
        });

        it.each([
            ['null', null],
            ['an empty object', {}],
            ['a missing field', { somethingElse: true }],
        ])('treats a GraphQL result of %s as a failure and retries it under the same index', async (_label, result) => {
            const { runtime, provider, flush } = await startRecorded();
            const original = provider.ExecuteGQL.bind(provider);
            let answered = false;
            provider.ExecuteGQL = async (query: string, variables?: ShardUpload) => {
                if (!answered && variables && /mutation UploadRealtimeRecordingSegment\(/.test(query)) {
                    answered = true;
                    provider.Attempts.push({
                        agentSessionId: variables.agentSessionId,
                        segmentIndex: variables.segmentIndex,
                        audioBase64: variables.audioBase64,
                    });
                    return result;
                }
                return original(query, variables);
            };
            await flush();
            await flush();
            expect(provider.Attempts.map((a) => a.segmentIndex)).toEqual([0, 0, 1]);
            expect(storedWindows(provider)).toEqual(['0:window-0', '1:window-1']);
            await runtime.EndRealtimeSession();
        });

        it('never rejects a flush, even when every upload throws', async () => {
            const { runtime, flush } = await startRecorded(Array(20).fill('network-error'));
            for (let i = 0; i < 5; i++) {
                await expect(flush()).resolves.toBeUndefined();
            }
            await runtime.EndRealtimeSession();
        });

        it('releases the shard queue, and the audio it retained, when the recording ends', async () => {
            const { runtime, flush } = await startRecorded(['refused', 'refused', 'refused']);
            await flush();
            await flush();
            expect(runtime['shardQueue']?.RetainedCount).toBe(2);
            await runtime.EndRealtimeSession();
            expect(runtime['shardQueue']).toBeNull();
        });

        it('a flush in flight at hang-up sends nothing more once the recording has ended', async () => {
            const { runtime, provider, flush } = await startRecorded(['refused']);
            await flush(); // shard 0 refused and retained
            let release!: (outcome: ShardOutcome) => void;
            provider.HoldNextAttempt = new Promise<ShardOutcome>((resolve) => {
                release = resolve;
            });
            const inFlight = flush(); // shard 0's resend is held on the wire
            await runtime.EndRealtimeSession();
            release('refused');
            await inFlight;
            // No new window (shard 1) after the end-of-call upload, and shard 0 is not retained again.
            expect(provider.Attempts.map((a) => a.segmentIndex)).toEqual([0, 0]);
        });

        // Regression guard for the per-recording queue (it passes on the pre-fix code too), not a repro.
        it("a flush still in flight when a new session starts does not touch the new session's shard indexes", async () => {
            const { runtime, provider, flush } = await startRecorded();
            let release!: (outcome: ShardOutcome) => void;
            provider.HoldNextAttempt = new Promise<ShardOutcome>((resolve) => {
                release = resolve;
            });
            const sessionAFlush = flush();
            await runtime.EndRealtimeSession();
            await runtime.StartRealtimeSessionFromResult(
                { ...mintedSession('fake-provider'), AgentSessionId: 'session-B' },
                { recordingConsent: true },
            );
            release('refused');
            await sessionAFlush;
            await runtime['flushRecordingSegment']();
            const sessionBAttempts = provider.Attempts.filter((a) => a.agentSessionId === 'session-B');
            expect(sessionBAttempts.map((a) => a.segmentIndex)).toEqual([0]);
            // A's refused bytes (window-0) must never be resent under session B.
            expect(sessionBAttempts.every((a) => atob(a.audioBase64) !== 'window-0')).toBe(true);
            await runtime.EndRealtimeSession();
        });
    });

    describe('recording mixes the agent stream (#5153)', () => {
        const agentStream = { getAudioTracks: () => [{}], getTracks: () => [] } as unknown as MediaStream;

        /** A PCM-playback driver: publishes its playout output during Connect, as Gemini/ElevenLabs/xAI do. */
        @RegisterClass(BaseRealtimeClient, 'fake-pcm-provider')
        class FakePcmClient extends FakeRealtimeClient {
            public override async Connect(): Promise<void> {
                this.publishRemoteMediaStream(agentStream);
            }
        }

        /** A WebRTC driver: the agent track lands after Connect resolves, as OpenAI's does. */
        @RegisterClass(BaseRealtimeClient, 'fake-webrtc-provider')
        class FakeWebRtcClient extends FakeRealtimeClient {
            public static Last: FakeWebRtcClient | null = null;
            public override async Connect(): Promise<void> {
                FakeWebRtcClient.Last = this;
            }
            public LandTrack(stream: MediaStream): void {
                this.publishRemoteMediaStream(stream);
            }
        }

        it('hands a stream published at Connect to the recorder at Start', async () => {
            expect(FakePcmClient).toBeDefined();
            const host = new FakeMediaHost();
            const { runtime } = build(host);
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-pcm-provider'), { recordingConsent: true });

            expect(host.recorder?.Start).toHaveBeenCalledTimes(1);
            expect(host.recorder?.Start.mock.calls[0][1]).toBe(agentStream);
            await runtime.EndRealtimeSession();
        });

        it('attaches a stream that lands after Connect to the recorder already running', async () => {
            const host = new FakeMediaHost();
            const { runtime } = build(host);
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-webrtc-provider'), { recordingConsent: true });
            expect(host.recorder?.Start.mock.calls[0][1]).toBeNull();

            FakeWebRtcClient.Last?.LandTrack(agentStream);

            expect(host.recorder?.AttachRemoteStream).toHaveBeenCalledWith(agentStream);
            await runtime.EndRealtimeSession();
        });
    });
});

describe('surface client tools run through the channel context', () => {
    // Bracket access reaches the private method with its real return type, no cast needed.
    const executeAppClientTool = (runtime: RealtimeSessionRuntime, name: string) => runtime['executeAppClientTool'](name, {});

    /** A runtime with one registered surface tool whose handler returns `result`. */
    function runtimeWithTool(result: unknown): RealtimeSessionRuntime {
        const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
        runtime.RegisterAppClientTools([{ Name: 'AddPanel', Handler: async () => result }]);
        return runtime;
    }

    it("reports a handler result with Success: false as a failure, with the handler's message and result", async () => {
        const failed = { Success: false, ErrorMessage: 'The open dashboard changed.', Data: { panelId: 'A' } };

        await expect(executeAppClientTool(runtimeWithTool(failed), 'AddPanel')).resolves.toEqual({
            Success: false,
            ErrorMessage: 'The open dashboard changed.',
            Result: failed,
        });
    });

    it('says "Tool failed" for a failed handler result without a message', async () => {
        const failed = { Success: false, ErrorMessage: '  ' };

        await expect(executeAppClientTool(runtimeWithTool(failed), 'AddPanel')).resolves.toEqual({ Success: false, ErrorMessage: 'Tool failed', Result: failed });
    });

    it('passes a succeeded handler result through unchanged', async () => {
        const succeeded = { Success: true, Data: { panelId: 'panel-2' } };

        await expect(executeAppClientTool(runtimeWithTool(succeeded), 'AddPanel')).resolves.toEqual({ Success: true, Result: succeeded });
        await expect(executeAppClientTool(runtimeWithTool('navigated'), 'AddPanel')).resolves.toEqual({ Success: true, Result: 'navigated' });
    });
});

describe('channel registry on a connect-only provider (#4887)', () => {
    // Bracket access reaches the private method with its real return type, no cast needed.
    const fetchChannelDefinitions = (runtime: RealtimeSessionRuntime) => runtime['fetchChannelDefinitions']();

    // A connect-only provider has no entity metadata, so AIEngineBase cannot load — but the embed
    // still needs its channels: without them Whiteboard/Media tools never reach the mint and the
    // agent loses them (seen live on Caliber's widget). The registry is read over GraphQL instead.
    const registryRow = (Name: string, IsActive: boolean, UIConfig?: string) => ({
        Data: JSON.stringify({ ID: `id-${Name}`, Name, ClientPluginClass: `${Name}Channel`, IsActive, ...(UIConfig ? { UIConfig } : {}) }),
    });

    it('reads the registry rows over GraphQL, active and inactive (an inactive row is the kill switch), without touching AIEngineBase, when the provider has no entity metadata', async () => {
        const spy = vi.spyOn(AIEngineBase, 'GetProviderInstance');
        const ExecuteGQL = vi.fn().mockResolvedValue({
            RunDynamicView: { Success: true, Results: [registryRow('Whiteboard', true, JSON.stringify({ Placement: 'pip' })), registryRow('Retired', false)] },
        });
        try {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            runtime.Provider = { Entities: [], ExecuteGQL } as never; // Entities + ExecuteGQL are all it reads

            await expect(fetchChannelDefinitions(runtime)).resolves.toEqual([
                { ID: 'id-Whiteboard', Name: 'Whiteboard', ClientPluginClass: 'WhiteboardChannel', IsActive: true, SurfacePlacement: { Default: 'pip', Allowed: MEDIA_PLACEMENTS } },
                { ID: 'id-Retired', Name: 'Retired', ClientPluginClass: 'RetiredChannel', IsActive: false, SurfacePlacement: { Default: 'tab', Allowed: MEDIA_PLACEMENTS } },
            ]);
            expect(ExecuteGQL).toHaveBeenCalledTimes(1);
            expect(ExecuteGQL.mock.calls[0][1]).toMatchObject({ input: { EntityName: 'MJ: AI Agent Channels' } });
            expect(ExecuteGQL.mock.calls[0][1].input.ExtraFilter).toBeUndefined();
            expect(ExecuteGQL.mock.calls[0][1].input.Fields).toContain('UIConfig');
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });

    it('degrades to no channels, with a warning, when the GraphQL registry read fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const ExecuteGQL = vi.fn().mockResolvedValue({ RunDynamicView: { Success: false, ErrorMessage: 'denied', Results: [] } });
        try {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            runtime.Provider = { Entities: [], ExecuteGQL } as never;

            await expect(fetchChannelDefinitions(runtime)).resolves.toEqual([]);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('Channel registry unavailable'), expect.stringContaining('denied'));
        } finally {
            warn.mockRestore();
        }
    });

    it('still consults AIEngineBase when the provider has entity metadata', async () => {
        const spy = vi.spyOn(AIEngineBase, 'GetProviderInstance').mockImplementation(() => {
            throw new Error('engine consulted');
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            runtime.Provider = { Entities: [{}] } as never; // only Entities is read

            await expect(fetchChannelDefinitions(runtime)).resolves.toEqual([]);
            expect(spy).toHaveBeenCalledTimes(1);
        } finally {
            spy.mockRestore();
            warn.mockRestore();
        }
    });
});

describe('BuildClientConfig: the requested-tracks key has one home', () => {
    // The drivers read the hint (Gemini) and strip it before the wire (OpenAI-protocol) through
    // REQUESTED_TRACKS_SESSION_KEY; the writer must use the same constant, or a rename on either
    // side silently breaks track negotiation and re-leaks the hint into OpenAI's session.update.
    const session = (SessionConfigJson: string): StartRealtimeClientSessionResult =>
        ({ AgentSessionId: 's', ConversationId: null, Provider: 'gemini', Model: 'm', EphemeralToken: 't', ExpiresAt: 'x', SessionConfigJson, ModelName: null }) as StartRealtimeClientSessionResult;

    it('writes channel-sourced tracks under REQUESTED_TRACKS_SESSION_KEY, keeping the mint-supplied ones', () => {
        const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
        const video = { Direction: 'Inbound', Modality: 'Video' } as const;
        runtime['_activeChannels$'].next([{ GetSourcedTracks: () => [video], GetSunkTracks: () => [] } as never]);
        const minted = { Direction: 'Outbound', Modality: 'Video' };
        const config = runtime.BuildClientConfig(session(JSON.stringify({ [REQUESTED_TRACKS_SESSION_KEY]: [minted] })));
        const tracks = config.SessionConfig?.[REQUESTED_TRACKS_SESSION_KEY] as Array<{ Direction: string; Modality: string }>;
        expect(tracks).toEqual(expect.arrayContaining([expect.objectContaining(video), expect.objectContaining(minted)]));
    });

    it('never spells the key as a string literal in the runtime source', () => {
        const source = readFileSync(fileURLToPath(new URL('../session/RealtimeSessionRuntime.ts', import.meta.url)), 'utf8');
        expect(source.length).toBeGreaterThan(0);
        expect(source).not.toMatch(/['"`]requestedTracks['"`]/);
    });
});
