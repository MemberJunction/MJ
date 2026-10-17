import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough, Readable } from 'node:stream';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mjCore from '@memberjunction/core';
import type {
    HarnessProcess,
    HarnessProcessSpec,
    ISandboxProvider,
    SandboxConfig,
    SandboxExecutor,
    SandboxHandle,
    WorkspaceKey,
} from '@memberjunction/ai-agent-harness';
import { FakeRenderBackend, RunOneShot } from '@memberjunction/video-studio-render-worker';
import {
    DEFAULT_DOCKER_CPUS,
    DEFAULT_DOCKER_MEMORY_MB,
    DEFAULT_DOCKER_PIDS_LIMIT,
    DEFAULT_DOCKER_RENDER_IMAGE,
    DEFAULT_DOCKER_SHM_SIZE_MB,
    DEFAULT_DOCKER_WORKSPACE_ROOT,
    DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
    DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
    DEFAULT_RENDER_TIMEOUT_MS,
    DOCKER_RENDER_IMAGE_BUILD_COMMAND,
    DockerRenderDriver,
    LOCAL_WORKER_NETWORK_WARNING,
    ReadVideoRenderSettings,
    VideoRenderEngine,
    VideoRenderError,
    type VideoRenderSettings,
} from '../index.js';
import {
    CreateHangRenderRequest,
    CreateMinimalRenderRequest,
    CreateRemoteUrlBundle,
    MINIMAL_BUNDLE_DURATION_SECONDS,
    MINIMAL_BUNDLE_FPS,
    MINIMAL_BUNDLE_HEIGHT,
    MINIMAL_BUNDLE_WIDTH,
} from './fixtures/minimal-bundle.js';
import { DescribeRenderDriverContract } from './render-driver-contract.js';

type SandboxOutcome = 'success' | 'failure' | 'cancelled';

interface RecordedProvision {
    Key: WorkspaceKey;
    Config: SandboxConfig;
}

interface RecordedFinalization {
    Handle: SandboxHandle;
    Outcome: SandboxOutcome;
}

async function* streamToLines(stream: Readable): AsyncIterable<string> {
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
        yield line;
    }
}

class InProcessOneShotSandboxProvider implements ISandboxProvider {
    public readonly Provisions: RecordedProvision[] = [];
    public readonly ProcessSpecs: HarnessProcessSpec[] = [];
    public readonly Finalizations: RecordedFinalization[] = [];
    public readonly TempDirs: string[] = [];

    private readonly stepDelayMs: number;
    private readonly failProvisionWithError?: Error;

    public constructor(options?: { StepDelayMs?: number; FailProvisionWithError?: Error }) {
        this.stepDelayMs = options?.StepDelayMs ?? 15;
        this.failProvisionWithError = options?.FailProvisionWithError;
    }

    public async Provision(key: WorkspaceKey, config: SandboxConfig): Promise<SandboxHandle> {
        this.Provisions.push({ Key: key, Config: config });
        if (this.failProvisionWithError) {
            throw this.failProvisionWithError;
        }

        const hostWorkspace = await fs.mkdtemp(
            path.join(os.tmpdir(), 'mj-vs-fake-docker-workspace-'),
        );
        this.TempDirs.push(hostWorkspace);

        const executor: SandboxExecutor = {
            Run: (spec: HarnessProcessSpec): HarnessProcess => {
                this.ProcessSpecs.push(spec);
                return this.runTranslatedOneShot(hostWorkspace, spec);
            },
        };

        return {
            WorkspacePath: '/workspace',
            HostWorkspacePath: hostWorkspace,
            Key: key,
            Ephemeral: true,
            Executor: executor,
        };
    }

    public async Finalize(handle: SandboxHandle, outcome: SandboxOutcome): Promise<void> {
        this.Finalizations.push({ Handle: handle, Outcome: outcome });
        if (handle.HostWorkspacePath) {
            await fs.rm(handle.HostWorkspacePath, { recursive: true, force: true });
        }
    }

    public async CleanupAll(): Promise<void> {
        while (this.TempDirs.length > 0) {
            const dir = this.TempDirs.pop()!;
            await fs.rm(dir, { recursive: true, force: true });
        }
    }

    private runTranslatedOneShot(
        hostWorkspace: string,
        spec: HarnessProcessSpec,
    ): HarnessProcess {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const stdin = new PassThrough();
        const abortController = new AbortController();

        const translatedArgs = spec.Args.slice(1).map((arg) => {
            if (arg === '/workspace') {
                return hostWorkspace;
            }
            if (arg.startsWith('/workspace/')) {
                return path.join(hostWorkspace, arg.slice('/workspace/'.length));
            }
            return arg;
        });

        let killed = false;
        const triggerKill = (): void => {
            if (!killed) {
                killed = true;
                abortController.abort();
            }
        };

        if (spec.CancellationToken) {
            if (spec.CancellationToken.aborted) {
                triggerKill();
            } else {
                spec.CancellationToken.addEventListener('abort', triggerKill, { once: true });
            }
        }

        const backend = new FakeRenderBackend({ StepDelayMs: this.stepDelayMs });
        const exitCode = (async (): Promise<number | null> => {
            try {
                const code = await RunOneShot(translatedArgs, backend, stdout, {
                    Stderr: stderr,
                    Stdin: stdin,
                    Signal: abortController.signal,
                });
                return killed ? 130 : code;
            } finally {
                stdout.end();
                stderr.end();
            }
        })();

        return {
            Stdin: stdin,
            Stdout: streamToLines(stdout),
            Stderr: streamToLines(stderr),
            ExitCode: exitCode,
            Kill: triggerKill,
        };
    }
}

