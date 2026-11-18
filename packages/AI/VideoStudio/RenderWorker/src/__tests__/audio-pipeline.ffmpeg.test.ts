/**
 * Runs the real audio pipeline (ffmpeg decode -> TS mix -> two-pass loudnorm -> mux -> ebur128 /
 * astats / silencedetect) on small generated fixtures. Needs ffmpeg + ffprobe; skipped without them.
 * Set FFMPEG_PATH / FFPROBE_PATH to point at other binaries.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    DEFAULT_AUDIO_CHECK_THRESHOLDS,
    DEFAULT_DUCKING_SETTINGS,
    DEFAULT_LOUDNESS_TARGET,
    type RenderAudioMixPlan,
} from '@memberjunction/video-studio-core';
import {
    CreateFfmpegRunner,
    DecodeAudioToPcm,
    FinalizeRenderAudio,
    MJ_AUDIO_LINE_PAUSE_CODE,
    MJ_AUDIO_NARRATION_MASKED_CODE,
    MJ_AUDIO_SOURCE_MISSING_CODE,
    MIX_SAMPLE_RATE,
} from '../index.js';

const FFMPEG = process.env.FFMPEG_PATH ?? '/usr/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? '/usr/bin/ffprobe';
const HAS_FFMPEG = existsSync(FFMPEG) && existsSync(FFPROBE);

function ff(...args: string[]): void {
    execFileSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args]);
}

function audioStreamCount(file: string): number {
    const out = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).toString();
    return out.trim().split('\n').filter((l) => l.trim().length > 0).length;
}

function basePlan(overrides: Partial<RenderAudioMixPlan> = {}): RenderAudioMixPlan {
    return {
        DurationSeconds: 6,
        Seed: 11,
        Narration: [
            { Key: 'l1', BeatKey: 'b1', Src: 'audio/l1.wav', StartSeconds: 0.5, DurationSeconds: 2, Text: 'Own your data, own your future.' },
            { Key: 'l2', BeatKey: 'b2', Src: 'audio/l2.wav', StartSeconds: 3, DurationSeconds: 2, Text: 'Our AI platform helps' },
        ],
        Music: { Src: 'audio/music.wav', GainDb: -15 },
        Sfx: [{ Key: 'click', StartSeconds: 5.5, Synth: 'Click', GainDb: -6 }],
        MusicEvents: [],
        Ducking: { ...DEFAULT_DUCKING_SETTINGS },
        Loudness: { ...DEFAULT_LOUDNESS_TARGET },
        Checks: { ...DEFAULT_AUDIO_CHECK_THRESHOLDS },
        ...overrides,
    };
}

describe.skipIf(!HAS_FFMPEG)('FinalizeRenderAudio (real ffmpeg)', () => {
    let root = '';
    const ffmpeg = CreateFfmpegRunner(FFMPEG);

    beforeAll(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-audio-pipeline-'));
        await fs.mkdir(path.join(root, 'audio'));
        ff('-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=6:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'silent.mp4'));
        ff(
            '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=6:r=30',
            '-f', 'lavfi', '-i', 'sine=f=330:d=6',
            '-af', 'volume=0.3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(root, 'with-audio.mp4'),
        );
        // Continuous "speech" (no interior gap).
        ff('-f', 'lavfi', '-i', `aevalsrc=0.3*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*4*t)):d=2:s=${MIX_SAMPLE_RATE}`, path.join(root, 'audio/l1.wav'));
        // "Speech" with a 0.3 s hole in the middle and no punctuation to explain it.
        ff('-f', 'lavfi', '-i', `aevalsrc=0.3*sin(2*PI*220*t)*(lt(t\\,0.8)+gte(t\\,1.1)):d=2:s=${MIX_SAMPLE_RATE}`, path.join(root, 'audio/l2.wav'));
        ff('-f', 'lavfi', '-i', 'anoisesrc=d=7:c=pink:a=0.3', '-ac', '2', path.join(root, 'audio/music.wav'));
    });

    afterAll(async () => {
        if (root) {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it('mixes from the plan, normalizes to -14 LUFS, and flags only the unexplained pause', async () => {
        const result = await FinalizeRenderAudio({
            Ffmpeg: ffmpeg,
            RootDir: root,
            VideoPath: path.join(root, 'silent.mp4'),
            VideoHasAudio: false,
            DurationSeconds: 6,
            Plan: basePlan(),
        });
        expect(audioStreamCount(result.OutputPath)).toBe(1);
        const { Report } = result;
        expect(Report.Mixed).toBe(true);
        expect(Report.Normalized).toBe(true);
        expect(Math.abs((Report.Measurements.IntegratedLufs ?? 0) - -14)).toBeLessThanOrEqual(1.5);
        expect(Report.Measurements.TruePeakDb ?? 0).toBeLessThanOrEqual(-1);
        expect(Report.Measurements.MinNarrationToMusicDb ?? 0).toBeGreaterThan(10);
        expect(Report.Synthesized).toEqual(['Sound effects: 1 synthesized (Click at 5.50s)']);
        const codes = Report.Issues.map((i) => i.Code);
        expect(codes).toEqual([MJ_AUDIO_LINE_PAUSE_CODE]);
        const pause = Report.Issues[0];
        expect(pause.BeatKey).toBe('b2');
        expect(pause.TimestampSeconds).toBeGreaterThan(3.75);
        expect(pause.TimestampSeconds).toBeLessThan(3.85);
    }, 60_000);

    it('replaces the composition audio when a plan is present and reports loud music as masking', async () => {
        const result = await FinalizeRenderAudio({
            Ffmpeg: ffmpeg,
            RootDir: root,
            VideoPath: path.join(root, 'with-audio.mp4'),
            VideoHasAudio: true,
            DurationSeconds: 6,
            Plan: basePlan({ Music: { Src: 'audio/music.wav', GainDb: 6 }, Ducking: { ...DEFAULT_DUCKING_SETTINGS, Enabled: false }, Sfx: [] }),
        });
        expect(result.Report.Issues.map((i) => i.Code)).toContain(MJ_AUDIO_NARRATION_MASKED_CODE);
        // The 330 Hz composition tone is gone: the delivered audio is the plan's mix.
        const pcm = await DecodeAudioToPcm(ffmpeg, result.OutputPath, 1);
        expect(pcm[0].length).toBeGreaterThan(5 * MIX_SAMPLE_RATE);
    }, 60_000);

    it('reports a source missing from the bundle', async () => {
        const result = await FinalizeRenderAudio({
            Ffmpeg: ffmpeg,
            RootDir: root,
            VideoPath: path.join(root, 'silent.mp4'),
            VideoHasAudio: false,
            DurationSeconds: 6,
            Plan: basePlan({ Narration: [{ ...basePlan().Narration[0], Src: 'audio/nope.wav' }] }),
        });
        expect(result.Report.Issues.map((i) => [i.Code, i.File])).toContainEqual([MJ_AUDIO_SOURCE_MISSING_CODE, 'audio/nope.wav']);
    }, 60_000);

    it('without a plan, normalizes the composition audio and leaves a silent video alone', async () => {
        const normalized = await FinalizeRenderAudio({
            Ffmpeg: ffmpeg,
            RootDir: root,
            VideoPath: path.join(root, 'with-audio.mp4'),
            VideoHasAudio: true,
            DurationSeconds: 6,
        });
        expect(normalized.Report.Mixed).toBe(false);
        expect(normalized.Report.Normalized).toBe(true);
        expect(Math.abs((normalized.Report.Measurements.IntegratedLufs ?? 0) - -14)).toBeLessThanOrEqual(1.5);
        expect(normalized.Report.Issues).toEqual([]);

        const untouched = await FinalizeRenderAudio({
            Ffmpeg: ffmpeg,
            RootDir: root,
            VideoPath: path.join(root, 'silent.mp4'),
            VideoHasAudio: false,
            DurationSeconds: 6,
        });
        expect(untouched.OutputPath).toBe(path.join(root, 'silent.mp4'));
        expect(untouched.Report).toEqual({ Mixed: false, Normalized: false, Measurements: {}, Issues: [], Synthesized: [] });
    }, 60_000);

    it('builds a soundtrack from a synthesized music bed alone', async () => {
        const result = await FinalizeRenderAudio({
            Ffmpeg: ffmpeg,
            RootDir: root,
            VideoPath: path.join(root, 'silent.mp4'),
            VideoHasAudio: false,
            DurationSeconds: 6,
            Plan: basePlan({ Narration: [], Sfx: [], Music: { Synthesized: { Mood: 'Corporate', Bpm: 100 }, GainDb: -2 } }),
        });
        expect(result.Report.Issues).toEqual([]);
        expect(result.Report.Synthesized[0]).toContain('synthesized Corporate bed');
        expect(Math.abs((result.Report.Measurements.IntegratedLufs ?? 0) - -14)).toBeLessThanOrEqual(1.5);
    }, 60_000);
});
