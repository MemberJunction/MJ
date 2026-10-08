/**
 * Tests for participant video inside the bot, driven through {@link LiveKitRtcNodeRoomClient} and a fake
 * `@livekit/rtc-node` room: who may be read (consent, agents, kinds), selection (one source at a time, the next when it
 * ends), subscriptions, pacing to the session's rate, consent winning over a frame in hand, every way a source ends,
 * teardown, and telemetry. The frames are real JPEGs (the encoder is not mocked).
 */
import { describe, it, expect, vi } from 'vitest';
import jpeg from 'jpeg-js';
import type {
    NativeConnectArgs,
    NativeRoomVideoFrame,
    NativeRoomVideoOptions,
    NativeRoomVideoSourceEnd,
} from '@memberjunction/ai-bridge-livekit';
import { LiveKitRtcNodeRoomClient, type RtcParticipant, type RtcTrack, type RtcVideoFrameEvent } from '../livekit-rtc-node-room';
import { VideoFrameEncoder } from '../video-frame-encoder';
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
    VIDEO_ROTATION,
    type FakeParticipant,
    type FakeRtc,
    type FakeVideoStream,
} from './fake-rtc-node';

const CONNECT: NativeConnectArgs = { url: 'wss://lk.example', token: 'tok', name: 'Agent' };
const WATCH: NativeRoomVideoOptions = { Streams: 1, Rate: 1, Cameras: true, Screens: true };

interface Harness {
    fake: FakeRtc;
    client: LiveKitRtcNodeRoomClient;
    frames: NativeRoomVideoFrame[];
    ended: NativeRoomVideoSourceEnd[];
    clock: { now: number };
}

/** A connected bot that watches the meeting, with an injected clock. */
async function watching(remote: RtcParticipant[], video: Partial<NativeRoomVideoOptions> = {}, now?: () => number): Promise<Harness> {
    const fake = makeFakeRtc(remote);
    const clock = { now: 0 };
    const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => fake.module, {
        Video: { ...WATCH, ...video },
        Now: now ?? (() => clock.now),
    });
    const frames: NativeRoomVideoFrame[] = [];
    const ended: NativeRoomVideoSourceEnd[] = [];
    client.onVideoFrame((f) => frames.push(f));
    client.onVideoSourceEnded((s) => ended.push(s));
    await client.connect(CONNECT);
    return { fake, client, frames, ended, clock };
}

/** The server sends the bot a video track (auto-subscribe, or a subscription the bot asked for). */
function subscribe(h: Harness, publication: FakePublication, person: RtcParticipant): FakeVideoStream | undefined {
    const track: RtcTrack = { kind: TRACK_KIND.KIND_VIDEO };
    h.fake.emit(ROOM_EVENT.TrackSubscribed, track, publication, person);
    return h.fake.cap.streamFor(track);
}

function frameEvent(width = 64, height = 48, rotation = VIDEO_ROTATION.VIDEO_ROTATION_0): RtcVideoFrameEvent {
    return { frame: i420Frame(width, height), rotation };
}

/** Hands the reader one frame at the current clock and lets the pump run. */
async function pushFrame(stream: FakeVideoStream, event: RtcVideoFrameEvent = frameEvent()): Promise<void> {
    stream.push(event);
    await flush();
}

/** Pushes `count` frames spaced `spacingMs` apart on the harness clock. */
async function pushAtRate(h: Harness, stream: FakeVideoStream, count: number, spacingMs: number): Promise<void> {
    for (let k = 0; k < count; k++) {
        h.clock.now = k * spacingMs;
        await pushFrame(stream);
    }
}

/** A person who lets agents see them, with a camera. */
function adaWithCamera(): { ada: FakeParticipant; cam: FakePublication } {
    const cam = new FakePublication('TR_ada_cam', TRACK_SOURCE.SOURCE_CAMERA);
    return { ada: fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [cam]), cam };
}

/** Makes a person leave the way LiveKit does: removed from the room, then the event. */
function leave(h: Harness, person: RtcParticipant): void {
    h.fake.remote.splice(h.fake.remote.indexOf(person), 1);
    h.fake.emit(ROOM_EVENT.ParticipantDisconnected, person);
}

const ADA_CAMERA_ENDED: NativeRoomVideoSourceEnd = { participantIdentity: 'ada', name: 'Ada', source: 'camera' };

