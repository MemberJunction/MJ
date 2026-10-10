/**
 * Tests for the real `@livekit/rtc-node` room wrapper — exercised against a **fake `@livekit/rtc-node`
 * module** (no native addon, no network). Covers the pure PCM helpers, the connect→publish-track flow,
 * BOTH audio directions (outbound `captureFrame` at the right rate + inbound `AudioStream`→diarized frame),
 * participant connect/disconnect events, roster, data-channel publish, disconnect teardown, the
 * sample-rate overrides, the absence of raw video/screen publish (the avatar is the only video out; its tests are in
 * livekit-rtc-node-avatar.test.ts), the participant-video wiring (the watcher's own rules are in
 * room-video-watcher.test.ts), which audio the bot hears (not screen-share audio), and the actionable error when the
 * addon is absent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ LogStatus: vi.fn<(message: string) => void>() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogStatus: mocks.LogStatus };
});

import {
    CreateLiveKitRtcNodeModule,
    LiveKitRtcNodeRoomClient,
    DefaultRtcNodeLoader,
    PcmToInt16,
    Int16ToArrayBuffer,
    ParticipantsToArray,
    DEFAULT_SAMPLE_RATE,
    type RtcAudioFrame,
    type RtcTrack,
} from '../livekit-rtc-node-room';
import type {
    NativeRoomAudioFrame,
    NativeConnectArgs,
    NativeRoomVideoFrame,
    NativeRoomVideoOptions,
} from '@memberjunction/ai-bridge-livekit';
import {
    fakePerson,
    FakePublication,
    flush,
    i420Frame,
    LETS_AGENTS_SEE,
    makeFakeRtc,
    ROOM_EVENT,
    TRACK_KIND,
    TRACK_SOURCE,
    type FakeParticipant,
    type FakeRtc,
} from './fake-rtc-node';

const connectArgs: NativeConnectArgs = { url: 'wss://lk.example', token: 'tok', name: 'Agent' };
const frame = (samples: number[]): RtcAudioFrame => ({
    data: Int16Array.from(samples), sampleRate: DEFAULT_SAMPLE_RATE, channels: 1, samplesPerChannel: samples.length,
});

beforeEach(() => mocks.LogStatus.mockClear());

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('LiveKit native wrapper — pure helpers', () => {
    it('pcmToInt16 views whole samples and truncates a trailing odd byte', () => {
        const buf = new Int16Array([1, -2, 3]).buffer;
        expect(Array.from(PcmToInt16(buf))).toEqual([1, -2, 3]);
        // 5 bytes → 2 whole samples
        expect(PcmToInt16(new ArrayBuffer(5)).length).toBe(2);
    });

    it('int16ToArrayBuffer copies (does not alias) and round-trips', () => {
        const src = Int16Array.from([7, -7, 700]);
        const out = Int16ToArrayBuffer(src);
        expect(Array.from(new Int16Array(out))).toEqual([7, -7, 700]);
        src[0] = 0; // mutate source after copy
        expect(new Int16Array(out)[0]).toBe(7); // copy unaffected
    });

    it('participantsToArray handles Map and array forms', () => {
        const p = { identity: 'a' };
        expect(ParticipantsToArray([p])).toEqual([p]);
        expect(ParticipantsToArray(new Map([['a', p]]))).toEqual([p]);
    });
});

// ── Connect + two-way audio ─────────────────────────────────────────────────────

describe('LiveKitRtcNodeRoomClient — connect + audio', () => {
    it('connect loads the module, connects, publishes the bot track, returns identity/room', async () => {
        const { module, cap } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(DEFAULT_SAMPLE_RATE, DEFAULT_SAMPLE_RATE, 1, async () => module);
        const result = await client.connect(connectArgs);
        expect(result).toEqual({ localIdentity: 'agent-bot', roomName: 'demo-room' });
        expect(cap.publishedSources).toEqual([2]); // SOURCE_MICROPHONE — required for captureFrame to succeed
        expect(cap.audioSourceRates).toEqual([[DEFAULT_SAMPLE_RATE, 1]]); // outbound source at model rate
    });

    it('publishAudio before connect is a safe no-op; after connect it captures a frame at the outbound rate', async () => {
        const { module, cap } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(16000, 24000, 1, async () => module);
        expect(() => client.publishAudio(new Int16Array([1, 2]).buffer)).not.toThrow(); // pre-connect no-op
        expect(cap.captured).toHaveLength(0);

        await client.connect(connectArgs);
        client.publishAudio(new Int16Array([10, 20, 30, 40]).buffer);
        await Promise.resolve(); // let the fire-and-forget captureFrame settle
        expect(cap.captured).toHaveLength(1);
        expect(cap.captured[0].sampleRate).toBe(16000); // OUTBOUND rate
        expect(Array.from(cap.captured[0].data)).toEqual([10, 20, 30, 40]);
        expect(cap.captured[0].samplesPerChannel).toBe(4);
    });

    it('serializes a burst of frames: captures in FIFO order, never more than one capture in flight', async () => {
        const { module, cap } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        await client.connect(connectArgs);

        // Fire a burst synchronously (the realtime model emits its reply faster than real time).
        client.publishAudio(new Int16Array([1]).buffer);
        client.publishAudio(new Int16Array([2]).buffer);
        client.publishAudio(new Int16Array([3]).buffer);
        client.publishAudio(new Int16Array([4]).buffer);

        // Let the serial drain run to completion.
        for (let i = 0; i < 10 && cap.captured.length < 4; i++) {
            await new Promise((r) => setTimeout(r, 0));
        }

        expect(cap.captured.map((f) => Array.from(f.data)[0])).toEqual([1, 2, 3, 4]); // FIFO, no reorder
        expect(cap.maxConcurrentCaptures).toBe(1); // never overlapped — the bug this fix prevents
    });

    it('inbound subscribed audio is read at the model INPUT rate and forwarded as a diarized frame', async () => {
        const { module, emit, inboundFramesFor } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 16000, 1, async () => module);
        const heard: NativeRoomAudioFrame[] = [];
        client.onAudioFrame((f) => heard.push(f));
        await client.connect(connectArgs);

        inboundFramesFor([frame([5, 6, 7])]);
        const audioTrack: RtcTrack = { kind: TRACK_KIND.KIND_AUDIO };
        emit(ROOM_EVENT.TrackSubscribed, audioTrack, {}, { identity: 'dana', name: 'Dana' });
        await new Promise((r) => setTimeout(r, 0)); // let the async stream pump run

        expect(heard).toHaveLength(1);
        expect(heard[0].participantIdentity).toBe('dana');
        expect(heard[0].name).toBe('Dana');
        expect(Array.from(new Int16Array(heard[0].data))).toEqual([5, 6, 7]);
    });

    it('ignores non-audio subscribed tracks', async () => {
        const { module, emit } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        const heard: NativeRoomAudioFrame[] = [];
        client.onAudioFrame((f) => heard.push(f));
        await client.connect(connectArgs);
        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_VIDEO }, {}, { identity: 'x' });
        await new Promise((r) => setTimeout(r, 0));
        expect(heard).toHaveLength(0);
    });

    it('tracks audio telemetry: inbound gap histogram, outbound captures and queuedDuration, event loop p99', async () => {
        const { module, emit, inboundFramesFor } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        await client.connect(connectArgs);

        // Inbound frames
        inboundFramesFor([frame([1, 2]), frame([3, 4])]);
        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_AUDIO }, {}, { identity: 'user-1', name: 'User 1' });
        await new Promise((r) => setTimeout(r, 0));

        // Outbound frame
        client.publishAudio(new Int16Array([10, 20]).buffer);
        await new Promise((r) => setTimeout(r, 10));

        const tele = client.GetTelemetry();
        expect(tele.outbound.captureCount).toBe(1);
        expect(tele.outbound.lastQueuedDuration).toBe(50);
        expect(tele.inboundGaps['user-1']).toBeDefined();
        expect(tele.inboundGaps['user-1'].totalFrames).toBeGreaterThanOrEqual(1);

        // Pruning on participant disconnect
        emit(ROOM_EVENT.ParticipantDisconnected, { identity: 'user-1' });
        expect(client.GetTelemetry().inboundGaps['user-1']).toBeUndefined();

        await client.disconnect();
        expect(Object.keys(client.GetTelemetry().inboundGaps)).toHaveLength(0);
    });
});

// ── What the bot hears ──────────────────────────────────────────────────────────

describe('LiveKitRtcNodeRoomClient — what the bot hears', () => {
    const audioTrack: RtcTrack = { kind: TRACK_KIND.KIND_AUDIO };
    const ada = { identity: 'ada', name: 'Ada' };
    const bob = { identity: 'bob', name: 'Bob' };

    /** A remote audio publication with the given track source. */
    const audioFrom = (sid: string, source: number): FakePublication => new FakePublication(sid, source, { kind: TRACK_KIND.KIND_AUDIO });

    /** The status lines saying whose screen-share audio the bot does not hear. */
    const screenShareAudioLines = (): string[] =>
        mocks.LogStatus.mock.calls.map(([message]) => message).filter((message) => message.includes('screen-share audio'));

    /** A connected bot (model input at 16 kHz) collecting what it hears; every audio stream it opens yields `samples`. */
    async function listening(samples: number[]): Promise<{ fake: FakeRtc; heard: NativeRoomAudioFrame[] }> {
        const fake = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 16000, 1, async () => fake.module);
        const heard: NativeRoomAudioFrame[] = [];
        client.onAudioFrame((f) => heard.push(f));
        await client.connect(connectArgs);
        fake.inboundFramesFor([frame(samples)]);
        return { fake, heard };
    }

    it('does not hear screen-share audio: it opens no stream, unsubscribes the track, and says so once per participant in the room', async () => {
        const { fake, heard } = await listening([1, 2, 3]);
        const adasTab = audioFrom('TR_ada_tab', TRACK_SOURCE.SOURCE_SCREENSHARE_AUDIO);
        const adasNextTab = audioFrom('TR_ada_tab_2', TRACK_SOURCE.SOURCE_SCREENSHARE_AUDIO); // Ada stops and shares again
        const bobsTab = audioFrom('TR_bob_tab', TRACK_SOURCE.SOURCE_SCREENSHARE_AUDIO);
        fake.emit(ROOM_EVENT.TrackSubscribed, audioTrack, adasTab, ada);
        fake.emit(ROOM_EVENT.TrackSubscribed, audioTrack, adasNextTab, ada);
        fake.emit(ROOM_EVENT.TrackSubscribed, audioTrack, bobsTab, bob);
        await flush();

        expect(fake.cap.audioStreamRates).toEqual([]); // no AudioStream: nothing of it reaches the model
        expect(heard).toEqual([]);
        expect([adasTab, adasNextTab, bobsTab].map((p) => p.subscribeCalls)).toEqual([[false], [false], [false]]);
        const lines = screenShareAudioLines();
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain("'ada'");
        expect(lines[1]).toContain("'bob'");

        // Ada leaves, rejoins and shares a tab with sound again: a new stay in the room gets its own line.
        fake.emit(ROOM_EVENT.ParticipantDisconnected, ada);
        fake.emit(ROOM_EVENT.TrackSubscribed, audioTrack, audioFrom('TR_ada_tab_3', TRACK_SOURCE.SOURCE_SCREENSHARE_AUDIO), ada);
        expect(screenShareAudioLines()).toHaveLength(3);
        expect(fake.cap.audioStreamRates).toEqual([]);
    });

    it('hears the microphone of a person who shares a tab with sound, and only the microphone', async () => {
        const { fake, heard } = await listening([4, 5]);
        const mic = audioFrom('TR_mic', TRACK_SOURCE.SOURCE_MICROPHONE);
        const tab = audioFrom('TR_tab', TRACK_SOURCE.SOURCE_SCREENSHARE_AUDIO);
        fake.emit(ROOM_EVENT.TrackSubscribed, audioTrack, mic, ada);
        fake.emit(ROOM_EVENT.TrackSubscribed, audioTrack, tab, ada);
        await flush();

        expect(fake.cap.audioStreamRates).toEqual([[16000, 1]]); // one stream, the microphone's, at the model's input rate
        expect(heard.map((f) => [f.participantIdentity, Array.from(new Int16Array(f.data))])).toEqual([['ada', [4, 5]]]);
        expect(mic.subscribeCalls).toEqual([]);
        expect(tab.subscribeCalls).toEqual([false]);
    });

    it('still hears audio whose source is unknown or missing (a client that published it without naming a source)', async () => {
        const { fake, heard } = await listening([6]);
        const unnamed = audioFrom('TR_unnamed', TRACK_SOURCE.SOURCE_UNKNOWN);
        fake.emit(ROOM_EVENT.TrackSubscribed, audioTrack, unnamed, { identity: 'cleo', name: 'Cleo' });
        fake.emit(ROOM_EVENT.TrackSubscribed, audioTrack, {}, { identity: 'dev' }); // a publication with no source at all
        await flush();

        expect(heard.map((f) => f.participantIdentity)).toEqual(['cleo', 'dev']);
        expect(unnamed.subscribeCalls).toEqual([]);
        expect(screenShareAudioLines()).toEqual([]);
    });
});

