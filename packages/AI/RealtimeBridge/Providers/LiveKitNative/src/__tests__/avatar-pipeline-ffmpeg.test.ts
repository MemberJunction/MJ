/**
 * The avatar pipeline with the ffmpeg installed on this machine (skipped, with the reason, where there is none): the
 * decoders' arguments run on this version, every access unit and AAC frame of the committed lip-sync fixture comes back
 * in order, the first frame comes back quickly, and, end to end through the publisher, each white flash is shown when
 * the voice's playout reaches its beep.
 */
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AdtsHeader, AvccToAnnexB, ReadFmp4Fragment, ReadFmp4Init, type Fmp4Init, type Fmp4Track } from '@memberjunction/ai';
import { AvatarAacDecoder, type AvatarPcmChunk } from '../avatar-aac-decoder';
import { AvatarH264Decoder, type AvatarVideoFrame } from '../avatar-h264-decoder';
import { AvatarPublisher, type AvailableFfmpeg, type AvatarVoiceQueue } from '../avatar-publisher';
import { FfmpegLocator } from '../ffmpeg-locator';
import { FakeOutlet, FixturePieces } from './avatar-test-helpers';

const hasFfmpeg = ((): boolean => {
    try {
        execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

/** One frame's duration at 24 fps (ms): the lip-sync tolerance. */
const FRAME_MS = 1000 / 24;

/** The fixture's samples as the decoders take them. */
function fixtureUnits(): { init: Fmp4Init; video: Fmp4Track; audio: Fmp4Track; videoUnits: Uint8Array[]; audioUnits: Array<{ Data: Uint8Array; Samples: number }> } {
    const [initPiece, ...fragments] = FixturePieces();
    const init = ReadFmp4Init(initPiece)!;
    const video = init.Tracks.find((t) => t.Handler === 'vide')!;
    const audio = init.Tracks.find((t) => t.Handler === 'soun')!;
    const videoUnits: Uint8Array[] = [];
    const audioUnits: Array<{ Data: Uint8Array; Samples: number }> = [];
    for (const piece of fragments) {
        for (const sample of ReadFmp4Fragment(piece, init)!.Samples) {
            if (sample.TrackID === video.TrackID) {
                videoUnits.push(AvccToAnnexB(sample.Data!, video.Avc!)!.Data);
            } else {
                const header = AdtsHeader(audio.Aac!, sample.Size)!;
                const data = new Uint8Array(header.length + sample.Size);
                data.set(header);
                data.set(sample.Data!, header.length);
                audioUnits.push({ Data: data, Samples: sample.Duration });
            }
        }
    }
    return { init, video, audio, videoUnits, audioUnits };
}

/** The mean luma of an I420 frame (0 black, 255 white). */
function meanLuma(frame: AvatarVideoFrame): number {
    const luma = frame.Data.subarray(0, frame.Width * frame.Height);
    let sum = 0;
    for (let i = 0; i < luma.length; i += 97) {
        sum += luma[i];
    }
    return sum / Math.ceil(luma.length / 97);
}

/** Where each beep starts in a run of 24 kHz PCM (ms): a loud sample after 100 ms of quiet. */
function beepOnsetsMs(pcm: Int16Array): number[] {
    const onsets: number[] = [];
    let quiet = 0;
    for (let i = 0; i < pcm.length; i++) {
        if (Math.abs(pcm[i]) > 3000 && quiet >= 2400) {
            onsets.push(i / 24);
        }
        quiet = Math.abs(pcm[i]) < 1000 ? quiet + 1 : 0;
    }
    return onsets;
}

function concatPcm(chunks: Int16Array[]): Int16Array {
    const out = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
    }
    return out;
}

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
    const deadline = performance.now() + timeoutMs;
    while (!condition() && performance.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10));
    }
}

