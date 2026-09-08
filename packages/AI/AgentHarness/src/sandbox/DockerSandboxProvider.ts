import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LogError, LogStatus } from '@memberjunction/core';
import { ISandboxProvider, SandboxConfig, SandboxHandle, WorkspaceKey } from './ISandboxProvider.js';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from './SandboxExecutor.js';
import { wrapChildProcess } from './ChildProcessExecutor.js';
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
    private readonly containers = new Map<string, string>();

    public constructor(options?: { hostRootPath?: string; defaultImage?: string }) {
        this.hostRootPath = options?.hostRootPath ?? join(tmpdir(), 'mj-agent-harness');
        this.defaultImage = options?.defaultImage ?? 'ghcr.io/memberjunction/harness-sandbox:latest';
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
            Key: key,
            Ephemeral: key.Scope === 'run',
            Executor: new DockerExecExecutor(containerName),
        };
    }

    /** @inheritdoc */
    public async Finalize(handle: SandboxHandle, _outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        const containerName = `mj-harness-${handle.Key.RunId}`;
        try {
            // --rm on the container means stopping it removes it, so this is both stop and cleanup.
            await this.runDockerCommand(['stop', '--time', '5', containerName]);
        } catch (e) {
            // Never rethrow from finalize: it runs on failure and cancellation paths, where throwing
            // would replace the real error with a cleanup error and lose the diagnosis.
            LogError(`Failed to stop harness container ${containerName}: ${describeError(e)}`);
        }
        this.containers.delete(containerName);

        if (handle.Ephemeral) {
            const hostPath = join(this.hostRootPath, this.buildRelativePath(handle.Key));
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

    /** Runs a docker CLI command and resolves with its trimmed stdout. */
    private runDockerCommand(args: string[]): Promise<string> {
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
        return wrapChildProcess(child);
    }
}

function describeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
