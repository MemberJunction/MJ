import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mjCore from '@memberjunction/core';
import {
    FakeRenderDriver,
    LOCAL_WORKER_NETWORK_WARNING,
    LocalWorkerRenderDriver,
    ResetLocalWorkerWarningState,
    VideoRenderEngine,
    VideoRenderError,
} from '../index.js';

describe('VideoRenderEngine', () => {
    const tempDirs: string[] = [];

    async function makeTempDirWithConfig(jsBody: string): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-vs-engine-test-'));
        tempDirs.push(dir);
        await fs.writeFile(path.join(dir, 'mj.config.cjs'), jsBody, 'utf8');
        return dir;
    }

    beforeEach(async () => {
        ResetLocalWorkerWarningState();
        await VideoRenderEngine.Instance.Shutdown();
        VideoRenderEngine.Instance.SetSettingsSearchDir(undefined);
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await VideoRenderEngine.Instance.Shutdown();
        VideoRenderEngine.Instance.SetSettingsSearchDir(undefined);
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop()!;
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    it('resolves LocalWorkerRenderDriver by default without spawning a process, exposes IsNetworkIsolated === false, and logs LOCAL_WORKER_NETWORK_WARNING once per process', async () => {
        const warnSpy = vi.spyOn(mjCore, 'LogWarning').mockImplementation(() => undefined);
        const dir = await makeTempDirWithConfig('module.exports = {};\n');
        VideoRenderEngine.Instance.SetSettingsSearchDir(dir);

        const driver = VideoRenderEngine.Instance.Driver;
        expect(driver).toBeInstanceOf(LocalWorkerRenderDriver);
        expect(driver.IsNetworkIsolated).toBe(false);
        expect((driver as LocalWorkerRenderDriver).ProcessId).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(LOCAL_WORKER_NETWORK_WARNING);

        // Shutting down and re-resolving LocalWorker in the same process does not re-log the warning
        await VideoRenderEngine.Instance.Shutdown();
        const secondDriver = VideoRenderEngine.Instance.Driver;
        expect(secondDriver).toBeInstanceOf(LocalWorkerRenderDriver);
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('throws VideoRenderError with Code === UnknownDriver when an unknown driver name is configured', async () => {
        const dir = await makeTempDirWithConfig(
            `module.exports = { videoStudio: { render: { driver: 'NonExistentDriver' } } };\n`,
        );
        VideoRenderEngine.Instance.SetSettingsSearchDir(dir);

        let caught: unknown;
        try {
            void VideoRenderEngine.Instance.Driver;
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(VideoRenderError);
        const vErr = caught as VideoRenderError;
        expect(vErr.Code).toBe('UnknownDriver');
        expect(vErr.message).toContain('NonExistentDriver');
    });

    it('UseDriver overrides the resolved driver and Shutdown calls the active driver Shutdown once', async () => {
        const fakeDriver = new FakeRenderDriver();
        const shutdownSpy = vi.spyOn(fakeDriver, 'Shutdown');

        VideoRenderEngine.Instance.UseDriver(fakeDriver);
        expect(VideoRenderEngine.Instance.Driver).toBe(fakeDriver);

        await VideoRenderEngine.Instance.Shutdown();
        await VideoRenderEngine.Instance.Shutdown();
        expect(shutdownSpy).toHaveBeenCalledTimes(1);
    });
});