// ── Roster, data, lifecycle ─────────────────────────────────────────────────────

describe('LiveKitRtcNodeRoomClient — roster, data, lifecycle', () => {
    it('participant connect/disconnect events reach the handlers', async () => {
        const { module, emit } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        const joined: string[] = [];
        const left: string[] = [];
        client.onParticipantConnected((p) => joined.push(p.identity));
        client.onParticipantDisconnected((id) => left.push(id));
        await client.connect(connectArgs);
        emit(ROOM_EVENT.ParticipantConnected, { identity: 'pat', name: 'Pat' });
        emit(ROOM_EVENT.ParticipantDisconnected, { identity: 'pat' });
        expect(joined).toEqual(['pat']);
        expect(left).toEqual(['pat']);
    });

    it('getParticipants maps the remote roster', async () => {
        const { module } = makeFakeRtc([{ identity: 'a', name: 'Ada' }, { identity: 'b' }]);
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        await client.connect(connectArgs);
        expect(await client.getParticipants()).toEqual([{ identity: 'a', name: 'Ada' }, { identity: 'b', name: undefined }]);
    });

    it('publishData encodes the text and sends it reliably', async () => {
        const { module, cap } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        await client.connect(connectArgs);
        await client.publishData('hello room');
        expect(cap.publishedData).toHaveLength(1);
        expect(new TextDecoder().decode(cap.publishedData[0])).toBe('hello room');
    });

    it('onDisconnected fires; disconnect() tears down the room', async () => {
        const { module, cap, emit } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        const ended = vi.fn();
        client.onDisconnected(ended);
        await client.connect(connectArgs);
        emit(ROOM_EVENT.Disconnected);
        expect(ended).toHaveBeenCalledOnce();
        await client.disconnect();
        expect(cap.disconnected).toBe(true);
    });

    it('has no raw video or screen publish: joining and speaking publish the voice track only (the avatar outlet is the one video path)', async () => {
        expect('publishVideo' in LiveKitRtcNodeRoomClient.prototype).toBe(false);
        expect('publishScreen' in LiveKitRtcNodeRoomClient.prototype).toBe(false);
        const { module, cap } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        await client.connect(connectArgs);
        client.publishAudio(new Int16Array([1, 2]).buffer);
        await flush();
        expect(cap.publishes.map((p) => p.kind)).toEqual(['audio']);
        expect(cap.videoSources).toHaveLength(0);
    });
});

