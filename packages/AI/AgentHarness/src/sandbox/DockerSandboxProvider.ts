import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LogError, LogStatus } from '@memberjunction/core';
import { ISandboxProvider, SandboxConfig, SandboxHandle, WorkspaceKey } from './ISandboxProvider.js';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from './SandboxExecutor.js';
import { WrapChildProcess } from './ChildProcessExecutor.js';
import { HarnessNetworkPolicy } from '../types.js';

/** Path the host workspace is mounted at inside the container. */
const CONTAINER_WORKSPACE = '/workspace';

/**
 * Runs each harness turn inside a per-run container.
 *
 * ## Why this exists
 *
 * {@link LocalDirectorySandboxProvider} scopes a directory but does not contain the process: the
 * harness runs on the MJAPI host with that host's network reach and cloud credentials. For a feature
 * whose entire purpose is executing an autonomous agent's shell commands, that is the wrong blast
 * radius anywhere but a developer's laptop.
 *
 * Here the harness runs in a container with the workspace bind-mounted, so a file write outside the
 * workspace hits the container's filesystem and dies with it, and `networkPolicy` is enforced by
 * Docker rather than merely documented.
 *
 * ## Container per RUN, exec per TURN
 *
 * The container starts once at {@link Provision} and every turn is a `docker exec` into it. The
 * alternative — `docker run` per turn — would pay container startup on every turn and, worse, lose
 * any in-container state the harness accumulated outside the mounted workspace. A run is the natural
 * lifetime because it is exactly the span over which a harness session is continuous.
 *
 * ## Network policy
 *
 * `none` maps to `--network none`. `mcp-only` and `allowlist` currently map to a bridge network and
 * are NOT yet enforced at the packet level — enforcing them properly needs a per-run network with
 * egress rules, which is the next increment. They are documented here as not-yet-enforced rather
 * than quietly treated as equivalent to `open`, because an operator who believes `mcp-only` is
 * enforced has a false sense of containment, which is worse than knowing the boundary is soft.
 */
export class DockerSandboxProvider implements ISandboxProvider {
    private readonly hostRootPath: string;
    private readonly defaultImage: string;
    private readonly dockerRunner?: (args: string[]) => Promise<string>;
    private readonly executorFactory?: (containerName: string, hostPath: string) => SandboxExecutor;
    private readonly containers = new Map<string, string>();

    public constructor(options?: {
        hostRootPath?: string;
        defaultImage?: string;
        /** Test seam overriding the `docker` CLI command runner. */
        dockerRunner?: (args: string[]) => Promise<string>;
        /** Test seam overriding the per-container executor; runs commands outside the container. */
        executorFactory?: (containerName: string, hostPath: string) => SandboxExecutor;
    }) {
        this.hostRootPath = options?.hostRootPath ?? join(tmpdir(), 'mj-agent-harness');
        this.defaultImage = options?.defaultImage ?? 'ghcr.io/memberjunction/harness-sandbox:latest';
        this.dockerRunner = options?.dockerRunner;
        this.executorFactory = options?.executorFactory;
    }

    /** @inheritdoc */
    public async Provision(key: WorkspaceKey, config: SandboxConfig): Promise<SandboxHandle> {
        const hostPath = join(this.hostRootPath, this.buildRelativePath(key));
        await mkdir(hostPath, { recursive: true });

        const image = config.Image ?? this.defaultImage;
        const containerName = `mj-harness-${key.RunId}`;
        const args = [
            'run',
            '--detach',
            '--rm',
            '--name',
            containerName,
            '--volume',
            `${hostPath}:${CONTAINER_WORKSPACE}`,
            '--workdir',
            CONTAINER_WORKSPACE,
            ...this.buildNetworkArgs(config.NetworkPolicy),
            ...this.buildContainerConstraintArgs(config),
            image,
            // Keep the container alive so turns can exec into it; the harness itself is never this
            // process, it is whatever `docker exec` runs.
            'sleep',
            'infinity',
        ];

        const containerId = await this.runDockerCommand(args);
        this.containers.set(containerName, containerId);
        LogStatus(`Harness container started: ${containerName} (${image})`);

        return {
            // The path AS THE HARNESS SEES IT — inside the container, not on the host. Anything that
            // tries to open this with `fs` on the MJAPI host is wrong; see SandboxHandle's note.
            WorkspacePath: CONTAINER_WORKSPACE,
            HostWorkspacePath: hostPath,
            Key: key,
            Ephemeral: key.Scope === 'run',
            Executor: this.executorFactory
                ? this.executorFactory(containerName, hostPath)
                : new DockerExecExecutor(containerName),
        };
    }

