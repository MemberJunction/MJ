/**
 * Pins the Docker sandbox provider's hardening, and — more importantly — that no secret VALUE ever
 * reaches a command line.
 *
 * Everything here runs without a docker daemon: argv construction is pure, and the provider takes an
 * injectable command runner and spawn function.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { LogStatus } from '@memberjunction/core';
import {
    BuildContainerName,
    BuildDockerExecInvocation,
    BuildDockerNetworkArgs,
    BuildDockerRunArgs,
    DEFAULT_DOCKER_LIMITS,
    DockerCommandRunner,
    DockerExecExecutor,
    DockerSandboxProvider,
    ResolveDockerLimits,
    ResolveDockerUser,
} from '../sandbox/DockerSandboxProvider';
import { DOCKER_CLI_ENV_ALLOWLIST } from '../sandbox/HostEnvironment';
import { HarnessProcessSpec } from '../sandbox/SandboxExecutor';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

const SECRET = 'sk-ant-api03-THIS-MUST-NEVER-APPEAR-IN-ARGV';

const runSpec = (over: Partial<Parameters<typeof BuildDockerRunArgs>[0]> = {}) => ({
    ContainerName: 'mj-harness-run-1',
    Image: 'example/harness:1',
    HostWorkspacePath: '/host/ws',
    NetworkPolicy: 'mcp-only' as const,
    Limits: ResolveDockerLimits(),
    User: '1000:1000',
    ...over,
});

function valueAfter(args: string[], flag: string): string {
    return args[args.indexOf(flag) + 1];
}

describe('BuildDockerRunArgs hardening', () => {
    it('drops every capability and forbids privilege gain', () => {
        const args = BuildDockerRunArgs(runSpec());
        expect(valueAfter(args, '--cap-drop')).toBe('ALL');
        expect(valueAfter(args, '--security-opt')).toBe('no-new-privileges');
    });

    it('bounds pids, memory (with swap pinned to it) and cpus by default', () => {
        const args = BuildDockerRunArgs(runSpec());
        expect(valueAfter(args, '--pids-limit')).toBe(String(DEFAULT_DOCKER_LIMITS.pids));
        expect(valueAfter(args, '--memory')).toBe(DEFAULT_DOCKER_LIMITS.memory);
        expect(valueAfter(args, '--memory-swap')).toBe(DEFAULT_DOCKER_LIMITS.memory);
        expect(valueAfter(args, '--cpus')).toBe(String(DEFAULT_DOCKER_LIMITS.cpus));
    });

    it('runs an init process and detaches with --rm', () => {
        const args = BuildDockerRunArgs(runSpec());
        expect(args).toContain('--init');
        expect(args).toContain('--detach');
        expect(args).toContain('--rm');
    });

    it('runs as the given user and points HOME into the workspace so the uid is usable', () => {
        const args = BuildDockerRunArgs(runSpec({ User: '1234:5678' }));
        expect(valueAfter(args, '--user')).toBe('1234:5678');
        expect(args).toContain('HOME=/workspace/.home');
    });

    it('passes neither --user nor HOME when no user is chosen (image default applies)', () => {
        const args = BuildDockerRunArgs(runSpec({ User: undefined }));
        expect(args).not.toContain('--user');
        expect(args.some((a) => a.startsWith('HOME='))).toBe(false);
    });

    it('never runs privileged or on the host network', () => {
        const args = BuildDockerRunArgs(runSpec());
        expect(args).not.toContain('--privileged');
        expect(args).not.toContain('host');
    });

    it('mounts the workspace and ends with image, sleep infinity', () => {
        const args = BuildDockerRunArgs(runSpec());
        expect(valueAfter(args, '--volume')).toBe('/host/ws:/workspace');
        expect(args.slice(-3)).toEqual(['example/harness:1', 'sleep', 'infinity']);
    });

    it('honours configured limits', () => {
        const args = BuildDockerRunArgs(runSpec({ Limits: ResolveDockerLimits({ memory: '512m', cpus: 0.5, pids: 64 }) }));
        expect(valueAfter(args, '--memory')).toBe('512m');
        expect(valueAfter(args, '--cpus')).toBe('0.5');
        expect(valueAfter(args, '--pids-limit')).toBe('64');
    });

    it('refuses an image that would be parsed as a docker option', () => {
        expect(() => BuildDockerRunArgs(runSpec({ Image: '--privileged' }))).toThrow(/image/);
        expect(() => BuildDockerRunArgs(runSpec({ Image: 'a b' }))).toThrow(/image/);
    });
});

describe('BuildDockerNetworkArgs', () => {
    it('enforces none', () => {
        expect(BuildDockerNetworkArgs('none')).toEqual(['--network', 'none']);
    });
    it.each(['mcp-only', 'allowlist', 'open'] as const)('adds no flags for %s (not enforceable under docker)', (p) => {
        expect(BuildDockerNetworkArgs(p)).toEqual([]);
    });
});

describe('ResolveDockerLimits', () => {
    it('applies conservative defaults when nothing is configured', () => {
        expect(ResolveDockerLimits()).toEqual({ Memory: '4g', Cpus: 2, Pids: 512 });
    });
    it.each([
        [{ memory: 'lots' }, /memory/],
        [{ memory: '--privileged' }, /memory/],
        [{ cpus: 0 }, /cpus/],
        [{ cpus: Number.NaN }, /cpus/],
        [{ pids: -1 }, /pids/],
        [{ pids: 1.5 }, /pids/],
    ])('throws on a malformed limit %j rather than substituting a default', (limits, message) => {
        expect(() => ResolveDockerLimits(limits)).toThrow(message);
    });
});

describe('ResolveDockerUser', () => {
    it('defaults to the host process uid:gid', () => {
        expect(ResolveDockerUser(undefined, { Uid: 1001, Gid: 1002 })).toBe('1001:1002');
    });
    it('lets an override win', () => {
        expect(ResolveDockerUser('node', { Uid: 1001, Gid: 1002 })).toBe('node');
        expect(ResolveDockerUser('2000:2000', { Uid: 1001, Gid: 1002 })).toBe('2000:2000');
    });
    it('leaves the image default when the platform has no getuid', () => {
        expect(ResolveDockerUser(undefined, {})).toBeUndefined();
    });
    it('does not force a root container when MJAPI itself is root', () => {
        expect(ResolveDockerUser(undefined, { Uid: 0, Gid: 0 })).toBeUndefined();
    });
    it('rejects an override that could smuggle another docker option', () => {
        expect(() => ResolveDockerUser('1000 --privileged', {})).toThrow(/user/);
        expect(() => ResolveDockerUser('--privileged', {})).toThrow(/user/);
    });
});

describe('BuildDockerExecInvocation — secrets never travel on argv', () => {
    const spec = (over: Partial<HarnessProcessSpec> = {}): HarnessProcessSpec => ({
        Command: 'claude',
        Args: ['-p', 'hello'],
        Environment: { ANTHROPIC_API_KEY: SECRET, GITHUB_TOKEN: 'ghp_other_secret' },
        ...over,
    });

    it('passes each variable by NAME only', () => {
        const { Args } = BuildDockerExecInvocation('c1', spec(), {});
        const envFlags = Args.map((a, i) => (Args[i - 1] === '--env' ? a : null)).filter((a): a is string => a !== null);
        expect(envFlags).toEqual(['ANTHROPIC_API_KEY', 'GITHUB_TOKEN']);
    });

    it('contains no secret value anywhere in argv', () => {
        const { Args } = BuildDockerExecInvocation('c1', spec(), {});
        const joined = Args.join('\0');
        expect(joined).not.toContain(SECRET);
        expect(joined).not.toContain('ghp_other_secret');
        expect(Args.some((a) => a.includes('='))).toBe(false);
    });

    it('delivers the values through the CLI process environment instead', () => {
        const { Env } = BuildDockerExecInvocation('c1', spec(), { PATH: '/usr/bin' });
        expect(Env.ANTHROPIC_API_KEY).toBe(SECRET);
        expect(Env.GITHUB_TOKEN).toBe('ghp_other_secret');
        expect(Env.PATH).toBe('/usr/bin');
    });

    it('builds the exec command: container, then command, then args, with workdir', () => {
        const { Args } = BuildDockerExecInvocation('c1', spec({ Environment: {}, WorkingDirectory: '/workspace/x' }), {});
        expect(Args).toEqual(['exec', '--interactive', '--workdir', '/workspace/x', 'c1', 'claude', '-p', 'hello']);
    });

    it.each(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CONTEXT'])(
        'refuses a grant named %s, which would hijack or be shadowed by the docker CLI environment',
        (name) => {
            expect(() => BuildDockerExecInvocation('c1', spec({ Environment: { [name]: 'x' } }), {})).toThrow(/collides/);
        },
    );

    it.each(['BAD=NAME', 'with space', '1LEADING', '', '--flag'])('refuses the illegal variable name %j', (name) => {
        expect(() => BuildDockerExecInvocation('c1', spec({ Environment: { [name]: 'x' } }), {})).toThrow(/valid environment variable name/);
    });
});

/** A fake `docker` process that emits nothing and exits cleanly. */
class FakeDockerProcess extends EventEmitter {
    public stdin = new PassThrough();
    public stdout = new PassThrough();
    public stderr = new PassThrough();
    public exitCode: number | null = null;
    public killed = false;
    public kill = vi.fn(() => true);
}