describe('RoomVideoWatcher: who may be read', () => {
    it.each([['yes'], ['TRUE'], ['True'], ['false'], ['1'], ['']])('does not read a person whose mj.agentCanSee is %j', async (value) => {
        const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const pat = fakePerson('pat', 'Pat', { 'mj.agentCanSee': value }, [cam]);
        const h = await watching([pat]);
        expect(subscribe(h, cam, pat)).toBeUndefined();
        expect(cam.subscribeCalls).toEqual([false]);
        expect(h.fake.cap.videoStreams).toHaveLength(0);
    });

    it('does not read a person without the attribute', async () => {
        const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const pat = fakePerson('pat', 'Pat', {}, [cam]);
        const h = await watching([pat]);
        expect(subscribe(h, cam, pat)).toBeUndefined();
        expect(cam.subscribeCalls).toEqual([false]);
    });

    it('reads a person whose mj.agentCanSee is exactly "true"', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        const stream = subscribe(h, cam, ada);
        expect(stream).toBeDefined();
        expect(cam.subscribeCalls).toEqual([]);
        await pushFrame(stream!);
        expect(h.frames).toHaveLength(1);
    });

    it.each([['agent-7f3c'], ['Agent-Sage']])('never reads an agent (%s), even one that carries the consent attribute', async (identity) => {
        const cam = new FakePublication('TR_agent_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const bot = fakePerson(identity, 'Sage', { ...LETS_AGENTS_SEE }, [cam]);
        const h = await watching([bot]);
        expect(subscribe(h, cam, bot)).toBeUndefined();
        expect(cam.subscribeCalls).toEqual([false]);
    });

    it('never picks an agent when a slot frees', async () => {
        const { ada, cam } = adaWithCamera();
        const botCam = new FakePublication('TR_bot_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const bot = fakePerson('agent-2', 'Other agent', { ...LETS_AGENTS_SEE }, [botCam]);
        const h = await watching([ada, bot]);
        subscribe(h, cam, ada);
        subscribe(h, botCam, bot);
        leave(h, ada);
        expect(botCam.subscribeCalls).toEqual([false]);
    });

    it('reads cameras only when Cameras is on, and screens only when Screens is on', async () => {
        const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const screen = new FakePublication('TR_screen', TRACK_SOURCE.SOURCE_SCREENSHARE);
        const ada = fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [cam, screen]);

        const screensOnly = await watching([ada], { Cameras: false });
        expect(subscribe(screensOnly, cam, ada)).toBeUndefined();
        expect(subscribe(screensOnly, screen, ada)).toBeDefined();

        const camerasOnly = await watching([ada], { Screens: false });
        expect(subscribe(camerasOnly, screen, ada)).toBeUndefined();
        expect(subscribe(camerasOnly, cam, ada)).toBeDefined();
    });

    it('does not read a video track that is neither a camera nor a screen share', async () => {
        const other = new FakePublication('TR_other', 0);
        const ada = fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [other]);
        const h = await watching([ada]);
        expect(subscribe(h, other, ada)).toBeUndefined();
        expect(other.subscribeCalls).toEqual([false]);
    });

    it('does not read a muted track, and selects it once it is unmuted', async () => {
        const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA, { muted: true });
        const ada = fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [cam]);
        const h = await watching([ada]);
        expect(subscribe(h, cam, ada)).toBeUndefined();
        expect(cam.subscribeCalls).toEqual([false]);

        cam.muted = false;
        h.fake.emit(ROOM_EVENT.TrackUnmuted, cam, ada);
        expect(cam.subscribeCalls).toEqual([false, true]);
        expect(subscribe(h, cam, ada)).toBeDefined();
    });

    it('selects a person who opts in during the call', async () => {
        const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const ada = fakePerson('ada', 'Ada', {}, [cam]);
        const h = await watching([ada]);
        expect(subscribe(h, cam, ada)).toBeUndefined();

        ada.attributes = { ...LETS_AGENTS_SEE };
        h.fake.emit(ROOM_EVENT.ParticipantAttributesChanged, { ...LETS_AGENTS_SEE }, ada);
        expect(cam.subscribeCalls).toEqual([false, true]);
        const stream = subscribe(h, cam, ada);
        await pushFrame(stream!);
        expect(h.frames.map((f) => f.participantIdentity)).toEqual(['ada']);
    });
});

