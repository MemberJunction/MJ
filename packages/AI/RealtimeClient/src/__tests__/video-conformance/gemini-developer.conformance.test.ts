/**
 * The video conformance kit on the Gemini Developer API client. No Developer model renders an avatar, so its server
 * never grants one: the audio-only checks run, and every check of a granted avatar is skipped with that reason.
 */
import { describe, expect, it } from 'vitest';
import { ListRealtimeVideoConformanceChecks, RunRealtimeVideoConformance } from '../../testing';
import { GeminiDeveloperHarness } from './gemini-harness';
import { AllBut, OutcomeOf } from './run-outcomes';

describe('the video conformance kit on gemini-developer', () => {
    for (const check of ListRealtimeVideoConformanceChecks(() => new GeminiDeveloperHarness())) {
        (check.SkipReason ? it.skip : it)(`${check.Id} ${check.Title}`, () => check.Run());
    }

    it('passes the audio-only checks and skips the avatar checks: the Developer endpoint grants no avatar', async () => {
        const results = await RunRealtimeVideoConformance(() => new GeminiDeveloperHarness());

        expect(OutcomeOf(results)).toEqual({ Passed: ['VC01', 'VC02'], Failed: [], Skipped: AllBut('VC01', 'VC02') });
        expect(results.find((r) => r.Id === 'VC03')?.Detail).toBe("gemini-developer's server grants no avatar (Traits.GrantsAvatar is false)");
    });
});