describe('DockerExecExecutor', () => {
    const original = { ...process.env };
    afterEach(() => {
        process.env = { ...original };
    });

    it('spawns docker with a minimal CLI environment plus the grants, and no value on argv', () => {
        process.env.MJ_HOST_DB_PASSWORD = 'host-db-password';
        process.env.PATH = process.env.PATH ?? '/usr/bin';
        let captured: { command: string; args: string[]; env: NodeJS.ProcessEnv | undefined } | undefined;
        const spawnProcess = (command: string, args: string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams => {
            captured = { command, args, env: options.env };
            return new FakeDockerProcess() as unknown as ChildProcessWithoutNullStreams;
        };

        new DockerExecExecutor('mj-harness-r1', { SpawnProcess: spawnProcess }).Run({
            Command: 'codex',
            Args: ['exec', 'go'],
            Environment: { OPENAI_API_KEY: SECRET },
        });

        expect(captured?.command).toBe('docker');
        expect(captured?.args.join('\0')).not.toContain(SECRET);
        expect(captured?.env?.OPENAI_API_KEY).toBe(SECRET);
        expect(captured?.env).not.toHaveProperty('MJ_HOST_DB_PASSWORD');
        for (const name of Object.keys(captured?.env ?? {})) {
            expect([...DOCKER_CLI_ENV_ALLOWLIST, 'OPENAI_API_KEY']).toContain(name);
        }
    });

    it('throws synchronously for a colliding grant so the adapter reports a session-error', () => {
        const executor = new DockerExecExecutor('c', {
            SpawnProcess: () => new FakeDockerProcess() as unknown as ChildProcessWithoutNullStreams,
        });
        expect(() => executor.Run({ Command: 'x', Args: [], Environment: { DOCKER_HOST: 'tcp://evil:2375' } })).toThrow(/collides/);
    });
});

describe('DockerSandboxProvider', () => {
    let root: string;
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'mj-docker-test-'));
        vi.mocked(LogStatus).mockClear();
    });
    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    const key = { Scope: 'run' as const, AgentId: 'agent-1', RunId: 'run-1', UserId: 'user-1' };

    function makeProvider(runner: DockerCommandRunner, over: { Uid?: number; Gid?: number } = { Uid: 1000, Gid: 1000 }): DockerSandboxProvider {
        return new DockerSandboxProvider({ HostRootPath: root, Runner: runner, HostIdentity: () => over });
    }

    it('runs docker with the hardened argv and ONLY the minimal CLI environment', async () => {
        process.env.MJ_HOST_DB_PASSWORD = 'host-db-password';
        const calls: Array<{ args: string[]; env: Record<string, string> }> = [];
        const runner: DockerCommandRunner = async (args, env) => {
            calls.push({ args, env });
            return 'container-id';
        };
        const provider = makeProvider(runner);

        const handle = await provider.Provision(key, { NetworkPolicy: 'none' });

        expect(calls).toHaveLength(1);
        const { args, env } = calls[0];
        expect(args[0]).toBe('run');
        expect(valueAfter(args, '--cap-drop')).toBe('ALL');
        expect(valueAfter(args, '--user')).toBe('1000:1000');
        expect(valueAfter(args, '--network')).toBe('none');
        expect(env).not.toHaveProperty('MJ_HOST_DB_PASSWORD');
        for (const name of Object.keys(env)) {
            expect(DOCKER_CLI_ENV_ALLOWLIST).toContain(name);
        }
        expect(handle.WorkspacePath).toBe('/workspace');
        expect(handle.Ephemeral).toBe(true);
        delete process.env.MJ_HOST_DB_PASSWORD;
    });

    it('creates the container HOME in the workspace when it runs as a non-root user', async () => {
        const provider = makeProvider(async () => 'id');
        await provider.Provision(key, { NetworkPolicy: 'none' });
        const home = await stat(join(root, 'run', 'run-1', '.home'));
        expect(home.isDirectory()).toBe(true);
    });

    it('applies Initialize settings: image, limits and user override', async () => {
        const calls: string[][] = [];
        const provider = makeProvider(async (args) => {
            calls.push(args);
            return 'id';
        });
        provider.Initialize({ image: 'custom/img:2', limits: { memory: '1g', cpus: 1, pids: 100 }, docker: { user: 'node' } });
        await provider.Provision(key, { NetworkPolicy: 'none' });
        const args = calls[0];
        expect(args).toContain('custom/img:2');
        expect(valueAfter(args, '--memory')).toBe('1g');
        expect(valueAfter(args, '--user')).toBe('node');
    });

    it('rejects a malformed settings block at Initialize, not at first use', () => {
        const provider = makeProvider(async () => 'id');
        expect(() => provider.Initialize({ limits: { memory: 'oops' } })).toThrow(/memory/);
        expect(() => provider.Initialize({ docker: { user: 'a b' } })).toThrow(/user/);
    });

    it.each(['mcp-only', 'allowlist'] as const)("warns that '%s' egress is not enforced", async (policy) => {
        const provider = makeProvider(async () => 'id');
        await provider.Provision(key, { NetworkPolicy: policy });
        const messages = vi.mocked(LogStatus).mock.calls.map((c) => String(c[0]));
        expect(messages.some((m) => m.includes('does NOT enforce') && m.includes(policy) && m.includes('openshell'))).toBe(true);
    });

    it.each(['none', 'open'] as const)("does not warn for '%s'", async (policy) => {
        const provider = makeProvider(async () => 'id');
        await provider.Provision(key, { NetworkPolicy: policy });
        const messages = vi.mocked(LogStatus).mock.calls.map((c) => String(c[0]));
        expect(messages.some((m) => m.includes('does NOT enforce'))).toBe(false);
    });

    it('Finalize stops the container with the minimal environment and removes the ephemeral workspace', async () => {
        const calls: Array<{ args: string[]; env: Record<string, string> }> = [];
        const provider = makeProvider(async (args, env) => {
            calls.push({ args, env });
            return 'id';
        });
        const handle = await provider.Provision(key, { NetworkPolicy: 'none' });
        await provider.Finalize(handle, 'success');

        const stop = calls[calls.length - 1];
        expect(stop.args).toEqual(['stop', '--time', '5', 'mj-harness-run-1']);
        for (const name of Object.keys(stop.env)) {
            expect(DOCKER_CLI_ENV_ALLOWLIST).toContain(name);
        }
        await expect(stat(join(root, 'run', 'run-1'))).rejects.toThrow();
    });

    it('Finalize never throws when docker stop fails', async () => {
        let first = true;
        const provider = makeProvider(async () => {
            if (first) {
                first = false;
                return 'id';
            }
            throw new Error('daemon unreachable');
        });
        const handle = await provider.Provision(key, { NetworkPolicy: 'none' });
        await expect(provider.Finalize(handle, 'failure')).resolves.toBeUndefined();
    });
});

describe('BuildContainerName', () => {
    it('keeps a GUID run id and sanitises anything docker would reject', () => {
        expect(BuildContainerName('3f2a-11')).toBe('mj-harness-3f2a-11');
        expect(BuildContainerName('a/b c')).toBe('mj-harness-a-b-c');
    });
});
