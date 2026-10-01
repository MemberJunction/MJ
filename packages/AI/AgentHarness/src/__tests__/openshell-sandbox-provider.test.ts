/**
 * Tests for the EXPERIMENTAL OpenShell sandbox provider.
 *
 * No OpenShell CLI is involved: argv construction and policy generation are pure functions, and the
 * provider takes an injectable command runner and spawn function. What these tests can NOT establish
 * is that the flags are accepted by a real `openshell` — that was checked by reading the OpenShell
 * source, not by running it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { LogError, LogStatus } from '@memberjunction/core';
import {
    BuildOpenShellCreateArgs,
    BuildOpenShellDeleteArgs,
    BuildOpenShellExecInvocation,
    BuildOpenShellPolicy,
    BuildOpenShellSandboxName,
    IsOpenShellVersionTested,
    OpenShellCommandResult,
    OpenShellCommandRunner,
    OpenShellExecExecutor,
    OpenShellSandboxProvider,
    ResolveOpenShellOptions,
    SerializeOpenShellPolicy,
} from '../sandbox/OpenShellSandboxProvider';
import { OPENSHELL_CLI_ENV_ALLOWLIST } from '../sandbox/HostEnvironment';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

const SECRET = 'sk-ant-api03-SHOULD-NOT-REACH-THE-SANDBOX';
const options = (over: Parameters<typeof ResolveOpenShellOptions>[0] = {}) => ResolveOpenShellOptions(over);
const valueAfter = (args: string[], flag: string): string => args[args.indexOf(flag) + 1];

describe('BuildOpenShellPolicy', () => {
    it('always emits the filesystem baseline and a hard Landlock requirement', () => {
        const p = BuildOpenShellPolicy({ NetworkPolicy: 'none' });
        expect(p.version).toBe(1);
        expect(p.landlock.compatibility).toBe('hard_requirement');
        expect(p.filesystem_policy.read_write).toEqual(['/sandbox', '/tmp', '/dev/null']);
        expect(p.filesystem_policy.read_only).toContain('/usr');
        expect(p.filesystem_policy.read_only).not.toContain('/sandbox');
        expect(p.filesystem_policy.read_write).not.toContain('/');
    });

    it("emits NO network rules for 'none' even when hosts are configured", () => {
        const p = BuildOpenShellPolicy({ NetworkPolicy: 'none', AllowedHosts: ['api.anthropic.com'], McpEndpoint: 'mcp.example.com:8443' });
        expect(p.network_policies).toBeUndefined();
    });

    it("allows the MCP endpoint and the allowed hosts under 'mcp-only'", () => {
        const p = BuildOpenShellPolicy({
            NetworkPolicy: 'mcp-only',
            McpEndpoint: 'https://mj.example.com:4001/mcp',
            AllowedHosts: ['api.anthropic.com', 'statsig.anthropic.com:443'],
        });
        const endpoints = p.network_policies?.mj_harness_egress.endpoints ?? [];
        expect(endpoints.map((e) => `${e.host}:${e.port}`)).toEqual(['mj.example.com:4001', 'api.anthropic.com:443', 'statsig.anthropic.com:443']);
    });

    it("allows only the listed hosts under 'allowlist' — the MCP endpoint is not implied", () => {
        const p = BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', McpEndpoint: 'mj.example.com:4001', AllowedHosts: ['pypi.org', 'files.pythonhosted.org'] });
        const hosts = p.network_policies?.mj_harness_egress.endpoints.map((e) => e.host);
        expect(hosts).toEqual(['pypi.org', 'files.pythonhosted.org']);
    });

    it('uses an inspected endpoint with ENFORCED (not audit) enforcement', () => {
        const p = BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: ['api.example.com'] });
        const [endpoint] = p.network_policies?.mj_harness_egress.endpoints ?? [];
        expect(endpoint).toEqual({ host: 'api.example.com', port: 443, protocol: 'rest', access: 'full', enforcement: 'enforce' });
    });

    it('defaults the rule to any binary and accepts narrower globs', () => {
        const wide = BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: ['a.example.com'] });
        expect(wide.network_policies?.mj_harness_egress.binaries).toEqual([{ path: '/**' }]);
        const narrow = BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: ['a.example.com'], NetworkBinaries: ['/usr/local/bin/claude'] });
        expect(narrow.network_policies?.mj_harness_egress.binaries).toEqual([{ path: '/usr/local/bin/claude' }]);
    });

    it("rejects 'open' with a clear error — OpenShell has no allow-all rule", () => {
        expect(() => BuildOpenShellPolicy({ NetworkPolicy: 'open' })).toThrow(/'open' is not supported.*allowlist/);
    });

    it('deduplicates repeated hosts', () => {
        const p = BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: ['a.example.com', 'A.example.com:443', 'a.example.com'] });
        expect(p.network_policies?.mj_harness_egress.endpoints).toHaveLength(1);
    });

    it('supports wildcard hosts with at least three labels', () => {
        const p = BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: ['*.example.com'] });
        expect(p.network_policies?.mj_harness_egress.endpoints[0].host).toBe('*.example.com');
        expect(() => BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: ['*.com'] })).toThrow(/three DNS labels/);
    });

    it.each(['bad host', 'a.com:0', 'a.com:70000', 'a.com:abc', 'a.com\nb', '', 'x"y.com'])('rejects the malformed host entry %j', (entry) => {
        expect(() => BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: [entry] })).toThrow();
    });

    it('rejects a binary path that is not absolute', () => {
        expect(() => BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: ['a.example.com'], NetworkBinaries: ['claude'] })).toThrow(/absolute/);
    });

    it('infers the port from a URL scheme', () => {
        const p = BuildOpenShellPolicy({ NetworkPolicy: 'mcp-only', McpEndpoint: 'http://host.openshell.internal/mcp' });
        expect(p.network_policies?.mj_harness_egress.endpoints[0]).toMatchObject({ host: 'host.openshell.internal', port: 80 });
    });
});

describe('SerializeOpenShellPolicy', () => {
    it('emits block YAML in the documented shape', () => {
        const yaml = SerializeOpenShellPolicy(
            BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: ['api.example.com:8443'] }),
        );
        expect(yaml).toBe(
            [
                'version: 1',
                'filesystem_policy:',
                '  include_workdir: true',
                '  read_only:',
                '    - "/bin"',
                '    - "/usr"',
                '    - "/lib"',
                '    - "/proc"',
                '    - "/dev/urandom"',
                '    - "/app"',
                '    - "/etc"',
                '    - "/var/log"',
                '  read_write:',
                '    - "/sandbox"',
                '    - "/tmp"',
                '    - "/dev/null"',
                'landlock:',
                '  compatibility: "hard_requirement"',
                'network_policies:',
                '  mj_harness_egress:',
                '    name: "mj-harness-egress"',
                '    endpoints:',
                '      - host: "api.example.com"',
                '        port: 8443',
                '        protocol: "rest"',
                '        access: "full"',
                '        enforcement: "enforce"',
                '    binaries:',
                '      - path: "/**"',
                '',
            ].join('\n'),
        );
    });

    it('omits network_policies entirely when there are no rules', () => {
        expect(SerializeOpenShellPolicy(BuildOpenShellPolicy({ NetworkPolicy: 'none' }))).not.toContain('network_policies');
    });

    it('quotes every string so a value cannot break out of its line', () => {
        const yaml = SerializeOpenShellPolicy(BuildOpenShellPolicy({ NetworkPolicy: 'allowlist', AllowedHosts: ['a.example.com'], NetworkBinaries: ['/x/y'] }));
        expect(yaml).toContain('- path: "/x/y"');
    });
});

describe('BuildOpenShellCreateArgs', () => {
    const base = { SandboxName: 'mj-harness-r1', PolicyFilePath: '/tmp/p/policy.yaml', RunId: 'r1', AgentId: 'a1' };

    it('creates a detached, JSON-output, keep-alive sandbox with the generated policy', () => {
        const args = BuildOpenShellCreateArgs({ ...base, Options: options() });
        expect(args.slice(0, 2)).toEqual(['sandbox', 'create']);
        expect(valueAfter(args, '--name')).toBe('mj-harness-r1');
        expect(valueAfter(args, '--policy')).toBe('/tmp/p/policy.yaml');
        expect(args).toContain('--detach');
        expect(valueAfter(args, '-o')).toBe('json');
        expect(args.slice(-3)).toEqual(['--', 'sleep', 'infinity']);
        expect(args).toContain('--no-auto-providers');
        expect(args).toContain('--no-tty');
    });

    it('omits --from unless an image is configured', () => {
        expect(BuildOpenShellCreateArgs({ ...base, Options: options() })).not.toContain('--from');
        expect(valueAfter(BuildOpenShellCreateArgs({ ...base, Options: options({ image: 'reg/agent:1' }) }), '--from')).toBe('reg/agent:1');
    });

    it('attaches each configured provider with --provider', () => {
        const args = BuildOpenShellCreateArgs({ ...base, Options: options({ openshell: { providers: ['anthropic', 'github'] } }) });
        const providers = args.map((a, i) => (args[i - 1] === '--provider' ? a : null)).filter((a): a is string => a !== null);
        expect(providers).toEqual(['anthropic', 'github']);
    });

    it('selects the gateway with the global --gateway flag when configured', () => {
        const args = BuildOpenShellCreateArgs({ ...base, Options: options({ openshell: { gateway: 'prod' } }) });
        expect(args.slice(0, 2)).toEqual(['--gateway', 'prod']);
    });

    it('translates docker-style limits into OpenShell quantities', () => {
        const args = BuildOpenShellCreateArgs({ ...base, Options: options({ limits: { memory: '2g', cpus: 1.5 } }) });
        expect(valueAfter(args, '--memory')).toBe('2Gi');
        expect(valueAfter(args, '--cpu')).toBe('1.5');
    });

    it('labels the sandbox for traceability with label-safe values', () => {
        const args = BuildOpenShellCreateArgs({ ...base, RunId: 'run/1 x', Options: options() });
        expect(args).toContain('mj-run=run-1-x');
        expect(args).toContain('mj-agent=a1');
    });

    it('never puts a credential-bearing flag on the command', () => {
        const args = BuildOpenShellCreateArgs({ ...base, Options: options({ openshell: { providers: ['anthropic'] } }) });
        expect(args).not.toContain('--env');
    });
});

describe('BuildOpenShellExecInvocation', () => {
    const spec = (env: Record<string, string>) => ({ Command: 'claude', Args: ['-p', 'hi there'], Environment: env });

    it('runs the command after `--` in the workspace, without a TTY or login shell', () => {
        const { Args } = BuildOpenShellExecInvocation('mj-harness-r1', spec({}), options());
        expect(Args.slice(0, 4)).toEqual(['sandbox', 'exec', '--name', 'mj-harness-r1']);
        expect(valueAfter(Args, '--workdir')).toBe('/sandbox');
        expect(Args).toContain('--no-tty');
        expect(Args).toContain('--no-login-shell');
        expect(Args.slice(Args.indexOf('--'))).toEqual(['--', 'claude', '-p', 'hi there']);
    });

    it('honours an explicit working directory', () => {
        const { Args } = BuildOpenShellExecInvocation('n', { ...spec({}), WorkingDirectory: '/sandbox/sub' }, options());
        expect(valueAfter(Args, '--workdir')).toBe('/sandbox/sub');
    });

    it('SKIPS provider-managed variables entirely and reports their names', () => {
        const inv = BuildOpenShellExecInvocation(
            'n',
            spec({ ANTHROPIC_API_KEY: SECRET, MJ_FLAG: 'on' }),
            options({ openshell: { providerManagedEnv: ['ANTHROPIC_API_KEY'] } }),
        );
        expect(inv.Args.join('\0')).not.toContain(SECRET);
        expect(inv.Args.join('\0')).not.toContain('ANTHROPIC_API_KEY');
        expect(inv.SkippedProviderManaged).toEqual(['ANTHROPIC_API_KEY']);
        expect(inv.Args).toContain('MJ_FLAG=on');
    });

    it('passes non-managed variables with --env and flags credential-looking names', () => {
        const inv = BuildOpenShellExecInvocation('n', spec({ GITHUB_TOKEN: 'ghp_x', LOG_LEVEL: 'debug' }), options());
        expect(inv.Args).toContain('GITHUB_TOKEN=ghp_x');
        expect(inv.CredentialLikeOnArgv).toEqual(['GITHUB_TOKEN']);
    });

    it('does not mistake TOKENIZERS_PARALLELISM for a credential', () => {
        const inv = BuildOpenShellExecInvocation('n', spec({ TOKENIZERS_PARALLELISM: 'false' }), options());
        expect(inv.CredentialLikeOnArgv).toEqual([]);
    });

    it.each(['OPENSHELL_GATEWAY', 'openshell_x'])('refuses the reserved OPENSHELL_ prefix (%s)', (name) => {
        expect(() => BuildOpenShellExecInvocation('n', spec({ [name]: 'x' }), options())).toThrow(/reserves/);
    });

    it.each(['A=B', 'a b', '1x', ''])('refuses the illegal variable name %j', (name) => {
        expect(() => BuildOpenShellExecInvocation('n', spec({ [name]: 'x' }), options())).toThrow(/valid environment variable name/);
    });

    it('selects the gateway when configured', () => {
        const { Args } = BuildOpenShellExecInvocation('n', spec({}), options({ openshell: { gateway: 'edge' } }));
        expect(Args.slice(0, 2)).toEqual(['--gateway', 'edge']);
    });
});

describe('ResolveOpenShellOptions', () => {
    it('defaults the CLI to `openshell` on PATH', () => {
        expect(options().CliPath).toBe('openshell');
    });
    it.each([
        [{ openshell: { providers: ['bad name'] } }, /provider name/],
        [{ openshell: { providers: ['--x'] } }, /provider name/],
        [{ openshell: { providerManagedEnv: ['A=B'] } }, /environment variable name/],
        [{ openshell: { gateway: 'a b' } }, /gateway/],
        [{ openshell: { cliPath: '' } }, /cliPath/],
        [{ image: '--privileged' }, /image/],
    ])('rejects malformed settings %j', (settings, message) => {
        expect(() => ResolveOpenShellOptions(settings)).toThrow(message);
    });
});

describe('naming and version helpers', () => {
    it('builds a lowercase DNS-label sandbox name', () => {
        expect(BuildOpenShellSandboxName('3F2A-9C')).toBe('mj-harness-3f2a-9c');
        expect(BuildOpenShellSandboxName('a_b/C')).toBe('mj-harness-a-b-c');
        expect(BuildOpenShellSandboxName('x'.repeat(100)).length).toBeLessThanOrEqual(63);
    });

    it.each([
        ['openshell 0.1.2', true],
        ['openshell 0.1.0', true],
        ['openshell 0.1.3-pre.2', true],
        ['openshell 0.0.100', false],
        ['openshell 0.2.0', false],
        ['openshell 1.0.0', false],
        ['garbage', false],
    ])('IsOpenShellVersionTested(%j) = %s', (text, expected) => {
        expect(IsOpenShellVersionTested(text)).toBe(expected);
    });

    it('builds the delete command', () => {
        expect(BuildOpenShellDeleteArgs('n', options({ openshell: { gateway: 'g' } }))).toEqual(['--gateway', 'g', 'sandbox', 'delete', 'n']);
    });
});

/** A fake `openshell` process. */
class FakeCliProcess extends EventEmitter {
    public stdin = new PassThrough();
    public stdout = new PassThrough();
    public stderr = new PassThrough();
    public exitCode: number | null = null;
    public killed = false;
    public kill = vi.fn(() => true);
    public stdinEnded = false;
    public constructor() {
        super();
        this.stdin.on('finish', () => {
            this.stdinEnded = true;
        });
    }
}