describe('RoomVideoWatcher: frames', () => {
    it('emits a JPEG frame labelled with the person and the source kind: camera', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        await pushFrame(subscribe(h, cam, ada)!);
        const [frame] = h.frames;
        expect(frame).toMatchObject({ mimeType: 'image/jpeg', participantIdentity: 'ada', name: 'Ada', source: 'camera', width: 64, height: 48 });
        expect(typeof frame.timestampMs).toBe('number');
        const decoded = jpeg.decode(new Uint8Array(frame.data), { useTArray: true });
        expect([decoded.width, decoded.height]).toEqual([64, 48]);
    });

    it('labels a shared screen as screen', async () => {
        const screen = new FakePublication('TR_screen', TRACK_SOURCE.SOURCE_SCREENSHARE);
        const ada = fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [screen]);
        const h = await watching([ada]);
        await pushFrame(subscribe(h, screen, ada)!);
        expect(h.frames[0].source).toBe('screen');
    });

    it('caps a camera at 640 px and a screen at 1280 px by default, and honors overrides', async () => {
        const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const screen = new FakePublication('TR_screen', TRACK_SOURCE.SOURCE_SCREENSHARE);
        const ada = fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [cam, screen]);

        const h = await watching([ada], { Streams: 2 });
        await pushFrame(subscribe(h, cam, ada)!, frameEvent(1280, 720));
        await pushFrame(subscribe(h, screen, ada)!, frameEvent(1920, 1080));
        expect(h.frames.map((f) => [f.source, f.width, f.height])).toEqual([['camera', 640, 360], ['screen', 1280, 720]]);

        const small = await watching([ada], { Streams: 2, CameraMaxDimension: 160, ScreenMaxDimension: 320 });
        await pushFrame(subscribe(small, cam, ada)!, frameEvent(1280, 720));
        await pushFrame(subscribe(small, screen, ada)!, frameEvent(1280, 720));
        expect(small.frames.map((f) => [f.width, f.height])).toEqual([[160, 90], [320, 180]]);
    });

    it('applies the frame rotation (90 degrees swaps width and height)', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        await pushFrame(subscribe(h, cam, ada)!, frameEvent(64, 48, VIDEO_ROTATION.VIDEO_ROTATION_90));
        expect([h.frames[0].width, h.frames[0].height]).toEqual([48, 64]);
    });

    it('samples 30 fps down to one frame per second at the default rate', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        await pushAtRate(h, subscribe(h, cam, ada)!, 90, 33); // ~3 s of video
        expect(h.frames).toHaveLength(3);
        expect(h.client.GetTelemetry().video).toMatchObject({ framesReceived: 90, framesSent: 3, framesSkippedNotDue: 87 });
    });

    it('follows the session rate: 2 fps sends twice as many frames', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada], { Rate: 2 });
        await pushAtRate(h, subscribe(h, cam, ada)!, 90, 33);
        expect(h.frames).toHaveLength(6);
    });

    it('falls back to 1 fps when no rate was negotiated', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada], { Rate: undefined });
        await pushAtRate(h, subscribe(h, cam, ada)!, 90, 33);
        expect(h.frames).toHaveLength(3);
    });

    it('keeps reading when the frame handler throws', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        let calls = 0;
        h.client.onVideoFrame(() => {
            calls++;
            throw new Error('consumer failed');
        });
        const stream = subscribe(h, cam, ada)!;
        await pushFrame(stream);
        h.clock.now = 1000;
        await pushFrame(stream);
        expect(calls).toBe(2);
        expect(stream.cancelled).toBe(false);
    });

    it('logs and skips a frame the encoder rejects, then keeps reading', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        const stream = subscribe(h, cam, ada)!;
        await pushFrame(stream, { frame: { ...i420Frame(8, 8), data: new Uint8Array(3) }, rotation: 0 });
        expect(h.frames).toHaveLength(0);
        h.clock.now = 1000;
        await pushFrame(stream);
        expect(h.frames).toHaveLength(1);
    });
});

