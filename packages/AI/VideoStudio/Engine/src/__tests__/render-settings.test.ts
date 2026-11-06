import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mjCore from '@memberjunction/core';
import {
    DEFAULT_DOCKER_CPUS,
    DEFAULT_DOCKER_MEMORY_MB,
    DEFAULT_DOCKER_PIDS_LIMIT,
    DEFAULT_DOCKER_RENDER_IMAGE,
    DEFAULT_DOCKER_SHM_SIZE_MB,
    DEFAULT_RENDER_MAX_OUTPUT_BYTES,
    DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
    DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
    DEFAULT_RENDER_TIMEOUT_MS,
    DEFAULT_VIDEO_RENDER_DRIVER,
    ReadVideoRenderSettings,
    ReadVideoStudioOutputSettings,
    VIDEO_STUDIO_INLINE_MAX_BYTES,
} from '../index.js';

const DEFAULT_DOCKER_SETTINGS = {
    Image: DEFAULT_DOCKER_RENDER_IMAGE,
    Cpus: DEFAULT_DOCKER_CPUS,
    MemoryMb: DEFAULT_DOCKER_MEMORY_MB,
    PidsLimit: DEFAULT_DOCKER_PIDS_LIMIT,
    ShmSizeMb: DEFAULT_DOCKER_SHM_SIZE_MB,
};

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
                    maxOutputBytes: 104857600,
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
            MaxOutputBytes: 104_857_600,
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
            Docker: DEFAULT_DOCKER_SETTINGS,
        });
    });

    it('returns defaults when no mj.config.cjs or videoStudio.render section exists', async () => {
        const dir = await makeTempDir();
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), 'module.exports = {};\n', 'utf8');

        const settings = ReadVideoRenderSettings(dir);
        expect(settings.Docker.WorkspaceRoot).toBeUndefined();
        expect(settings).toEqual({
            Driver: DEFAULT_VIDEO_RENDER_DRIVER,
            MaxOutputBytes: DEFAULT_RENDER_MAX_OUTPUT_BYTES,
            Timeouts: {
                StartupMs: DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
                RenderMs: DEFAULT_RENDER_TIMEOUT_MS,
                RequestMs: DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
            },
            Local: {},
            Remote: {},
            Docker: DEFAULT_DOCKER_SETTINGS,
        });
    });

    it('logs warnings and falls back to defaults when values are invalid without throwing', async () => {
        const warnSpy = vi.spyOn(mjCore, 'LogWarning').mockImplementation(() => undefined);
        const dir = await makeTempDir();
        const badConfig = `module.exports = {
            videoStudio: {
                render: {
                    driver: '',
                    maxOutputBytes: -100,
                    timeouts: {
                        startupMs: -50,
                        renderMs: 'invalid',
                        requestMs: 0,
                    },
                    local: {
                        workerEntry: '   ',
                        maxOldSpaceMb: -1024,
                    },
                    docker: {
                        image: '   ',
                        workspaceRoot: '',
                        cpus: -2,
                        memoryMb: 0,
                        pidsLimit: -10,
                        shmSizeMb: 'invalid',
                    },
                },
            },
        };\n`;
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), badConfig, 'utf8');

        const settings = ReadVideoRenderSettings(dir);
        expect(settings).toEqual({
            Driver: DEFAULT_VIDEO_RENDER_DRIVER,
            MaxOutputBytes: DEFAULT_RENDER_MAX_OUTPUT_BYTES,
            Timeouts: {
                StartupMs: DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
                RenderMs: DEFAULT_RENDER_TIMEOUT_MS,
                RequestMs: DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
            },
            Local: {},
            Remote: {},
            Docker: DEFAULT_DOCKER_SETTINGS,
        });
        expect(warnSpy).toHaveBeenCalled();
    });

    it('reads videoStudio.render.docker from mj.config.cjs', async () => {
        const dir = await makeTempDir();
        const configContent = `module.exports = {
            videoStudio: {
                render: {
                    driver: 'Docker',
                    docker: {
                        image: 'custom-registry.example.com/mj-render:v2',
                        workspaceRoot: '/var/tmp/mj-render-workspaces',
                        cpus: 8,
                        memoryMb: 8192,
                        pidsLimit: 512,
                        shmSizeMb: 2048,
                    },
                },
            },
        };\n`;
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), configContent, 'utf8');

        const settings = ReadVideoRenderSettings(dir);
        expect(settings.Driver).toBe('Docker');
        expect(settings.Docker).toEqual({
            Image: 'custom-registry.example.com/mj-render:v2',
            WorkspaceRoot: '/var/tmp/mj-render-workspaces',
            Cpus: 8,
            MemoryMb: 8192,
            PidsLimit: 512,
            ShmSizeMb: 2048,
        });
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

    it('ReadVideoStudioOutputSettings: reads inlineMaxBytes from temp mj.config.cjs (outputs or render), defaults to 2 MB when absent, and logs a warning + uses default on invalid values', async () => {
        const customDir = await makeTempDir();
        await fs.writeFile(
            path.join(customDir, 'mj.config.cjs'),
            `module.exports = {
                videoStudio: {
                    outputs: {
                        inlineMaxBytes: 5 * 1024 * 1024,
                    },
                },
            };\n`,
            'utf8',
        );
        expect(ReadVideoStudioOutputSettings(customDir)).toEqual({
            InlineMaxBytes: 5 * 1024 * 1024,
        });

        const renderAliasDir = await makeTempDir();
        await fs.writeFile(
            path.join(renderAliasDir, 'mj.config.cjs'),
            `module.exports = {
                videoStudio: {
                    render: {
                        inlineMaxBytes: 4 * 1024 * 1024,
                    },
                },
            };\n`,
            'utf8',
        );
        expect(ReadVideoStudioOutputSettings(renderAliasDir)).toEqual({
            InlineMaxBytes: 4 * 1024 * 1024,
        });

        const absentDir = await makeTempDir();
        await fs.writeFile(path.join(absentDir, 'mj.config.cjs'), 'module.exports = {};\n', 'utf8');
        expect(ReadVideoStudioOutputSettings(absentDir)).toEqual({
            InlineMaxBytes: VIDEO_STUDIO_INLINE_MAX_BYTES,
        });
        expect(VIDEO_STUDIO_INLINE_MAX_BYTES).toBe(2 * 1024 * 1024);

        const warnSpy = vi.spyOn(mjCore, 'LogWarning').mockImplementation(() => undefined);
        const badDir = await makeTempDir();
        await fs.writeFile(
            path.join(badDir, 'mj.config.cjs'),
            `module.exports = {
                videoStudio: {
                    outputs: {
                        inlineMaxBytes: -100,
                    },
                },
            };\n`,
            'utf8',
        );
        expect(ReadVideoStudioOutputSettings(badDir)).toEqual({
            InlineMaxBytes: VIDEO_STUDIO_INLINE_MAX_BYTES,
        });
        expect(warnSpy).toHaveBeenCalled();
    });

    it('logs one warning without leaking the raw token value when videoStudio.render.remote.token is not a string', async () => {
        const warnSpy = vi.spyOn(mjCore, 'LogWarning').mockImplementation(() => undefined);
        const dir = await makeTempDir();
        const configContent = `module.exports = {
            videoStudio: {
                render: {
                    driver: 'Remote',
                    remote: {
                        url: 'https://render.internal.example.com',
                        token: 98765432123,
                    },
                },
            },
        };\n`;
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), configContent, 'utf8');

        const settings = ReadVideoRenderSettings(dir);
        expect(settings.Remote).toEqual({
            Url: 'https://render.internal.example.com',
        });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const warnMsg = String(warnSpy.mock.calls[0]?.[0] ?? '');
        expect(warnMsg).toContain('videoStudio.render.remote.token');
        expect(warnMsg).not.toContain('98765432123');
    });

    it('reads videoStudio.render.remote.urls and clears VIDEO_STUDIO_RENDER_URL fallback when urls is configured without url', async () => {
        process.env.VIDEO_STUDIO_RENDER_URL = 'http://127.0.0.1:18081';
        const dir = await makeTempDir();
        const configContent = `module.exports = {
            videoStudio: {
                render: {
                    driver: 'Remote',
                    remote: {
                        urls: ['https://worker-1.internal.example.com', 'https://worker-2.internal.example.com'],
                        token: 'pool-token',
                    },
                },
            },
        };\n`;
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), configContent, 'utf8');

        const settings = ReadVideoRenderSettings(dir);
        expect(settings.Remote).toEqual({
            Urls: ['https://worker-1.internal.example.com', 'https://worker-2.internal.example.com'],
            Token: 'pool-token',
        });
    });
});


