import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as mjCore from '@memberjunction/core';
import {
    DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
    DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
    DEFAULT_RENDER_TIMEOUT_MS,
    DEFAULT_VIDEO_RENDER_DRIVER,
    ReadVideoRenderSettings,
} from '../index.js';

describe('ReadVideoRenderSettings', () => {
    const tempDirs: string[] = [];

    async function makeTempDir(): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-vs-render-settings-'));
        tempDirs.push(dir);
        return dir;
    }

    afterEach(async () => {
        vi.restoreAllMocks();
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop()!;
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    it('reads videoStudio.render from mj.config.cjs in a temp directory', async () => {
        const dir = await makeTempDir();
        const configContent = `module.exports = {
            videoStudio: {
                render: {
                    driver: 'LocalWorker',
                    timeouts: {
                        startupMs: 45000,
                        renderMs: 1200000,
                        requestMs: 300000,
                    },
                    local: {
                        workerEntry: '/custom/worker/main.js',
                        maxOldSpaceMb: 4096,
                    },
                },
            },
        };\n`;
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), configContent, 'utf8');

        const settings = ReadVideoRenderSettings(dir);
        expect(settings).toEqual({
            Driver: 'LocalWorker',
            Timeouts: {
                StartupMs: 45_000,
                RenderMs: 1_200_000,
                RequestMs: 300_000,
            },
            Local: {
                WorkerEntry: '/custom/worker/main.js',
                MaxOldSpaceMb: 4096,
            },
        });
    });

    it('returns defaults when no mj.config.cjs or videoStudio.render section exists', async () => {
        const dir = await makeTempDir();
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), 'module.exports = {};\n', 'utf8');

        const settings = ReadVideoRenderSettings(dir);
        expect(settings).toEqual({
            Driver: DEFAULT_VIDEO_RENDER_DRIVER,
            Timeouts: {
                StartupMs: DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
                RenderMs: DEFAULT_RENDER_TIMEOUT_MS,
                RequestMs: DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
            },
            Local: {},
        });
    });

    it('logs warnings and falls back to defaults when values are invalid without throwing', async () => {
        const warnSpy = vi.spyOn(mjCore, 'LogWarning').mockImplementation(() => undefined);
        const dir = await makeTempDir();
        const badConfig = `module.exports = {
            videoStudio: {
                render: {
                    driver: '',
                    timeouts: {
                        startupMs: -50,
                        renderMs: 'invalid',
                        requestMs: 0,
                    },
                    local: {
                        workerEntry: '   ',
                        maxOldSpaceMb: -1024,
                    },
                },
            },
        };\n`;
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), badConfig, 'utf8');

        const settings = ReadVideoRenderSettings(dir);
        expect(settings).toEqual({
            Driver: DEFAULT_VIDEO_RENDER_DRIVER,
            Timeouts: {
                StartupMs: DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
                RenderMs: DEFAULT_RENDER_TIMEOUT_MS,
                RequestMs: DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
            },
            Local: {},
        });
        expect(warnSpy).toHaveBeenCalled();
    });
});
