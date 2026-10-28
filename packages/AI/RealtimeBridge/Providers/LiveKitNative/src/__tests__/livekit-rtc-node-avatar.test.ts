/**
 * The room client publishing an agent's avatar over a fake `@livekit/rtc-node` (no addon, no network, fake decoders):
 * the camera track and its publish options, the voice through the serial queue, the playout clock the avatar reads,
 * barge-in, the fall back to audio only, a rejoin after it, and the module's avatar probe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeAvatarStatus, NativeConnectArgs } from '@memberjunction/ai-bridge-livekit';
import { AVATAR_FRAME_TICK_MS } from '../avatar-publisher';
import { CreateLiveKitRtcNodeModule, DescribeAvatarVideo, LiveKitRtcNodeRoomClient, type RtcNodeModule } from '../livekit-rtc-node-room';
import { FakeDecoders, FFMPEG_9, FixturePieces, Settle } from './avatar-test-helpers';
import { makeFakeRtc, TRACK_SOURCE, VIDEO_BUFFER_TYPE, type FakeRtc } from './fake-rtc-node';

const connectArgs: NativeConnectArgs = { url: 'wss://lk.example', token: 'tok', name: 'Agent' };

/** Lets the serial voice drain run (its captures await) under fake timers. */
async function flush(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    await Settle();
}

/** A connected client with fake decoders and the fake room, and the avatar statuses it reported. */
async function connected(options: { AvatarStatus?: NativeAvatarStatus; SampleRate?: number } = {}): Promise<{ fake: FakeRtc; client: LiveKitRtcNodeRoomClient; decoders: FakeDecoders; statuses: NativeAvatarStatus[] }> {
    const fake = makeFakeRtc();
    const decoders = new FakeDecoders();
    const client = new LiveKitRtcNodeRoomClient(options.SampleRate ?? 24000, 16000, 1, async () => fake.module, {
        AvatarStatus: options.AvatarStatus,
        Avatar: { Probe: async () => FFMPEG_9, Decoders: decoders },
    });
    const statuses: NativeAvatarStatus[] = [];
    client.onAvatarStatus((s) => statuses.push(s));
    await client.connect(connectArgs);
    return { fake, client, decoders, statuses };
}

