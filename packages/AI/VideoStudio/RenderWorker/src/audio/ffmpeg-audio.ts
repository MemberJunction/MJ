/**
 * ffmpeg I/O for the Video Studio audio pipeline (§8): decoding sources to PCM, writing WAV,
 * two-pass `loudnorm`, muxing the final MP4, and measuring it with `ebur128`, `astats`, and
 * `silencedetect`. The parsing lives in `../checks/audio-checks.ts`; this file only runs processes.
 */

import { execFile } from 'node:child_process';
import type { RenderLoudnessTarget } from '@memberjunction/video-studio-core';
import {
    ParseAstatsOverall,
    ParseEbur128Summary,
    ParseLoudnormJson,
    ParseSilenceDetect,
    type AstatsSummary,
    type Ebur128Summary,
    type LoudnormMeasurement,
} from '../checks/audio-checks.js';
import { MIX_SAMPLE_RATE } from './synth.js';

/** Largest decoded PCM payload accepted from one ffmpeg call (2 GiB). */
const MAX_PCM_BYTES = 2 * 1024 * 1024 * 1024 - 1;

/** Output of one ffmpeg invocation. */
export interface FfmpegRunResult {
    Stdout: Buffer;
    Stderr: string;
}

/** Runs ffmpeg with arguments; rejects when the process exits non-zero. */
export type FfmpegRunner = (args: string[], signal?: AbortSignal) => Promise<FfmpegRunResult>;

/**
 * Creates an {@link FfmpegRunner} over the ffmpeg binary at `ffmpegPath`. A failed run rejects with an
 * error carrying the tail of ffmpeg's stderr.
 */
export function CreateFfmpegRunner(ffmpegPath: string): FfmpegRunner {
    return (args, signal) =>
        new Promise<FfmpegRunResult>((resolve, reject) => {
            execFile(
                ffmpegPath,
                ['-hide_banner', '-nostdin', ...args],
                { encoding: 'buffer', maxBuffer: MAX_PCM_BYTES, signal, windowsHide: true },
                (error, stdout, stderr) => {
                    const stderrText = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? '');
                    if (error) {
                        const tail = stderrText.split('\n').slice(-8).join('\n');
                        reject(new Error(`ffmpeg ${args.slice(0, 4).join(' ')} … failed: ${error.message}\n${tail}`));
                        return;
                    }
                    resolve({ Stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? ''), Stderr: stderrText });
                },
            );
        });
}

/**
 * Decodes an audio (or video) file's first audio stream to float PCM at {@link MIX_SAMPLE_RATE},
 * returning one `Float32Array` per channel.
 */
export async function DecodeAudioToPcm(
    ffmpeg: FfmpegRunner,
    inputPath: string,
    channels: 1 | 2,
    signal?: AbortSignal,
): Promise<Float32Array[]> {
    const { Stdout } = await ffmpeg(
        ['-v', 'error', '-i', inputPath, '-map', '0:a:0', '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', String(channels), '-ar', String(MIX_SAMPLE_RATE), 'pipe:1'],
        signal,
    );
    return DeinterleaveFloat32(Stdout, channels);
}

/** Splits interleaved little-endian float32 PCM into per-channel arrays. */
export function DeinterleaveFloat32(bytes: Buffer, channels: number): Float32Array[] {
    const frames = Math.floor(bytes.byteLength / (4 * channels));
    const out = Array.from({ length: channels }, () => new Float32Array(frames));
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
            out[c][i] = bytes.readFloatLE((i * channels + c) * 4);
        }
    }
    return out;
}

/**
 * Encodes channels as a 32-bit float WAV (format 3) at `sampleRate`, padding or trimming every channel
 * to `frameCount` frames.
 */
export function EncodeWavFloat32(channels: readonly Float32Array[], frameCount: number, sampleRate = MIX_SAMPLE_RATE): Buffer {
    const channelCount = channels.length;
    const dataBytes = frameCount * channelCount * 4;
    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(3, 20);
    buffer.writeUInt16LE(channelCount, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channelCount * 4, 28);
    buffer.writeUInt16LE(channelCount * 4, 32);
    buffer.writeUInt16LE(32, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataBytes, 40);
    for (let i = 0; i < frameCount; i++) {
        for (let c = 0; c < channelCount; c++) {
            const sample = i < channels[c].length ? channels[c][i] : 0;
            buffer.writeFloatLE(Number.isFinite(sample) ? sample : 0, 44 + (i * channelCount + c) * 4);
        }
    }
    return buffer;
}

