import { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio, spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseSandboxProvider } from './BaseSandboxProvider.js';
import { SandboxConfig, SandboxHandle, WorkspaceKey } from './ISandboxProvider.js';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from './SandboxExecutor.js';
import { WrapChildProcess } from './ChildProcessExecutor.js';
import { BuildHostEnvironment, DOCKER_CLI_ENV_ALLOWLIST, IsValidEnvName } from './HostEnvironment.js';
import { HarnessNetworkPolicy, HarnessSandboxLimits, HarnessSandboxSettings } from '../types.js';

/** Path the host workspace is mounted at inside the container. */
const CONTAINER_WORKSPACE = '/workspace';

/**
 * HOME inside the container when it runs as a non-root uid.
 *
 * An arbitrary uid has no passwd entry, so without this HOME is `/` — unwritable — and every CLI
 * harness fails on its first attempt to create `~/.claude` or `~/.config`. It points INTO the
 * mounted workspace, which makes harness state (including the session store `--resume` reads)
 * survive as long as the workspace does instead of dying with the container.
 */
const CONTAINER_HOME = `${CONTAINER_WORKSPACE}/.home`;

/**
 * Conservative container ceilings, applied when `sandbox.limits` omits a field.
 *
 * Sized for "one harness CLI plus the tools it shells out to" — generous enough that a normal
 * coding turn is never starved, small enough that a runaway or fork-bombing agent cannot take the
 * host with it. Operators raise them per agent in `TypeConfiguration`.
 */
export const DEFAULT_DOCKER_LIMITS: Readonly<Required<HarnessSandboxLimits>> = {
    memory: '4g',
    cpus: 2,
    pids: 512,
};

/** Docker's memory syntax: a non-negative number with an optional b/k/m/g suffix. */
const DOCKER_MEMORY_PATTERN = /^[0-9]+(\.[0-9]+)?[bkmg]?$/i;
/** `uid[:gid]`, each a number or a POSIX-ish name. */
const DOCKER_USER_PATTERN = /^(?:[0-9]+|[A-Za-z_][A-Za-z0-9_.-]*)(?::(?:[0-9]+|[A-Za-z_][A-Za-z0-9_.-]*))?$/;
/** Characters Docker accepts in a container name. */
const CONTAINER_NAME_UNSAFE = /[^A-Za-z0-9_.-]/g;

/** Limits after validation and defaulting — what actually goes on the command line. */
export interface ResolvedDockerLimits {
    Memory: string;
    Cpus: number;
    Pids: number;
}

/**
 * Validates `sandbox.limits` and fills in defaults.
 *
 * Throws on a malformed value rather than falling back to the default: the settings are
 * hand-edited JSON, and silently substituting a different ceiling than the operator wrote is how a
 * "512m" typo becomes an unbounded container nobody notices.
 */
export function ResolveDockerLimits(limits?: HarnessSandboxLimits): ResolvedDockerLimits {
    const memory = limits?.memory ?? DEFAULT_DOCKER_LIMITS.memory;
    if (typeof memory !== 'string' || !DOCKER_MEMORY_PATTERN.test(memory)) {
        throw new Error(`sandbox.limits.memory '${String(memory)}' is not a docker memory value such as "512m" or "2g".`);
    }
    const cpus = limits?.cpus ?? DEFAULT_DOCKER_LIMITS.cpus;
    if (typeof cpus !== 'number' || !Number.isFinite(cpus) || cpus <= 0) {
        throw new Error(`sandbox.limits.cpus '${String(cpus)}' must be a positive number of cores.`);
    }
    const pids = limits?.pids ?? DEFAULT_DOCKER_LIMITS.pids;
    if (typeof pids !== 'number' || !Number.isInteger(pids) || pids < 1) {
        throw new Error(`sandbox.limits.pids '${String(pids)}' must be a positive integer.`);
    }
    return { Memory: memory, Cpus: cpus, Pids: pids };
}

/**
 * Chooses the `--user` for the container, or undefined to let the image's own USER apply.
 *
 * An explicit override wins (validated). Otherwise the default is the MJAPI process's own uid:gid,
 * so files the harness writes into the bind-mounted workspace remain owned by the MJAPI user and
 * can be read and cleaned up by it. Two cases return undefined:
 *  - the platform has no `getuid` (Windows), where bind-mount ownership is not a concept; and
 *  - MJAPI itself runs as root (uid 0). Forcing the container to root would undo the point of
 *    dropping privileges, and the image's `USER` is the better default there.
 */
