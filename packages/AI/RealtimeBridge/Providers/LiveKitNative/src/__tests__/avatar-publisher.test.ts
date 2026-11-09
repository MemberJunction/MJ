import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadFmp4Fragment, ReadFmp4Init } from '@memberjunction/ai';
import type { NativeAvatarStatus } from '@memberjunction/ai-bridge-livekit';
import { AVATAR_AUDIO_WAIT_LIMIT_MS } from '../avatar-media-clock';
import { AVATAR_DECODER_FAILURE_WINDOW_MS, AVATAR_FRAME_QUEUE_LIMIT, AVATAR_FRAME_TICK_MS, AVATAR_MAX_LATE_MS, AvatarPublisher } from '../avatar-publisher';
import type { FfmpegProbeResult } from '../ffmpeg-locator';
import { FakeDecoders, FakeOutlet, FakeVoiceQueue, FFMPEG_9, FixturePieces, Settle, ShiftDecodeTimes } from './avatar-test-helpers';

/** The fixture's tracks: video 1 at 90 kHz, audio 2 at 24 kHz. */
const VIDEO_TRACK = 1;
const AUDIO_TRACK = 2;

/** A publisher over fakes, with the test's clock. */
function setup(probe: FfmpegProbeResult = FFMPEG_9, sampleRate = 24000) {
    const decoders = new FakeDecoders();
    const voice = new FakeVoiceQueue(sampleRate);
    const outlet = new FakeOutlet();
    const statuses: NativeAvatarStatus[] = [];
    const clock = { now: 0 };
    const publisher = new AvatarPublisher({
        Voice: voice,
        Video: outlet,
        SampleRate: sampleRate,
        OnStatus: (s) => statuses.push(s),
        Probe: async () => probe,
        Decoders: decoders,
        Now: () => clock.now,
    });
    return { decoders, voice, outlet, statuses, clock, publisher };
}

type Setup = ReturnType<typeof setup>;

/** Feeds the fixture's init and its first `count` fragments. */
function feed(t: Setup, count = Infinity): void {
    const [init, ...fragments] = FixturePieces();
    t.publisher.Accept({ data: init, mimeType: 'video/mp4' });
    for (const fragment of fragments.slice(0, count)) {
        t.publisher.Accept({ data: fragment, mimeType: 'video/mp4' });
    }
}

/** The voice decoder returns every unit's PCM; the video decoder every unit's frame (each filled with its index). */
function decodeAll(t: Setup): void {
    for (const unit of t.decoders.audio.Units) {
        t.decoders.audio.EmitPcm(unit);
    }
    t.decoders.video.Units.forEach((unit, i) => t.decoders.video.EmitFrame(unit, i % 256));
}

