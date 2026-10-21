/**
 * The video conformance kit on the synthetic provider: a driver built only on what the package exports to any provider
 * passes every check that applies (G-5), whichever form its model sends video in: fragmented MP4 that carries the voice,
 * or encoded chunks or images on a timeline the voice shares (the raw-frame runs), and the stream branches in stream mode.
 */
import { describe, expect, it } from 'vitest';
import { ListRealtimeVideoConformanceChecks, RunRealtimeVideoConformance } from '../../testing';
import { SyntheticHarness, SyntheticStreamHarness } from './synthetic-harness';
import { AllBut, OutcomeOf } from './run-outcomes';

describe('the video conformance kit on the synthetic provider (fMP4)', () => {
    for (const check of ListRealtimeVideoConformanceChecks(() => new SyntheticHarness())) {
        it.skipIf(check.SkipReason !== null)(`${check.Id} ${check.Title}`, () => check.Run());
    }

    it('passes every check but the clock: its voice, in the MP4 or as untimed PCM, has no media time', async () => {
        expect(OutcomeOf(await RunRealtimeVideoConformance(() => new SyntheticHarness()))).toEqual({ Passed: AllBut('VF02'), Failed: [], Skipped: ['VF02'] });
    });
});

describe.each(['chunk', 'image'] as const)('the video conformance kit on the synthetic provider (%s frames)', (kind) => {
    for (const check of ListRealtimeVideoConformanceChecks(() => new SyntheticHarness({}, kind))) {
        it.skipIf(check.SkipReason !== null)(`${check.Id} ${check.Title}`, () => check.Run());
    }

    it('passes every check but the voice in the video: raw frames carry none, so the timed voice drives the clock', async () => {
        const results = await RunRealtimeVideoConformance(() => new SyntheticHarness({}, kind));

        expect(OutcomeOf(results)).toEqual({ Passed: AllBut('VC11'), Failed: [], Skipped: ['VC11'] });
        expect(results.find((r) => r.Id === 'VC11')?.Detail).toBe(`synthetic-${kind}'s video never carries the voice (Traits.VideoCanCarryVoice is false)`);
    });
});

describe('the video conformance kit on the synthetic provider (stream)', () => {
    for (const check of ListRealtimeVideoConformanceChecks(() => new SyntheticStreamHarness())) {
        it.skipIf(check.SkipReason !== null)(`${check.Id} ${check.Title}`, () => check.Run());
    }

    it('passes the checks a live stream answers and skips the player checks', async () => {
        const results = await RunRealtimeVideoConformance(() => new SyntheticStreamHarness());

        expect(OutcomeOf(results)).toEqual({ Passed: ['VC01', 'VC03', 'VC04'], Failed: [], Skipped: AllBut('VC01', 'VC03', 'VC04') });
        expect(results.find((r) => r.Id === 'VC06')?.Detail).toBe("synthetic-stream has no video player to record (Traits.AgentVideo is 'stream')");
    });
});