export function ResolveDockerUser(override: string | undefined, identity: { Uid?: number; Gid?: number }): string | undefined {
    if (override !== undefined) {
        if (typeof override !== 'string' || !DOCKER_USER_PATTERN.test(override)) {
            throw new Error(`sandbox.docker.user '${String(override)}' is not a valid uid[:gid] or user[:group].`);
        }
        return override;
    }
    if (identity.Uid === undefined || identity.Gid === undefined || identity.Uid === 0) {
        return undefined;
    }
    return `${identity.Uid}:${identity.Gid}`;
}

/** Everything {@link BuildDockerRunArgs} needs, already validated. */
export interface DockerRunSpec {
    ContainerName: string;
    Image: string;
    HostWorkspacePath: string;
    NetworkPolicy: HarnessNetworkPolicy;
    Limits: ResolvedDockerLimits;
    /** `--user` value, or undefined for the image default. */
    User?: string;
}

/**
 * Builds the `docker run` argv for a harness container. Pure, so the hardening is testable without
 * a daemon.
 *
 * What each flag is for:
 *  - `--cap-drop ALL`: a coding agent needs no Linux capabilities; an image-level setuid binary
 *    cannot reacquire them either, thanks to the next flag.
 *  - `--security-opt no-new-privileges`: blocks privilege gain through setuid/setgid binaries.
 *  - `--pids-limit`, `--memory` (+ `--memory-swap` equal to it, so the limit is not quietly
 *    doubled by swap), `--cpus`: bound what a runaway agent can take from the host.
 *  - `--init`: a real PID 1 that reaps the zombies an agent's shell commands leave behind, and
 *    forwards signals so `docker stop` is prompt.
 *  - `--user`: see {@link ResolveDockerUser}.
 */
export function BuildDockerRunArgs(spec: DockerRunSpec): string[] {
    if (spec.Image.startsWith('-') || /\s/.test(spec.Image)) {
        // A leading dash would be parsed as a docker option, not an image name.
        throw new Error(`Refusing sandbox image '${spec.Image}': an image reference cannot start with '-' or contain whitespace.`);
    }
    const args = [
        'run',
        '--detach',
        '--rm',
        '--init',
        '--name',
        spec.ContainerName,
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        String(spec.Limits.Pids),
        '--memory',
        spec.Limits.Memory,
        '--memory-swap',
        spec.Limits.Memory,
        '--cpus',
        String(spec.Limits.Cpus),
    ];
    if (spec.User !== undefined) {
        args.push('--user', spec.User, '--env', `HOME=${CONTAINER_HOME}`);
    }
    args.push(
        '--volume',
        `${spec.HostWorkspacePath}:${CONTAINER_WORKSPACE}`,
        '--workdir',
        CONTAINER_WORKSPACE,
        ...BuildDockerNetworkArgs(spec.NetworkPolicy),
        spec.Image,
        // Keep the container alive so turns can exec into it; the harness itself is never this
        // process, it is whatever `docker exec` runs.
        'sleep',
        'infinity',
    );
    return args;
}

/**
 * Maps the declared network policy onto docker flags, honestly.
 *
 * `none` is fully enforced: no interfaces at all. `mcp-only` and `allowlist` are NOT enforced at
 * the packet level — enforcing them needs a per-run network with egress rules, which Docker does
 * not provide natively — so they are deliberately identical to `open` here rather than pretending
 * otherwise. {@link DockerSandboxProvider} says so in the log on every provision.
 */
export function BuildDockerNetworkArgs(policy: HarnessNetworkPolicy): string[] {
    switch (policy) {
        case 'none':
            return ['--network', 'none'];
        case 'mcp-only':
        case 'allowlist':
        case 'open':
            return [];
    }
}

/** The `docker exec` argv and the environment the docker CLI process must be spawned with. */
export interface DockerExecInvocation {
    Args: string[];
    /** Environment for the docker CLI process: its own minimal base plus every granted variable. */
    Env: Record<string, string>;
}

/**
 * Builds a `docker exec` invocation in which NO secret value appears on the command line.
 *
 * ## Secrets travel by name
 *
 * The obvious `--env KEY=VALUE` puts the credential in the docker CLI's argv, where any local user
 * can read it from `ps` or `/proc/<pid>/cmdline` for the lifetime of the turn. `--env KEY` (name
 * only) tells docker to take the value from ITS OWN environment, so the secret rides in the CLI
 * process's environment instead — readable only by its owner. The CLI is spawned with a minimal
 * base environment ({@link DOCKER_CLI_ENV_ALLOWLIST}) plus the granted variables, so it also does
 * not inherit MJAPI's unrelated secrets.
 *
 * @throws if a granted variable has an illegal name, or collides with a variable the docker CLI
 *         itself reads (`PATH`, `HOME`, `DOCKER_HOST`, ...). A grant named `DOCKER_HOST` would
 *         otherwise silently repoint the CLI at another daemon, and a grant named `PATH` would
 *         silently be replaced by the host's. Failing loudly is the only safe answer; the adapter
 *         surfaces it as a `session-error`.
 */