// ── Participant video wiring ────────────────────────────────────────────────────

describe('LiveKitRtcNodeRoomClient — participant video wiring', () => {
    const WATCH: NativeRoomVideoOptions = { Streams: 1, Rate: 1, Cameras: true, Screens: true };

    function adaWithCameraAndScreen(): { ada: FakeParticipant; cam: FakePublication; screen: FakePublication } {
        const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const screen = new FakePublication('TR_screen', TRACK_SOURCE.SOURCE_SCREENSHARE);
        return { ada: fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [cam, screen]), cam, screen };
    }

    /** Ada with a camera only (with a screen too, the screen would rank first). */
    function adaWithCamera(): { ada: FakeParticipant; cam: FakePublication } {
        const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA);
        return { ada: fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [cam]), cam };
    }

    it('without video options, reads no video and unsubscribes every video track as it arrives (every meeting)', async () => {
        const { ada, cam, screen } = adaWithCameraAndScreen();
        const { module, cap, emit, inboundFramesFor } = makeFakeRtc([ada]);
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        const seen: NativeRoomVideoFrame[] = [];
        const heard: NativeRoomAudioFrame[] = [];
        client.onVideoFrame((f) => seen.push(f));
        client.onAudioFrame((f) => heard.push(f));
        await client.connect(connectArgs);

        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_VIDEO }, cam, ada);
        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_VIDEO }, screen, ada);
        inboundFramesFor([frame([1, 2])]);
        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_AUDIO }, new FakePublication('TR_mic', TRACK_SOURCE.SOURCE_MICROPHONE, { kind: TRACK_KIND.KIND_AUDIO }), ada);
        await flush();

        expect(cam.subscribeCalls).toEqual([false]);
        expect(screen.subscribeCalls).toEqual([false]);
        expect(cap.videoStreams).toHaveLength(0);
        expect(seen).toHaveLength(0);
        expect(heard).toHaveLength(1); // hearing is unchanged
        expect(client.GetTelemetry().video).toBeUndefined();
    });

    it('with video options, reads a consenting camera and reports video telemetry', async () => {
        const { ada, cam } = adaWithCamera();
        const { module, cap, emit } = makeFakeRtc([ada]);
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module, { Video: WATCH });
        const seen: NativeRoomVideoFrame[] = [];
        client.onVideoFrame((f) => seen.push(f));
        await client.connect(connectArgs);

        const track = { kind: TRACK_KIND.KIND_VIDEO };
        emit(ROOM_EVENT.TrackSubscribed, track, cam, ada);
        cap.streamFor(track)!.push({ frame: i420Frame(32, 24), rotation: 0 });
        await flush();

        expect(seen.map((f) => [f.participantIdentity, f.source])).toEqual([['ada', 'camera']]);
        expect(client.GetTelemetry().video).toMatchObject({ framesSent: 1, selectedSources: 1 });
    });

    it('createRoomClient passes Video to the in-process client, and omits it when the agent does not watch', async () => {
        const watched = adaWithCamera();
        const one = makeFakeRtc([watched.ada]);
        const watching = CreateLiveKitRtcNodeModule({ Loader: async () => one.module }).createRoomClient({ Video: WATCH });
        await watching.connect(connectArgs);
        one.emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_VIDEO }, watched.cam, watched.ada);
        expect(one.cap.videoStreams).toHaveLength(1);

        const unwatched = adaWithCameraAndScreen();
        const two = makeFakeRtc([unwatched.ada]);
        const plain = CreateLiveKitRtcNodeModule({ Loader: async () => two.module }).createRoomClient({});
        await plain.connect(connectArgs);
        two.emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_VIDEO }, unwatched.cam, unwatched.ada);
        expect(two.cap.videoStreams).toHaveLength(0);
        expect(unwatched.cam.subscribeCalls).toEqual([false]);
    });

    it('with video options, a published screen share takes the view from the camera (TrackPublished is wired)', async () => {
        const { ada, cam } = adaWithCamera();
        const { module, cap, emit } = makeFakeRtc([ada]);
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module, { Video: WATCH });
        await client.connect(connectArgs);
        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_VIDEO }, cam, ada);

        const screen = new FakePublication('TR_screen', TRACK_SOURCE.SOURCE_SCREENSHARE);
        ada.trackPublications.set(screen.sid, screen);
        emit(ROOM_EVENT.TrackPublished, screen, ada);
        expect(cap.videoStreams[0].cancelled).toBe(true);
        expect(cam.lastSubscribe).toBe(false);
        expect(screen.subscribeCalls).toEqual([true]);
    });

    it("with video options, the active speaker's camera takes the view after the onset (ActiveSpeakersChanged is wired)", async () => {
        const { ada, cam } = adaWithCamera();
        const bobCam = new FakePublication('TR_bob_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const bob = fakePerson('bob', 'Bob', { ...LETS_AGENTS_SEE }, [bobCam]);
        const { module, emit } = makeFakeRtc([ada, bob]);
        const clock = { now: 0 };
        const timers: Array<() => void> = [];
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module, {
            Video: { ...WATCH, SpeakerOnsetMs: 100, SpeakerHoldMs: 100 },
            Now: () => clock.now,
            Timer: (callback) => {
                timers.push(callback);
                return () => undefined;
            },
        });
        await client.connect(connectArgs);
        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_VIDEO }, cam, ada);
        emit(ROOM_EVENT.ActiveSpeakersChanged, [bob]);
        expect(timers).toHaveLength(1);

        clock.now = 101;
        timers[0]();
        expect(cam.lastSubscribe).toBe(false);
        expect(bobCam.lastSubscribe).toBe(true);
        expect(client.GetTelemetry().video).toMatchObject({ activeSpeakerUpdates: 1, sourceSwitches: 1 });
    });

    it('without video options, publish and speaker events touch nothing', async () => {
        const { ada, cam, screen } = adaWithCameraAndScreen();
        const { module, emit } = makeFakeRtc([ada]);
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        await client.connect(connectArgs);
        emit(ROOM_EVENT.TrackPublished, screen, ada);
        emit(ROOM_EVENT.ActiveSpeakersChanged, [ada]);
        expect(cam.subscribeCalls).toEqual([]);
        expect(screen.subscribeCalls).toEqual([]);
        expect(client.GetTelemetry().video).toBeUndefined();
    });
});