    /**
     * Checks whether the container for `handle` is still running via `docker container inspect`.
     *
     * Returns `false` when inspect prints `false` or fails with `No such container` / `No such object`.
     * Any other error or unclear output returns `true` (fail-safe) so callers never delete bind-mounted
     * host directories while a container process might still be alive.
     */
    public async IsContainerRunning(handle: SandboxHandle): Promise<boolean> {
        const containerName = `mj-harness-${handle.Key.RunId}`;
        try {
            const output = await this.runDockerCommand([
                'container',
                'inspect',
                '--format',
                '{{.State.Running}}',
                containerName,
            ]);
            const normalized = output.trim().replace(/^['"]|['"]$/g, '').trim();
            return normalized !== 'false';
        } catch (error) {
            if (/no such (container|object)/i.test(describeError(error))) {
                return false;
            }
            return true;
        }
    }

    /** @inheritdoc */
    public async Finalize(handle: SandboxHandle, _outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        const containerName = `mj-harness-${handle.Key.RunId}`;
        const hostPath = join(this.hostRootPath, this.buildRelativePath(handle.Key));
        let stopError: unknown;
        try {
            // --rm on the container means stopping it removes it, so this is both stop and cleanup.
            await this.runDockerCommand(['stop', '--time', '5', containerName]);
        } catch (e) {
            stopError = e;
        }

        if (stopError !== undefined) {
            let killError: unknown;
            try {
                await this.runDockerCommand(['kill', containerName]);
            } catch (e) {
                killError = e;
            }
            const stillRunning = await this.IsContainerRunning(handle);
            if (stillRunning) {
                // Never rethrow from finalize: it runs on failure and cancellation paths, where throwing
                // would replace the real error with a cleanup error and lose the diagnosis.
                const detail =
                    killError !== undefined
                        ? `${describeError(stopError)}; kill failed: ${describeError(killError)}`
                        : describeError(stopError);
                LogError(
                    `Failed to stop harness container ${containerName} (${detail}); leaving workspace ${hostPath} in place because container may still be running.`,
                );
                this.containers.delete(containerName);
                return;
            }
        }
        this.containers.delete(containerName);

        if (handle.Ephemeral) {
            try {
                await rm(hostPath, { recursive: true, force: true });
            } catch (e) {
                LogError(`Failed to remove harness workspace ${hostPath}: ${describeError(e)}`);
            }
        }
    }

    /** Maps the declared network policy onto docker flags, honestly. */
    private buildNetworkArgs(policy: HarnessNetworkPolicy): string[] {
        switch (policy) {
            case 'none':
                // Fully enforced: no interfaces at all.
                return ['--network', 'none'];
            case 'mcp-only':
            case 'allowlist':
                // NOT yet enforced at the packet level — see the class doc. Deliberately identical
                // to 'open' today rather than pretending otherwise.
                return [];
            case 'open':
                return [];
        }
    }

    /** Maps optional resource-limit and hardening flags onto `docker run` arguments before the image. */
    private buildContainerConstraintArgs(config: SandboxConfig): string[] {
        const flags: string[] = [];
        if (config.Cpus !== undefined) {
            flags.push('--cpus', String(config.Cpus));
        }
        if (config.MemoryMb !== undefined) {
            flags.push('--memory', `${config.MemoryMb}m`);
        }
        if (config.PidsLimit !== undefined) {
            flags.push('--pids-limit', String(config.PidsLimit));
        }
        if (config.ShmSizeMb !== undefined) {
            flags.push('--shm-size', `${config.ShmSizeMb}m`);
        }
        if (config.ReadOnlyRoot === true) {
            flags.push('--read-only', '--tmpfs', '/tmp:rw,size=256m');
        }
        if (config.User !== undefined && config.User.length > 0) {
            flags.push('--user', config.User);
        }
        if (config.DropCapabilities === true) {
            flags.push('--cap-drop', 'ALL', '--security-opt', 'no-new-privileges');
        }
        return flags;
    }

    /** Runs a docker CLI command and resolves with its trimmed stdout. */
    private runDockerCommand(args: string[]): Promise<string> {
        if (this.dockerRunner) {
            return this.dockerRunner(args);
        }
        return new Promise<string>((resolve, reject) => {
            const child = spawn('docker', args);
            const out: string[] = [];
            const err: string[] = [];
            child.stdout.on('data', (c: Buffer) => out.push(c.toString()));
            child.stderr.on('data', (c: Buffer) => err.push(c.toString()));
            child.once('error', (e) => reject(e));
            child.once('close', (code) => {
                if (code === 0) {
                    resolve(out.join('').trim());
                } else {
                    reject(new Error(`docker ${args[0]} failed (code ${code}): ${err.join('').trim()}`));
                }
            });
        });
    }

    /** Same shape as the local provider, so a workspace is recognisable across both. */
    private buildRelativePath(key: WorkspaceKey): string {
        switch (key.Scope) {
            case 'run':
                return join('run', key.RunId);
            case 'agent':
                return join('agent', key.AgentId);
            case 'agent-user':
                return join('agent-user', key.AgentId, key.UserId ?? 'no-user');
        }
    }
}

/**
 * Runs harness processes via `docker exec` into an already-running per-run container.
 *
 * Environment is passed with repeated `--env` flags rather than baked into the container at start,
 * so a credential rotated between turns takes effect on the next turn without recreating the
 * sandbox.
 */
export class DockerExecExecutor implements SandboxExecutor {
    public constructor(private readonly containerName: string) {}

    /** @inheritdoc */
    public Run(spec: HarnessProcessSpec): HarnessProcess {
        const args = ['exec', '--interactive'];
        for (const [key, value] of Object.entries(spec.Environment)) {
            args.push('--env', `${key}=${value}`);
        }
        if (spec.WorkingDirectory) {
            args.push('--workdir', spec.WorkingDirectory);
        }
        args.push(this.containerName, spec.Command, ...spec.Args);

        const child = spawn('docker', args, { signal: spec.CancellationToken });
        return WrapChildProcess(child);
    }
}

function describeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
