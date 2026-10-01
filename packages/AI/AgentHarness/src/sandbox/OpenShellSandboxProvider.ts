import { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseSandboxProvider } from './BaseSandboxProvider.js';
import { SandboxConfig, SandboxHandle, WorkspaceKey } from './ISandboxProvider.js';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from './SandboxExecutor.js';
import { WrapChildProcess } from './ChildProcessExecutor.js';
import { BuildHostEnvironment, IsValidEnvName, OPENSHELL_CLI_ENV_ALLOWLIST } from './HostEnvironment.js';
import { HarnessNetworkPolicy, HarnessSandboxLimits, HarnessSandboxSettings } from '../types.js';

/**
 * ============================================================================
 * EXPERIMENTAL: NVIDIA OpenShell sandbox provider
 * ============================================================================
 *
 * OpenShell (https://github.com/NVIDIA/OpenShell) is a gateway plus an `openshell` CLI that runs
 * agents in policy-governed sandboxes: Landlock + seccomp for the filesystem and syscalls, and a
 * deny-by-default egress proxy with per-binary, per-host rules. It is the one backend here that can
 * actually ENFORCE `networkPolicy: 'mcp-only'` / `'allowlist'` (Docker cannot), and its credential
 * "providers" keep real API keys out of the sandbox: the agent only ever sees placeholders that the
 * proxy swaps for the real secret on the wire to the allowed endpoint.
 *
 * ## Read this before relying on it
 *
 * OpenShell is PRE-1.0. Its v0.1.0 release (2026-09-25) broke the wire protocol, policy schema, CLI
 * and provider-profile format relative to 0.0.x, and its own release policy reserves further breaking
 * changes for minor versions. This provider drives the CLI, whose surface it was written against by
 * reading the OpenShell source at commit 0e8d9e5 (post v0.1.2). Verified against the real v0.1.2
 * binaries: the CLI's argument parser accepts the generated create/exec/delete argv, and the
 * generated policy files are accepted by OpenShell's own policy parser (`openshell-prover check`).
 * NOT verified: an end-to-end create -> exec -> delete against a live gateway. It pins to
 * {@link OPENSHELL_TESTED_VERSION_RANGE}, logs a warning outside it, and should be expected to
 * change. It is not the default and nothing selects it implicitly.
 *
 * ## How it maps onto the sandbox contract
 *
 * - {@link OpenShellSandboxProvider.Provision} writes an MJ-generated policy file (see
 *   {@link BuildOpenShellPolicy}) and runs
 *   `openshell sandbox create --name <n> --policy <file> [--from <image>] [--provider <p>]... --detach -o json -- sleep infinity`.
 *   The create command returns once the sandbox is Ready.
 * - Each harness turn is `openshell sandbox exec -n <n> --workdir /sandbox --no-tty -- <cmd> <args>`.
 * - {@link OpenShellSandboxProvider.Finalize} runs `openshell sandbox delete <n>`.
 *
 * ## Known limitations of this spike
 *
 * - Only the `run` workspace scope: the sandbox has its own filesystem, so `agent` / `agent-user`
 *   persistence (and therefore session resume) is not supported.
 * - `networkPolicy: 'open'` is rejected: OpenShell has no allow-all egress rule.
 * - Attached OpenShell providers contribute their own network rules on top of this policy, so
 *   `'none'` means "no MJ-added egress", not "no egress", whenever providers are attached.
 * - Secrets: only env vars named in `sandbox.openshell.providerManagedEnv` are withheld. Any other
 *   granted variable is passed with `exec --env K=V`, which places the VALUE on the local `openshell`
 *   process's command line. Attach an OpenShell provider for real secrets.
 * - Cancelling a turn kills the local CLI; whether the remote process dies with it is up to the
 *   gateway. Finalize deleting the sandbox is what guarantees cleanup.
 *
 * CLI facts below cite the OpenShell source tree: `crates/openshell-cli/src/main.rs` (the
 * `SandboxCommands` enum, global flags), `crates/openshell-cli/src/run.rs` (`sandbox_create`,
 * `sandbox_exec_grpc`), `docs/how-it-works/policies/{schema,network-rules,default-policy}.mdx`,
 * `docs/how-it-works/sandboxes/overview.mdx` and `docs/how-it-works/providers/overview.mdx`.
 */

/** The OpenShell CLI versions this provider was written against. Outside it a warning is logged. */
export const OPENSHELL_TESTED_VERSION_RANGE = { MinInclusive: '0.1.0', MaxExclusive: '0.2.0' } as const;

/**
 * Workspace path inside the sandbox.
 *
 * `/sandbox` is OpenShell's canonical workspace on every driver (docs/how-it-works/sandboxes/
 * runtimes.mdx: "Podman, Kubernetes, and MicroVM always use /sandbox", Docker defaults to it) and is
 * the read-write path in the reference policy (examples/sandbox-policy-quickstart/policy.yaml).
 */