describe.skipIf(!hasFfmpeg)('the avatar pipeline with the installed ffmpeg', () => {
    let ffmpeg: AvailableFfmpeg;
    const disposers: Array<() => void> = [];

    beforeAll(async () => {
        FfmpegLocator.Instance.Configure();
        const probe = await FfmpegLocator.Instance.Probe();
        if (probe.Available !== true) {
            throw new Error(`ffmpeg is installed but unusable: ${probe.Available === false ? probe.Reason : ''}`);
        }
        ffmpeg = probe;
    });

    afterEach(() => {
        disposers.splice(0).forEach((dispose) => dispose());
    });

    it('decodes every access unit in order, white on the flash frames, and every AAC frame with the beeps after the priming', async () => {
        const { videoUnits, audioUnits } = fixtureUnits();
        const frames: AvatarVideoFrame[] = [];
        const pcm: AvatarPcmChunk[] = [];
        const failures: string[] = [];
        const videoDecoder = new AvatarH264Decoder({ Width: 704, Height: 1280, OnFrame: (f) => frames.push(f), OnFailure: (r) => failures.push(r) }, ffmpeg.Path, ffmpeg.Version);
        const audioDecoder = new AvatarAacDecoder({ SampleRate: 24000, OnPcm: (c) => pcm.push(c), OnFailure: (r) => failures.push(r) }, ffmpeg.Path);
        disposers.push(() => videoDecoder.Dispose(), () => audioDecoder.Dispose());
        videoUnits.forEach((data, i) => videoDecoder.Decode({ Seq: i, Epoch: 0, Time: i, Data: data }));
        audioUnits.forEach((unit, i) => audioDecoder.Decode({ Seq: i, Epoch: 0, Time: i, DecodedSamples: 1024, Samples: unit.Samples, Data: unit.Data }));
        // ffmpeg keeps the newest access units (one when they come in real time, up to three after a burst like this one)
        // until more input comes; every earlier frame comes back.
        await waitUntil(() => frames.length >= videoUnits.length - 3 && pcm.length === audioUnits.length, 10_000);

        expect(failures).toEqual([]);
        expect(frames.length).toBeGreaterThanOrEqual(videoUnits.length - 4);
        expect(frames.map((f) => f.Seq)).toEqual(frames.map((_, i) => i));
        const white = frames.filter((f) => meanLuma(f) > 200).map((f) => f.Seq);
        expect(white).toEqual([24, 48, 72]);
        expect(pcm.map((c) => c.Seq)).toEqual(audioUnits.map((_, i) => i));
        const onsets = beepOnsetsMs(concatPcm(pcm.map((c) => c.Pcm)));
        expect(onsets.map((ms) => Math.round(ms))).toEqual([1043, 2043, 3043]); // 1024 samples of AAC priming after each second
    });

    it('returns the first frame within 200 ms of the first access unit, with units arriving in real time', async () => {
        const { videoUnits } = fixtureUnits();
        let firstAt = 0;
        const decoder = new AvatarH264Decoder({ Width: 704, Height: 1280, OnFrame: () => { firstAt ||= performance.now(); }, OnFailure: () => undefined }, ffmpeg.Path, ffmpeg.Version);
        disposers.push(() => decoder.Dispose());
        await new Promise((r) => setTimeout(r, 300)); // the process is warm, as a session's decoder is
        const start = performance.now();
        // The raw H.264 reader takes a few units before its first frame, so they come at the stream's own pace.
        for (let i = 0; i < 6 && !firstAt; i++) {
            decoder.Decode({ Seq: i, Epoch: 0, Time: i / 24, Data: videoUnits[i] });
            await new Promise((r) => setTimeout(r, FRAME_MS));
        }
        await waitUntil(() => firstAt > 0, 2000);
        expect(firstAt).toBeGreaterThan(0);
        expect(firstAt - start).toBeLessThan(200);
    });

    it('shows each flash within one frame of its beep reaching the voice\'s playout (the voice is the clock)', async () => {
        const chunks: Int16Array[] = [];
        let enqueued = 0;
        let startedAt = 0;
        const voice: AvatarVoiceQueue = {
            EnqueuedMs: () => enqueued,
            // Plays in real time from the first queued audio, never past what was queued.
            PlayedMs: () => (startedAt ? Math.min(enqueued, performance.now() - startedAt) : 0),
            Enqueue: (samples) => {
                startedAt ||= performance.now();
                chunks.push(samples);
                enqueued += (samples.length / 24000) * 1000;
            },
        };
        const outlet = new FakeOutlet();
        const shown: Array<{ Luma: number; PlayedMs: number }> = [];
        outlet.Capture = (frame) => shown.push({ Luma: meanLuma(frame), PlayedMs: voice.PlayedMs() });
        const publisher = new AvatarPublisher({ Voice: voice, Video: outlet, SampleRate: 24000, OnStatus: () => undefined, Probe: async () => ffmpeg });
        disposers.push(() => publisher.Dispose());
        for (const piece of FixturePieces()) {
            publisher.Accept({ data: piece, mimeType: 'video/mp4' });
        }
        await waitUntil(() => voice.PlayedMs() >= 3200, 10_000);

        const beeps = beepOnsetsMs(concatPcm(chunks));
        const flashes = shown.filter((s) => s.Luma > 200).map((s) => s.PlayedMs);
        expect(beeps).toHaveLength(3);
        expect(flashes.length).toBeGreaterThanOrEqual(2); // a frame due late is skipped, not burst
        for (const at of flashes) {
            const nearest = Math.min(...beeps.map((b) => Math.abs(at - b)));
            expect(nearest).toBeLessThanOrEqual(FRAME_MS);
        }
    }, 15_000);
});