/** Sends the fixture's init and first `count` fragments to the client. */
function send(client: LiveKitRtcNodeRoomClient, count: number): void {
    const [init, ...fragments] = FixturePieces();
    client.publishAvatarMedia({ data: init, mimeType: 'video/mp4' });
    fragments.slice(0, count).forEach((f) => client.publishAvatarMedia({ data: f, mimeType: 'video/mp4' }));
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('LiveKitRtcNodeRoomClient — the agent\'s avatar', () => {
    it('drops avatar pieces before connect', () => {
        const fake = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 16000, 1, async () => fake.module);
        expect(() => client.publishAvatarMedia({ data: FixturePieces()[0], mimeType: 'video/mp4' })).not.toThrow();
    });

    it('queues the avatar\'s voice on the bot\'s voice track, behind the voice already queued', async () => {
        const { fake, client, decoders } = await connected();
        client.publishAudio(new Int16Array([5, 5]).buffer);
        send(client, 4);
        await Settle(); // the publisher probes ffmpeg at its first piece
        decoders.audio.Units.forEach((u) => decoders.audio.EmitPcm(u, 9));
        await flush();
        expect(fake.cap.captured.map((f) => f.data[0])).toEqual([5, 9, 9]);
        expect(fake.cap.captured[1].samplesPerChannel).toBe(1024);
    });

    it("decodes the avatar's voice at the voice track's own rate", async () => {
        const { client, decoders } = await connected({ SampleRate: 48000 });
        send(client, 4);
        await Settle(); // the publisher probes ffmpeg at its first piece
        expect(decoders.audio.Options.SampleRate).toBe(48000);
    });

    it('publishes the face on a camera track named agent-avatar with LiveKit\'s default simulcast, at the first frame', async () => {
        const { fake, client, decoders, statuses } = await connected();
        send(client, 4);
        await Settle(); // the publisher probes ffmpeg at its first piece
        expect(fake.cap.publishes.filter((p) => p.kind === 'video')).toHaveLength(0);
        decoders.audio.Units.forEach((u) => decoders.audio.EmitPcm(u));
        decoders.video.EmitFrame(decoders.video.Units[0]);
        await flush(); // the voice is captured, so its playout passes the frame's time
        await vi.advanceTimersByTimeAsync(AVATAR_FRAME_TICK_MS);
        await Settle();
        // The room shows an agent's camera track by this name as its avatar.
        expect(fake.cap.publishes.filter((p) => p.kind === 'video')).toEqual([{ kind: 'video', name: 'agent-avatar', source: TRACK_SOURCE.SOURCE_CAMERA, simulcast: true, sid: 'TR_2' }]);
        expect(fake.cap.videoSources).toHaveLength(1);
        expect([fake.cap.videoSources[0].width, fake.cap.videoSources[0].height]).toEqual([704, 1280]);
        expect(fake.cap.videoSources[0].frames).toHaveLength(1);
        expect(fake.cap.videoSources[0].frames[0].type).toBe(VIDEO_BUFFER_TYPE.I420);
        expect(statuses).toEqual([{ state: 'on' }]);
    });

    it('measures the voice\'s playout as what the source took less what it still holds', async () => {
        const { fake, client, decoders } = await connected();
        send(client, 4);
        await Settle(); // the publisher probes ffmpeg at its first piece
        decoders.audio.Units.forEach((u) => decoders.audio.EmitPcm(u)); // 2 × 42.67 ms of voice, from 0 ms
        await flush();
        const [first, second] = decoders.video.Units; // t = 0 and t = 84.3 ms
        decoders.video.EmitFrame(first);
        decoders.video.EmitFrame(second);
        fake.cap.queuedDurationMs = 85.33 - 50; // 50 ms has played
        await vi.advanceTimersByTimeAsync(AVATAR_FRAME_TICK_MS);
        await Settle();
        expect(fake.cap.videoSources[0].frames).toHaveLength(1);
        fake.cap.queuedDurationMs = 0; // all 85.3 ms has played: past the second frame's 84.3 ms
        await vi.advanceTimersByTimeAsync(AVATAR_FRAME_TICK_MS);
        expect(fake.cap.videoSources[0].frames).toHaveLength(2);
    });

    it('counts voice a barge-in dropped as never played: avatar voice after it is placed where the queue stands', async () => {
        const { fake, client, decoders } = await connected();
        client.publishAudio(new Int16Array(12000).buffer); // 500 ms, being captured
        client.publishAudio(new Int16Array(12000).buffer); // 500 ms, still queued
        client.flushOutbound(); // the second 500 ms never plays
        await flush();
        send(client, 4);
        await Settle(); // the publisher probes ffmpeg at its first piece
        decoders.audio.Units.forEach((u) => decoders.audio.EmitPcm(u)); // 85.3 ms of avatar voice behind the 500 ms
        await flush();
        decoders.video.EmitFrame(decoders.video.Units[0]); // t = 0: due once 500 ms of the queue has played
        fake.cap.queuedDurationMs = 60; // 585.3 − 60 = 525.3 ms has played
        await vi.advanceTimersByTimeAsync(AVATAR_FRAME_TICK_MS);
        await Settle();
        expect(fake.cap.videoSources[0]?.frames).toHaveLength(1);
    });

    it('a barge-in flushes the voice queue, the source and the avatar together', async () => {
        const { fake, client, decoders } = await connected();
        send(client, 4);
        await Settle(); // the publisher probes ffmpeg at its first piece
        client.flushOutbound();
        expect(fake.cap.clearQueueCalls).toBe(1);
        expect([decoders.video.Fences, decoders.audio.Fences]).toEqual([1, 1]);
        decoders.audio.Units.forEach((u) => decoders.audio.EmitPcm(u));
        await flush();
        expect(fake.cap.captured).toHaveLength(0); // voice decoded from before the barge-in is dropped
    });

    it('when the avatar is taken down: camera unpublished, mj.agentAvatar set, the status reported; then the replacement\'s PCM retires it', async () => {
        const { fake, client, decoders, statuses } = await connected();
        send(client, 4);
        await Settle(); // the publisher probes ffmpeg at its first piece
        decoders.audio.Units.forEach((u) => decoders.audio.EmitPcm(u));
        decoders.video.EmitFrame(decoders.video.Units[0]);
        await flush();
        await vi.advanceTimersByTimeAsync(AVATAR_FRAME_TICK_MS);
        await Settle();
        for (let i = 0; i < 3; i++) {
            decoders.video.Fail();
        }
        await Settle();
        expect(fake.cap.unpublished).toEqual(['TR_2']);
        expect(fake.cap.closedVideoTracks).toEqual(['agent-avatar']); // released with its source
        expect(fake.cap.attributeSets).toEqual([{ 'mj.agentAvatar': 'audio-only:decoder-failed' }]);
        expect(statuses).toEqual([{ state: 'on' }, { state: 'audio-only', reason: 'decoder-failed' }]);
        expect(decoders.audio.Disposed).toBe(false);
        client.publishAudio(new Int16Array([1]).buffer);
        expect(decoders.audio.Disposed).toBe(true);
    });

    it('rejoining after the avatar was taken down re-applies the attribute and publishes no avatar', async () => {
        const { fake, client, decoders } = await connected({ AvatarStatus: { state: 'audio-only', reason: 'decoder-failed' } });
        expect(fake.cap.attributeSets).toEqual([{ 'mj.agentAvatar': 'audio-only:decoder-failed' }]);
        send(client, 4);
        await Settle();
        expect(decoders.Videos).toHaveLength(0);
    });

    it('disconnect ends the avatar\'s decoders', async () => {
        const { client, decoders } = await connected();
        send(client, 2);
        await Settle(); // the publisher probes ffmpeg at its first piece
        await client.disconnect();
        expect([decoders.video.Disposed, decoders.audio.Disposed]).toEqual([true, true]);
    });
});