export const OPENSHELL_WORKSPACE = '/sandbox';

/** Filesystem baseline copied from examples/sandbox-policy-quickstart/policy.yaml and default-policy.mdx. */
const POLICY_READ_ONLY_PATHS = ['/bin', '/usr', '/lib', '/proc', '/dev/urandom', '/app', '/etc', '/var/log'];
const POLICY_READ_WRITE_PATHS = [OPENSHELL_WORKSPACE, '/tmp', '/dev/null'];

/** Default executable glob for generated network rules; `/**` is what OpenShell's own tests use for "any binary". */
const DEFAULT_NETWORK_BINARIES = ['/**'];

/** Name of the single network rule MJ contributes. Must not start with `_provider_` (reserved by OpenShell). */
const NETWORK_RULE_KEY = 'mj_harness_egress';

/** Bounds on how long a CLI invocation may run before MJ gives up on it. */
const CREATE_TIMEOUT_MS = 10 * 60 * 1000;
const DELETE_TIMEOUT_MS = 60 * 1000;
const VERSION_TIMEOUT_MS = 10 * 1000;

const PROVIDER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const HOST_PATTERN = /^[A-Za-z0-9*]([A-Za-z0-9*.-]*[A-Za-z0-9*])?$/;
const LABEL_UNSAFE = /[^A-Za-z0-9_.-]/g;
/** Credential words, as whole underscore-separated segments — the same idea the OpenShell CLI uses to warn. */
const CREDENTIAL_WORDS = ['TOKEN', 'SECRET', 'PASSWORD', 'PASSWD', 'CREDENTIAL', 'CREDENTIALS', 'KEY', 'APIKEY'];

// ---------------------------------------------------------------------------------------------
// Policy generation (pure)
// ---------------------------------------------------------------------------------------------

// Both policy types below are `type` aliases rather than `interface`s: type aliases of object
// literals are assignable to the string-indexed shape the YAML emitter walks, interfaces are not.
//
// Members are written several to a line, each line carrying the case marker: these keys are
// OpenShell's own policy-file schema (snake_case, lower-case), serialised to YAML verbatim, so the
// casing is not ours to choose.

/** One endpoint of a generated network rule. Field names are OpenShell's (`schema.mdx`, "Endpoint Object"). */
export type OpenShellEndpoint = {
    host: string; port: number; protocol: 'rest'; access: 'full'; enforcement: 'enforce'; // case-violation-ok-legacy-back-compat: OpenShell policy schema key
};

/** The generated policy document, in OpenShell's schema (`schema.mdx`). */
export type OpenShellPolicy = {
    version: 1; // case-violation-ok-legacy-back-compat: OpenShell policy schema key
    filesystem_policy: { include_workdir: boolean; read_only: string[]; read_write: string[] }; // case-violation-ok-legacy-back-compat: OpenShell policy schema key
    landlock: { compatibility: 'hard_requirement' | 'best_effort' }; // case-violation-ok-legacy-back-compat: OpenShell policy schema key
    network_policies?: Record<string, { name: string; endpoints: OpenShellEndpoint[]; binaries: Array<{ path: string }> }>; // case-violation-ok-legacy-back-compat: OpenShell policy schema key
};

/** Inputs to {@link BuildOpenShellPolicy}. */
export interface OpenShellPolicyInput {
    NetworkPolicy: HarnessNetworkPolicy;
    /** `host` or `host:port` entries (port defaults to 443); wildcards like `*.example.com` allowed. */
    AllowedHosts?: string[];
    /** URL or `host:port` of the MJ MCP endpoint, added under `mcp-only`. */
    McpEndpoint?: string;
    /** Executable globs the network rule applies to. Defaults to any binary. */
    NetworkBinaries?: string[];
}

/** A `host`/`port` pair parsed from user configuration. */
interface HostPort {
    Host: string;
    Port: number;
}

/**
 * Builds the sandbox policy MJ hands to `openshell sandbox create --policy`.
 *
 * ## What it enforces
 *
 * - Filesystem: the workspace (`/sandbox`) and `/tmp` are read-write; system directories are
 *   read-only; everything else is inaccessible. Landlock compatibility is `hard_requirement`, so a
 *   host whose kernel cannot enforce the rules FAILS to start the sandbox instead of silently
 *   running unconfined — the same refuse-rather-than-pretend stance as the rest of this package.
 * - Network, by {@link HarnessNetworkPolicy}:
 *   - `none`: no network rules. OpenShell is deny-by-default, so nothing MJ-added is reachable.
 *   - `mcp-only`: the MJ MCP endpoint plus any `AllowedHosts` (the model vendor, typically).
 *   - `allowlist`: `AllowedHosts` only.
 *   - `open`: rejected. OpenShell has no allow-all rule — a rule must name a host, and a wildcard
 *     needs at least three DNS labels (`schema.mdx`, "Destination Fields") — so honouring `open`
 *     would mean inventing a lie. Use `allowlist` and name the hosts.
 * - Every allowed endpoint is an INSPECTED endpoint (`protocol: rest`) with `enforcement: enforce`.
 *   OpenShell's default is `audit`, which logs a violation and lets the request through — useless
 *   for containment. `access: full` keeps every method and path open: the boundary MJ draws is the
 *   HOST, not the request shape.
 *
 * Credentials are deliberately absent. Attached OpenShell providers contribute their own rules and
 * secrets; MJ never writes one into a policy file.
 *
 * @throws on `open`, on a malformed host/port, or on an invalid binary path. Fails closed.
 */