export function BuildDockerExecInvocation(
    containerName: string,
    spec: HarnessProcessSpec,
    cliBaseEnvironment: Record<string, string>,
): DockerExecInvocation {
    const args = ['exec', '--interactive'];
    const env: Record<string, string> = { ...cliBaseEnvironment };
    for (const [name, value] of Object.entries(spec.Environment)) {
        if (!IsValidEnvName(name)) {
            throw new Error(`Granted environment variable name '${name}' is not a valid environment variable name.`);
        }
        if (DOCKER_CLI_ENV_ALLOWLIST.includes(name)) {
            throw new Error(
                `Granted environment variable '${name}' collides with a variable the docker CLI itself reads. ` +
                    'Rename the grant (the harness can be told the real name through its own configuration).',
            );
        }
        args.push('--env', name);
        env[name] = value;
    }
    if (spec.WorkingDirectory) {
        args.push('--workdir', spec.WorkingDirectory);
    }
    args.push(containerName, spec.Command, ...spec.Args);
    return { Args: args, Env: env };
}

/** Runs a docker CLI command with the given environment and resolves with its trimmed stdout. */
export type DockerCommandRunner = (args: string[], env: Record<string, string>) => Promise<string>;

/** The `spawn` signature the docker executor needs; injectable so tests need no daemon. */
export type DockerSpawn = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

