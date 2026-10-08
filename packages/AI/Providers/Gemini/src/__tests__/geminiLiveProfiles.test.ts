import { describe, it, expect } from 'vitest';
import {
    ResolveGeminiLiveProfile,
    ResolveGeminiMaxInboundVideoStreams,
    ResolveGeminiThinkingLevel,
    GEMINI_LIVE_FALLBACK_PROFILE,
    GEMINI_LIVE_ENDPOINT_OVERLAYS,
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
            expect(ResolveGeminiLiveProfile(id as string)).toEqual({ ...GEMINI_LIVE_FALLBACK_PROFILE, SupportsAvatarOutput: false, Endpoint: 'developer' });
        }
    });

    it('never invents a thinking level for an unknown model', () => {
        expect(GEMINI_LIVE_FALLBACK_PROFILE.SupportsThinkingLevel).toBe(false);
        expect(GEMINI_LIVE_FALLBACK_PROFILE.AllowedThinkingLevels).toEqual([]);
    });

    it('returns the same object for one model on one endpoint, so a resolved profile is stable', () => {
        expect(ResolveGeminiLiveProfile('gemini-3.8-live')).toBe(ResolveGeminiLiveProfile(' GEMINI-3.8-LIVE '));
        expect(ResolveGeminiLiveProfile('gemini-3.8-live', 'enterprise')).not.toBe(ResolveGeminiLiveProfile('gemini-3.8-live'));
    });
});

describe('ResolveGeminiLiveProfile by endpoint (live avatars)', () => {
    it('defaults to the Developer API, where no model renders an avatar', () => {
        for (const id of ['gemini-3.8-live', 'gemini-3.8-live-extended-thinking', 'gemini-3.1-flash-live-preview', 'unknown-live']) {
            const p = ResolveGeminiLiveProfile(id);
            expect(p.Endpoint, id).toBe('developer');
            expect(p.SupportsAvatarOutput, id).toBe(false);
            expect(p.AvatarOutputEncoding, id).toBeUndefined();
        }
    });

    it('renders an avatar on Gemini Enterprise for gemini-3.8-live: fragmented MP4 that carries the voice', () => {
        const p = ResolveGeminiLiveProfile('gemini-3.8-live', 'enterprise');
        expect(p.Endpoint).toBe('enterprise');
        expect(p.SupportsAvatarOutput).toBe(true);
        expect(p.AvatarOutputEncoding).toBe('video/mp4; codecs="avc1.42c01f, mp4a.40.2"');
        expect(p.AvatarAudioMuxed).toBe(true);
    });

    it('keeps every other fact of the model row on Enterprise', () => {
        const { Endpoint: _e, SupportsAvatarOutput: _s, AvatarOutputEncoding: _a, AvatarAudioMuxed: _m, ...enterprise } = ResolveGeminiLiveProfile('gemini-3.8-live', 'enterprise');
        const { Endpoint: _e2, SupportsAvatarOutput: _s2, AvatarOutputEncoding: _a2, AvatarAudioMuxed: _m2, ...developer } = ResolveGeminiLiveProfile('gemini-3.8-live');
        expect(enterprise).toEqual(developer);
    });

    it("doesn't let Extended Thinking inherit 3.8 Live's avatar through the longer id", () => {
        const et = ResolveGeminiLiveProfile('gemini-3.8-live-extended-thinking', 'enterprise');
        expect(et.MatchPrefix).toBe('gemini-3.8-live-extended-thinking');
        expect(et.SupportsAvatarOutput).toBe(false);
    });

    it('renders no avatar for the legacy model or an unknown one on Enterprise', () => {
        expect(ResolveGeminiLiveProfile('gemini-3.1-flash-live-preview', 'enterprise').SupportsAvatarOutput).toBe(false);
        expect(ResolveGeminiLiveProfile('gemini-9.9-live-future', 'enterprise').SupportsAvatarOutput).toBe(false);
        expect(ResolveGeminiLiveProfile(undefined, 'enterprise').SupportsAvatarOutput).toBe(false);
    });

    it('declares overlays only for model rows that exist', () => {
        for (const overlay of GEMINI_LIVE_ENDPOINT_OVERLAYS) {
            expect(ResolveGeminiLiveProfile(overlay.ModelPrefix, overlay.Endpoint).MatchPrefix).toBe(overlay.ModelPrefix);
        }
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

describe('MaxInboundVideoStreams', () => {
    it('Gemini 3.8 Live and Extended Thinking each take exactly one inbound video stream', () => {
        expect(ResolveGeminiMaxInboundVideoStreams(ResolveGeminiLiveProfile('gemini-3.8-live'))).toBe(1);
        expect(ResolveGeminiMaxInboundVideoStreams(ResolveGeminiLiveProfile('gemini-3.8-live-extended-thinking'))).toBe(1);
    });

    it('a model that does not accept video has zero streams', () => {
        expect(ResolveGeminiMaxInboundVideoStreams(ResolveGeminiLiveProfile('gemini-3.1-flash-live-preview'))).toBe(0);
    });

    it('the fallback profile declares one stream but resolves to zero while it accepts no video', () => {
        expect(GEMINI_LIVE_FALLBACK_PROFILE.MaxInboundVideoStreams).toBe(1);
        expect(GEMINI_LIVE_FALLBACK_PROFILE.SupportsInboundVideo).toBe(false);
        expect(ResolveGeminiMaxInboundVideoStreams(GEMINI_LIVE_FALLBACK_PROFILE)).toBe(0);
        expect(ResolveGeminiMaxInboundVideoStreams(ResolveGeminiLiveProfile('some-future-live-model'))).toBe(0);
        expect(ResolveGeminiMaxInboundVideoStreams(ResolveGeminiLiveProfile(undefined))).toBe(0);
    });

    it('a video profile that declares no count means one, and a stale count on a non-video row is ignored', () => {
        const base = ResolveGeminiLiveProfile('gemini-3.8-live');
        expect(ResolveGeminiMaxInboundVideoStreams({ ...base, MaxInboundVideoStreams: undefined })).toBe(1);
        expect(ResolveGeminiMaxInboundVideoStreams({ ...base, MaxInboundVideoStreams: 2 })).toBe(2);
        expect(ResolveGeminiMaxInboundVideoStreams({ ...base, SupportsInboundVideo: false, MaxInboundVideoStreams: 2 })).toBe(0);
    });
});
