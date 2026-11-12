/**
 * Final audio stage of a Video Studio render (§8, §9): after HyperFrames writes the picture, this
 * builds the soundtrack from the request's `AudioMix` plan (or keeps the composition's own audio when
 * there is no plan), normalizes loudness with two-pass `loudnorm`, muxes the delivered MP4, and runs
 * the deterministic audio checks on the result.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
    DEFAULT_AUDIO_CHECK_THRESHOLDS,
    DEFAULT_LOUDNESS_TARGET,
    type RenderAudioMeasurements,
    type RenderAudioMixPlan,
    type RenderAudioReport,
} from '@memberjunction/video-studio-core';
import {
    EvaluateAudioChecks,
    FindUnexpectedLinePauses,
    type LineMaskingMeasurement,
    type UnexpectedLinePause,
} from '../checks/audio-checks.js';
import { ResolveInsideBundleRoot } from '../bundle.js';
import {
    BuildLoudnormFilter,
    DecodeAudioToPcm,
    DetectSilences,
    EncodeWavFloat32,
    MeasureDeliveredAudio,
    MeasureLoudnorm,
    MuxFinalAudio,
    type DeliveredAudioMeasurement,
    type FfmpegRunner,
} from './ffmpeg-audio.js';
import { BuildMixStems, MeasureLineMasking, MixStemsToStereo, type DecodedMixSources, type MixStems } from './mixer.js';
import { MIX_SAMPLE_RATE } from './synth.js';

/** Seconds of silence appended to the mix so it never ends before the picture. */
export const MIX_TAIL_PAD_SECONDS = 0.25;

/** Input to {@link FinalizeRenderAudio}. */
export interface FinalizeRenderAudioParams {
    /** ffmpeg runner. */
    Ffmpeg: FfmpegRunner;
    /** Staged bundle directory (plan `Src` paths resolve inside it). */
    RootDir: string;
    /** MP4 written by the renderer. */
    VideoPath: string;
    /** Whether `VideoPath` has an audio stream. */
    VideoHasAudio: boolean;
    /** Film duration in seconds. */
    DurationSeconds: number;
    /** Optional soundtrack plan. */
    Plan?: RenderAudioMixPlan;
    /** Directory for intermediate files (defaults to `RootDir`). */
    WorkDir?: string;
}

/** Result of {@link FinalizeRenderAudio}. */
export interface FinalizeRenderAudioResult {
    /** Delivered MP4 path (equal to `VideoPath` when nothing had to change). */
    OutputPath: string;
    /** Audio report for the render result. */
    Report: RenderAudioReport;
}

/**
 * Converts delivered-audio measurements into report measurements, dropping non-finite values (a
 * silent mix measures `-inf`, which JSON cannot carry).
 */
export function BuildAudioMeasurements(
    delivered: DeliveredAudioMeasurement,
    minNarrationToMusicDb?: number,
): RenderAudioMeasurements {
    const measurements: RenderAudioMeasurements = {};
    const set = (key: keyof RenderAudioMeasurements, value: number | undefined): void => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            measurements[key] = value;
        }
    };
    set('IntegratedLufs', delivered.Loudness.IntegratedLufs);
    set('LoudnessRangeLu', delivered.Loudness.LoudnessRangeLu);
    set('TruePeakDb', delivered.Loudness.TruePeakDb);
    set('SamplePeakDb', delivered.Peaks.PeakLevelDb);
    if ((delivered.Peaks.PeakLevelDb ?? Number.NEGATIVE_INFINITY) >= -0.01) {
        set('ClippedSamples', delivered.Peaks.PeakCount);
    }
    set('MinNarrationToMusicDb', minNarrationToMusicDb);
    return measurements;
}

function planExpectsAudio(plan: RenderAudioMixPlan): boolean {
    return plan.Narration.length > 0 || Boolean(plan.Music) || plan.Sfx.length > 0;
}

async function tryDecode(
    ffmpeg: FfmpegRunner,
    rootDir: string,
    src: string,
    channels: 1 | 2,
    missing: string[],
    signal?: AbortSignal,
): Promise<Float32Array[] | null> {
    try {
        const filePath = ResolveInsideBundleRoot(rootDir, src);
        await fs.access(filePath);
        return await DecodeAudioToPcm(ffmpeg, filePath, channels, signal);
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }
        if (!missing.includes(src)) {
            missing.push(src);
        }
        return null;
    }
}

async function decodePlanSources(
    params: FinalizeRenderAudioParams,
    plan: RenderAudioMixPlan,
    missing: string[],
    signal?: AbortSignal,
): Promise<DecodedMixSources> {
    const sources: DecodedMixSources = { Narration: new Map(), Sfx: new Map() };
    for (const line of plan.Narration) {
        const pcm = await tryDecode(params.Ffmpeg, params.RootDir, line.Src, 1, missing, signal);
        if (pcm) {
            sources.Narration.set(line.Key, pcm[0]);
        }
    }
    if (plan.Music?.Src) {
        const pcm = await tryDecode(params.Ffmpeg, params.RootDir, plan.Music.Src, 2, missing, signal);
        if (pcm) {
            sources.Music = { Left: pcm[0], Right: pcm[1] };
        }
    }
    for (const sfx of plan.Sfx) {
        if (sfx.Src) {
            const pcm = await tryDecode(params.Ffmpeg, params.RootDir, sfx.Src, 1, missing, signal);
            if (pcm) {
                sources.Sfx.set(sfx.Key, pcm[0]);
            }
        }
    }
    return sources;
}