describe('RoomVideoWatcher: one source at a time', () => {
    function adaAndBob(): { ada: FakeParticipant; bob: FakeParticipant; adaCam: FakePublication; bobCam: FakePublication } {
        const adaCam = new FakePublication('TR_ada_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const bobCam = new FakePublication('TR_bob_cam', TRACK_SOURCE.SOURCE_CAMERA);
        return {
            ada: fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [adaCam]),
            bob: fakePerson('bob', 'Bob', { ...LETS_AGENTS_SEE }, [bobCam]),
            adaCam,
            bobCam,
        };
    }

    it('reads the first eligible source and unsubscribes the second until the first ends, then picks it', async () => {
        const { ada, bob, adaCam, bobCam } = adaAndBob();
        const h = await watching([ada, bob]);
        const adaStream = subscribe(h, adaCam, ada)!;
        expect(subscribe(h, bobCam, bob)).toBeUndefined();
        expect(bobCam.subscribeCalls).toEqual([false]);
        await pushFrame(adaStream);

        leave(h, ada);
        expect(adaStream.cancelled).toBe(true);
        expect(h.ended).toEqual([ADA_CAMERA_ENDED]);
        expect(bobCam.subscribeCalls).toEqual([false, true]);
        expect(h.client.GetTelemetry().video?.selectedSources).toBe(1);

        h.clock.now = 5000;
        await pushFrame(subscribe(h, bobCam, bob)!);
        expect(h.frames.map((f) => f.participantIdentity)).toEqual(['ada', 'bob']);
    });

    it('frees the slot when LiveKit refuses a subscription it asked for, and picks the next source', async () => {
        const { ada, bob, adaCam, bobCam } = adaAndBob();
        const cyCam = new FakePublication('TR_cy_cam', TRACK_SOURCE.SOURCE_CAMERA);
        const cy = fakePerson('cy', 'Cy', { ...LETS_AGENTS_SEE }, [cyCam]);
        const h = await watching([ada, bob, cy]);
        const adaStream = subscribe(h, adaCam, ada)!;
        expect(subscribe(h, bobCam, bob)).toBeUndefined();
        expect(subscribe(h, cyCam, cy)).toBeUndefined();
        await pushFrame(adaStream);
        h.fake.emit(ROOM_EVENT.TrackSubscriptionFailed, 'TR_unknown', bob, 'gone'); // not one it asked for: ignored
        expect(adaStream.cancelled).toBe(false);

        leave(h, ada); // the slot goes to Bob: the bot asks for his camera
        expect(bobCam.lastSubscribe).toBe(true);
        h.fake.emit(ROOM_EVENT.TrackSubscriptionFailed, 'TR_bob_cam', bob, 'not allowed');

        expect(cyCam.lastSubscribe).toBe(true); // the slot moved on to Cy
        expect(h.ended).toEqual([ADA_CAMERA_ENDED]); // Bob never sent a frame: nothing to report for him
        expect(h.client.GetTelemetry().video?.selectedSources).toBe(1);
    });

    it('keeps the selected source while another becomes eligible', async () => {
        const { ada, bob, adaCam, bobCam } = adaAndBob();
        bob.attributes = {};
        const h = await watching([ada, bob]);
        const adaStream = subscribe(h, adaCam, ada)!;
        subscribe(h, bobCam, bob);
        bob.attributes = { ...LETS_AGENTS_SEE };
        h.fake.emit(ROOM_EVENT.ParticipantAttributesChanged, { ...LETS_AGENTS_SEE }, bob);
        expect(bobCam.subscribeCalls).toEqual([false]);
        expect(adaStream.cancelled).toBe(false);
    });

    it('reads up to Streams sources at once', async () => {
        const { ada, bob, adaCam, bobCam } = adaAndBob();
        const h = await watching([ada, bob], { Streams: 2 });
        await pushFrame(subscribe(h, adaCam, ada)!);
        await pushFrame(subscribe(h, bobCam, bob)!);
        expect(h.frames.map((f) => f.participantIdentity)).toEqual(['ada', 'bob']);
        expect(bobCam.subscribeCalls).toEqual([]);
    });

    it('waits for the subscription it asked for, even when an earlier unsubscribe settles first', async () => {
        const { ada, bob, adaCam, bobCam } = adaAndBob();
        const h = await watching([ada, bob]);
        subscribe(h, adaCam, ada);
        subscribe(h, bobCam, bob); // unsubscribed: the slot is taken
        ada.attributes = {};
        h.fake.emit(ROOM_EVENT.ParticipantAttributesChanged, {}, ada);
        expect(bobCam.subscribeCalls).toEqual([false, true]);

        h.fake.emit(ROOM_EVENT.TrackUnsubscribed, { kind: TRACK_KIND.KIND_VIDEO }, bobCam, bob); // the earlier unsubscribe lands
        expect(h.client.GetTelemetry().video?.selectedSources).toBe(1);
        await pushFrame(subscribe(h, bobCam, bob)!);
        expect(h.frames.map((f) => f.participantIdentity)).toEqual(['bob']);
    });

    it('a new subscription of the source being read replaces its reader, and later calls use the new publication', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        const first = subscribe(h, cam, ada)!;
        await pushFrame(first);

        const renewed = new FakePublication(cam.sid, TRACK_SOURCE.SOURCE_CAMERA); // same track sid, new SDK object
        ada.trackPublications.set(renewed.sid, renewed);
        const second = subscribe(h, renewed, ada)!;
        expect(first.cancelled).toBe(true);
        expect(h.ended).toEqual([]);
        h.clock.now = 1000;
        await pushFrame(second);
        expect(h.frames).toHaveLength(2);

        ada.attributes = {}; // the opt-out unsubscribes the publication the watcher holds
        h.fake.emit(ROOM_EVENT.ParticipantAttributesChanged, {}, ada);
        expect(second.cancelled).toBe(true);
        expect(renewed.subscribeCalls).toEqual([false]);
        expect(cam.subscribeCalls).toEqual([]);
    });

    it('ignores the unsubscribe of a track it was not reading', async () => {
        const { ada, bob, adaCam, bobCam } = adaAndBob();
        const h = await watching([ada, bob]);
        const adaStream = subscribe(h, adaCam, ada)!;
        subscribe(h, bobCam, bob);
        h.fake.emit(ROOM_EVENT.TrackUnsubscribed, { kind: TRACK_KIND.KIND_VIDEO }, bobCam, bob);
        expect(adaStream.cancelled).toBe(false);
        expect(h.ended).toEqual([]);
    });
});

