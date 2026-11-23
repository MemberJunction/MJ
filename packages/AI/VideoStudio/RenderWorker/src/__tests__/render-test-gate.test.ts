import { describe, expect, it, vi } from 'vitest';
import { CheckCanRunRealRenderTests } from './render-test-gate.js';

describe('CheckCanRunRealRenderTests', () => {
    it('should return false and log when VIDEO_STUDIO_RENDER_TESTS is unset and not required', () => {
        const log = vi.fn();
        const result = CheckCanRunRealRenderTests('sample.test', {
            Env: {},
            SpawnSync: () => ({ status: 0 }),
            ExistsSync: () => true,
            ResolveBrowserPath: () => '/usr/bin/chromium',
            Log: log,
        });
        expect(result).toBe(false);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('[sample.test] set VIDEO_STUDIO_RENDER_TESTS=1 to enable.'),
        );
    });

    it('should throw when VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1 and VIDEO_STUDIO_RENDER_TESTS is unset', () => {
        expect(() =>
            CheckCanRunRealRenderTests('sample.test', {
                Env: { VIDEO_STUDIO_RENDER_TESTS_REQUIRED: '1' },
                SpawnSync: () => ({ status: 0 }),
                ExistsSync: () => true,
                ResolveBrowserPath: () => '/usr/bin/chromium',
            }),
        ).toThrow(/VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1/);
    });

    it('should return false when ffmpeg is missing and not required, and throw when required', () => {
        const log = vi.fn();
        expect(
            CheckCanRunRealRenderTests('sample.test', {
                Env: { VIDEO_STUDIO_RENDER_TESTS: '1' },
                SpawnSync: () => ({ status: 127 }),
                ExistsSync: () => true,
                ResolveBrowserPath: () => '/usr/bin/chromium',
                Log: log,
            }),
        ).toBe(false);

        expect(() =>
            CheckCanRunRealRenderTests('sample.test', {
                Env: {
                    VIDEO_STUDIO_RENDER_TESTS: '1',
                    VIDEO_STUDIO_RENDER_TESTS_REQUIRED: '1',
                },
                SpawnSync: () => ({ status: 127 }),
                ExistsSync: () => true,
                ResolveBrowserPath: () => '/usr/bin/chromium',
            }),
        ).toThrow(/ffmpeg binary not found on PATH/);
    });

    it('should return false when CHROME_PATH points to a missing binary and not required, and throw when required', () => {
        const log = vi.fn();
        expect(
            CheckCanRunRealRenderTests('sample.test', {
                Env: {
                    VIDEO_STUDIO_RENDER_TESTS: '1',
                    CHROME_PATH: '/missing/chrome',
                },
                SpawnSync: () => ({ status: 0 }),
                ExistsSync: () => false,
                ResolveBrowserPath: () => undefined,
                Log: log,
            }),
        ).toBe(false);

        expect(() =>
            CheckCanRunRealRenderTests('sample.test', {
                Env: {
                    VIDEO_STUDIO_RENDER_TESTS: '1',
                    VIDEO_STUDIO_RENDER_TESTS_REQUIRED: '1',
                    CHROME_PATH: '/missing/chrome',
                },
                SpawnSync: () => ({ status: 0 }),
                ExistsSync: () => false,
                ResolveBrowserPath: () => undefined,
            }),
        ).toThrow(/Chrome binary not found at CHROME_PATH/);
    });

    it('should throw when VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1 and no Chromium binary can be resolved', () => {
        expect(() =>
            CheckCanRunRealRenderTests('sample.test', {
                Env: {
                    VIDEO_STUDIO_RENDER_TESTS: '1',
                    VIDEO_STUDIO_RENDER_TESTS_REQUIRED: '1',
                },
                SpawnSync: () => ({ status: 0 }),
                ExistsSync: () => true,
                ResolveBrowserPath: () => undefined,
            }),
        ).toThrow(/Chromium headless shell binary not found/);
    });

    it('should return true when all prerequisites are present', () => {
        expect(
            CheckCanRunRealRenderTests('sample.test', {
                Env: {
                    VIDEO_STUDIO_RENDER_TESTS: '1',
                    VIDEO_STUDIO_RENDER_TESTS_REQUIRED: '1',
                },
                SpawnSync: () => ({ status: 0 }),
                ExistsSync: () => true,
                ResolveBrowserPath: () => '/opt/puppeteer-cache/chrome-headless-shell-bin',
            }),
        ).toBe(true);
    });
});