describe('OpenShellExecExecutor', () => {
    it('CLOSES stdin immediately — the CLI reads stdin to EOF before it execs', async () => {
        const fake = new FakeCliProcess();
        const executor = new OpenShellExecExecutor('n', options(), {
            SpawnProcess: () => fake as unknown as ChildProcessWithoutNullStreams,
        });
        executor.Run({ Command: 'claude', Args: [], Environment: {} });
        await new Promise((r) => setImmediate(r));
        expect(fake.stdinEnded).toBe(true);
    });

    it('spawns the configured CLI with the minimal environment', () => {
        process.env.MJ_HOST_DB_PASSWORD = 'host-db-password';
        process.env.PATH = process.env.PATH ?? '/usr/bin';
        let captured: { command: string; env: NodeJS.ProcessEnv | undefined } | undefined;
        const executor = new OpenShellExecExecutor('n', options({ openshell: { cliPath: '/opt/openshell' } }), {
            SpawnProcess: (command: string, _args: string[], o: SpawnOptionsWithoutStdio) => {
                captured = { command, env: o.env };
                return new FakeCliProcess() as unknown as ChildProcessWithoutNullStreams;
            },
        });
        executor.Run({ Command: 'x', Args: [], Environment: {} });
        expect(captured?.command).toBe('/opt/openshell');
        expect(captured?.env).not.toHaveProperty('MJ_HOST_DB_PASSWORD');
        for (const name of Object.keys(captured?.env ?? {})) {
            expect(OPENSHELL_CLI_ENV_ALLOWLIST).toContain(name);
        }
        delete process.env.MJ_HOST_DB_PASSWORD;
    });

    it('logs which variables were withheld or exposed by NAME, never by value', () => {
        vi.mocked(LogStatus).mockClear();
        vi.mocked(LogError).mockClear();
        const executor = new OpenShellExecExecutor('n', options({ openshell: { providerManagedEnv: ['ANTHROPIC_API_KEY'] } }), {
            SpawnProcess: () => new FakeCliProcess() as unknown as ChildProcessWithoutNullStreams,
        });
        executor.Run({ Command: 'x', Args: [], Environment: { ANTHROPIC_API_KEY: SECRET, GITHUB_TOKEN: 'ghp_value' } });
        const status = vi.mocked(LogStatus).mock.calls.map((c) => String(c[0])).join('\n');
        const errors = vi.mocked(LogError).mock.calls.map((c) => String(c[0])).join('\n');
        // Withholding a provider-managed variable is the intended path: status. A credential-looking
        // value on the CLI command line is a real exposure: error.
        expect(status).toContain('ANTHROPIC_API_KEY');
        expect(errors).toContain('GITHUB_TOKEN');
        for (const logged of [status, errors]) {
            expect(logged).not.toContain(SECRET);
            expect(logged).not.toContain('ghp_value');
        }
    });
});

