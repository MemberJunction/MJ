import { describe, expect, it } from 'vitest';
import {
    BUNDLED_DEFAULT_FONTS,
    BuildCheckCliUnreadableIssue,
    BuildCspMetaTag,
    BuildDefaultFontsStyleTag,
    CONTACT_SHEET_WIDTH,
    DEFAULT_CONCURRENCY,
    DEFAULT_HEARTBEAT_MS,
    DEFAULT_HOST,
    DEFAULT_MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_MB,
    DEFAULT_MAX_TIMEOUT_MS,
    DEFAULT_NON_RENDER_TIMEOUT_MS,
    DEFAULT_PORT,
    DEFAULT_TILES_PER_SHEET,
    DEFAULT_VIDEO_TTL_MS,
    DedupeCheckIssues,
    HYPERFRAMES_LINT_NONDETERMINISTIC_CODES,
    IsAllowedNumericLiteral,
    IsLoopbackHost,
    MAX_ASPECT_RATIO_TOLERANCE,
    MAX_CONTACT_SHEET_GRIDS,
    MAX_DURATION_SECONDS,
    MAX_FPS,
    MAX_FRAME_DIMENSION,
    MAX_STILL_POINTS,
    MIN_FPS,
    MIN_FRAME_DIMENSION,
    ONE_SHOT_OPERATIONS,
    ONE_SHOT_USAGE,
    PACKAGE_NAME,
    PINNED_HYPERFRAMES_VERSION,
    ResolveCompositionDuration,
    ResolveCompositionFps,
    ValidateStrictBase64,
} from '../index.js';

describe('@memberjunction/video-studio-render-worker root index exports', () => {
    it('exports canonical package metadata and limits', () => {
        expect(PACKAGE_NAME).toBe('@memberjunction/video-studio-render-worker');
        expect(PINNED_HYPERFRAMES_VERSION).toMatch(/^\d+\.\d+\.\d+/);
        expect(MIN_FRAME_DIMENSION).toBe(16);
        expect(MAX_FRAME_DIMENSION).toBe(4096);
        expect(MAX_ASPECT_RATIO_TOLERANCE).toBe(0.01);
        expect(MIN_FPS).toBe(1);
        expect(MAX_FPS).toBe(60);
        expect(MAX_DURATION_SECONDS).toBe(600);
        expect(CONTACT_SHEET_WIDTH).toBe(1536);
        expect(DEFAULT_TILES_PER_SHEET).toBe(12);
        expect(MAX_CONTACT_SHEET_GRIDS).toBe(4);
        expect(MAX_STILL_POINTS).toBe(48);
        expect(DEFAULT_HOST).toBe('127.0.0.1');
        expect(DEFAULT_PORT).toBe(0);
        expect(DEFAULT_CONCURRENCY).toBe(1);
        expect(DEFAULT_MAX_BODY_MB).toBe(256);
        expect(DEFAULT_MAX_BODY_BYTES).toBe(256 * 1024 * 1024);
        expect(DEFAULT_MAX_TIMEOUT_MS).toBeGreaterThan(0);
        expect(DEFAULT_NON_RENDER_TIMEOUT_MS).toBeGreaterThan(0);
        expect(DEFAULT_HEARTBEAT_MS).toBeGreaterThan(0);
        expect(DEFAULT_VIDEO_TTL_MS).toBeGreaterThan(0);
        expect(BUNDLED_DEFAULT_FONTS.length).toBeGreaterThanOrEqual(2);
        expect(HYPERFRAMES_LINT_NONDETERMINISTIC_CODES.length).toBeGreaterThan(0);
        expect(ONE_SHOT_OPERATIONS).toEqual(['render', 'stills', 'contact-sheet', 'check', 'keyframes', 'health']);
        expect(ONE_SHOT_USAGE).toContain('Usage:');
    });

    it('validates helper functions exported from root index', () => {
        expect(() => ValidateStrictBase64('YWJj', 'test.bin')).not.toThrow();
        expect(() => ValidateStrictBase64('not-valid-base64!', 'test.bin')).toThrow();

        const bundle = {
            Format: '16:9' as const,
            EntryFile: 'index.html',
            Files: [{ Path: 'index.html', Content: '<div data-composition-id="root" data-fps="24" data-duration="12.5"></div>' }],
            Assets: [],
            Seed: 1,
        };
        expect(ResolveCompositionFps(bundle)).toBe(24);
        expect(ResolveCompositionDuration(bundle)).toBe(12.5);

        expect(BuildCspMetaTag()).toContain('Content-Security-Policy');
        expect(BuildDefaultFontsStyleTag()).toContain('@font-face');

        const issue = BuildCheckCliUnreadableIssue('bad json');
        expect(issue.Code).toBe('MJ_CHECK_CLI_UNREADABLE');
        expect(DedupeCheckIssues([issue, { ...issue }])).toHaveLength(1);

        expect(IsAllowedNumericLiteral('42', new Set(['42']))).toBe(true);
        expect(IsLoopbackHost('127.0.0.1')).toBe(true);
        expect(IsLoopbackHost('0.0.0.0')).toBe(false);
    });
});
