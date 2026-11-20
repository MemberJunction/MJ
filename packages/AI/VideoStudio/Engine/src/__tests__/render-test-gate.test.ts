import { describe, expect, it, vi } from 'vitest';
import {
    CheckCanRunRealDockerTests,
    CheckCanRunRealRenderTests,
} from './render-test-gate.js';

describe('CheckCanRunRealRenderTests', () => {
    it('should return false when VIDEO_STUDIO_RENDER_TESTS is unset and not required, and throw when required', () => {
        const log = vi.fn();
        expect(
            CheckCanRunRealRenderTests('local-worker.test', {
                Env: {},
                SpawnSync: () => ({ status: 0 }),
                ExistsSync: () => true,
                ResolveBrowserPath: () => '/usr/bin/chromium',
                Log: log,
            }),
        ).toBe(false);

        expect(() =>
            CheckCanRunRealRenderTests('local-worker.test', {
                Env: { VIDEO_STUDIO_RENDER_TESTS_REQUIRED: '1' },
                SpawnSync: () => ({ status: 0 }),
                ExistsSync: () => true,
                ResolveBrowserPath: () => '/usr/bin/chromium',
            }),
        ).toThrow(/VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1/);
    });

    it('should throw when VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1 and ffmpeg or Chrome is missing', () => {
        expect(() =>
            CheckCanRunRealRenderTests('local-worker.test', {
                Env: {
                    VIDEO_STUDIO_RENDER_TESTS: '1',
                    VIDEO_STUDIO_RENDER_TESTS_REQUIRED: '1',
                },
                SpawnSync: () => ({ status: 1 }),
                ExistsSync: () => true,
                ResolveBrowserPath: () => '/usr/bin/chromium',
            }),
        ).toThrow(/ffmpeg binary not found on PATH/);

        expect(() =>
            CheckCanRunRealRenderTests('local-worker.test', {
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
            CheckCanRunRealRenderTests('local-worker.test', {
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

describe('CheckCanRunRealDockerTests', () => {
    it('should return false when VIDEO_STUDIO_DOCKER_TESTS is unset and not required, and throw when required', () => {
        const log = vi.fn();
        expect(
            CheckCanRunRealDockerTests('docker.test', 'mj-video-render-worker:local', {
                Env: {},
                SpawnSync: () => ({ status: 0 }),
                Log: log,
            }),
        ).toBe(false);

        expect(() =>
            CheckCanRunRealDockerTests('docker.test', 'mj-video-render-worker:local', {
                Env: { VIDEO_STUDIO_DOCKER_TESTS_REQUIRED: '1' },
                SpawnSync: () => ({ status: 0 }),
            }),
        ).toThrow(/Required Docker render suite cannot be skipped/);
    });

    it('should throw when required and the Docker image is missing', () => {
        expect(() =>
            CheckCanRunRealDockerTests('docker.test', 'mj-video-render-worker:local', {
                Env: {
                    VIDEO_STUDIO_DOCKER_TESTS: '1',
                    VIDEO_STUDIO_RENDER_TESTS_REQUIRED: '1',
                },
                SpawnSync: () => ({ status: 1 }),
            }),
        ).toThrow(/Docker image 'mj-video-render-worker:local' is missing/);
    });

    it('should return true when VIDEO_STUDIO_DOCKER_TESTS=1 and the Docker image exists', () => {
        expect(
            CheckCanRunRealDockerTests('docker.test', 'mj-video-render-worker:local', {
                Env: {
                    VIDEO_STUDIO_DOCKER_TESTS: '1',
                    VIDEO_STUDIO_RENDER_TESTS_REQUIRED: '1',
                },
                SpawnSync: () => ({ status: 0 }),
            }),
        ).toBe(true);
    });
});
