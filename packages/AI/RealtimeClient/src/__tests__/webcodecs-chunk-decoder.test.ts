import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RealtimeChunkVideoFrame } from '@memberjunction/ai';
import type { VideoFrameDecoderContext } from '../media/videoFrameDecoder';
import type { VideoPlayoutProblem } from '../media/videoPlayout';
import { MAX_FRAMES_AHEAD, MAX_WAITING_CHUNKS, WebCodecsChunkDecoder, WEBCODECS_CHUNK_DECODER } from '../media/decoders/webCodecsChunkDecoder';
import { InstallFakeDom, type FakeDom } from './helpers/fake-dom';
import { FakeStream, FakeTrackGenerator, FakeVideoDecoder, InstallFakeWebCodecs, OpenPictures } from './helpers/fake-webcodecs';

const H264 = 'video/h264; codecs="avc1.42e01f"';
const VP8 = 'video/vp8';

/** An encoded chunk at `ms`; its two bytes say whether it is a key frame and when it is, so tests can tell chunks apart. */
function chunk(ms: number, key = false, mimeType = H264): RealtimeChunkVideoFrame {
    return { Kind: 'chunk', Data: Uint8Array.of(key ? 1 : 0, (ms / 40) & 0xff).buffer, MimeType: mimeType, PresentationTimeMs: ms, KeyFrame: key };
}

/** Lets the support check's promise settle. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

/** A player context that records what the decoder reports and whether it gave up. */
interface RecordingContext extends VideoFrameDecoderContext {
    Reports: VideoPlayoutProblem[];
    Failures: string[];
}

function recordingContext(): RecordingContext {
    const reports: VideoPlayoutProblem[] = [];
    const failures: string[] = [];
    return {
        MimeType: H264,
        BackBufferSeconds: 10,
        CarriesVoice: false,
        Report: (problem) => reports.push(problem),
        Failed: (message) => failures.push(message),
        Reports: reports,
        Failures: failures,
    };
}

