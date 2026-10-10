import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, MEDIA_PLACEMENTS, REQUESTED_TRACKS_SESSION_KEY } from '@memberjunction/ai-realtime-client';
import type { IMetadataProvider } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
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
        public async Connect(): Promise<void> {}
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

    it('clears the last start error when a later session starts cleanly', async () => {
        const { runtime } = build(new FakeMediaHost());
        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        expect(runtime.LastStartError).toBeNull();
        await runtime.EndRealtimeSession();
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