describe('DescribeAvatarVideo — whether this host can publish an avatar', () => {
    it('can, with the room SDK\'s video classes and a usable ffmpeg', async () => {
        const fake = makeFakeRtc();
        expect(await DescribeAvatarVideo(async () => fake.module, async () => FFMPEG_9)).toEqual({ Supported: true });
    });

    it("says 'decoder-missing' without a usable ffmpeg", async () => {
        const fake = makeFakeRtc();
        const result = await DescribeAvatarVideo(async () => fake.module, async () => ({ Available: false, Reason: 'ffmpeg could not be run at ffmpeg' }));
        expect(result).toEqual({ Supported: false, Reason: 'decoder-missing', Detail: 'ffmpeg could not be run at ffmpeg' });
    });

    it("says 'bridged' when the room SDK cannot publish video, or cannot be loaded", async () => {
        const fake = makeFakeRtc();
        const noVideo: RtcNodeModule = { ...fake.module, VideoSource: undefined };
        const probe = vi.fn(async () => FFMPEG_9);
        expect(await DescribeAvatarVideo(async () => noVideo, probe)).toMatchObject({ Supported: false, Reason: 'bridged' });
        expect(await DescribeAvatarVideo(async () => { throw new Error('no addon'); }, probe)).toMatchObject({ Supported: false, Reason: 'bridged' });
        expect(probe).not.toHaveBeenCalled();
    });

    it('is offered by the module the room coordinator loads', () => {
        expect(typeof CreateLiveKitRtcNodeModule({ Loader: async () => makeFakeRtc().module }).describeAvatarVideo).toBe('function');
    });
});