/**
 * Builds the `loudnorm` filter. With a first-pass measurement it runs in linear mode (one gain for
 * the whole programme, so the mix balance is kept); without one it falls back to single-pass dynamic.
 */
export function BuildLoudnormFilter(target: RenderLoudnessTarget, measured: LoudnormMeasurement | null): string {
    const base = `loudnorm=I=${target.IntegratedLufs}:TP=${target.TruePeakDb}:LRA=${target.LoudnessRangeLu}`;
    if (!measured) {
        return base;
    }
    return (
        `${base}:measured_I=${measured.InputI}:measured_TP=${measured.InputTp}:measured_LRA=${measured.InputLra}` +
        `:measured_thresh=${measured.InputThresh}:offset=${measured.TargetOffset}:linear=true`
    );
}

/** First `loudnorm` pass: measures the input's first audio stream. Returns `null` when unmeasurable. */
export async function MeasureLoudnorm(
    ffmpeg: FfmpegRunner,
    inputPath: string,
    target: RenderLoudnessTarget,
    signal?: AbortSignal,
): Promise<LoudnormMeasurement | null> {
    const { Stderr } = await ffmpeg(
        ['-nostats', '-i', inputPath, '-map', '0:a:0', '-af', `${BuildLoudnormFilter(target, null)}:print_format=json`, '-f', 'null', '-'],
        signal,
    );
    return ParseLoudnormJson(Stderr);
}

/** Parameters for {@link MuxFinalAudio}. */
export interface MuxFinalAudioParams {
    /** MP4 whose video stream is copied. */
    VideoPath: string;
    /** File whose first audio stream is used (the mix WAV, or the video itself). */
    AudioPath: string;
    /** Destination MP4. */
    OutputPath: string;
    /** Optional audio filter (e.g. the `loudnorm` filter). */
    AudioFilter?: string;
}

/**
 * Writes the delivered MP4: video stream copied, audio filtered and encoded as 48 kHz AAC, faststart.
 * `-shortest` lets the video define the end, so a mix padded slightly past it never adds black frames.
 */
export async function MuxFinalAudio(ffmpeg: FfmpegRunner, params: MuxFinalAudioParams, signal?: AbortSignal): Promise<void> {
    const sameInput = params.AudioPath === params.VideoPath;
    const args = ['-y', '-v', 'error', '-i', params.VideoPath];
    if (!sameInput) {
        args.push('-i', params.AudioPath);
    }
    args.push('-map', '0:v:0', '-map', `${sameInput ? 0 : 1}:a:0`, '-c:v', 'copy');
    if (params.AudioFilter) {
        args.push('-af', params.AudioFilter);
    }
    args.push('-ar', String(MIX_SAMPLE_RATE), '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', params.OutputPath);
    await ffmpeg(args, signal);
}

/** Loudness and peak measurements of a delivered file's first audio stream. */
export interface DeliveredAudioMeasurement {
    Loudness: Ebur128Summary;
    Peaks: AstatsSummary;
}

/** Measures integrated loudness, loudness range, true peak (`ebur128`), and sample peaks (`astats`). */
export async function MeasureDeliveredAudio(ffmpeg: FfmpegRunner, inputPath: string, signal?: AbortSignal): Promise<DeliveredAudioMeasurement> {
    const { Stderr } = await ffmpeg(
        [
            '-nostats',
            '-i',
            inputPath,
            '-map',
            '0:a:0',
            '-af',
            'ebur128=peak=true:framelog=quiet,astats=measure_perchannel=none:measure_overall=Peak_level+Peak_count',
            '-f',
            'null',
            '-',
        ],
        signal,
    );
    return { Loudness: ParseEbur128Summary(Stderr), Peaks: ParseAstatsOverall(Stderr) };
}

/** Runs `silencedetect` over a file's first audio stream and returns the silent intervals. */
export async function DetectSilences(
    ffmpeg: FfmpegRunner,
    inputPath: string,
    thresholdDb: number,
    minSeconds: number,
    endSeconds: number,
    signal?: AbortSignal,
): Promise<Array<{ Start: number; End: number }>> {
    const { Stderr } = await ffmpeg(
        ['-nostats', '-i', inputPath, '-map', '0:a:0', '-af', `silencedetect=noise=${thresholdDb}dB:d=${minSeconds}`, '-f', 'null', '-'],
        signal,
    );
    return ParseSilenceDetect(Stderr, endSeconds);
}
