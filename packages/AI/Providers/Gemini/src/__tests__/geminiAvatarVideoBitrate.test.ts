import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
    GEMINI_AVATAR_VIDEO_BITRATE_BPS_DEFAULT,
    GEMINI_AVATAR_VIDEO_BITRATE_ENV,
    ResolveGeminiAvatarVideoBitrateBps,
} from '../geminiAvatarVideoBitrate';

describe('ResolveGeminiAvatarVideoBitrateBps', () => {
    let warn: MockInstance<typeof console.warn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
        warn.mockRestore();
    });

    const warnings = (): string[] => warn.mock.calls.map((call) => String(call[0]));
    const read = (value: string | undefined): number | null => ResolveGeminiAvatarVideoBitrateBps({ [GEMINI_AVATAR_VIDEO_BITRATE_ENV]: value });

    it('names the variable MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS and defaults to 2 Mbps (decision M18)', () => {
        expect(GEMINI_AVATAR_VIDEO_BITRATE_ENV).toBe('MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS');
        expect(GEMINI_AVATAR_VIDEO_BITRATE_BPS_DEFAULT).toBe(2_000_000);
    });

    it('asks for the default when the variable is unset or blank, saying nothing', () => {
        expect(ResolveGeminiAvatarVideoBitrateBps({})).toBe(2_000_000);
        expect(read(undefined)).toBe(2_000_000);
        expect(read('')).toBe(2_000_000);
        expect(read('   ')).toBe(2_000_000);
        expect(warnings()).toEqual([]);
    });

    it('takes a whole number of bits per second, around which spaces are ignored', () => {
        expect(read('1000000')).toBe(1_000_000);
        expect(read(' 4500000 ')).toBe(4_500_000);
        expect(read('1')).toBe(1);
        expect(warnings()).toEqual([]);
    });

    it('reads 0 as "leave the field out" (null), so Google picks the bitrate', () => {
        expect(read('0')).toBeNull();
        expect(read('000')).toBeNull();
        expect(warnings()).toEqual([]);
    });

    it('falls back to the default for a value that is not a whole number, and says so once per value', () => {
        for (const bad of ['2e6', '2,000,000', '-1', '1.5', 'fast', '0x10', '99999999999999999999']) {
            expect(read(bad), bad).toBe(2_000_000);
            expect(read(bad), bad).toBe(2_000_000);
        }
        const lines = warnings();
        expect(lines).toHaveLength(7);
        expect(lines[0]).toContain('MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS');
        expect(lines[0]).toContain('"2e6"');
        expect(lines[0]).toContain('2000000');
        expect(lines[0]).toContain('0 leaves the field out');
    });

    it('quotes a long or unprintable value shortened and cleaned, never raw', () => {
        expect(read(`fast\u0007${'9'.repeat(200)}`)).toBe(2_000_000);
        const line = warnings()[0];
        expect(line).not.toContain('\u0007');
        expect(line.length).toBeLessThan(400);
    });

    it("reads the process's environment by default", () => {
        vi.stubEnv(GEMINI_AVATAR_VIDEO_BITRATE_ENV, '0');
        try {
            expect(ResolveGeminiAvatarVideoBitrateBps()).toBeNull();
        } finally {
            vi.unstubAllEnvs();
        }
        expect(ResolveGeminiAvatarVideoBitrateBps()).toBe(2_000_000);
    });
});