describe('OpenShellSandboxProvider', () => {
    let policyRoot: string;
    const key = { Scope: 'run' as const, AgentId: 'agent-1', RunId: 'Run-1', UserId: 'u' };

    beforeEach(async () => {
        policyRoot = await mkdtemp(join(tmpdir(), 'mj-openshell-test-'));
        vi.mocked(LogStatus).mockClear();
        vi.mocked(LogError).mockClear();
    });
    afterEach(async () => {
        await rm(policyRoot, { recursive: true, force: true });
    });

    const ok = (Stdout = ''): OpenShellCommandResult => ({ ExitCode: 0, Stdout, Stderr: '' });

    function makeProvider(runner: OpenShellCommandRunner): OpenShellSandboxProvider {
        return new OpenShellSandboxProvider({ Runner: runner, PolicyRootPath: policyRoot });
    }

    it('provisions: checks the version, writes the policy, then creates the sandbox', async () => {
        const calls: Array<{ cli: string; args: string[]; env: Record<string, string> }> = [];
        let policyAtCreate = '';
        const provider = makeProvider(async (cli, args, env) => {
            calls.push({ cli, args, env });
            if (args.includes('create')) {
                policyAtCreate = await readFile(valueAfter(args, '--policy'), 'utf8');
            }
            return ok(args[0] === '--version' ? 'openshell 0.1.2' : '{}');
        });
        provider.Initialize({ networkPolicy: 'allowlist', allowedHosts: ['api.anthropic.com'], openshell: { providers: ['anthropic'] }, image: 'reg/agent:1' });

        const handle = await provider.Provision(key, { NetworkPolicy: 'allowlist', AllowedHosts: ['api.anthropic.com'] });

        expect(calls.map((c) => c.args[0])).toEqual(['--version', 'sandbox']);
        const create = calls[1].args;
        expect(create.slice(0, 2)).toEqual(['sandbox', 'create']);
        expect(valueAfter(create, '--name')).toBe('mj-harness-run-1');
        expect(valueAfter(create, '--provider')).toBe('anthropic');
        expect(valueAfter(create, '--from')).toBe('reg/agent:1');
        expect(policyAtCreate).toContain('host: "api.anthropic.com"');
        expect(policyAtCreate).toContain('enforcement: "enforce"');
        expect(handle.WorkspacePath).toBe('/sandbox');
        expect(handle.Ephemeral).toBe(true);
        expect(handle.Executor).toBeInstanceOf(OpenShellExecExecutor);
    });

    it('runs every CLI call with only the minimal environment', async () => {
        process.env.MJ_HOST_DB_PASSWORD = 'host-db-password';
        const envs: Array<Record<string, string>> = [];
        const provider = makeProvider(async (_cli, _args, env) => {
            envs.push(env);
            return ok('openshell 0.1.2');
        });
        const handle = await provider.Provision(key, { NetworkPolicy: 'none' });
        await provider.Finalize(handle, 'success');
        expect(envs.length).toBeGreaterThanOrEqual(3);
        for (const env of envs) {
            expect(env).not.toHaveProperty('MJ_HOST_DB_PASSWORD');
            for (const name of Object.keys(env)) {
                expect(OPENSHELL_CLI_ENV_ALLOWLIST).toContain(name);
            }
        }
        delete process.env.MJ_HOST_DB_PASSWORD;
    });

    it.each(['agent', 'agent-user'] as const)("rejects the '%s' workspace scope before creating anything", async (Scope) => {
        const runner = vi.fn<OpenShellCommandRunner>(async () => ok());
        const provider = makeProvider(runner);
        await expect(provider.Provision({ ...key, Scope }, { NetworkPolicy: 'none' })).rejects.toThrow(/only workspaceScope 'run'/);
        expect(runner).not.toHaveBeenCalled();
    });

    it("rejects the 'open' network policy before creating anything", async () => {
        const runner = vi.fn<OpenShellCommandRunner>(async () => ok());
        const provider = makeProvider(runner);
        await expect(provider.Provision(key, { NetworkPolicy: 'open' })).rejects.toThrow(/'open' is not supported/);
        expect(runner).not.toHaveBeenCalled();
    });

    it('warns (without failing) when the CLI version is outside the tested range', async () => {
        const provider = makeProvider(async (_c, args) => ok(args[0] === '--version' ? 'openshell 0.9.0' : '{}'));
        await provider.Provision(key, { NetworkPolicy: 'none' });
        const logged = vi.mocked(LogStatus).mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).toMatch(/EXPERIMENTAL.*0\.9\.0/);
    });

    it('warns (without failing) when the version command itself fails', async () => {
        const provider = makeProvider(async (_c, args) => {
            if (args[0] === '--version') {
                throw new Error('spawn openshell ENOENT');
            }
            return ok('{}');
        });
        await expect(provider.Provision(key, { NetworkPolicy: 'none' })).resolves.toBeDefined();
        const logged = vi.mocked(LogStatus).mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).toContain('could not run');
    });

    it('checks the version once per provider instance', async () => {
        const runner = vi.fn<OpenShellCommandRunner>(async (_c, args) => ok(args[0] === '--version' ? 'openshell 0.1.2' : '{}'));
        const provider = makeProvider(runner);
        await provider.Provision(key, { NetworkPolicy: 'none' });
        await provider.Provision({ ...key, RunId: 'Run-2' }, { NetworkPolicy: 'none' });
        expect(runner.mock.calls.filter((c) => c[1][0] === '--version')).toHaveLength(1);
    });

    it('on create failure: surfaces the error, deletes the half-made sandbox and removes the policy file', async () => {
        const calls: string[][] = [];
        const provider = makeProvider(async (_c, args) => {
            calls.push(args);
            if (args[0] === '--version') {
                return ok('openshell 0.1.2');
            }
            if (args.includes('create')) {
                return { ExitCode: 1, Stdout: '', Stderr: 'provisioning timed out' };
            }
            return ok();
        });
        await expect(provider.Provision(key, { NetworkPolicy: 'none' })).rejects.toThrow(/sandbox create failed \(code 1\): provisioning timed out/);
        expect(calls.some((a) => a.includes('delete') && a.includes('mj-harness-run-1'))).toBe(true);
        expect(await readdir(policyRoot)).toEqual([]);
    });

    it('Finalize deletes the sandbox and removes the policy file', async () => {
        const calls: string[][] = [];
        const provider = makeProvider(async (_c, args) => {
            calls.push(args);
            return ok('openshell 0.1.2');
        });
        const handle = await provider.Provision(key, { NetworkPolicy: 'none' });
        expect((await readdir(policyRoot)).length).toBe(1);
        await provider.Finalize(handle, 'success');
        expect(calls[calls.length - 1]).toEqual(['sandbox', 'delete', 'mj-harness-run-1']);
        expect(await readdir(policyRoot)).toEqual([]);
    });

    it('Finalize never throws, even when the CLI fails or cannot be spawned', async () => {
        const provider = makeProvider(async (_c, args) => {
            if (args.includes('delete')) {
                throw new Error('gateway unreachable');
            }
            return ok('openshell 0.1.2');
        });
        const handle = await provider.Provision(key, { NetworkPolicy: 'none' });
        await expect(provider.Finalize(handle, 'failure')).resolves.toBeUndefined();
        expect(vi.mocked(LogError)).toHaveBeenCalled();
        expect(await readdir(policyRoot)).toEqual([]);
    });

    it('Finalize also tolerates a non-zero exit from delete', async () => {
        const provider = makeProvider(async (_c, args) =>
            args.includes('delete') ? { ExitCode: 1, Stdout: '', Stderr: 'not found' } : ok('openshell 0.1.2'),
        );
        const handle = await provider.Provision(key, { NetworkPolicy: 'none' });
        await expect(provider.Finalize(handle, 'cancelled')).resolves.toBeUndefined();
    });

    it("notes that attached providers add egress under 'none'", async () => {
        const provider = makeProvider(async () => ok('openshell 0.1.2'));
        provider.Initialize({ openshell: { providers: ['anthropic'] } });
        await provider.Provision(key, { NetworkPolicy: 'none' });
        const logged = vi.mocked(LogStatus).mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).toMatch(/anthropic.*contribute their own endpoint rules/);
    });

    it('rejects a malformed settings block at Initialize', () => {
        const provider = makeProvider(async () => ok());
        expect(() => provider.Initialize({ openshell: { providers: ['bad name'] } })).toThrow(/provider name/);
    });
});
