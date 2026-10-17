import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    let savedRenderUrl: string | undefined;
    let savedRenderToken: string | undefined;

    async function makeTempDir(): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-vs-render-settings-'));
        tempDirs.push(dir);
        return dir;
    }

    beforeEach(() => {
        savedRenderUrl = process.env.VIDEO_STUDIO_RENDER_URL;
        savedRenderToken = process.env.VIDEO_STUDIO_RENDER_TOKEN;
        delete process.env.VIDEO_STUDIO_RENDER_URL;
        delete process.env.VIDEO_STUDIO_RENDER_TOKEN;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        if (savedRenderUrl === undefined) {
            delete process.env.VIDEO_STUDIO_RENDER_URL;
        } else {
            process.env.VIDEO_STUDIO_RENDER_URL = savedRenderUrl;
        }
        if (savedRenderToken === undefined) {
            delete process.env.VIDEO_STUDIO_RENDER_TOKEN;
        } else {
            process.env.VIDEO_STUDIO_RENDER_TOKEN = savedRenderToken;
        }
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
            Remote: {},
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
            Remote: {},
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
            Remote: {},
        });
        expect(warnSpy).toHaveBeenCalled();
    });

    it('reads videoStudio.render.remote from mj.config.cjs', async () => {
        const dir = await makeTempDir();
        const configContent = `module.exports = {
            videoStudio: {
                render: {
                    driver: 'Remote',
                    remote: {
                        url: 'https://render.internal.example.com',
                        token: 'cfg-secret-token',
                    },
                },
            },
        };\n`;
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), configContent, 'utf8');

        const settings = ReadVideoRenderSettings(dir);
        expect(settings.Driver).toBe('Remote');
        expect(settings.Remote).toEqual({
            Url: 'https://render.internal.example.com',
            Token: 'cfg-secret-token',
        });
    });

    it('falls back to VIDEO_STUDIO_RENDER_URL and VIDEO_STUDIO_RENDER_TOKEN env vars, and config beats env', async () => {
        process.env.VIDEO_STUDIO_RENDER_URL = 'http://127.0.0.1:18081';
        process.env.VIDEO_STUDIO_RENDER_TOKEN = 'env-secret-token';

        const emptyDir = await makeTempDir();
        await fs.writeFile(path.join(emptyDir, 'mj.config.cjs'), 'module.exports = {};\n', 'utf8');

        const envSettings = ReadVideoRenderSettings(emptyDir);
        expect(envSettings.Remote).toEqual({
            Url: 'http://127.0.0.1:18081',
            Token: 'env-secret-token',
        });

        const overrideDir = await makeTempDir();
        const overrideConfig = `module.exports = {
            videoStudio: {
                render: {
                    driver: 'Remote',
                    remote: {
                        url: 'https://config-wins.example.com',
                        token: 'config-wins-token',
                    },
                },
            },
        };\n`;
        await fs.writeFile(path.join(overrideDir, 'mj.config.cjs'), overrideConfig, 'utf8');

        const mergedSettings = ReadVideoRenderSettings(overrideDir);
        expect(mergedSettings.Remote).toEqual({
            Url: 'https://config-wins.example.com',
            Token: 'config-wins-token',
        });
    });
});
