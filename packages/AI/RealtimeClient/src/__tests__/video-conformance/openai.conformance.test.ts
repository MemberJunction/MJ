/**
 * The video conformance kit on the OpenAI Realtime client (WebRTC). OpenAI sends no video: the run proves its driver
 * declares none and still plays the voice; every video check is skipped with that reason.
 */
import { describe, expect, it } from 'vitest';
import { ListRealtimeVideoConformanceChecks, RunRealtimeVideoConformance } from '../../testing';
import { OpenAIHarness } from './openai-harness';
import { AllBut, OutcomeOf } from './run-outcomes';

describe('the video conformance kit on openai', () => {
    for (const check of ListRealtimeVideoConformanceChecks(() => new OpenAIHarness())) {
        it.skipIf(check.SkipReason !== null)(`${check.Id} ${check.Title}`, () => check.Run());
    }

    it('passes the audio-only check and skips the rest: its parts name no type, and it hands over no video', async () => {
        const results = await RunRealtimeVideoConformance(() => new OpenAIHarness());

        expect(OutcomeOf(results)).toEqual({ Passed: ['VC01'], Failed: [], Skipped: AllBut('VC01') });
        expect(results.find((r) => r.Id === 'VC02')?.Detail).toBe("openai's harness has no SendPart");
        expect(results.find((r) => r.Id === 'VC03')?.Detail).toBe("openai hands over no agent video (Traits.AgentVideo is 'none')");
    });
});