// ── Module factory + loader ─────────────────────────────────────────────────────

describe('CreateLiveKitRtcNodeModule + loader', () => {
    it('createRoomClient honors the configured outbound + inbound sample rates', async () => {
        const { module, cap } = makeFakeRtc();
        const mod = CreateLiveKitRtcNodeModule({ OutboundSampleRate: 8000, InboundSampleRate: 16000, Loader: async () => module });
        const client = mod.createRoomClient({});
        await client.connect(connectArgs);
        expect(cap.audioSourceRates).toEqual([[8000, 1]]); // outbound source at the OUTBOUND override

        // inbound AudioStream is constructed at the INBOUND override rate
        const { module: m2, cap: cap2, emit, inboundFramesFor } = makeFakeRtc();
        const mod2 = CreateLiveKitRtcNodeModule({ InboundSampleRate: 16000, Loader: async () => m2 });
        const c2 = mod2.createRoomClient({});
        await c2.connect(connectArgs);
        inboundFramesFor([frame([1])]);
        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_AUDIO }, {}, { identity: 'z' });
        await new Promise((r) => setTimeout(r, 0));
        expect(cap2.audioStreamRates).toEqual([[16000, 1]]);
    });

    it('defaultRtcNodeLoader resolves a Room-bearing module when the addon is present, else throws the actionable error', async () => {
        // Deterministic across environments: the native addon is an optionalDependency — present here,
        // possibly absent in CI (a native-build failure is non-fatal). Accept either branch.
        try {
            const mod = await DefaultRtcNodeLoader();
            expect(typeof mod.Room).toBe('function');
        } catch (err) {
            expect((err as Error).message).toMatch(/could not load '@livekit\/rtc-node'/);
        }
    });
});