function makeDockerSettings(overrides?: Partial<VideoRenderSettings>): VideoRenderSettings {
    return {
        Driver: 'Docker',
        Timeouts: {
            StartupMs: DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
            RenderMs: DEFAULT_RENDER_TIMEOUT_MS,
            RequestMs: DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
        },
        Local: {},
        Remote: {},
        Docker: {
            Image: DEFAULT_DOCKER_RENDER_IMAGE,
            WorkspaceRoot: DEFAULT_DOCKER_WORKSPACE_ROOT,
            Cpus: DEFAULT_DOCKER_CPUS,
            MemoryMb: DEFAULT_DOCKER_MEMORY_MB,
            PidsLimit: DEFAULT_DOCKER_PIDS_LIMIT,
            ShmSizeMb: DEFAULT_DOCKER_SHM_SIZE_MB,
        },
        ...overrides,
    };
}

describe('DockerRenderDriver (fake ISandboxProvider + RunOneShot)', () => {
    const providers: InProcessOneShotSandboxProvider[] = [];

    afterEach(async () => {
        while (providers.length > 0) {
            const p = providers.pop()!;
            await p.CleanupAll();
        }
    });

    DescribeRenderDriverContract('DockerRenderDriver (fake ISandboxProvider + RunOneShot)', () => {
        const provider = new InProcessOneShotSandboxProvider({ StepDelayMs: 15 });
        providers.push(provider);
        return new DockerRenderDriver(makeDockerSettings(), provider);
    });
});