async function findLinePauses(
    params: FinalizeRenderAudioParams,
    plan: RenderAudioMixPlan,
    stems: MixStems,
    workDir: string,
    signal?: AbortSignal,
): Promise<UnexpectedLinePause[]> {
    if (plan.Narration.length === 0) {
        return [];
    }
    const narrationPath = path.join(workDir, 'mj-narration-stem.wav');
    await fs.writeFile(narrationPath, EncodeWavFloat32([stems.Narration], stems.Narration.length));
    const silences = await DetectSilences(
        params.Ffmpeg,
        narrationPath,
        plan.Checks.SilenceThresholdDb,
        plan.Checks.MinLinePauseSeconds,
        plan.DurationSeconds,
        signal,
    );
    return FindUnexpectedLinePauses(plan.Narration, silences, plan.Checks.MinLinePauseSeconds);
}

async function normalizeAndMux(
    params: FinalizeRenderAudioParams,
    audioPath: string,
    target: RenderAudioMixPlan['Loudness'],
    signal?: AbortSignal,
): Promise<{ OutputPath: string; Normalized: boolean }> {
    const outputPath = path.join(params.WorkDir ?? params.RootDir, 'mj-final-audio.mp4');
    const measured = target.Enabled ? await MeasureLoudnorm(params.Ffmpeg, audioPath, target, signal) : null;
    await MuxFinalAudio(
        params.Ffmpeg,
        {
            VideoPath: params.VideoPath,
            AudioPath: audioPath,
            OutputPath: outputPath,
            ...(target.Enabled ? { AudioFilter: BuildLoudnormFilter(target, measured) } : {}),
        },
        signal,
    );
    return { OutputPath: outputPath, Normalized: target.Enabled };
}

async function finalizeWithPlan(params: FinalizeRenderAudioParams, plan: RenderAudioMixPlan, signal?: AbortSignal): Promise<FinalizeRenderAudioResult> {
    const workDir = params.WorkDir ?? params.RootDir;
    const missing: string[] = [];
    const sources = await decodePlanSources(params, plan, missing, signal);
    const stems = BuildMixStems(plan, sources);
    const mix = MixStemsToStereo(stems);
    const mixPath = path.join(workDir, 'mj-mix.wav');
    const paddedFrames = mix.Left.length + Math.round(MIX_TAIL_PAD_SECONDS * MIX_SAMPLE_RATE);
    await fs.writeFile(mixPath, EncodeWavFloat32([mix.Left, mix.Right], paddedFrames));

    const pauses = await findLinePauses(params, plan, stems, workDir, signal);
    const masking: LineMaskingMeasurement[] = MeasureLineMasking(plan.Narration, stems);
    const muxed = await normalizeAndMux(params, mixPath, plan.Loudness, signal);
    const delivered = await MeasureDeliveredAudio(params.Ffmpeg, muxed.OutputPath, signal);

    const issues = EvaluateAudioChecks({
        AudioExpected: planExpectsAudio(plan),
        HasAudioStream: true,
        MissingSources: missing,
        Loudness: delivered.Loudness,
        Peaks: delivered.Peaks,
        Target: plan.Loudness,
        Masking: masking,
        LinePauses: pauses,
        Thresholds: plan.Checks,
    });
    const finiteRatios = masking.map((m) => m.RatioDb).filter((r) => Number.isFinite(r));
    return {
        OutputPath: muxed.OutputPath,
        Report: {
            Mixed: true,
            Normalized: muxed.Normalized,
            Measurements: BuildAudioMeasurements(
                delivered,
                finiteRatios.length > 0 ? Math.round(Math.min(...finiteRatios) * 10) / 10 : undefined,
            ),
            Issues: issues,
            Synthesized: stems.Synthesized,
        },
    };
}

async function finalizeWithoutPlan(params: FinalizeRenderAudioParams, signal?: AbortSignal): Promise<FinalizeRenderAudioResult> {
    if (!params.VideoHasAudio) {
        return { OutputPath: params.VideoPath, Report: { Mixed: false, Normalized: false, Measurements: {}, Issues: [], Synthesized: [] } };
    }
    const muxed = await normalizeAndMux(params, params.VideoPath, DEFAULT_LOUDNESS_TARGET, signal);
    const delivered = await MeasureDeliveredAudio(params.Ffmpeg, muxed.OutputPath, signal);
    const issues = EvaluateAudioChecks({
        AudioExpected: false,
        HasAudioStream: true,
        MissingSources: [],
        Loudness: delivered.Loudness,
        Peaks: delivered.Peaks,
        Target: DEFAULT_LOUDNESS_TARGET,
        Masking: [],
        LinePauses: [],
        Thresholds: DEFAULT_AUDIO_CHECK_THRESHOLDS,
    });
    return {
        OutputPath: muxed.OutputPath,
        Report: {
            Mixed: false,
            Normalized: muxed.Normalized,
            Measurements: BuildAudioMeasurements(delivered),
            Issues: issues,
            Synthesized: [],
        },
    };
}

/**
 * Builds, normalizes, muxes, and checks the delivered soundtrack:
 * - with a plan: the soundtrack is rebuilt from the plan (the composition's own audio is replaced),
 *   normalized, and checked for loudness, peaks, clipping, masking, unexpected pauses, and missing audio;
 * - without a plan: the composition's audio (if any) is normalized and checked for loudness and peaks.
 */
export async function FinalizeRenderAudio(params: FinalizeRenderAudioParams, signal?: AbortSignal): Promise<FinalizeRenderAudioResult> {
    if (params.Plan && planExpectsAudio(params.Plan)) {
        return finalizeWithPlan(params, params.Plan, signal);
    }
    return finalizeWithoutPlan(params, signal);
}
