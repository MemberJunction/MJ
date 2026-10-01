/**
 * Builds the environment a HOST-SIDE process is spawned with.
 *
 * ## Why this exists
 *
 * Several places in this package spawn a process on the MJAPI host: the local provider spawns the
 * harness itself, and the container/remote providers spawn a control-plane CLI (`docker`,
 * `openshell`). In every case the default — Node's `spawn()` with no `env` option — hands the child
 * MJAPI's ENTIRE `process.env`: database credentials, vendor API keys, signing secrets. A control
 * CLI has no business holding any of that, and for the local harness it is exactly the over-granting
 * the credential model exists to prevent.
 *
 * So every spawn site goes through {@link BuildHostEnvironment} with an explicit allowlist. One
 * helper rather than three hand-rolled loops, so the policy has a single place to be reviewed.
 */

/**
 * What a locally-spawned harness inherits before granted credentials are layered on top.
 *
 * `HOME` is on the list for a specific reason. Local CLI harnesses keep their own login state under
 * the user's home directory (Claude Code in `~/.claude`), so a developer who has already
 * authenticated their CLI can run a harness agent with no credential row and no API key at all —
 * the "true local" mode. Without HOME the harness cannot find its session and reports "Not logged
 * in", which reads as a broken integration rather than a stripped variable.
 */
export const LOCAL_HARNESS_ENV_ALLOWLIST: readonly string[] = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'TERM'];

/**
 * What the `docker` CLI needs to find and talk to its daemon, and nothing else.
 *
 * `DOCKER_HOST` / `DOCKER_CONTEXT` / `DOCKER_CONFIG` select the daemon and its client config;
 * `DOCKER_CERT_PATH` / `DOCKER_TLS_VERIFY` carry the (non-secret) location of TLS material for a
 * remote daemon. `HOME` lets the CLI find `~/.docker` when none of those are set, and
 * `XDG_RUNTIME_DIR` locates a rootless daemon's socket. `SystemRoot`/`WINDIR` are required for any
 * child process on Windows.
 */
export const DOCKER_CLI_ENV_ALLOWLIST: readonly string[] = [
    'PATH',
    'HOME',
    'XDG_RUNTIME_DIR',
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_CONFIG',
    'DOCKER_CERT_PATH',
    'DOCKER_TLS_VERIFY',
    'SystemRoot',
    'WINDIR',
];

/**
 * What the `openshell` CLI needs to find its gateway and the credentials it stored for it.
 *
 * Gateway metadata and auth tokens live under the user's config directory (`~/.config/openshell`),
 * hence `HOME` / `XDG_CONFIG_HOME`. The `OPENSHELL_*` variables are the CLI's documented gateway
 * selectors (`OPENSHELL_GATEWAY`, `OPENSHELL_GATEWAY_ENDPOINT`, `OPENSHELL_GATEWAY_INSECURE`,
 * `OPENSHELL_WORKSPACE`) plus the provisioning-timeout knob. Source: `Cli` struct in
 * `crates/openshell-cli/src/main.rs` and `sandbox_create` in `crates/openshell-cli/src/run.rs`.
 */
export const OPENSHELL_CLI_ENV_ALLOWLIST: readonly string[] = [
    'PATH',
    'HOME',
    'XDG_CONFIG_HOME',
    'XDG_RUNTIME_DIR',
    'TMPDIR',
    'LANG',
    'OPENSHELL_GATEWAY',
    'OPENSHELL_GATEWAY_ENDPOINT',
    'OPENSHELL_GATEWAY_INSECURE',
    'OPENSHELL_WORKSPACE',
    'OPENSHELL_PROVISION_TIMEOUT',
    'SystemRoot',
    'WINDIR',
];

/**
 * Copies only the allowlisted variables that are actually set.
 *
 * Pure (takes the source as a parameter) so the allowlists can be tested without touching the real
 * `process.env`.
 */
export function BuildHostEnvironment(allowlist: readonly string[], source: NodeJS.ProcessEnv = process.env): Record<string, string> {
    const env: Record<string, string> = {};
    for (const name of allowlist) {
        const value = source[name];
        if (value !== undefined) {
            env[name] = value;
        }
    }
    return env;
}

/** The shape every environment variable name must have to be safely placed in a process env. */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** True when `name` is a legal environment variable name (no `=`, no whitespace, no leading digit). */
export function IsValidEnvName(name: string): boolean {
    return ENV_NAME_PATTERN.test(name);
}