describe('DockerRenderDriver isolation, hardening, and lifecycle unit tests', () => {
    const tempDirs: string[] = [];
    const providers: InProcessOneShotSandboxProvider[] = [];

    async function makeTempDir(): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-vs-docker-driver-test-'));
        tempDirs.push(dir);
        return dir;
    }

    function createProvider(options?: {
        StepDelayMs?: number;
        FailProvisionWithError?: Error;
    }): InProcessOneShotSandboxProvider {
        const p = new InProcessOneShotSandboxProvider(options);
        providers.push(p);
        return p;
    }

    beforeEach(() => {
        process.env.SUPER_SECRET_PARENT_ENV_VAR = 'top-secret-value-never-pass-to-container';
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        delete process.env.SUPER_SECRET_PARENT_ENV_VAR;
        await VideoRenderEngine.Instance.Shutdown();
        VideoRenderEngine.Instance.SetSettingsSearchDir(undefined);
        while (providers.length > 0) {
            const p = providers.pop()!;
            await p.CleanupAll();
        }
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop()!;
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    it('resolves DockerRenderDriver from VideoRenderEngine when driver is Docker, sets IsNetworkIsolated === true, and does NOT log LOCAL_WORKER_NETWORK_WARNING', async () => {
        const warnSpy = vi.spyOn(mjCore, 'LogWarning').mockImplementation(() => undefined);
        const dir = await makeTempDir();
        await fs.writeFile(
            path.join(dir, 'mj.config.cjs'),
            `module.exports = { videoStudio: { render: { driver: 'Docker' } } };\n`,
            'utf8',
        );

        VideoRenderEngine.Instance.SetSettingsSearchDir(dir);
        const driver = VideoRenderEngine.Instance.Driver;

        expect(driver).toBeInstanceOf(DockerRenderDriver);
        expect(driver.IsNetworkIsolated).toBe(true);
        const warningMessages = warnSpy.mock.calls.map((c) => String(c[0]));
        expect(warningMessages.some((m) => m.includes(LOCAL_WORKER_NETWORK_WARNING))).toBe(false);
    });

    it('passes hardened SandboxConfig to Provision (NetworkPolicy: none, ReadOnlyRoot: true, DropCapabilities: true, resource limits, and platform User)', async () => {
        const provider = createProvider();
        const settings = makeDockerSettings({
            Docker: {
                Image: 'custom-render-worker:test',
                WorkspaceRoot: '/tmp/custom-ws',
                Cpus: 6,
                MemoryMb: 6144,
                PidsLimit: 300,
                ShmSizeMb: 1536,
            },
        });
        const driver = new DockerRenderDriver(settings, provider);

        const health = await driver.Health();
        expect(health.Healthy).toBe(true);
        expect(provider.Provisions).toHaveLength(1);

        const { Key: key, Config: config } = provider.Provisions[0]!;
        expect(key.Scope).toBe('run');
        expect(config.NetworkPolicy).toBe('none');
        expect(config.ReadOnlyRoot).toBe(true);
        expect(config.DropCapabilities).toBe(true);
        expect(config.Image).toBe('custom-render-worker:test');
        expect(config.Cpus).toBe(6);
        expect(config.MemoryMb).toBe(6144);
        expect(config.PidsLimit).toBe(300);
        expect(config.ShmSizeMb).toBe(1536);

        if (
            process.platform === 'linux' &&
            typeof process.getuid === 'function' &&
            typeof process.getgid === 'function'
        ) {
            expect(config.User).toBe(`${process.getuid()}:${process.getgid()}`);
        } else {
            expect(config.User).toBeUndefined();
        }
    });

    it('passes ONLY HOME and TMPDIR in Environment to Executor.Run (no parent process.env secrets)', async () => {
        const provider = createProvider();
        const driver = new DockerRenderDriver(makeDockerSettings(), provider);

        await driver.Health();
        expect(provider.ProcessSpecs).toHaveLength(1);

        const env = provider.ProcessSpecs[0]!.Environment;
        expect(Object.keys(env).sort()).toEqual(['HOME', 'TMPDIR']);
        expect(env).toEqual({
            HOME: '/workspace/home',
            TMPDIR: '/workspace/tmp',
        });
        expect(env.SUPER_SECRET_PARENT_ENV_VAR).toBeUndefined();
    });

    it('calls Finalize exactly once with success on a clean run, failure on a lint-blocked run, and cancelled on an aborted run', async () => {
        const provider = createProvider({ StepDelayMs: 25 });
        const driver = new DockerRenderDriver(makeDockerSettings(), provider);

        // 1. Clean run -> 'success'
        const okResult = await driver.Render(CreateMinimalRenderRequest());
        expect(Buffer.from(okResult.Video.subarray(4, 8)).toString('ascii')).toBe('ftyp');
        expect(provider.Finalizations).toHaveLength(1);
        expect(provider.Finalizations[0]!.Outcome).toBe('success');

        // 2. Lint-blocked run -> 'failure'
        await expect(
            driver.Render({
                Bundle: CreateRemoteUrlBundle(),
                Width: MINIMAL_BUNDLE_WIDTH,
                Height: MINIMAL_BUNDLE_HEIGHT,
                Fps: MINIMAL_BUNDLE_FPS,
                DurationSeconds: MINIMAL_BUNDLE_DURATION_SECONDS,
                Quality: 'standard',
            }),
        ).rejects.toMatchObject({
            name: 'VideoRenderError',
            Code: 'LintBlocked',
        });
        expect(provider.Finalizations).toHaveLength(2);
        expect(provider.Finalizations[1]!.Outcome).toBe('failure');

        // 3. Aborted run -> 'cancelled'
        const controller = new AbortController();
        const renderPromise = driver.Render(
            CreateHangRenderRequest(),
            () => {
                if (!controller.signal.aborted) {
                    controller.abort();
                }
            },
            controller.signal,
        );
        await expect(renderPromise).rejects.toMatchObject({
            name: 'AbortError',
        });
        expect(provider.Finalizations).toHaveLength(3);
        expect(provider.Finalizations[2]!.Outcome).toBe('cancelled');
    });

    it('when Provision rejects, Health() returns Healthy: false (never throws) with the docker build command in Errors, and Render() rejects with WorkerUnavailable naming the docker build command', async () => {
        const provider = createProvider({
            FailProvisionWithError: new Error(
                'Unable to find image mj-video-render-worker:local locally',
            ),
        });
        const driver = new DockerRenderDriver(makeDockerSettings(), provider);

        const health = await driver.Health();
        expect(health.Healthy).toBe(false);
        expect(health.Errors.join(' ')).toContain(DOCKER_RENDER_IMAGE_BUILD_COMMAND);

        let caught: unknown;
        try {
            await driver.Render(CreateMinimalRenderRequest());
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(VideoRenderError);
        const renderErr = caught as VideoRenderError;
        expect(renderErr.Code).toBe('WorkerUnavailable');
        expect(renderErr.message).toContain(DOCKER_RENDER_IMAGE_BUILD_COMMAND);
    });

    it('closing proc.Stdin terminates the in-container one-shot process (ExitCode !== 0 and Finalize called)', async () => {
        let capturedStdin: PassThrough | undefined;
        let capturedExitCode: Promise<number | null> | undefined;
        const finalizations: RecordedFinalization[] = [];

        const stdinClosingProvider: ISandboxProvider = {
            Provision: async (key: WorkspaceKey): Promise<SandboxHandle> => {
                const hostWorkspace = await fs.mkdtemp(
                    path.join(os.tmpdir(), 'mj-vs-stdin-close-ws-'),
                );
                tempDirs.push(hostWorkspace);

                const executor: SandboxExecutor = {
                    Run: (spec: HarnessProcessSpec): HarnessProcess => {
                        const stdout = new PassThrough();
                        const stderr = new PassThrough();
                        const stdin = new PassThrough();
                        capturedStdin = stdin;

                        const translatedArgs = spec.Args.slice(1).map((arg) =>
                            arg.startsWith('/workspace/')
                                ? path.join(hostWorkspace, arg.slice('/workspace/'.length))
                                : arg,
                        );

                        const backend = new FakeRenderBackend({ StepDelayMs: 100 });
                        const exitCode = (async (): Promise<number | null> => {
                            try {
                                return await RunOneShot(translatedArgs, backend, stdout, {
                                    Stderr: stderr,
                                    Stdin: stdin,
                                });
                            } finally {
                                stdout.end();
                                stderr.end();
                            }
                        })();
                        capturedExitCode = exitCode;

                        // Close stdin shortly after start to simulate parent container exec disconnect
                        setTimeout(() => {
                            stdin.end();
                        }, 30);

                        return {
                            Stdin: stdin,
                            Stdout: streamToLines(stdout),
                            Stderr: streamToLines(stderr),
                            ExitCode: exitCode,
                            Kill: () => stdin.end(),
                        };
                    },
                };

                return {
                    WorkspacePath: '/workspace',
                    HostWorkspacePath: hostWorkspace,
                    Key: key,
                    Ephemeral: true,
                    Executor: executor,
                };
            },
            Finalize: async (handle, outcome) => {
                finalizations.push({ Handle: handle, Outcome: outcome });
                if (handle.HostWorkspacePath) {
                    await fs.rm(handle.HostWorkspacePath, { recursive: true, force: true });
                }
            },
        };

        const driver = new DockerRenderDriver(makeDockerSettings(), stdinClosingProvider);
        await expect(driver.Render(CreateHangRenderRequest())).rejects.toThrow();

        expect(capturedStdin).toBeDefined();
        expect(capturedExitCode).toBeDefined();
        const code = await capturedExitCode!;
        expect(code).not.toBe(0);
        expect(finalizations).toHaveLength(1);
    });

    it('rejects with Code === "Internal" and never returns host file bytes when out/video.mp4 is a symlink to a host file', async () => {
        const secretDir = await makeTempDir();
        const secretFilePath = path.join(secretDir, 'host-secret.env');
        await fs.writeFile(secretFilePath, 'DB_PASSWORD=hunter2', 'utf8');

        const symlinkFileProvider: ISandboxProvider = {
            Provision: async (key: WorkspaceKey): Promise<SandboxHandle> => {
                const hostWorkspace = await fs.mkdtemp(
                    path.join(os.tmpdir(), 'mj-vs-symlink-file-ws-'),
                );
                tempDirs.push(hostWorkspace);

                const executor: SandboxExecutor = {
                    Run: (): HarnessProcess => {
                        const stdout = new PassThrough();
                        const stderr = new PassThrough();
                        const stdin = new PassThrough();

                        const exitCode = (async (): Promise<number | null> => {
                            try {
                                const outDir = path.join(hostWorkspace, 'out');
                                await fs.writeFile(
                                    path.join(outDir, 'result.json'),
                                    JSON.stringify({
                                        Format: 'mp4',
                                        VideoID: 'video.mp4',
                                        VideoSizeBytes: 19,
                                        MimeType: 'video/mp4',
                                        Width: MINIMAL_BUNDLE_WIDTH,
                                        Height: MINIMAL_BUNDLE_HEIGHT,
                                        Fps: MINIMAL_BUNDLE_FPS,
                                        DurationSeconds: MINIMAL_BUNDLE_DURATION_SECONDS,
                                        FrameCount: 60,
                                        HasAudio: false,
                                        RendererVersion: 'test',
                                        RenderDurationMs: 10,
                                    }),
                                    'utf8',
                                );
                                await fs.symlink(secretFilePath, path.join(outDir, 'video.mp4'));
                                return 0;
                            } finally {
                                stdout.end();
                                stderr.end();
                            }
                        })();

                        return {
                            Stdin: stdin,
                            Stdout: streamToLines(stdout),
                            Stderr: streamToLines(stderr),
                            ExitCode: exitCode,
                            Kill: () => stdin.end(),
                        };
                    },
                };

                return {
                    WorkspacePath: '/workspace',
                    HostWorkspacePath: hostWorkspace,
                    Key: key,
                    Ephemeral: true,
                    Executor: executor,
                };
            },
            Finalize: async (handle) => {
                if (handle.HostWorkspacePath) {
                    await fs.rm(handle.HostWorkspacePath, { recursive: true, force: true });
                }
            },
        };

        const driver = new DockerRenderDriver(makeDockerSettings(), symlinkFileProvider);
        let caught: unknown;
        try {
            await driver.Render(CreateMinimalRenderRequest());
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(VideoRenderError);
        const renderErr = caught as VideoRenderError;
        expect(renderErr.Code).toBe('Internal');
        expect(renderErr.message).not.toContain('hunter2');
    });

    it('rejects with Code === "Internal" and never returns host file bytes when out is replaced with a symlink to a host directory', async () => {
        const externalOutDir = await makeTempDir();
        await fs.writeFile(
            path.join(externalOutDir, 'result.json'),
            JSON.stringify({
                Format: 'mp4',
                VideoID: 'video.mp4',
                VideoSizeBytes: 19,
                MimeType: 'video/mp4',
                Width: MINIMAL_BUNDLE_WIDTH,
                Height: MINIMAL_BUNDLE_HEIGHT,
                Fps: MINIMAL_BUNDLE_FPS,
                DurationSeconds: MINIMAL_BUNDLE_DURATION_SECONDS,
                FrameCount: 60,
                HasAudio: false,
                RendererVersion: 'test',
                RenderDurationMs: 10,
            }),
            'utf8',
        );
        await fs.writeFile(path.join(externalOutDir, 'video.mp4'), 'DB_PASSWORD=hunter2', 'utf8');

        const symlinkDirProvider: ISandboxProvider = {
            Provision: async (key: WorkspaceKey): Promise<SandboxHandle> => {
                const hostWorkspace = await fs.mkdtemp(
                    path.join(os.tmpdir(), 'mj-vs-symlink-dir-ws-'),
                );
                tempDirs.push(hostWorkspace);

                const executor: SandboxExecutor = {
                    Run: (): HarnessProcess => {
                        const stdout = new PassThrough();
                        const stderr = new PassThrough();
                        const stdin = new PassThrough();

                        const exitCode = (async (): Promise<number | null> => {
                            try {
                                const outDir = path.join(hostWorkspace, 'out');
                                await fs.rm(outDir, { recursive: true, force: true });
                                await fs.symlink(externalOutDir, outDir);
                                return 0;
                            } finally {
                                stdout.end();
                                stderr.end();
                            }
                        })();

                        return {
                            Stdin: stdin,
                            Stdout: streamToLines(stdout),
                            Stderr: streamToLines(stderr),
                            ExitCode: exitCode,
                            Kill: () => stdin.end(),
                        };
                    },
                };

                return {
                    WorkspacePath: '/workspace',
                    HostWorkspacePath: hostWorkspace,
                    Key: key,
                    Ephemeral: true,
                    Executor: executor,
                };
            },
            Finalize: async (handle) => {
                if (handle.HostWorkspacePath) {
                    await fs.rm(handle.HostWorkspacePath, { recursive: true, force: true });
                }
            },
        };

        const driver = new DockerRenderDriver(makeDockerSettings(), symlinkDirProvider);
        let caught: unknown;
        try {
            await driver.Render(CreateMinimalRenderRequest());
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(VideoRenderError);
        const renderErr = caught as VideoRenderError;
        expect(renderErr.Code).toBe('Internal');
        expect(renderErr.message).not.toContain('hunter2');
    });

    it.runIf(process.platform === 'linux')(
        'chmods the per-run host workspace to 0o700 on Linux before writing request.json',
        async () => {
            let recordedMode: number | undefined;

            const modeRecordingProvider: ISandboxProvider = {
                Provision: async (key: WorkspaceKey): Promise<SandboxHandle> => {
                    const hostWorkspace = await fs.mkdtemp(
                        path.join(os.tmpdir(), 'mj-vs-linux-mode-ws-'),
                    );
                    await fs.chmod(hostWorkspace, 0o755);
                    tempDirs.push(hostWorkspace);

                    const executor: SandboxExecutor = {
                        Run: (): HarnessProcess => {
                            const stdout = new PassThrough();
                            const stderr = new PassThrough();
                            const stdin = new PassThrough();

                            const exitCode = (async (): Promise<number | null> => {
                                try {
                                    const stat = await fs.stat(hostWorkspace);
                                    recordedMode = stat.mode & 0o777;
                                    await fs.writeFile(
                                        path.join(hostWorkspace, 'out', 'result.json'),
                                        JSON.stringify({
                                            Healthy: true,
                                            NodeVersion: process.version,
                                            HyperFramesVersion: '0.1.0',
                                            Errors: [],
                                        }),
                                        'utf8',
                                    );
                                    return 0;
                                } finally {
                                    stdout.end();
                                    stderr.end();
                                }
                            })();

                            return {
                                Stdin: stdin,
                                Stdout: streamToLines(stdout),
                                Stderr: streamToLines(stderr),
                                ExitCode: exitCode,
                                Kill: () => stdin.end(),
                            };
                        },
                    };

                    return {
                        WorkspacePath: '/workspace',
                        HostWorkspacePath: hostWorkspace,
                        Key: key,
                        Ephemeral: true,
                        Executor: executor,
                    };
                },
                Finalize: async (handle) => {
                    if (handle.HostWorkspacePath) {
                        await fs.rm(handle.HostWorkspacePath, { recursive: true, force: true });
                    }
                },
            };

            const driver = new DockerRenderDriver(makeDockerSettings(), modeRecordingProvider);
            const health = await driver.Health();
            expect(health.Healthy).toBe(true);
            expect(recordedMode).toBe(0o700);
        },
    );

    it('stages outputs under 0o700 <HostWorkspacePath>.out/out, keeps <HostWorkspacePath>.out until Finalize runs, and removes it after Render resolves', async () => {
        let hostWorkspacePath = '';
        let resultExistsDuringFinalize = false;
        let safeOutRootModeDuringFinalize = 0;

        const baseProvider = createProvider();
        const orderingProvider: ISandboxProvider = {
            Provision: async (key, config) => {
                const handle = await baseProvider.Provision(key, config);
                hostWorkspacePath = handle.HostWorkspacePath ?? '';
                return handle;
            },
            Finalize: async (handle, outcome) => {
                const safeOutRoot = `${handle.HostWorkspacePath}.out`;
                const safeResultPath = path.join(safeOutRoot, 'out', 'result.json');
                const rootStat = await fs.stat(safeOutRoot);
                safeOutRootModeDuringFinalize = rootStat.mode & 0o777;
                const resultStat = await fs.stat(safeResultPath);
                resultExistsDuringFinalize = resultStat.isFile();
                await baseProvider.Finalize(handle, outcome);
            },
        };

        const driver = new DockerRenderDriver(makeDockerSettings(), orderingProvider);
        const res = await driver.Render(CreateMinimalRenderRequest());
        expect(res.Video.byteLength).toBeGreaterThan(0);
        expect(hostWorkspacePath).not.toBe('');
        expect(resultExistsDuringFinalize).toBe(true);
        expect(safeOutRootModeDuringFinalize).toBe(0o700);
        await expect(fs.stat(`${hostWorkspacePath}.out`)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('rejects oversized video output and VideoSizeBytes mismatches with Code === "Internal" before handle.readFile() is called', async () => {
        const probeDir = await makeTempDir();
        const probeFile = path.join(probeDir, 'probe.txt');
        await fs.writeFile(probeFile, 'probe', 'utf8');
        const probeHandle = await fs.open(probeFile, 'r');
        const fileHandleProto = Object.getPrototypeOf(probeHandle) as {
            readFile: (...args: unknown[]) => Promise<Buffer>;
        };
        await probeHandle.close();

        const origReadFile = fileHandleProto.readFile;
        const readContents: string[] = [];
        const readFileSpy = vi
            .spyOn(fileHandleProto, 'readFile')
            .mockImplementation(async function (this: unknown, ...args: unknown[]) {
                const buf = await origReadFile.apply(this, args);
                readContents.push(Buffer.from(buf).toString('utf8'));
                return buf;
            });

        const makeFakeVideoProvider = (videoBytes: Uint8Array, declaredVideoSizeBytes: number): ISandboxProvider => ({
            Provision: async (key: WorkspaceKey): Promise<SandboxHandle> => {
                const hostWorkspace = await fs.mkdtemp(
                    path.join(os.tmpdir(), 'mj-vs-size-cap-ws-'),
                );
                tempDirs.push(hostWorkspace);

                const executor: SandboxExecutor = {
                    Run: (): HarnessProcess => {
                        const stdout = new PassThrough();
                        const stderr = new PassThrough();
                        const stdin = new PassThrough();

                        const exitCode = (async (): Promise<number | null> => {
                            try {
                                const outDir = path.join(hostWorkspace, 'out');
                                await fs.writeFile(
                                    path.join(outDir, 'result.json'),
                                    JSON.stringify({
                                        Format: 'mp4',
                                        VideoID: 'video.mp4',
                                        VideoSizeBytes: declaredVideoSizeBytes,
                                        MimeType: 'video/mp4',
                                        Width: MINIMAL_BUNDLE_WIDTH,
                                        Height: MINIMAL_BUNDLE_HEIGHT,
                                        Fps: MINIMAL_BUNDLE_FPS,
                                        DurationSeconds: MINIMAL_BUNDLE_DURATION_SECONDS,
                                        FrameCount: 60,
                                        HasAudio: false,
                                        RendererVersion: 'test',
                                        RenderDurationMs: 10,
                                    }),
                                    'utf8',
                                );
                                await fs.writeFile(path.join(outDir, 'video.mp4'), videoBytes);
                                return 0;
                            } finally {
                                stdout.end();
                                stderr.end();
                            }
                        })();

                        return {
                            Stdin: stdin,
                            Stdout: streamToLines(stdout),
                            Stderr: streamToLines(stderr),
                            ExitCode: exitCode,
                            Kill: () => stdin.end(),
                        };
                    },
                };

                return {
                    WorkspacePath: '/workspace',
                    HostWorkspacePath: hostWorkspace,
                    Key: key,
                    Ephemeral: true,
                    Executor: executor,
                };
            },
            Finalize: async (handle) => {
                if (handle.HostWorkspacePath) {
                    await fs.rm(handle.HostWorkspacePath, { recursive: true, force: true });
                }
            },
        });

        // 1. Oversized output (128 bytes > MaxOutputBytes = 64 bytes)
        const oversizedBytes = Buffer.alloc(128, 0x41);
        const oversizedDriver = new DockerRenderDriver(
            makeDockerSettings({ MaxOutputBytes: 64 }),
            makeFakeVideoProvider(oversizedBytes, oversizedBytes.byteLength),
        );
        await expect(oversizedDriver.Render(CreateMinimalRenderRequest())).rejects.toMatchObject({
            name: 'VideoRenderError',
            Code: 'Internal',
        });
        // Only result.json was read; video.mp4 handle.readFile() was never called
        expect(readFileSpy).toHaveBeenCalledTimes(1);
        expect(readContents[0]).toContain('"Format":"mp4"');

        // 2. VideoSizeBytes mismatch (file is 32 bytes, metadata declares 48 bytes)
        readFileSpy.mockClear();
        readContents.length = 0;
        const mismatchBytes = Buffer.alloc(32, 0x42);
        const mismatchDriver = new DockerRenderDriver(
            makeDockerSettings({ MaxOutputBytes: 1024 }),
            makeFakeVideoProvider(mismatchBytes, 48),
        );
        await expect(mismatchDriver.Render(CreateMinimalRenderRequest())).rejects.toMatchObject({
            name: 'VideoRenderError',
            Code: 'Internal',
        });
        expect(readFileSpy).toHaveBeenCalledTimes(1);
        expect(readContents[0]).toContain('"Format":"mp4"');

        // 3. Image-carrying JSON output (CaptureStills > 1 MiB) uses MaxOutputBytes instead of the 1 MiB JSON cap
        const largeBase64Still = Buffer.alloc(900_000, 0x55).toString('base64'); // ~1.2 MB base64 string (> 1 MiB)
        const makeLargeStillsProvider = (): ISandboxProvider => ({
            Provision: async (key: WorkspaceKey): Promise<SandboxHandle> => {
                const hostWorkspace = await fs.mkdtemp(
                    path.join(os.tmpdir(), 'mj-vs-large-stills-ws-'),
                );
                tempDirs.push(hostWorkspace);
                return {
                    WorkspacePath: '/workspace',
                    HostWorkspacePath: hostWorkspace,
                    Key: key,
                    Ephemeral: true,
                    Executor: {
                        Run: (): HarnessProcess => {
                            const stdout = new PassThrough();
                            const stderr = new PassThrough();
                            const stdin = new PassThrough();
                            const exitCode = (async (): Promise<number | null> => {
                                try {
                                    await fs.writeFile(
                                        path.join(hostWorkspace, 'out', 'result.json'),
                                        JSON.stringify({
                                            Stills: [
                                                {
                                                    Key: 'frame-0',
                                                    TimestampSeconds: 0,
                                                    FrameIndex: 0,
                                                    Width: MINIMAL_BUNDLE_WIDTH,
                                                    Height: MINIMAL_BUNDLE_HEIGHT,
                                                    MimeType: 'image/png',
                                                    ImageBase64: largeBase64Still,
                                                },
                                            ],
                                            CaptureDurationMs: 5,
                                        }),
                                        'utf8',
                                    );
                                    return 0;
                                } finally {
                                    stdout.end();
                                    stderr.end();
                                }
                            })();
                            return {
                                Stdin: stdin,
                                Stdout: streamToLines(stdout),
                                Stderr: streamToLines(stderr),
                                ExitCode: exitCode,
                                Kill: () => stdin.end(),
                            };
                        },
                    },
                };
            },
            Finalize: async (handle) => {
                if (handle.HostWorkspacePath) {
                    await fs.rm(handle.HostWorkspacePath, { recursive: true, force: true });
                }
            },
        });

        const stillsOkDriver = new DockerRenderDriver(
            makeDockerSettings({ MaxOutputBytes: 4 * 1024 * 1024 }),
            makeLargeStillsProvider(),
        );
        const stillsRes = await stillsOkDriver.CaptureStills({
            Bundle: CreateMinimalRenderRequest().Bundle,
            Width: MINIMAL_BUNDLE_WIDTH,
            Height: MINIMAL_BUNDLE_HEIGHT,
            Points: [{ Key: 'frame-0', TimestampSeconds: 0, Role: 'Custom', Label: 'Frame 0' }],
        });
        expect(stillsRes.Stills).toHaveLength(1);
        expect(stillsRes.Stills[0]!.ImageBase64.length).toBeGreaterThan(1024 * 1024);

        readFileSpy.mockClear();
        const stillsTooBigDriver = new DockerRenderDriver(
            makeDockerSettings({ MaxOutputBytes: 512 * 1024 }),
            makeLargeStillsProvider(),
        );
        await expect(
            stillsTooBigDriver.CaptureStills({
                Bundle: CreateMinimalRenderRequest().Bundle,
                Width: MINIMAL_BUNDLE_WIDTH,
                Height: MINIMAL_BUNDLE_HEIGHT,
                Points: [{ Key: 'frame-0', TimestampSeconds: 0, Role: 'Custom', Label: 'Frame 0' }],
            }),
        ).rejects.toMatchObject({
            name: 'VideoRenderError',
            Code: 'Internal',
        });
        expect(readFileSpy).toHaveBeenCalledTimes(0);
    });

    it('fails closed on Windows (process.platform === "win32") naming the Remote driver without starting any container', async () => {
        const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        try {
            const provider = createProvider();
            const driver = new DockerRenderDriver(makeDockerSettings(), provider);

            await expect(driver.Render(CreateMinimalRenderRequest())).rejects.toMatchObject({
                name: 'VideoRenderError',
                Code: 'WorkerUnavailable',
                message: expect.stringContaining('Remote'),
            });

            const health = await driver.Health();
            expect(health.Healthy).toBe(false);
            expect(health.Errors.join(' ')).toContain('Remote');
            expect(provider.Provisions).toHaveLength(0);
        } finally {
            platformSpy.mockRestore();
        }
    });

    it('creates and reuses one per-process 0o700 mkdtemp workspace root when WorkspaceRoot is omitted, and uses configured WorkspaceRoot as-is', async () => {
        const unconfiguredSettings = makeDockerSettings({
            Docker: {
                Image: DEFAULT_DOCKER_RENDER_IMAGE,
                Cpus: DEFAULT_DOCKER_CPUS,
                MemoryMb: DEFAULT_DOCKER_MEMORY_MB,
                PidsLimit: DEFAULT_DOCKER_PIDS_LIMIT,
                ShmSizeMb: DEFAULT_DOCKER_SHM_SIZE_MB,
            },
        });
        const driverA = new DockerRenderDriver(unconfiguredSettings, createProvider());
        const driverB = new DockerRenderDriver(unconfiguredSettings, createProvider());

        const rootA = await driverA.ResolveWorkspaceRoot();
        const rootB = await driverB.ResolveWorkspaceRoot();

        expect(rootA).toBe(rootB);
        expect(rootA).not.toBe(DEFAULT_DOCKER_WORKSPACE_ROOT);
        expect(path.dirname(rootA)).toBe(os.tmpdir());
        expect(path.basename(rootA)).toMatch(/^mj-video-render-.+/);
        const stat = await fs.stat(rootA);
        expect(stat.mode & 0o777).toBe(0o700);

        const configuredDriver = new DockerRenderDriver(
            makeDockerSettings({
                Docker: {
                    Image: DEFAULT_DOCKER_RENDER_IMAGE,
                    WorkspaceRoot: '/custom/explicit/workspace-root',
                    Cpus: DEFAULT_DOCKER_CPUS,
                    MemoryMb: DEFAULT_DOCKER_MEMORY_MB,
                    PidsLimit: DEFAULT_DOCKER_PIDS_LIMIT,
                    ShmSizeMb: DEFAULT_DOCKER_SHM_SIZE_MB,
                },
            }),
            createProvider(),
        );
        expect(await configuredDriver.ResolveWorkspaceRoot()).toBe('/custom/explicit/workspace-root');
    });
});

function checkCanRunRealDockerTests(): boolean {
    if (process.env.VIDEO_STUDIO_DOCKER_TESTS !== '1') {
        console.info(
            '[docker-render-driver.test] Skipping real-Docker contract suite: set VIDEO_STUDIO_DOCKER_TESTS=1 to enable.',
        );
        return false;
    }
    const res = spawnSync('docker', ['image', 'inspect', DEFAULT_DOCKER_RENDER_IMAGE], {
        stdio: 'ignore',
    });
    if (res.status !== 0) {
        console.info(
            `[docker-render-driver.test] Skipping real-Docker contract suite: Docker image '${DEFAULT_DOCKER_RENDER_IMAGE}' is missing. Build it with: ${DOCKER_RENDER_IMAGE_BUILD_COMMAND}`,
        );
        return false;
    }
    return true;
}

const CAN_RUN_REAL_DOCKER_TESTS = checkCanRunRealDockerTests();

describe.skipIf(!CAN_RUN_REAL_DOCKER_TESTS)(
    'DockerRenderDriver (opt-in real Docker container via VIDEO_STUDIO_DOCKER_TESTS=1)',
    () => {
        const configDirs: string[] = [];

        afterEach(async () => {
            let remaining = '';
            const deadline = Date.now() + 2_000;
            do {
                const psRes = spawnSync(
                    'docker',
                    ['ps', '-a', '-q', '--filter', 'name=mj-harness-'],
                    { encoding: 'utf8' },
                );
                remaining = (psRes.stdout ?? '').trim();
                if (remaining === '') {
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 50));
            } while (Date.now() < deadline);
            expect(remaining).toBe('');
        });

        afterAll(async () => {
            while (configDirs.length > 0) {
                const dir = configDirs.pop()!;
                await fs.rm(dir, { recursive: true, force: true });
            }
        });

        DescribeRenderDriverContract(
            'DockerRenderDriver (real Docker container)',
            async () => {
                const dockerConfigDir = await fs.mkdtemp(
                    path.join(os.tmpdir(), 'mj-vs-real-docker-cfg-'),
                );
                configDirs.push(dockerConfigDir);
                await fs.writeFile(
                    path.join(dockerConfigDir, 'mj.config.cjs'),
                    `module.exports = { videoStudio: { render: { driver: 'Docker' } } };\n`,
                    'utf8',
                );
                return new DockerRenderDriver(ReadVideoRenderSettings(dockerConfigDir));
            },
        );
    },
);
