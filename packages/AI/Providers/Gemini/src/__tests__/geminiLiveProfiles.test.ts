import { describe, it, expect } from 'vitest';
import {
    ResolveGeminiLiveProfile,
    ResolveGeminiThinkingLevel,
    GEMINI_LIVE_FALLBACK_PROFILE,
} from '../geminiLiveProfiles';

describe('ResolveGeminiLiveProfile', () => {
    it('does NOT let gemini-3.8-live capture extended-thinking — longest prefix wins', () => {
        const et = ResolveGeminiLiveProfile('gemini-3.8-live-extended-thinking');
        expect(et.MatchPrefix).toBe('gemini-3.8-live-extended-thinking');
        expect(et.IdleSignal).toBe('interactionStatus');
        expect(et.Tooling.SupportsBlockingExecution).toBe(false);
    });

    it('resolves plain 3.8 Live to its own profile', () => {
        const p = ResolveGeminiLiveProfile('gemini-3.8-live');
        expect(p.SupportsThinkingLevel).toBe(false);
        expect(p.IdleSignal).toBe('turnComplete');
        // Blocking and scheduling are legal here and only here.
        expect(p.Tooling).toEqual({ SupportsBlockingExecution: true, SupportsScheduling: true });
    });

    it('still resolves the legacy 3.1 preview, which the capability table makes free to keep', () => {
        const p = ResolveGeminiLiveProfile('gemini-3.1-flash-live-preview');
        expect(p.AllowedThinkingLevels).toContain('minimal');
        expect(p.AffectiveDialogRemoved).toBe(false);
    });

    it('matches case- and whitespace-insensitively, because model ids come from human-edited metadata', () => {
        expect(ResolveGeminiLiveProfile('  GEMINI-3.8-LIVE  ').MatchPrefix).toBe('gemini-3.8-live');
    });

    it('falls back permissively for an unknown model rather than refusing to connect', () => {
        for (const id of ['gemini-9.9-live-future', '', '   ', null, undefined]) {
            expect(ResolveGeminiLiveProfile(id as string)).toBe(GEMINI_LIVE_FALLBACK_PROFILE);
        }
    });

    it('never invents a thinking level for an unknown model', () => {
        expect(GEMINI_LIVE_FALLBACK_PROFILE.SupportsThinkingLevel).toBe(false);
        expect(GEMINI_LIVE_FALLBACK_PROFILE.AllowedThinkingLevels).toEqual([]);
    });
});

describe('ResolveGeminiThinkingLevel', () => {
    const et = ResolveGeminiLiveProfile('gemini-3.8-live-extended-thinking');
    const live = ResolveGeminiLiveProfile('gemini-3.8-live');
    const legacy = ResolveGeminiLiveProfile('gemini-3.1-flash-live-preview');

    it('returns nothing and warns nothing when no level is asked for', () => {
        expect(ResolveGeminiThinkingLevel(undefined, et)).toEqual({});
        expect(ResolveGeminiThinkingLevel('  ', live)).toEqual({});
    });

    it('warns rather than throwing when a level is asked of a model that takes none', () => {
        const r = ResolveGeminiThinkingLevel('high', live);
        expect(r.Level).toBeUndefined();
        expect(r.Warning).toMatch(/does not accept/i);
        // Says the model still reasons, so the warning is not read as "thinking is off".
        expect(r.Warning).toMatch(/interleaved/i);
    });

    it('rejects minimal on Extended Thinking, naming what IS allowed', () => {
        const r = ResolveGeminiThinkingLevel('minimal', et);
        expect(r.Level).toBeUndefined();
        expect(r.Warning).toMatch(/low, medium, high/);
    });

    it('rejects neutral effort values Gemini has no equivalent for', () => {
        for (const v of ['none', 'xhigh']) {
            expect(ResolveGeminiThinkingLevel(v, et).Level, v).toBeUndefined();
        }
    });

    it('accepts the levels each model documents, case-insensitively', () => {
        expect(ResolveGeminiThinkingLevel('LOW', et).Level).toBe('low');
        expect(ResolveGeminiThinkingLevel('high', et).Level).toBe('high');
        expect(ResolveGeminiThinkingLevel('minimal', legacy).Level).toBe('minimal');
    });

    it('never returns both a level and a warning — the caller should not have to choose', () => {
        for (const [v, p] of [['low', et], ['minimal', et], ['high', live]] as const) {
            const r = ResolveGeminiThinkingLevel(v, p);
            expect(Boolean(r.Level) && Boolean(r.Warning)).toBe(false);
        }
    });
});
