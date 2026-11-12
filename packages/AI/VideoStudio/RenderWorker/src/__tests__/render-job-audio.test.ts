import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AUDIO_CHECK_THRESHOLDS,
    DEFAULT_DUCKING_SETTINGS,
    DEFAULT_LOUDNESS_TARGET,
    MAX_RENDER_CAPTURE_WORKERS,
    type RenderAudioReport,
    type RenderRequest,
} from '@memberjunction/video-studio-core';
import { FakeRenderBackend, ResolveRenderCaptureWorkers, RunRenderJob } from '../index.js';

function request(overrides: Partial<RenderRequest> = {}): RenderRequest {
    return {
        Bundle: {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [
                {
                    Path: 'index.html',
                    Content:
                        '<!doctype html><html><body><div data-composition-id="main" data-duration="2" data-fps="30" data-width="1280" data-height="720" data-no-timeline></div></body></html>',
                },
            ],
            Assets: [],
            Seed: 1,
        },
        Width: 1280,
        Height: 720,
        Fps: 30,
        DurationSeconds: 2,
        Quality: 'draft',
        ...overrides,
    };
}

describe('ResolveRenderCaptureWorkers', () => {
    it('prefers the request, then VIDEO_STUDIO_RENDER_WORKERS, then a CPU-based default, always clamped', () => {
        expect(ResolveRenderCaptureWorkers(3, { VIDEO_STUDIO_RENDER_WORKERS: '2' }, 8)).toBe(3);
        expect(ResolveRenderCaptureWorkers(undefined, { VIDEO_STUDIO_RENDER_WORKERS: '2' }, 8)).toBe(2);
        expect(ResolveRenderCaptureWorkers(undefined, { VIDEO_STUDIO_RENDER_WORKERS: 'lots' }, 8)).toBe(4);
        expect(ResolveRenderCaptureWorkers(undefined, {}, 6)).toBe(3);
        expect(ResolveRenderCaptureWorkers(99, {}, 64)).toBe(MAX_RENDER_CAPTURE_WORKERS);
        expect(ResolveRenderCaptureWorkers(16, {}, 2)).toBe(2);
    });
});

describe('RunRenderJob audio + workers wiring', () => {
    it('passes the worker count to the backend, the plan to FinalizeAudio, and returns the audio report', async () => {
        const report: RenderAudioReport = {
            Mixed: true,
            Normalized: true,
            Measurements: { IntegratedLufs: -14.1, TruePeakDb: -1.6 },
            Issues: [],
            Synthesized: ['Music: synthesized Calm bed at 80 BPM (procedurally generated, not a licensed track)'],
        };
        const backend = new FakeRenderBackend({ StepDelayMs: 1, AudioReport: report });
        const plan = {
            DurationSeconds: 2,
            Seed: 1,
            Narration: [],
            Music: { Synthesized: { Mood: 'Calm' as const, Bpm: 80 }, GainDb: -2 },
            Sfx: [],
            MusicEvents: [],
            Ducking: { ...DEFAULT_DUCKING_SETTINGS },
            Loudness: { ...DEFAULT_LOUDNESS_TARGET },
            Checks: { ...DEFAULT_AUDIO_CHECK_THRESHOLDS },
        };
        const result = await RunRenderJob(request({ Workers: 1, AudioMix: plan }), backend, () => undefined);
        expect(backend.LastRenderJob?.Workers).toBe(1);
        expect(backend.LastAudioJob?.Plan).toEqual(plan);
        expect(backend.LastAudioJob?.DurationSeconds).toBe(2);
        expect(result.Workers).toBe(1);
        expect(result.Audio).toEqual(report);
    });

    it('still finalizes audio (normalize only) without a plan', async () => {
        const backend = new FakeRenderBackend({ StepDelayMs: 1 });
        const result = await RunRenderJob(request(), backend, () => undefined);
        expect(backend.LastAudioJob?.Plan).toBeUndefined();
        expect(result.Audio?.Mixed).toBe(false);
        expect(result.Workers).toBeGreaterThanOrEqual(1);
    });
});