/** Plays the voice up to `ms` and lets the frame clock tick. */
async function playTo(t: Setup, ms: number): Promise<void> {
    t.voice.Played = ms;
    await vi.advanceTimersByTimeAsync(AVATAR_FRAME_TICK_MS);
    await Settle();
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('AvatarPublisher — reading and decoding', () => {
    it('holds the pieces that arrive while ffmpeg is probed, then decodes them', async () => {
        let answer: (r: FfmpegProbeResult) => void = () => undefined;
        const t = setup();
        const slow = new AvatarPublisher({ Voice: t.voice, Video: t.outlet, SampleRate: 24000, OnStatus: vi.fn(), Probe: () => new Promise((r) => { answer = r; }), Decoders: t.decoders });
        const [init, first] = FixturePieces();
        slow.Accept({ data: init, mimeType: 'video/mp4' });
        slow.Accept({ data: first, mimeType: 'video/mp4' });
        expect(t.decoders.Videos).toHaveLength(0);
        answer(FFMPEG_9);
        await Settle();
        expect(t.decoders.video.Units).toHaveLength(1);
    });

    it('starts the video decoder at a key frame with the parameter sets, and frames the voice as ADTS with its sample count', async () => {
        const t = setup();
        await Settle();
        feed(t, 4);
        const [firstVideo] = t.decoders.video.Units;
        expect(t.decoders.video.Options).toMatchObject({ Width: 704, Height: 1280 });
        expect(Array.from(firstVideo.Data.subarray(0, 5))).toEqual([0, 0, 0, 1, 0x67]); // SPS first
        expect(Array.from(firstVideo.Data.subarray(-6))).toEqual([0, 0, 0, 1, 0x09, 0xf0]); // delimiter last
        const [firstAudio, secondAudio] = t.decoders.audio.Units;
        expect([firstAudio.Data[0], firstAudio.Data[1]]).toEqual([0xff, 0xf1]);
        expect([firstAudio.DecodedSamples, firstAudio.Samples, firstAudio.Time, secondAudio.Time]).toEqual([1024, 1024, 0, 1024 / 24000]);
    });

    it('places each unit at its own timestamp: the second video frame at 3840 + 3750 ticks, not 1/24 s', async () => {
        const t = setup();
        await Settle();
        feed(t, 6);
        expect(t.decoders.video.Units.map((u) => u.Time)).toEqual([0, 7590 / 90000, 11340 / 90000]);
    });

    it('joins a moof that came without its mdat to the next piece', async () => {
        const t = setup();
        await Settle();
        const [init, fragment] = FixturePieces();
        const bytes = new Uint8Array(fragment);
        const moofSize = new DataView(fragment).getUint32(0);
        t.publisher.Accept({ data: init, mimeType: 'video/mp4' });
        t.publisher.Accept({ data: bytes.slice(0, moofSize).buffer, mimeType: 'video/mp4' });
        expect(t.decoders.video.Units).toHaveLength(0);
        t.publisher.Accept({ data: bytes.slice(moofSize).buffer, mimeType: 'video/mp4' });
        expect(t.decoders.video.Units).toHaveLength(1);
    });

    it('keeps its decoders across an init with the same configuration', async () => {
        const t = setup();
        await Settle();
        feed(t, 2);
        t.publisher.Accept({ data: FixturePieces()[0], mimeType: 'video/mp4' });
        expect([t.decoders.Videos.length, t.decoders.Audios.length]).toEqual([1, 1]);
    });

    it("sizes each voice frame at the voice track's rate: 1024 samples at 24 kHz come out as 2048 at 48 kHz", async () => {
        const t = setup(FFMPEG_9, 48000);
        await Settle();
        feed(t, 4);
        expect(t.decoders.audio.Options.SampleRate).toBe(48000);
        expect(t.decoders.audio.Units.map((u) => [u.DecodedSamples, u.Samples])).toEqual([
            [2048, 2048],
            [2048, 2048],
        ]);
    });

    it("keeps a frame's declared length: the stream's last AAC frame decodes to 1024 samples and keeps 768", async () => {
        const t = setup();
        await Settle();
        feed(t);
        const last = t.decoders.audio.Units[t.decoders.audio.Units.length - 1];
        expect([last.DecodedSamples, last.Samples]).toEqual([1024, 768]);
    });
});

describe('AvatarPublisher — showing the face against the voice', () => {
    it('publishes the camera track only at the first frame shown, then shows frames on it', async () => {
        const t = setup();
        await Settle();
        feed(t, 10);
        expect(t.outlet.Published).toHaveLength(0);
        decodeAll(t);
        expect(t.outlet.Published).toHaveLength(0); // nothing due yet: the voice has not played
        await playTo(t, 1);
        expect(t.outlet.Published).toEqual([{ Width: 704, Height: 1280 }]);
        expect(t.statuses).toEqual([{ state: 'on' }]);
        expect(t.outlet.Captured.map((f) => f.Seq)).toEqual([t.decoders.video.Units[0].Seq]);
    });

    it('shows each frame once the voice reaches its timestamp, in order', async () => {
        const t = setup();
        await Settle();
        feed(t);
        decodeAll(t);
        const times = t.decoders.video.Units.map((u) => u.Time * 1000);
        for (let ms = 0; ms <= 600; ms += 5) {
            await playTo(t, ms);
        }
        const shown = t.outlet.Captured.map((f) => f.Time * 1000);
        expect(shown).toEqual(times.filter((time) => time <= 600));
    });

    it('drops late frames rather than bursting them: only the newest due frame is shown', async () => {
        const t = setup();
        await Settle();
        feed(t, 20);
        t.decoders.audio.Units.forEach((u) => t.decoders.audio.EmitPcm(u));
        const [first, ...rest] = t.decoders.video.Units;
        t.decoders.video.EmitFrame(first);
        await playTo(t, 1); // the first frame publishes the track
        rest.forEach((u) => t.decoders.video.EmitFrame(u));
        await playTo(t, 400);
        const due = rest.filter((u) => u.Time * 1000 <= 400);
        expect(due.length).toBeGreaterThan(2);
        expect(t.outlet.Captured.map((f) => f.Seq)).toEqual([first.Seq, due[due.length - 1].Seq]);
    });

    it("honours a stream whose video starts after its voice (Google's 85 ms): the first frame waits for the voice to reach it", async () => {
        const t = setup();
        await Settle();
        const [init, ...fragments] = FixturePieces();
        t.publisher.Accept({ data: init, mimeType: 'video/mp4' });
        fragments.slice(0, 8).forEach((f) => t.publisher.Accept({ data: ShiftDecodeTimes(f, { [VIDEO_TRACK]: 7680 }), mimeType: 'video/mp4' }));
        decodeAll(t);
        expect(t.decoders.video.Units[0].Time).toBeCloseTo(7680 / 90000, 9);
        await playTo(t, 60);
        expect(t.outlet.Published).toHaveLength(0);
        await playTo(t, 86);
        expect(t.outlet.Captured.map((f) => f.Seq)).toEqual([t.decoders.video.Units[0].Seq]);
    });

    it("starts a new timeline at a new init: the next stream's frames wait for their own voice", async () => {
        const t = setup();
        await Settle();
        feed(t, 12);
        decodeAll(t);
        await playTo(t, 300);
        const shown = t.outlet.Captured.length;
        const [init, ...fragments] = FixturePieces();
        t.publisher.Accept({ data: init, mimeType: 'video/mp4' });
        // The next stream's times continue 2 s later.
        fragments.slice(0, 4).forEach((f) => t.publisher.Accept({ data: ShiftDecodeTimes(f, { [VIDEO_TRACK]: 180000, [AUDIO_TRACK]: 48000 }), mimeType: 'video/mp4' }));
        const next = t.decoders.video.Units.filter((u) => u.Time >= 2);
        t.decoders.video.EmitFrame(next[0]);
        await playTo(t, 300);
        expect(t.outlet.Captured).toHaveLength(shown); // its voice is not queued yet
        t.decoders.audio.Units.filter((u) => u.Time >= 2).forEach((u) => t.decoders.audio.EmitPcm(u));
        await playTo(t, 300); // its voice entered the queue at 256 ms, which has played
        expect(t.outlet.Captured.map((f) => f.Seq).slice(shown)).toEqual([next[0].Seq]);
    });

    it(`paces frames no voice comes for by their own timestamps, after waiting ${AVATAR_AUDIO_WAIT_LIMIT_MS} ms for it`, async () => {
        const t = setup();
        await Settle();
        feed(t, 6);
        const [first, second] = t.decoders.video.Units; // t = 0 and 84.3 ms
        t.decoders.video.EmitFrame(first);
        t.decoders.video.EmitFrame(second);
        await playTo(t, 0);
        expect(t.outlet.Published).toHaveLength(0); // waiting for the voice
        t.clock.now = AVATAR_AUDIO_WAIT_LIMIT_MS;
        await playTo(t, 0);
        expect(t.outlet.Captured.map((f) => f.Seq)).toEqual([first.Seq]);
        t.clock.now += 80;
        await playTo(t, 0);
        expect(t.outlet.Captured).toHaveLength(1);
        t.clock.now += 5;
        await playTo(t, 0);
        expect(t.outlet.Captured.map((f) => f.Seq)).toEqual([first.Seq, second.Seq]);
    });

    it(`drops a frame more than ${AVATAR_MAX_LATE_MS} ms late instead of showing it (a turn's held-back tail)`, async () => {
        const t = setup();
        await Settle();
        feed(t, 6);
        t.decoders.audio.Units.forEach((u) => t.decoders.audio.EmitPcm(u));
        t.voice.Played = AVATAR_MAX_LATE_MS + 50; // the voice is well past the first frame when it comes out
        t.decoders.video.EmitFrame(t.decoders.video.Units[0]);
        await playTo(t, AVATAR_MAX_LATE_MS + 50);
        expect(t.outlet.Captured).toHaveLength(0);
        expect(t.outlet.Published).toHaveLength(0);
        t.decoders.video.EmitFrame(t.decoders.video.Units[1]);
        await playTo(t, 90); // a frame not that late is shown
        expect(t.outlet.Captured).toHaveLength(1);
    });

    it('lets frames wait for the voice that carries their time', async () => {
        const t = setup();
        await Settle();
        feed(t, 6);
        t.decoders.video.Units.forEach((u) => t.decoders.video.EmitFrame(u));
        await playTo(t, 100);
        expect(t.outlet.Captured).toHaveLength(0);
        t.decoders.audio.Units.forEach((u) => t.decoders.audio.EmitPcm(u));
        await playTo(t, 100);
        expect(t.outlet.Captured).toHaveLength(1);
    });

    it('queues the voice behind what is already queued, in order', async () => {
        const t = setup();
        await Settle();
        feed(t, 6);
        t.decoders.audio.Units.forEach((u, i) => t.decoders.audio.EmitPcm(u, i + 1));
        expect(t.voice.Chunks.map((c) => c[0])).toEqual([1, 2, 3]);
    });

    it(`pauses the video decoder at ${AVATAR_FRAME_QUEUE_LIMIT} waiting frames and resumes it as they are shown`, async () => {
        const t = setup();
        await Settle();
        feed(t, 60);
        t.decoders.video.Units.slice(0, AVATAR_FRAME_QUEUE_LIMIT).forEach((u) => t.decoders.video.EmitFrame(u));
        expect(t.decoders.video.Paused).toBe(true);
        t.decoders.audio.Units.forEach((u) => t.decoders.audio.EmitPcm(u));
        await playTo(t, 2000);
        expect(t.decoders.video.Paused).toBe(false);
        expect(t.publisher.QueuedFrames).toBe(0);
    });
});

describe('AvatarPublisher — barge-in', () => {
    it('drops the waiting frames, fences both decoders, and shows nothing decoded before it; the last frame stays', async () => {
        const t = setup();
        await Settle();
        feed(t, 20);
        const units = [...t.decoders.video.Units];
        t.decoders.audio.Units.forEach((u) => t.decoders.audio.EmitPcm(u));
        t.decoders.video.EmitFrame(units[0]);
        await playTo(t, 1);
        expect(t.outlet.Captured).toHaveLength(1);
        units.slice(1, 5).forEach((u) => t.decoders.video.EmitFrame(u));
        t.publisher.Flush();
        expect(t.publisher.QueuedFrames).toBe(0);
        expect([t.decoders.video.Fences, t.decoders.audio.Fences]).toEqual([1, 1]);
        units.slice(5, 8).forEach((u) => t.decoders.video.EmitFrame(u)); // decoded from before the barge-in
        expect(t.publisher.QueuedFrames).toBe(0); // dropped as they come out
        await playTo(t, 5000);
        expect(t.outlet.Captured).toHaveLength(1);
        expect(t.outlet.Unpublished).toBe(0);
    });

    it('resumes a paused video decoder: its frame queue was emptied', async () => {
        const t = setup();
        await Settle();
        feed(t, 60);
        t.decoders.video.Units.slice(0, AVATAR_FRAME_QUEUE_LIMIT).forEach((u) => t.decoders.video.EmitFrame(u));
        expect(t.decoders.video.Paused).toBe(true);
        t.publisher.Flush();
        expect(t.decoders.video.Paused).toBe(false);
    });

    it('drops a moof still waiting for its mdat', async () => {
        const t = setup();
        await Settle();
        const [initPiece, ...fragments] = FixturePieces();
        const init = ReadFmp4Init(initPiece);
        const audio = fragments.filter((f) => ReadFmp4Fragment(f, init)?.Samples[0].TrackID === AUDIO_TRACK);
        t.publisher.Accept({ data: initPiece, mimeType: 'video/mp4' });
        t.publisher.Accept({ data: audio[5].slice(0, new DataView(audio[5]).getUint32(0)), mimeType: 'video/mp4' }); // a lone moof
        t.publisher.Flush();
        t.publisher.Accept({ data: audio[0], mimeType: 'video/mp4' });
        expect(t.decoders.audio.Units.map((u) => u.Time)).toEqual([0]);
    });

    it('while ffmpeg is probed: drops the media held for it, and keeps the init the next fragments need', async () => {
        let answer: (r: FfmpegProbeResult) => void = () => undefined;
        const t = setup();
        const slow = new AvatarPublisher({ Voice: t.voice, Video: t.outlet, SampleRate: 24000, OnStatus: vi.fn(), Probe: () => new Promise((r) => { answer = r; }), Decoders: t.decoders });
        const [init, ...fragments] = FixturePieces();
        slow.Accept({ data: init, mimeType: 'video/mp4' });
        fragments.slice(0, 4).forEach((f) => slow.Accept({ data: f, mimeType: 'video/mp4' }));
        slow.Flush();
        answer(FFMPEG_9);
        await Settle();
        expect([t.decoders.Videos.length, t.decoders.Audios.length]).toEqual([1, 1]);
        expect([t.decoders.video.Units.length, t.decoders.audio.Units.length]).toEqual([0, 0]);
        fragments.slice(4, 8).forEach((f) => slow.Accept({ data: f, mimeType: 'video/mp4' }));
        expect(t.decoders.audio.Units.length).toBeGreaterThan(0);
    });

    it('drops voice decoded from before it', async () => {
        const t = setup();
        await Settle();
        feed(t, 6);
        const units = [...t.decoders.audio.Units];
        t.publisher.Flush();
        units.forEach((u) => t.decoders.audio.EmitPcm(u));
        expect(t.voice.Chunks).toHaveLength(0);
    });
});

describe('AvatarPublisher — failures', () => {
    it('restarts a failed video decoder, which resumes at the next key frame', async () => {
        const t = setup();
        await Settle();
        feed(t, 6);
        t.decoders.video.Fail();
        expect(t.decoders.Videos).toHaveLength(2);
        expect(t.decoders.Videos[0].Disposed).toBe(true);
        const [, ...fragments] = FixturePieces();
        fragments.slice(6, 30).forEach((f) => t.publisher.Accept({ data: f, mimeType: 'video/mp4' }));
        const first = t.decoders.video.Units[0];
        expect(Array.from(first.Data.subarray(0, 5))).toEqual([0, 0, 0, 1, 0x67]); // a key frame (SPS first)
        expect(first.Time).toBeCloseTo((3840 + 12 * 3750) / 90000, 9); // frame 12: the next key frame
        expect(t.statuses).toEqual([]);
    });

    it(`takes the avatar down after ${3} video decoder failures within the window: unpublished, attribute set, voice kept`, async () => {
        const t = setup();
        await Settle();
        feed(t, 6);
        decodeAll(t);
        await playTo(t, 1);
        for (let i = 0; i < 3; i++) {
            t.clock.now += 1000;
            t.decoders.video.Fail();
        }
        await Settle();
        expect(t.statuses).toEqual([{ state: 'on' }, { state: 'audio-only', reason: 'decoder-failed' }]);
        expect(t.outlet.Attributes).toEqual([{ 'mj.agentAvatar': 'audio-only:decoder-failed' }]);
        expect(t.outlet.Unpublished).toBe(1);
        expect(t.publisher.IsAudioOnly).toBe(true);
        expect(t.decoders.audio.Disposed).toBe(false);
        const voiced = t.voice.Chunks.length;
        const [, ...fragments] = FixturePieces();
        fragments.slice(6, 10).forEach((f) => t.publisher.Accept({ data: f, mimeType: 'video/mp4' }));
        t.decoders.audio.Units.slice(-2).forEach((u) => t.decoders.audio.EmitPcm(u));
        expect(t.voice.Chunks.length).toBe(voiced + 2); // the voice goes on
    });

    it('does not take it down for failures spread over more than the window', async () => {
        const t = setup();
        await Settle();
        feed(t, 2);
        for (let i = 0; i < 5; i++) {
            t.clock.now += AVATAR_DECODER_FAILURE_WINDOW_MS / 2 + 1;
            t.decoders.video.Fail();
        }
        expect(t.statuses).toEqual([]);
        expect(t.decoders.Videos).toHaveLength(6);
    });

    it('takes it down, voice decoder included, after three voice decoder failures', async () => {
        const t = setup();
        await Settle();
        feed(t, 2);
        for (let i = 0; i < 3; i++) {
            t.decoders.audio.Fail();
        }
        expect(t.statuses).toEqual([{ state: 'audio-only', reason: 'decoder-failed' }]);
        expect(t.decoders.Audios.every((d) => d.Disposed)).toBe(true);
        expect(t.decoders.video.Disposed).toBe(true);
    });

    it("goes audio only with 'publish-failed' when the room refuses the camera track", async () => {
        const t = setup();
        t.outlet.FailPublish = true;
        await Settle();
        feed(t, 6);
        decodeAll(t);
        await playTo(t, 1);
        expect(t.statuses).toEqual([{ state: 'audio-only', reason: 'publish-failed' }]);
        expect(t.outlet.Attributes).toEqual([{ 'mj.agentAvatar': 'audio-only:publish-failed' }]);
        expect(t.outlet.Unpublished).toBe(0);
    });

    it('takes down a camera track the room publishes only after the avatar was taken down', async () => {
        const t = setup();
        let release: () => void = () => undefined;
        t.outlet.PublishGate = new Promise<void>((r) => {
            release = r;
        });
        await Settle();
        feed(t, 6);
        decodeAll(t);
        await playTo(t, 1); // the first frame asks for the track; the room has not answered
        for (let i = 0; i < 3; i++) {
            t.decoders.video.Fail();
        }
        release();
        await Settle();
        expect(t.outlet.Unpublished).toBe(1);
        expect(t.outlet.Captured).toHaveLength(0);
        expect(t.statuses).toEqual([{ state: 'audio-only', reason: 'decoder-failed' }]);
    });

    it('goes audio only when this thread has no usable ffmpeg', async () => {
        const t = setup({ Available: false, Reason: 'ffmpeg could not be run' });
        await Settle();
        expect(t.statuses).toEqual([{ state: 'audio-only', reason: 'decoder-failed' }]);
        feed(t, 2);
        expect(t.decoders.Videos).toHaveLength(0);
    });

    it('drops everything once retired (the audio-only replacement speaks)', async () => {
        const t = setup();
        await Settle();
        feed(t, 2);
        t.publisher.Retire();
        expect([t.decoders.video.Disposed, t.decoders.audio.Disposed]).toEqual([true, true]);
        feed(t, 4);
        expect(t.decoders.Videos).toHaveLength(1);
    });
});
