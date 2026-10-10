/**
 * The video conformance kit on the Gemini Enterprise client, through the real web build of `@google/genai` over a fake
 * relay socket, on a relay session as `GeminiEnterpriseRealtime` mints it. Every check runs but the clock (Gemini's PCM
 * carries no media time): the avatar Gemini 3.8 Live renders on Gemini Enterprise is the first video provider.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', async () => vi.importActual<typeof import('@google/genai/web')>('@google/genai/web'));

import { ListRealtimeVideoConformanceChecks, RunRealtimeVideoConformance } from '../../testing';
import { GeminiEnterpriseHarness } from './gemini-enterprise-harness';
import { AllBut, OutcomeOf } from './run-outcomes';

describe('the video conformance kit on gemini-enterprise', () => {
    for (const check of ListRealtimeVideoConformanceChecks(() => new GeminiEnterpriseHarness())) {
        it.skipIf(check.SkipReason !== null)(`${check.Id} ${check.Title}`, () => check.Run());
    }

    it("passes every check but the clock: Gemini's PCM carries no media time", async () => {
        const results = await RunRealtimeVideoConformance(() => new GeminiEnterpriseHarness());

        expect(OutcomeOf(results)).toEqual({ Passed: AllBut('VF02'), Failed: [], Skipped: ['VF02'] });
        expect(results.find((r) => r.Id === 'VF02')?.Detail).toBe("gemini-enterprise's voice carries no media time (Traits.TimedVoice is not set)");
    });

    it('leaves the browser globals as it found them', async () => {
        const webSocket = globalThis.WebSocket;
        await RunRealtimeVideoConformance(() => new GeminiEnterpriseHarness());

        expect(globalThis.WebSocket).toBe(webSocket);
        expect('MediaSource' in globalThis).toBe(false);
    });
});