describe('WebCodecsChunkDecoder', () => {
    let dom: FakeDom;
    let context: RecordingContext;
    let decoder: WebCodecsChunkDecoder;

    /** The browser decoder the chunk decoder opened last. */
    const browserDecoder = (): FakeVideoDecoder => FakeVideoDecoder.Instances.at(-1) as FakeVideoDecoder;
    /** The times (µs) of the chunks the browser decoder was given, with their types. */
    const decoded = (target = browserDecoder()): string[] => target.Chunks.map((c) => `${c.type}@${c.timestamp}`);
    /** The labels of the frames shown, in order. */
    const shown = (): string[] => (FakeTrackGenerator.Instances.at(-1) as FakeTrackGenerator).Written.map((frame) => frame.Label);

    /** A decoder configured for H.264 by a first key frame at 0 ms. */
    async function started(): Promise<FakeVideoDecoder> {
        decoder.Append(chunk(0, true));
        await settle();
        return browserDecoder();
    }

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
        dom = InstallFakeDom();
        InstallFakeWebCodecs();
        FakeVideoDecoder.Supported.add('avc1.42e01f');
        FakeVideoDecoder.Supported.add('vp8');
        context = recordingContext();
        decoder = new WebCodecsChunkDecoder(context);
    });

    afterEach(() => {
        decoder.Dispose();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('what it can play', () => {
        it('takes H.264, VP9 and AV1 with a codec string, and VP8 with or without one', () => {
            const playable = [
                'video/h264; codecs="avc1.42e01f"',
                'video/h264; codecs=avc3.640028',
                'video/vp8',
                'video/vp8; codecs="vp8"',
                'video/vp9; codecs="vp09.00.10.08"',
                'video/av1; codecs="av01.0.04M.08"',
            ];
            expect(playable.filter((type) => WEBCODECS_CHUNK_DECODER.CanPlay(type))).toEqual(playable);
        });

        it('refuses a type without the codec string WebCodecs needs, of another family, or not a chunk type', () => {
            const refused = ['video/h264', 'video/vp9', 'video/h264; codecs="vp8"', 'video/webm', 'video/mp4', 'image/jpeg'];
            expect(refused.filter((type) => WEBCODECS_CHUNK_DECODER.CanPlay(type))).toEqual([]);
        });

        it('refuses everything without WebCodecs, or with nothing to show frames through', () => {
            vi.stubGlobal('VideoDecoder', undefined);
            expect(WEBCODECS_CHUNK_DECODER.CanPlay(VP8)).toBe(false);
            InstallFakeWebCodecs({ Generator: false, Canvas: false });
            expect(WEBCODECS_CHUNK_DECODER.CanPlay(VP8)).toBe(false);
        });

        it('is the webcodecs decoder, for chunks', () => {
            expect([WEBCODECS_CHUNK_DECODER.Name, WEBCODECS_CHUNK_DECODER.Kind]).toEqual(['webcodecs', 'chunk']);
            expect(WEBCODECS_CHUNK_DECODER.Create(context)).toBeInstanceOf(WebCodecsChunkDecoder);
        });
    });

    describe('starting', () => {
        it('configures at the first key frame, once the browser confirms the codec, with no description (Annex B)', async () => {
            decoder.Append(chunk(0, true));
            expect(FakeVideoDecoder.Checks.map((check) => check.Codec)).toEqual(['avc1.42e01f']);
            expect(FakeVideoDecoder.Instances).toHaveLength(0);

            await settle();
            expect(browserDecoder().Configs).toEqual([{ codec: 'avc1.42e01f', optimizeForLatency: true }]);
            decoder.Append(chunk(40));
            expect(decoded()).toEqual(['key@0', 'delta@40000']);
            expect(Array.from(browserDecoder().Chunks[1].Bytes)).toEqual([0, 1]);
        });

        it('takes VP8 without a codec string', async () => {
            decoder.Append(chunk(0, true, VP8));
            await settle();
            expect(browserDecoder().Configs[0].codec).toBe('vp8');
        });

        it('drops delta chunks before the first key frame, reporting each (the player passes the kind on once)', () => {
            decoder.Append(chunk(0));
            decoder.Append(chunk(40));
            expect(context.Reports).toEqual(['fragment-before-init', 'fragment-before-init']);
            expect(FakeVideoDecoder.Checks).toEqual([]);
        });

        it('keeps chunks that arrive during the check, and decodes them in order once it says yes', async () => {
            FakeVideoDecoder.AnswerChecks = false;
            decoder.Append(chunk(0, true));
            decoder.Append(chunk(40));
            await settle();
            expect(FakeVideoDecoder.Instances).toHaveLength(0);

            FakeVideoDecoder.Checks[0].Answer(true);
            await settle();
            expect(decoded()).toEqual(['key@0', 'delta@40000']);
        });

        it("reports a browser that can't decode the codec as unsupported, and gives up", async () => {
            decoder.Append(chunk(0, true, 'video/vp9; codecs="vp09.00.10.08"'));
            await settle();
            expect(context.Reports).toEqual(['unsupported']);
            expect(context.Failures).toHaveLength(1);
            expect(FakeVideoDecoder.Instances).toHaveLength(0);
        });

        it('gives up when the browser refuses the configuration outright', async () => {
            FakeVideoDecoder.RefuseConfigure = true;
            decoder.Append(chunk(0, true));
            await settle();
            expect(context.Reports).toEqual(['unsupported']);
            expect(context.Failures).toHaveLength(1);
        });

        it('reads a support check that fails as a no', async () => {
            FakeVideoDecoder.AnswerChecks = false;
            decoder.Append(chunk(0, true));
            FakeVideoDecoder.Checks[0].Reject(new Error('no answer'));
            await settle();
            expect(context.Failures).toHaveLength(1);
        });

        it('reports and drops a key frame whose type names no codec WebCodecs knows', () => {
            decoder.Append(chunk(0, true, 'video/h264'));
            expect(context.Reports).toEqual(['unsupported']);
            expect(FakeVideoDecoder.Checks).toEqual([]);
        });
    });

    describe('showing frames', () => {
        it('shows decoded frames by their presentation time, and its stream in the element', async () => {
            const browser = await started();
            decoder.Attach(document.createElement('video'));
            expect(dom.Videos[0].srcObject).toBeInstanceOf(FakeStream);
            expect(decoder.IsPlaying).toBe(false);

            browser.Output(0);
            browser.Output(40_000);
            expect(shown()).toEqual(['frame@0']);
            vi.advanceTimersByTime(40);
            expect(shown()).toEqual(['frame@0', 'frame@40000']);
        });

        it("shows decoded frames on the player's clock when it has one", async () => {
            decoder.Dispose();
            const voice = { CurrentTimeMs: null as number | null };
            decoder = new WebCodecsChunkDecoder({ ...context, Clock: voice });
            const browser = await started();
            browser.Output(0);
            expect(shown()).toEqual([]);
            voice.CurrentTimeMs = 0;
            vi.advanceTimersByTime(20);
            expect(shown()).toEqual(['frame@0']);
        });

        it(`decodes at most ${MAX_FRAMES_AHEAD} frames ahead: the rest wait, encoded, until frames show`, async () => {
            const browser = await started();
            for (let i = 1; i <= 9; i++) {
                decoder.Append(chunk(i * 40));
            }
            expect(browser.Chunks).toHaveLength(MAX_FRAMES_AHEAD);

            browser.Output(0); // shown at once: one fewer ahead
            expect(browser.Chunks).toHaveLength(MAX_FRAMES_AHEAD + 1);
            browser.Output(40_000); // waits to show: as many ahead as before
            expect(browser.Chunks).toHaveLength(MAX_FRAMES_AHEAD + 1);
            vi.advanceTimersByTime(40);
            expect(browser.Chunks).toHaveLength(MAX_FRAMES_AHEAD + 2);
        });

        it('counts the frames still to show: chunks waiting, chunks decoding, and frames waiting for their time; none after a flush', async () => {
            const browser = await started();
            for (let i = 1; i <= 7; i++) {
                decoder.Append(chunk(i * 40));
            }
            // MAX_FRAMES_AHEAD decoding, two waiting encoded.
            expect(decoder.FramesAhead).toBe(8);

            browser.Output(0); // shown at once; the next chunk starts decoding
            expect(decoder.FramesAhead).toBe(7);
            browser.Output(40_000); // waits for its time
            expect(decoder.FramesAhead).toBe(7);
            vi.advanceTimersByTime(40);
            expect(shown()).toEqual(['frame@0', 'frame@40000']);
            expect(decoder.FramesAhead).toBe(6);

            decoder.Flush();
            expect(decoder.FramesAhead).toBe(0);
        });

        it('Detach takes the stream out of the element', () => {
            decoder.Attach(document.createElement('video'));
            decoder.Detach();
            expect(dom.Videos[0].srcObject).toBeNull();
        });
    });

    describe('Flush (barge-in)', () => {
        it('resets the decoder, drops the chunks waiting and the frames not shown, and waits for a key frame', async () => {
            const browser = await started();
            browser.Output(0);
            const notShown = browser.Output(40_000);
            browser.decodeQueueSize = MAX_FRAMES_AHEAD;
            decoder.Append(chunk(80));

            decoder.Flush();
            expect(browser.Resets).toBe(1);
            expect(notShown.Closed).toBe(true);
            expect(shown()).toEqual(['frame@0']);

            decoder.Append(chunk(120));
            expect(decoded(browser)).toEqual(['key@0']);
            expect(context.Reports).toEqual([]);
        });

        it('configures again at the next key frame without asking the browser again', async () => {
            const browser = await started();
            decoder.Flush();
            decoder.Append(chunk(160, true));
            expect(FakeVideoDecoder.Checks).toHaveLength(1);
            expect(browser.Configs).toHaveLength(2);
            expect(decoded(browser)).toEqual(['key@0', 'key@160000']);
        });
    });

    describe('end of turn', () => {
        it('flushes the decoder once nothing waits; the next chunk must be a key frame', async () => {
            const browser = await started();
            decoder.EndOfTurn();
            expect(browser.Flushes).toBe(1);

            decoder.Append(chunk(40));
            decoder.Append(chunk(80, true));
            expect(decoded(browser)).toEqual(['key@0', 'key@80000']);
        });

        it('waits for the chunks still waiting, and a chunk arriving first continues the turn instead', async () => {
            const browser = await started();
            browser.decodeQueueSize = MAX_FRAMES_AHEAD;
            decoder.Append(chunk(40));
            decoder.EndOfTurn();
            expect(browser.Flushes).toBe(0);

            decoder.Append(chunk(80));
            browser.decodeQueueSize = 0;
            browser.Output(0);
            expect(decoded(browser)).toEqual(['key@0', 'delta@40000', 'delta@80000']);
            expect(browser.Flushes).toBe(0);

            decoder.EndOfTurn();
            expect(browser.Flushes).toBe(1);
        });
    });

    describe('errors', () => {
        it('reports a decode error and starts a new decoder at the next key frame', async () => {
            const first = await started();
            first.Fail('bad bitstream');
            expect(context.Reports).toEqual(['append-failed']);
            expect(context.Failures).toEqual([]);

            decoder.Append(chunk(40));
            decoder.Append(chunk(80, true));
            const second = browserDecoder();
            expect(second).not.toBe(first);
            expect(decoded(second)).toEqual(['key@80000']);
        });

        it('counts a decode call that throws as a decode error', async () => {
            const browser = await started();
            browser.reset(); // the browser decoder lost its configuration
            decoder.Append(chunk(40));
            expect(context.Reports).toEqual(['append-failed']);
            expect(browser.state).toBe('closed');
        });

        it('gives up after three decode errors within a minute, but not when they are further apart', async () => {
            (await started()).Fail();
            vi.advanceTimersByTime(61_000);
            decoder.Append(chunk(80, true));
            browserDecoder().Fail();
            vi.advanceTimersByTime(61_000);
            decoder.Append(chunk(120, true));
            browserDecoder().Fail();
            expect(context.Failures).toEqual([]);

            decoder.Append(chunk(160, true));
            browserDecoder().Fail();
            decoder.Append(chunk(200, true));
            browserDecoder().Fail();
            expect(context.Failures).toHaveLength(1);
        });

        it('closes frames from a decoder it replaced', async () => {
            const first = await started();
            first.Fail();
            const stale = first.Output(0);
            expect(stale.Closed).toBe(true);
            expect(shown()).toEqual([]);
        });
    });

    it('decodes nothing of a new codec until the browser confirms it, even with room to decode', async () => {
        const browser = await started();
        FakeVideoDecoder.AnswerChecks = false;
        decoder.Append(chunk(80, true, VP8));
        expect(decoded(browser)).toEqual(['key@0']);
        FakeVideoDecoder.Checks[1].Answer(true);
        await settle();
        expect(decoded(browser)).toEqual(['key@0', 'key@80000']);
    });

    it("ignores a check that finishes after the stream moved on to another codec", async () => {
        decoder.Append(chunk(0, true, VP8));
        await settle();
        const browser = browserDecoder();
        FakeVideoDecoder.AnswerChecks = false;
        decoder.Append(chunk(40, true)); // H.264: a check starts
        decoder.Append(chunk(80, true, VP8)); // back to VP8, which the browser already confirmed
        FakeVideoDecoder.Checks[1].Answer(true);
        await settle();
        expect(browser.Configs.map((config) => config.codec)).toEqual(['vp8', 'vp8']);
        expect(decoded(browser)).toEqual(['key@0', 'key@80000']);
    });

    it('switches codec at a key frame: checks it, configures for it, and drops chunks of the old codec still waiting', async () => {
        const browser = await started();
        browser.decodeQueueSize = MAX_FRAMES_AHEAD;
        decoder.Append(chunk(40));
        decoder.Append(chunk(80, true, VP8));
        await settle();
        browser.decodeQueueSize = 0;
        browser.Output(0);
        expect(browser.Configs.map((config) => config.codec)).toEqual(['avc1.42e01f', 'vp8']);
        expect(decoded(browser)).toEqual(['key@0', 'key@80000']);
    });

    it('drops the chunks waiting when too many pile up, reported once, and waits for a key frame', async () => {
        const browser = await started();
        browser.decodeQueueSize = MAX_FRAMES_AHEAD;
        for (let i = 1; i <= MAX_WAITING_CHUNKS + 1; i++) {
            decoder.Append(chunk(i * 40));
        }
        expect(context.Reports).toEqual(['pending-overflow']);
        browser.decodeQueueSize = 0;
        decoder.Append(chunk(99_000));
        expect(decoded(browser)).toEqual(['key@0']);
    });

    it('Dispose closes the decoder and the stream, and closes frames output after it', async () => {
        const browser = await started();
        decoder.Dispose();
        expect(browser.state).toBe('closed');
        expect(FakeTrackGenerator.Instances[0].Stopped).toBe(true);
        const late = browser.Output(0);
        expect(late.Closed).toBe(true);
        expect(OpenPictures.Count).toBe(0);
    });
});
