import { describe, it, expect } from 'vitest';
import { VoiceAbuseGuard } from '../voice/voice-abuse-guard.js';

describe('VoiceAbuseGuard', () => {
    it('returns null before any ceiling is crossed', () => {
        const g = new VoiceAbuseGuard({ maxSessionMinutes: 10, maxOutputTokens: 1000 });
        g.Start(0);
        expect(g.ShouldAbort(60_000)).toBeNull(); // 1 min in
    });

    it('aborts at the max-minutes ceiling', () => {
        const g = new VoiceAbuseGuard({ maxSessionMinutes: 5 });
        g.Start(0);
        expect(g.ShouldAbort(4 * 60_000)).toBeNull();
        expect(g.ShouldAbort(5 * 60_000)).toBe('max-minutes');
    });

    it('aborts at the output-token cost ceiling', () => {
        const g = new VoiceAbuseGuard({ maxSessionMinutes: 60, maxOutputTokens: 500 });
        g.Start(0);
        g.AddUsage(300);
        expect(g.ShouldAbort(1_000)).toBeNull();
        g.AddUsage(250);
        expect(g.ShouldAbort(1_000)).toBe('max-cost');
    });

    it('returns null when never started', () => {
        const g = new VoiceAbuseGuard();
        expect(g.ShouldAbort(999_999)).toBeNull();
    });

    it('ignores absent/zero usage', () => {
        const g = new VoiceAbuseGuard({ maxSessionMinutes: 60, maxOutputTokens: 100 });
        g.Start(0);
        g.AddUsage(undefined);
        g.AddUsage(0);
        expect(g.ShouldAbort(1_000)).toBeNull();
    });

    it('provides user-facing messages for each reason', () => {
        expect(VoiceAbuseGuard.MessageFor('max-minutes')).toMatch(/time limit/i);
        expect(VoiceAbuseGuard.MessageFor('max-cost')).toMatch(/usage limit/i);
    });
});