describe('RoomVideoWatcher: a source ends', () => {
    /** Ada's camera, read, with one frame already sent. */
    async function readingAda(): Promise<{ h: Harness; ada: FakeParticipant; cam: FakePublication; stream: FakeVideoStream }> {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        const stream = subscribe(h, cam, ada)!;
        await pushFrame(stream);
        expect(h.frames).toHaveLength(1);
        return { h, ada, cam, stream };
    }

    it('opt-out: cancels the reader, unsubscribes, reports the source, and drops the frame in hand', async () => {
        const { h, ada, cam, stream } = await readingAda();
        h.clock.now = 1500; // the next frame is due
        stream.push(frameEvent()); // in hand: the read resolved, the pump has not run yet
        ada.attributes = {}; // LiveKit updates the attributes, then emits the change
        h.fake.emit(ROOM_EVENT.ParticipantAttributesChanged, { 'mj.agentCanSee': '' }, ada);
        await flush();

        expect(h.frames).toHaveLength(1);
        expect(stream.cancelled).toBe(true);
        expect(cam.lastSubscribe).toBe(false);
        expect(h.ended).toEqual([ADA_CAMERA_ENDED]);
        expect(h.client.GetTelemetry().video?.selectedSources).toBe(0);

        h.clock.now = 5000;
        await pushFrame(stream);
        expect(h.frames).toHaveLength(1);
    });

    it('re-checks consent before every frame, even before the change event arrives', async () => {
        const { h, ada, stream } = await readingAda();
        ada.attributes = { 'mj.agentCanSee': 'false' }; // no event yet
        h.clock.now = 1500;
        await pushFrame(stream);
        expect(h.frames).toHaveLength(1);
    });

    it('does not even encode a frame of someone who no longer lets agents see', async () => {
        const encode = vi.spyOn(VideoFrameEncoder.prototype, 'Encode');
        try {
            const { h, ada, stream } = await readingAda();
            const encodedBefore = encode.mock.calls.length;
            ada.attributes = { 'mj.agentCanSee': 'false' }; // no event yet
            h.clock.now = 1500; // the next frame is due
            await pushFrame(stream);
            expect(encode.mock.calls.length).toBe(encodedBefore);
            expect(h.frames).toHaveLength(1);
        } finally {
            encode.mockRestore();
        }
    });

    it('leave: cancels the reader and reports the source', async () => {
        const { h, ada, stream } = await readingAda();
        leave(h, ada);
        expect(stream.cancelled).toBe(true);
        expect(h.ended).toEqual([ADA_CAMERA_ENDED]);
    });

    it('unpublish: cancels the reader and reports the source', async () => {
        const { h, ada, cam, stream } = await readingAda();
        ada.trackPublications.delete(cam.sid);
        h.fake.emit(ROOM_EVENT.TrackUnpublished, cam, ada);
        expect(stream.cancelled).toBe(true);
        expect(h.ended).toEqual([ADA_CAMERA_ENDED]);
    });

    it('unsubscribe: cancels the reader and reports the source', async () => {
        const { h, ada, cam, stream } = await readingAda();
        h.fake.emit(ROOM_EVENT.TrackUnsubscribed, { kind: TRACK_KIND.KIND_VIDEO }, cam, ada);
        expect(stream.cancelled).toBe(true);
        expect(h.ended).toEqual([ADA_CAMERA_ENDED]);
        expect(cam.subscribeCalls).toEqual([]); // the slot moves on rather than re-subscribing the source that just ended
    });

    it('mute: cancels the reader, unsubscribes, and reports the source', async () => {
        const { h, ada, cam, stream } = await readingAda();
        cam.muted = true;
        h.fake.emit(ROOM_EVENT.TrackMuted, cam, ada);
        expect(stream.cancelled).toBe(true);
        expect(cam.lastSubscribe).toBe(false);
        expect(h.ended).toEqual([ADA_CAMERA_ENDED]);
    });

    it('its stream ending on its own: unsubscribes, reports it, and moves on', async () => {
        const { h, cam, stream } = await readingAda();
        stream.end();
        await flush();
        expect(cam.lastSubscribe).toBe(false);
        expect(h.ended).toEqual([ADA_CAMERA_ENDED]);
        expect(h.client.GetTelemetry().video?.selectedSources).toBe(0);
    });

    it('does not report a source that never sent a frame', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        const stream = subscribe(h, cam, ada)!;
        leave(h, ada);
        expect(stream.cancelled).toBe(true);
        expect(h.ended).toEqual([]);
    });
});

