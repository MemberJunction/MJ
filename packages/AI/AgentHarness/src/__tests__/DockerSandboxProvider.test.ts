import { EventEmitter } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
    spawn: spawnMock,
}));

import { DockerSandboxProvider } from '../sandbox/DockerSandboxProvider.js';
import { LocalDirectorySandboxProvider } from '../sandbox/LocalDirectorySandboxProvider.js';

class MockDockerProcess extends EventEmitter {
    public stdin = new PassThrough();
    public stdout = new PassThrough();
    public stderr = new PassThrough();
    public exitCode: number | null = null;
    public killed = false;
    public kill = vi.fn(() => {
        this.killed = true;
        return true;
    });
}

describe('DockerSandboxProvider and LocalDirectorySandboxProvider', () => {
    let tempRoot: string;
    let spawnedCalls: Array<{ command: string; args: string[] }>;

    beforeEach(async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'mj-harness-docker-test-'));
        spawnedCalls = [];
        spawnMock.mockReset();
        spawnMock.mockImplementation((command: string, args: string[]) => {
            spawnedCalls.push({ command, args: [...args] });
            const proc = new MockDockerProcess();
            queueMicrotask(() => {
                proc.stdout.write('container-id-123\n');
                proc.stdout.end();
                proc.exitCode = 0;
                proc.emit('close', 0);
            });
            return proc;
        });
    });

    afterEach(async () => {
        await rm(tempRoot, { recursive: true, force: true });
    });

    it('produces the exact baseline docker run argv when no new limit or hardening options are set', async () => {
        const provider = new DockerSandboxProvider({
            hostRootPath: tempRoot,
            defaultImage: 'mj-video-render-worker:local',
        });

        const handle = await provider.Provision(
            { Scope: 'run', AgentId: 'video-studio-render', RunId: 'run-baseline' },
            { NetworkPolicy: 'none' },
        );

        const expectedHostDir = join(tempRoot, 'run', 'run-baseline');
        expect(handle.WorkspacePath).toBe('/workspace');
        expect(handle.HostWorkspacePath).toBe(expectedHostDir);

        const dirStat = await stat(expectedHostDir);
        expect(dirStat.isDirectory()).toBe(true);

        expect(spawnedCalls).toHaveLength(1);
        expect(spawnedCalls[0]?.command).toBe('docker');
        expect(spawnedCalls[0]?.args).toEqual([
            'run',
            '--detach',
            '--rm',
            '--name',
            'mj-harness-run-baseline',
            '--volume',
            `${expectedHostDir}:/workspace`,
            '--workdir',
            '/workspace',
            '--network',
            'none',
            'mj-video-render-worker:local',
            'sleep',
            'infinity',
        ]);

        await provider.Finalize(handle, 'success');
    });

    it('maps all limit and hardening options once before the image while preserving --network none', async () => {
        const provider = new DockerSandboxProvider({
            hostRootPath: tempRoot,
        });

        const handle = await provider.Provision(
            { Scope: 'run', AgentId: 'video-studio-render', RunId: 'run-hardened' },
            {
                NetworkPolicy: 'none',
                Image: 'mj-video-render-worker:local',
                Cpus: 2,
                MemoryMb: 4096,
                PidsLimit: 512,
                ShmSizeMb: 1024,
                ReadOnlyRoot: true,
                User: '1000:1000',
                DropCapabilities: true,
            },
        );

        const expectedHostDir = join(tempRoot, 'run', 'run-hardened');
        expect(handle.HostWorkspacePath).toBe(expectedHostDir);

        expect(spawnedCalls).toHaveLength(1);
        const args = spawnedCalls[0]?.args ?? [];
        const imageIndex = args.indexOf('mj-video-render-worker:local');
        expect(imageIndex).toBeGreaterThan(0);

        const beforeImage = args.slice(0, imageIndex);
        expect(beforeImage).toContain('--network');
        expect(beforeImage[beforeImage.indexOf('--network') + 1]).toBe('none');

        const assertFlagPairOnce = (flag: string, value: string): void => {
            const occurrences = beforeImage.reduce<number[]>((acc, item, idx) => {
                if (item === flag) {
                    acc.push(idx);
                }
                return acc;
            }, []);
            expect(occurrences).toHaveLength(1);
            expect(beforeImage[occurrences[0]! + 1]).toBe(value);
        };

        assertFlagPairOnce('--cpus', '2');
        assertFlagPairOnce('--memory', '4096m');
        assertFlagPairOnce('--pids-limit', '512');
        assertFlagPairOnce('--shm-size', '1024m');
        assertFlagPairOnce('--tmpfs', '/tmp:rw,size=256m');
        assertFlagPairOnce('--user', '1000:1000');
        assertFlagPairOnce('--cap-drop', 'ALL');
        assertFlagPairOnce('--security-opt', 'no-new-privileges');
        expect(beforeImage.filter((item) => item === '--read-only')).toHaveLength(1);
        expect(args.slice(imageIndex)).toEqual([
            'mj-video-render-worker:local',
            'sleep',
            'infinity',
        ]);

        await provider.Finalize(handle, 'success');
    });

    it('sets HostWorkspacePath on LocalDirectorySandboxProvider handles and ignores container-only options', async () => {
        const provider = new LocalDirectorySandboxProvider(tempRoot);
        const handle = await provider.Provision(
            { Scope: 'run', AgentId: 'agent-1', RunId: 'local-run-1' },
            {
                NetworkPolicy: 'none',
                Cpus: 4,
                MemoryMb: 2048,
                ReadOnlyRoot: true,
                DropCapabilities: true,
            },
        );

        const expectedHostDir = join(tempRoot, 'run', 'local-run-1');
        expect(handle.WorkspacePath).toBe(expectedHostDir);
        expect(handle.HostWorkspacePath).toBe(expectedHostDir);

        const dirStat = await stat(expectedHostDir);
        expect(dirStat.isDirectory()).toBe(true);

        await provider.Finalize(handle, 'success');
    });
});