export function BuildOpenShellPolicy(input: OpenShellPolicyInput): OpenShellPolicy {
    if (input.NetworkPolicy === 'open') {
        throw new Error(
            "networkPolicy 'open' is not supported by the openshell sandbox provider: OpenShell is deny-by-default " +
                "and has no allow-all egress rule. List the hosts under sandbox.allowedHosts and use 'allowlist'.",
        );
    }

    const policy: OpenShellPolicy = {
        version: 1,
        filesystem_policy: {
            include_workdir: true,
            read_only: [...POLICY_READ_ONLY_PATHS],
            read_write: [...POLICY_READ_WRITE_PATHS],
        },
        landlock: { compatibility: 'hard_requirement' },
    };

    const endpoints = collectEndpoints(input);
    if (endpoints.length === 0) {
        return policy;
    }
    const binaries = (input.NetworkBinaries?.length ? input.NetworkBinaries : DEFAULT_NETWORK_BINARIES).map(validateBinaryPath);
    policy.network_policies = {
        [NETWORK_RULE_KEY]: {
            name: 'mj-harness-egress',
            endpoints: endpoints.map((e) => ({
                host: e.Host,
                port: e.Port,
                protocol: 'rest',
                access: 'full',
                enforcement: 'enforce',
            })),
            binaries: binaries.map((path) => ({ path })),
        },
    };
    return policy;
}

/** The hosts the chosen network policy allows, deduplicated, in a stable order. */
function collectEndpoints(input: OpenShellPolicyInput): HostPort[] {
    const wanted: HostPort[] = [];
    if (input.NetworkPolicy === 'mcp-only' && input.McpEndpoint) {
        wanted.push(parseEndpointReference(input.McpEndpoint, 'sandbox.openshell.mcpEndpoint'));
    }
    if (input.NetworkPolicy === 'mcp-only' || input.NetworkPolicy === 'allowlist') {
        for (const entry of input.AllowedHosts ?? []) {
            wanted.push(parseEndpointReference(entry, 'sandbox.allowedHosts'));
        }
    }
    const seen = new Set<string>();
    return wanted.filter((e) => {
        const id = `${e.Host.toLowerCase()}:${e.Port}`;
        if (seen.has(id)) {
            return false;
        }
        seen.add(id);
        return true;
    });
}

/**
 * Parses `host`, `host:port`, or a full URL into a validated host/port.
 *
 * Validation is strict because the result is written into a security policy: a host containing
 * whitespace or a colon-less port would otherwise produce a policy that means something other than
 * what the operator typed. Wildcards must have at least three DNS labels, mirroring OpenShell's own
 * rule so a mistake fails here with a clear message rather than at sandbox creation.
 */