describe('RoomVideoWatcher: the bot leaving', () => {
    it('disconnect() cancels every reader and reports no source', async () => {
        const { ada, cam } = adaWithCamera();
        const screen = new FakePublication('TR_screen', TRACK_SOURCE.SOURCE_SCREENSHARE);
        ada.trackPublications.set(screen.sid, screen);
        const h = await watching([ada], { Streams: 2 });
        const camStream = subscribe(h, cam, ada)!;
        const screenStream = subscribe(h, screen, ada)!;
        await pushFrame(camStream);
        await pushFrame(screenStream);

        await h.client.disconnect();
        expect(camStream.cancelled).toBe(true);
        expect(screenStream.cancelled).toBe(true);
        expect(h.ended).toEqual([]);
        expect(h.client.GetTelemetry().video).toBeUndefined();
    });

    it('the room disconnecting cancels every reader and reports no source', async () => {
        const { ada, cam } = adaWithCamera();
        const h = await watching([ada]);
        const stream = subscribe(h, cam, ada)!;
        await pushFrame(stream);
        h.fake.emit(ROOM_EVENT.Disconnected, 'SERVER_SHUTDOWN');
        expect(stream.cancelled).toBe(true);
        expect(h.ended).toEqual([]);
        expect(subscribe(h, cam, ada)).toBeUndefined(); // a late subscription is not read
    });
});

describe('RoomVideoWatcher: telemetry', () => {
    it('counts frames, bytes, encode time and selected sources', async () => {
        const { ada, cam } = adaWithCamera();
        let ticks = 0;
        const h = await watching([ada], {}, () => (ticks += 7)); // every clock read advances 7 ms
        const stream = subscribe(h, cam, ada)!;
        await pushFrame(stream); // arrives at 7, encoded by 14
        await pushFrame(stream); // arrives at 21: not due
        const video = h.client.GetTelemetry().video;
        expect(video).toEqual({
            framesReceived: 2,
            framesSent: 1,
            framesSkippedNotDue: 1,
            encodeMsLast: 7,
            encodeMsMax: 7,
            bytesSent: h.frames[0].data.byteLength,
            selectedSources: 1,
        });
    });
});