/** The real runner: spawns `docker` and collects its output. */
export const SpawnDockerCommand: DockerCommandRunner = (args, env) =>
    new Promise<string>((resolve, reject) => {
        const child = spawn('docker', args, { env });
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

/** Constructor options, mainly so tests (and unusual deployments) can substitute the seams. */
export interface DockerSandboxProviderOptions {
    HostRootPath?: string;
    DefaultImage?: string;
    /** Replaces the real docker CLI invocation. */
    Runner?: DockerCommandRunner;
    /** Replaces `process.getuid()`/`getgid()`, for tests and platforms without them. */
    HostIdentity?: () => { Uid?: number; Gid?: number };
    /** Replaces `spawn` for the exec executor. */
    SpawnProcess?: DockerSpawn;
}

/** The host process's own uid:gid, where the platform has one. */
function currentHostIdentity(): { Uid?: number; Gid?: number } {
    return { Uid: process.getuid?.(), Gid: process.getgid?.() };
}

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
 * workspace hits the container's filesystem and dies with it, and `networkPolicy: 'none'` is
 * enforced by Docker rather than merely documented.
 *
 * ## Hardened by default
 *
 * Capabilities dropped, no privilege escalation, pids/memory/cpu ceilings, an init process, and a
 * non-root user — see {@link BuildDockerRunArgs}. Tune the ceilings with `sandbox.limits` and the
 * user with `sandbox.docker.user` in the agent's `TypeConfiguration`.
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
 * are NOT enforced at the packet level. They are documented (and logged on every provision) as
 * not-yet-enforced rather than quietly treated as equivalent to `open`, because an operator who
 * believes `mcp-only` is enforced has a false sense of containment, which is worse than knowing the
 * boundary is soft. The `openshell` provider is the one that enforces them.
 */
@RegisterClass(BaseSandboxProvider, 'docker')
export class DockerSandboxProvider extends BaseSandboxProvider {
    private readonly hostRootPath: string;
    private defaultImage: string;
    private limits: ResolvedDockerLimits = ResolveDockerLimits();
    private userOverride: string | undefined;
    private readonly runner: DockerCommandRunner;
    private readonly hostIdentity: () => { Uid?: number; Gid?: number };
    private readonly spawnProcess: DockerSpawn;
    private readonly containers = new Map<string, string>();

    public constructor(options?: DockerSandboxProviderOptions) {
        super();
        this.hostRootPath = options?.HostRootPath ?? join(tmpdir(), 'mj-agent-harness');
        this.defaultImage = options?.DefaultImage ?? 'ghcr.io/memberjunction/harness-sandbox:latest';
        this.runner = options?.Runner ?? SpawnDockerCommand;
        this.hostIdentity = options?.HostIdentity ?? currentHostIdentity;
        this.spawnProcess = options?.SpawnProcess ?? spawn;
    }

    /** @inheritdoc */
    public override Initialize(settings: HarnessSandboxSettings): void {
        if (settings.image) {
            this.defaultImage = settings.image;
        }
        this.limits = ResolveDockerLimits(settings.limits);
        this.userOverride = settings.docker?.user;
        // Resolve eagerly so a bad `docker.user` fails the run at startup, not at first provision.
        ResolveDockerUser(this.userOverride, this.hostIdentity());
    }

    /** @inheritdoc */
    public async Provision(key: WorkspaceKey, config: SandboxConfig): Promise<SandboxHandle> {
        const hostPath = join(this.hostRootPath, this.buildRelativePath(key));
        await mkdir(hostPath, { recursive: true });

        const user = ResolveDockerUser(this.userOverride, this.hostIdentity());
        if (user !== undefined) {
            // The container's HOME lives in the workspace (see CONTAINER_HOME); it must exist and be
            // owned by the same user the container runs as, which the host user is by default.
            await mkdir(join(hostPath, '.home'), { recursive: true });
        }
        this.warnIfEgressUnenforced(config.NetworkPolicy);

        const containerName = BuildContainerName(key.RunId);
        const image = config.Image ?? this.defaultImage;
        const args = BuildDockerRunArgs({
            ContainerName: containerName,
            Image: image,
            HostWorkspacePath: hostPath,
            NetworkPolicy: config.NetworkPolicy,
            Limits: this.limits,
            User: user,
        });

        const containerId = await this.runDockerCommand(args);
        this.containers.set(containerName, containerId);
        LogStatus(`Harness container started: ${containerName} (${image})`);

        return {
            // The path AS THE HARNESS SEES IT — inside the container, not on the host. Anything that
            // tries to open this with `fs` on the MJAPI host is wrong; see SandboxHandle's note.
            WorkspacePath: CONTAINER_WORKSPACE,
            Key: key,
            Ephemeral: key.Scope === 'run',
            Executor: new DockerExecExecutor(containerName, { SpawnProcess: this.spawnProcess }),
        };
    }

    /** @inheritdoc */
    public async Finalize(handle: SandboxHandle, _outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        const containerName = BuildContainerName(handle.Key.RunId);
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

    /**
     * Says out loud that Docker does not enforce `mcp-only` / `allowlist` egress.
     *
     * Once per provision, at the moment an operator would otherwise be relying on it. Points at the
     * provider that does enforce it, so the warning is actionable rather than merely alarming.
     */
    private warnIfEgressUnenforced(policy: HarnessNetworkPolicy): void {
        if (policy === 'mcp-only' || policy === 'allowlist') {
            LogStatus(
                `WARNING: the Docker sandbox provider does NOT enforce networkPolicy '${policy}' — the container ` +
                    `has unrestricted egress. Only 'none' is enforced under Docker. Use sandbox.provider 'openshell' ` +
                    `(experimental) for deny-by-default egress with a host allowlist.`,
            );
        }
    }

    /** Runs a docker CLI command with ONLY the minimal CLI environment, never MJAPI's full env. */
    private runDockerCommand(args: string[]): Promise<string> {
        return this.runner(args, BuildHostEnvironment(DOCKER_CLI_ENV_ALLOWLIST));
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

/** A docker-legal container name for a run. */
export function BuildContainerName(runId: string): string {
    return `mj-harness-${runId.replace(CONTAINER_NAME_UNSAFE, '-')}`;
}

/**
 * Runs harness processes via `docker exec` into an already-running per-run container.
 *
 * Environment is passed per exec rather than baked into the container at start, so a credential
 * rotated between turns takes effect on the next turn without recreating the sandbox — and it is
 * passed by NAME, with the values in the docker CLI's environment, so no secret reaches a command
 * line. See {@link BuildDockerExecInvocation}.
 */
export class DockerExecExecutor implements SandboxExecutor {
    private readonly spawnProcess: DockerSpawn;

    public constructor(
        private readonly containerName: string,
        options?: { SpawnProcess?: DockerSpawn },
    ) {
        this.spawnProcess = options?.SpawnProcess ?? spawn;
    }

    /** @inheritdoc */
    public Run(spec: HarnessProcessSpec): HarnessProcess {
        const { Args, Env } = BuildDockerExecInvocation(this.containerName, spec, BuildHostEnvironment(DOCKER_CLI_ENV_ALLOWLIST));
        const child = this.spawnProcess('docker', Args, { env: Env, signal: spec.CancellationToken });
        return WrapChildProcess(child);
    }
}

function describeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