function parseEndpointReference(reference: string, setting: string): HostPort {
    const text = typeof reference === 'string' ? reference.trim() : '';
    if (!text) {
        throw new Error(`${setting} contains an empty entry.`);
    }

    let host: string;
    let port: number;
    if (text.includes('://')) {
        let url: URL;
        try {
            url = new URL(text);
        } catch {
            throw new Error(`${setting} entry '${text}' is not a valid URL.`);
        }
        host = url.hostname;
        port = url.port ? Number(url.port) : url.protocol === 'http:' ? 80 : 443;
    } else {
        const lastColon = text.lastIndexOf(':');
        if (lastColon === -1) {
            host = text;
            port = 443;
        } else {
            host = text.slice(0, lastColon);
            port = Number(text.slice(lastColon + 1));
        }
    }

    if (!HOST_PATTERN.test(host)) {
        throw new Error(`${setting} entry '${text}' has an invalid host '${host}'.`);
    }
    if (host.includes('*') && host.split('.').length < 3) {
        throw new Error(`${setting} entry '${text}': a wildcard host needs at least three DNS labels (for example *.example.com).`);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${setting} entry '${text}' has an invalid port.`);
    }
    return { Host: host, Port: port };
}

/** A binary path must be absolute, so it names a real executable path (or glob) rather than a command. */
function validateBinaryPath(path: string): string {
    if (typeof path !== 'string' || !path.startsWith('/') || /\s/.test(path)) {
        throw new Error(`sandbox.openshell.networkBinaries entry '${String(path)}' must be an absolute executable path or glob.`);
    }
    return path;
}

/**
 * Serialises a policy as block-style YAML.
 *
 * Hand-written rather than a library because the document has a small fixed shape (maps, lists,
 * strings, integers, booleans) and no `yaml` package is a dependency of this package. JSON would be
 * the shortcut — it is a YAML subset — but OpenShell parses with its own YAML library
 * (`noyalib`, a `serde_yaml` replacement), and block YAML is what its documentation and examples
 * use, so emitting exactly that avoids betting on a parser corner. Every string is emitted as a
 * double-quoted JSON string, which is also a valid YAML double-quoted scalar, so no value can break
 * out of its line.
 */
export function SerializeOpenShellPolicy(policy: OpenShellPolicy): string {
    return emitYaml(policy, 0).join('\n') + '\n';
}

type YamlValue = string | number | boolean | YamlValue[] | { [key: string]: YamlValue | undefined };

function emitYaml(value: YamlValue, indent: number): string[] {
    const pad = ' '.repeat(indent);
    const lines: string[] = [];
    if (Array.isArray(value)) {
        for (const item of value) {
            if (isScalar(item)) {
                lines.push(`${pad}- ${scalar(item)}`);
            } else {
                const nested = emitYaml(item, indent + 2);
                lines.push(`${pad}- ${nested[0].slice(indent + 2)}`, ...nested.slice(1));
            }
        }
        return lines;
    }
    if (typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            if (child === undefined) {
                continue;
            }
            if (isScalar(child)) {
                lines.push(`${pad}${yamlKey(key)}: ${scalar(child)}`);
            } else if (Array.isArray(child) && child.length === 0) {
                lines.push(`${pad}${yamlKey(key)}: []`);
            } else {
                lines.push(`${pad}${yamlKey(key)}:`, ...emitYaml(child, indent + 2));
            }
        }
        return lines;
    }
    return [`${pad}${scalar(value)}`];
}

function isScalar(value: YamlValue): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function scalar(value: string | number | boolean): string {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function yamlKey(key: string): string {
    return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

/** `sandbox.*` settings after validation. */
export interface ResolvedOpenShellOptions {
    CliPath: string;
    Gateway?: string;
    Image?: string;
    Providers: string[];
    ProviderManagedEnv: string[];
    McpEndpoint?: string;
    NetworkBinaries?: string[];
    Limits?: HarnessSandboxLimits;
}

/**
 * Validates the `sandbox` settings for this provider.
 *
 * Throws on anything malformed: these values reach a command line and a policy file, so a typo must
 * fail the run rather than be quietly dropped.
 */
export function ResolveOpenShellOptions(settings: HarnessSandboxSettings): ResolvedOpenShellOptions {
    const os = settings.openshell ?? {};
    const cliPath = os.cliPath ?? 'openshell';
    if (typeof cliPath !== 'string' || !cliPath.trim() || cliPath.includes('\0')) {
        throw new Error('sandbox.openshell.cliPath must be a non-empty path.');
    }
    if (os.gateway !== undefined && (typeof os.gateway !== 'string' || !PROVIDER_NAME_PATTERN.test(os.gateway))) {
        throw new Error(`sandbox.openshell.gateway '${String(os.gateway)}' is not a valid gateway name.`);
    }
    if (settings.image !== undefined && (typeof settings.image !== 'string' || settings.image.startsWith('-') || /\s/.test(settings.image))) {
        throw new Error(`sandbox.image '${String(settings.image)}' is not a valid image reference.`);
    }
    const providers = os.providers ?? [];
    for (const p of providers) {
        if (typeof p !== 'string' || !PROVIDER_NAME_PATTERN.test(p)) {
            throw new Error(`sandbox.openshell.providers entry '${String(p)}' is not a valid provider name.`);
        }
    }
    const managed = os.providerManagedEnv ?? [];
    for (const n of managed) {
        if (typeof n !== 'string' || !IsValidEnvName(n)) {
            throw new Error(`sandbox.openshell.providerManagedEnv entry '${String(n)}' is not a valid environment variable name.`);
        }
    }
    return {
        CliPath: cliPath,
        Gateway: os.gateway,
        Image: settings.image,
        Providers: [...providers],
        ProviderManagedEnv: [...managed],
        McpEndpoint: os.mcpEndpoint,
        NetworkBinaries: os.networkBinaries,
        Limits: settings.limits,
    };
}

// ---------------------------------------------------------------------------------------------
// Command construction (pure)
// ---------------------------------------------------------------------------------------------

/** Global flags that select the gateway. `--gateway` is `global = true` in the CLI, so position is free. */
function gatewayArgs(options: ResolvedOpenShellOptions): string[] {
    return options.Gateway ? ['--gateway', options.Gateway] : [];
}

/** The sandbox name for a run: a lowercase DNS-1123-style label, safe for every OpenShell driver. */
export function BuildOpenShellSandboxName(runId: string): string {
    const slug = `mj-harness-${runId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    return slug.slice(0, 63).replace(/-+$/, '');
}

/** Converts docker-style memory (`2g`, `512m`) to the Kubernetes-style quantity OpenShell's `--memory` takes. */
function toOpenShellMemory(memory: string): string {
    const match = /^([0-9]+(?:\.[0-9]+)?)([bkmg])?$/i.exec(memory);
    if (!match) {
        throw new Error(`sandbox.limits.memory '${memory}' is not a docker memory value such as "512m" or "2g".`);
    }
    const unit = { b: '', k: 'Ki', m: 'Mi', g: 'Gi' }[(match[2] ?? 'b').toLowerCase() as 'b' | 'k' | 'm' | 'g'];
    return `${match[1]}${unit}`;
}

/** Inputs to {@link BuildOpenShellCreateArgs}. */
export interface OpenShellCreateSpec {
    SandboxName: string;
    PolicyFilePath: string;
    Options: ResolvedOpenShellOptions;
    /** Value for the `mj-run` / `mj-agent` traceability labels. */
    RunId: string;
    AgentId: string;
}

/**
 * Builds `openshell sandbox create` argv.
 *
 * Flag choices, each verified against `SandboxCommands::Create` in `crates/openshell-cli/src/main.rs`:
 * - `--detach` + `-- sleep infinity`: the create command must RETURN once the sandbox is Ready rather
 *   than attach to a shell. Structured output (`-o json`) is only legal with a trailing command if
 *   `--detach` is also given, and a keep-alive main process is what lets later `exec` calls land in
 *   the same sandbox. The image therefore needs a `sleep` binary.
 * - `--no-auto-providers`: never prompt, never silently create providers from local credentials; a
 *   missing provider is an error.
 * - `--no-tty`: determinism — never depend on whether MJAPI happens to have a terminal.
 * - `--no-credential-warnings` is NOT passed: MJ sets no `--env` here, so there is nothing to warn about.
 */
export function BuildOpenShellCreateArgs(spec: OpenShellCreateSpec): string[] {
    const { Options: o } = spec;
    const args = [...gatewayArgs(o), 'sandbox', 'create', '--name', spec.SandboxName, '--policy', spec.PolicyFilePath];
    if (o.Image) {
        args.push('--from', o.Image);
    }
    for (const provider of o.Providers) {
        args.push('--provider', provider);
    }
    if (o.Limits?.cpus !== undefined) {
        args.push('--cpu', String(o.Limits.cpus));
    }
    if (o.Limits?.memory !== undefined) {
        args.push('--memory', toOpenShellMemory(o.Limits.memory));
    }
    args.push(
        '--label',
        `mj-run=${labelValue(spec.RunId)}`,
        '--label',
        `mj-agent=${labelValue(spec.AgentId)}`,
        '--no-auto-providers',
        '--no-tty',
        '--detach',
        '-o',
        'json',
        '--',
        'sleep',
        'infinity',
    );
    return args;
}

function labelValue(value: string): string {
    return value.replace(LABEL_UNSAFE, '-').slice(0, 63) || 'unknown';
}

/** Builds `openshell sandbox delete <name>` argv. */
export function BuildOpenShellDeleteArgs(sandboxName: string, options: ResolvedOpenShellOptions): string[] {
    return [...gatewayArgs(options), 'sandbox', 'delete', sandboxName];
}

/** What {@link BuildOpenShellExecInvocation} decided about the granted environment. */
export interface OpenShellExecInvocation {
    Args: string[];
    /** Granted variables withheld because an OpenShell provider supplies them. Names only. */
    SkippedProviderManaged: string[];
    /** Variables passed on the command line whose NAME looks like a credential. Names only. */
    CredentialLikeOnArgv: string[];
}

/**
 * Builds `openshell sandbox exec` argv for one harness process.
 *
 * - `--no-tty`: the harness emits a JSON line stream; a PTY would mangle it.
 * - `--no-login-shell`: automation mode per `docs/how-it-works/sandboxes/overview.mdx` — the user's
 *   shell startup files cannot print into the stream or alter the command before it starts. The
 *   image must therefore put the harness on the sandbox's own PATH.
 * - Environment goes through `--env K=V`; there is no way to pass it out of band. So variables an
 *   OpenShell provider manages are skipped entirely (the proxy injects the real value on the wire),
 *   and anything else is on the CLI's argv — see the class limitations.
 * - The command follows `--`, so nothing in it is ever parsed as an OpenShell flag.
 */
export function BuildOpenShellExecInvocation(
    sandboxName: string,
    spec: HarnessProcessSpec,
    options: ResolvedOpenShellOptions,
): OpenShellExecInvocation {
    const managed = new Set(options.ProviderManagedEnv);
    const skipped: string[] = [];
    const credentialLike: string[] = [];
    const args = [...gatewayArgs(options), 'sandbox', 'exec', '--name', sandboxName];
    args.push('--workdir', spec.WorkingDirectory ?? OPENSHELL_WORKSPACE, '--no-tty', '--no-login-shell');
    for (const [name, value] of Object.entries(spec.Environment)) {
        if (!IsValidEnvName(name)) {
            throw new Error(`Granted environment variable name '${name}' is not a valid environment variable name.`);
        }
        if (name.toUpperCase().startsWith('OPENSHELL_')) {
            throw new Error(`Granted environment variable '${name}' uses the OPENSHELL_ prefix, which OpenShell reserves.`);
        }
        if (managed.has(name)) {
            skipped.push(name);
            continue;
        }
        if (looksLikeCredential(name)) {
            credentialLike.push(name);
        }
        args.push('--env', `${name}=${value}`);
    }
    if (!spec.Command) {
        throw new Error('A sandbox exec requires a command.');
    }
    args.push('--', spec.Command, ...spec.Args);
    return { Args: args, SkippedProviderManaged: skipped, CredentialLikeOnArgv: credentialLike };
}

function looksLikeCredential(name: string): boolean {
    return name
        .toUpperCase()
        .split('_')
        .some((segment) => CREDENTIAL_WORDS.includes(segment));
}

// ---------------------------------------------------------------------------------------------
// Process plumbing
// ---------------------------------------------------------------------------------------------

/** Result of a completed CLI invocation. */
export interface OpenShellCommandResult {
    ExitCode: number | null;
    Stdout: string;
    Stderr: string;
}

/** Runs the `openshell` CLI to completion. Injectable so tests need no CLI. */
export type OpenShellCommandRunner = (
    cliPath: string,
    args: string[],
    env: Record<string, string>,
    timeoutMs: number,
) => Promise<OpenShellCommandResult>;

/** The `spawn` signature the exec executor needs; injectable so tests need no CLI. */
export type OpenShellSpawn = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

/** The real runner: spawns the CLI with stdin closed and collects its output. */
export const SpawnOpenShellCommand: OpenShellCommandRunner = (cliPath, args, env, timeoutMs) =>
    new Promise<OpenShellCommandResult>((resolve, reject) => {
        const child = spawn(cliPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'], signal: AbortSignal.timeout(timeoutMs) });
        const out: string[] = [];
        const err: string[] = [];
        child.stdout.on('data', (c: Buffer) => out.push(c.toString()));
        child.stderr.on('data', (c: Buffer) => err.push(c.toString()));
        child.once('error', (e) => reject(e));
        child.once('close', (code) => resolve({ ExitCode: code, Stdout: out.join(''), Stderr: err.join('') }));
    });

/** True when `version` (`major.minor.patch...`) lies in {@link OPENSHELL_TESTED_VERSION_RANGE}. */
export function IsOpenShellVersionTested(version: string): boolean {
    const parsed = parseVersion(version);
    const min = parseVersion(OPENSHELL_TESTED_VERSION_RANGE.MinInclusive);
    const max = parseVersion(OPENSHELL_TESTED_VERSION_RANGE.MaxExclusive);
    if (!parsed || !min || !max) {
        return false;
    }
    return compareVersions(parsed, min) >= 0 && compareVersions(parsed, max) < 0;
}

function parseVersion(text: string): [number, number, number] | null {
    const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) {
            return a[i] - b[i];
        }
    }
    return 0;
}

/** Constructor seams, mainly for tests. */
export interface OpenShellSandboxProviderOptions {
    Runner?: OpenShellCommandRunner;
    SpawnProcess?: OpenShellSpawn;
    /** Directory under which per-run policy files are written. Defaults to the OS temp dir. */
    PolicyRootPath?: string;
}

/**
 * EXPERIMENTAL — runs each harness turn inside an NVIDIA OpenShell sandbox. Read the notes at the top
 * of this file before using it: the CLI it drives is pre-1.0, this provider has not been run against
 * a live gateway by its author, and it is never selected unless `sandbox.provider` is `"openshell"`.
 */
@RegisterClass(BaseSandboxProvider, 'openshell')
export class OpenShellSandboxProvider extends BaseSandboxProvider {
    private options: ResolvedOpenShellOptions = ResolveOpenShellOptions({});
    private versionChecked = false;
    private readonly runner: OpenShellCommandRunner;
    private readonly spawnProcess: OpenShellSpawn;
    private readonly policyRootPath: string;
    /** Policy temp directories by sandbox name, so Finalize can remove exactly what Provision wrote. */
    private readonly policyDirs = new Map<string, string>();

    public constructor(constructorOptions?: OpenShellSandboxProviderOptions) {
        super();
        this.runner = constructorOptions?.Runner ?? SpawnOpenShellCommand;
        this.spawnProcess = constructorOptions?.SpawnProcess ?? spawn;
        this.policyRootPath = constructorOptions?.PolicyRootPath ?? tmpdir();
    }

    /** @inheritdoc */
    public override Initialize(settings: HarnessSandboxSettings): void {
        this.options = ResolveOpenShellOptions(settings);
    }

    /** @inheritdoc */
    public async Provision(key: WorkspaceKey, config: SandboxConfig): Promise<SandboxHandle> {
        if (key.Scope !== 'run') {
            throw new Error(
                `The openshell sandbox provider supports only workspaceScope 'run' (got '${key.Scope}'): an OpenShell ` +
                    'sandbox has its own filesystem, so persistent agent / agent-user workspaces are not supported yet. ' +
                    "Set sandbox.workspaceScope to 'run'.",
            );
        }
        // Built BEFORE anything is created, so a bad policy (or the unsupported 'open') fails with
        // nothing to clean up.
        const policy = BuildOpenShellPolicy({
            NetworkPolicy: config.NetworkPolicy,
            AllowedHosts: config.AllowedHosts,
            McpEndpoint: this.options.McpEndpoint,
            NetworkBinaries: this.options.NetworkBinaries,
        });
        await this.warnIfCliVersionUntested();
        this.noteProviderNetworkRules(config.NetworkPolicy);

        const sandboxName = BuildOpenShellSandboxName(key.RunId);
        const policyDir = await mkdtemp(join(this.policyRootPath, 'mj-openshell-'));
        this.policyDirs.set(sandboxName, policyDir);
        const policyFile = join(policyDir, 'policy.yaml');
        await writeFile(policyFile, SerializeOpenShellPolicy(policy), { mode: 0o600 });

        const options: ResolvedOpenShellOptions = { ...this.options, Image: config.Image ?? this.options.Image };
        try {
            const args = BuildOpenShellCreateArgs({
                SandboxName: sandboxName,
                PolicyFilePath: policyFile,
                Options: options,
                RunId: key.RunId,
                AgentId: key.AgentId,
            });
            await this.runCli(args, CREATE_TIMEOUT_MS, 'sandbox create');
        } catch (e) {
            // A create that failed partway (for example a provisioning timeout, which OpenShell
            // RETAINS for inspection) must not leave the sandbox or the policy file behind.
            await this.deleteQuietly(sandboxName);
            await this.removePolicyDir(sandboxName);
            throw e;
        }
        LogStatus(`OpenShell sandbox started: ${sandboxName}`);

        return {
            WorkspacePath: OPENSHELL_WORKSPACE,
            Key: key,
            // A run-scoped sandbox is always discarded; durable scopes are rejected above.
            Ephemeral: true,
            Executor: new OpenShellExecExecutor(sandboxName, this.options, { SpawnProcess: this.spawnProcess }),
        };
    }

    /** @inheritdoc */
    public async Finalize(handle: SandboxHandle, _outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        const sandboxName = BuildOpenShellSandboxName(handle.Key.RunId);
        await this.deleteQuietly(sandboxName);
        await this.removePolicyDir(sandboxName);
    }

    /**
     * Logs when the installed CLI is outside the tested range. Never fails the run: the range is a
     * caution, and a CLI that cannot report its version will fail more usefully at `create`.
     */
    private async warnIfCliVersionUntested(): Promise<void> {
        if (this.versionChecked) {
            return;
        }
        this.versionChecked = true;
        try {
            const result = await this.runner(
                this.options.CliPath,
                ['--version'],
                BuildHostEnvironment(OPENSHELL_CLI_ENV_ALLOWLIST),
                VERSION_TIMEOUT_MS,
            );
            const text = `${result.Stdout} ${result.Stderr}`.trim();
            if (result.ExitCode !== 0 || !IsOpenShellVersionTested(text)) {
                LogStatus(
                    `WARNING: the OpenShell sandbox provider is EXPERIMENTAL and was written for openshell ` +
                        `>=${OPENSHELL_TESTED_VERSION_RANGE.MinInclusive} <${OPENSHELL_TESTED_VERSION_RANGE.MaxExclusive}; ` +
                        `\`openshell --version\` reported '${text || `exit code ${result.ExitCode}`}'. Its CLI, policy schema ` +
                        `and protocol have changed between pre-1.0 releases, so expect failures.`,
                );
            }
        } catch (e) {
            LogStatus(`WARNING: could not run '${this.options.CliPath} --version' to check the OpenShell CLI: ${describeError(e)}`);
        }
    }

    /** Says plainly that attached providers add network rules on top of the MJ policy. */
    private noteProviderNetworkRules(policy: HarnessNetworkPolicy): void {
        if (policy === 'none' && this.options.Providers.length > 0) {
            LogStatus(
                `NOTE: networkPolicy 'none' adds no MJ network rules, but the attached OpenShell providers ` +
                    `(${this.options.Providers.join(', ')}) contribute their own endpoint rules. Egress is limited to those.`,
            );
        }
    }

    /** Runs the CLI and throws, with a bounded and secret-free message, on a non-zero exit. */
    private async runCli(args: string[], timeoutMs: number, what: string): Promise<OpenShellCommandResult> {
        const result = await this.runner(this.options.CliPath, args, BuildHostEnvironment(OPENSHELL_CLI_ENV_ALLOWLIST), timeoutMs);
        if (result.ExitCode !== 0) {
            const detail = result.Stderr.trim() || result.Stdout.trim();
            throw new Error(`openshell ${what} failed (code ${result.ExitCode}): ${detail.slice(0, 2000)}`);
        }
        return result;
    }

    /** `openshell sandbox delete`, which must never throw: it runs on failure and cancellation paths. */
    private async deleteQuietly(sandboxName: string): Promise<void> {
        try {
            await this.runCli(BuildOpenShellDeleteArgs(sandboxName, this.options), DELETE_TIMEOUT_MS, 'sandbox delete');
        } catch (e) {
            // Never rethrow from finalize: a cleanup error would replace the real error and lose the
            // diagnosis. The sandbox is named mj-harness-<RunId>, so an operator can delete it by hand.
            LogError(`Failed to delete OpenShell sandbox ${sandboxName}: ${describeError(e)}`);
        }
    }

    private async removePolicyDir(sandboxName: string): Promise<void> {
        const dir = this.policyDirs.get(sandboxName);
        if (!dir) {
            return;
        }
        this.policyDirs.delete(sandboxName);
        try {
            await rm(dir, { recursive: true, force: true });
        } catch (e) {
            LogError(`Failed to remove OpenShell policy directory ${dir}: ${describeError(e)}`);
        }
    }
}

/**
 * Runs harness processes via `openshell sandbox exec` into an already-running per-run sandbox.
 *
 * ## stdin must be closed
 *
 * When stdin is not a terminal, `openshell sandbox exec` reads it to EOF BEFORE it issues the exec
 * (`sandbox_exec_grpc` in `crates/openshell-cli/src/run.rs` does `read_to_end` first). The harness
 * adapters never write to stdin, so leaving the pipe open would hang every turn forever with no
 * output. It is closed immediately after spawn, which also hands the harness an empty stdin — the
 * correct input for a `-p` prompt-on-argv invocation.
 */
export class OpenShellExecExecutor implements SandboxExecutor {
    private readonly spawnProcess: OpenShellSpawn;
    private readonly loggedCredentialNames = new Set<string>();

    public constructor(
        private readonly sandboxName: string,
        private readonly options: ResolvedOpenShellOptions,
        executorOptions?: { SpawnProcess?: OpenShellSpawn },
    ) {
        this.spawnProcess = executorOptions?.SpawnProcess ?? spawn;
    }

    /** @inheritdoc */
    public Run(spec: HarnessProcessSpec): HarnessProcess {
        const invocation = BuildOpenShellExecInvocation(this.sandboxName, spec, this.options);
        this.logEnvironmentDecisions(invocation);
        const child = this.spawnProcess(this.options.CliPath, invocation.Args, {
            env: BuildHostEnvironment(OPENSHELL_CLI_ENV_ALLOWLIST),
            signal: spec.CancellationToken,
        });
        child.stdin.end();
        return WrapChildProcess(child);
    }

    /** Reports, by NAME only, which variables were withheld and which travel on the CLI command line. */
    private logEnvironmentDecisions(invocation: OpenShellExecInvocation): void {
        const fresh = (names: string[]): string[] => names.filter((n) => !this.loggedCredentialNames.has(n));
        const skipped = fresh(invocation.SkippedProviderManaged);
        if (skipped.length > 0) {
            skipped.forEach((n) => this.loggedCredentialNames.add(n));
            LogStatus(`OpenShell sandbox ${this.sandboxName}: not injecting provider-managed variable(s): ${skipped.join(', ')}.`);
        }
        const exposed = fresh(invocation.CredentialLikeOnArgv);
        if (exposed.length > 0) {
            exposed.forEach((n) => this.loggedCredentialNames.add(n));
            LogError(
                `Variable(s) ${exposed.join(', ')} look like credentials and are passed to the sandbox with ` +
                    `'openshell sandbox exec --env', which puts the VALUE on the local command line. Attach an OpenShell ` +
                    `provider and list the name(s) in sandbox.openshell.providerManagedEnv so the real value never leaves the gateway.`,
            );
        }
    }
}

function describeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
