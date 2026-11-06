import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname } from 'node:path';
import type { Settings } from '../settings';

export interface SandboxMount { Host: string; Container: string; Mode: 'ro' | 'rw'; }
export interface SandboxRunOptions { Mounts: SandboxMount[]; Tmpfs?: string[]; WorkDir: string; Command: string[]; TimeoutMs: number; Env?: Record<string, string>; }
export interface SandboxRunResult { ExitCode: number | null; TimedOut: boolean; Stdout: string; Stderr: string; DurationMs: number; }
export type CommandRunner = (file: string, args: string[], options: { timeoutMs: number }) => Promise<SandboxRunResult>;

const ENV_ALLOW = new Set(['TZ', 'HOME', 'CI', 'NODE_OPTIONS', 'TURBO_CACHE_DIR', 'TURBO_TELEMETRY_DISABLED', 'TURBO_LOG_ORDER']);
const MAX_OUTPUT = 32 * 1024 * 1024;
/** Host folders the sandbox never mounts. The runner user has passwordless sudo, so a socket or system path is a way out. */
const DENIED_ROOTS = ['/etc', '/proc', '/sys', '/dev', '/run', '/var/run', '/root', '/boot', '/private/etc', '/private/var/run'];

/** Runs untrusted code in a Docker container with no network, no secrets and its own PID namespace (D28). */
export class Sandbox {
    constructor(private readonly settings: Settings['Sandbox'], private readonly runner: CommandRunner = execFileRunner) {}

    public BuildArgs(o: SandboxRunOptions): string[] {
        return this.buildArgsNamed(o, newContainerName());
    }

    /** Runs the command; after a timeout it kills the container by name, since killing the docker client leaves it running. */
    public async Run(o: SandboxRunOptions): Promise<SandboxRunResult> {
        const name = newContainerName();
        const result = await this.runner('docker', this.buildArgsNamed(o, name), { timeoutMs: o.TimeoutMs });
        if (result.TimedOut) await this.runner('docker', ['kill', name], { timeoutMs: 10_000 }).catch(() => undefined);
        return result;
    }

    private buildArgsNamed(o: SandboxRunOptions, name: string): string[] {
        const args = ['run', '--rm', '--name', name, '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--pids-limit', String(this.settings.PidsLimit), '--memory', `${this.settings.MemoryGB}g`, '--cpus', String(this.settings.Cpus),
            '--user', `${userInfo().uid}:${userInfo().gid}`, '--workdir', o.WorkDir];
        for (const m of o.Mounts) {
            const denied = (p: string) => p === '/' || p.includes('docker.sock') || DENIED_ROOTS.some((d) => p === d || p.startsWith(`${d}/`));
            if (denied(m.Host) || denied(resolveExisting(m.Host))) throw new Error(`refusing to mount ${m.Host}`);
            args.push('-v', `${m.Host}:${m.Container}:${m.Mode}`);
        }
        for (const t of o.Tmpfs ?? []) args.push('--tmpfs', `${t}:rw,size=256m`);
        for (const [k, v] of Object.entries(o.Env ?? {})) {
            if (!ENV_ALLOW.has(k)) throw new Error(`environment variable ${k} is not allowed in the sandbox`);
            args.push('-e', `${k}=${v}`);
        }
        return [...args, this.settings.Image, ...o.Command];
    }

    /** Builds the image from `dockerfileDir/Dockerfile` on the host (network allowed here; nothing untrusted runs). */
    public async EnsureImage(dockerfileDir: string): Promise<void> {
        const r = await this.runner('docker', ['build', '-q', '-t', this.settings.Image, dockerfileDir], { timeoutMs: 15 * 60_000 });
        if (r.ExitCode !== 0) throw new Error(`docker build failed: ${r.Stderr}`);
    }
}

/** A unique container name: `jit-` plus 12 hex characters. */
function newContainerName(): string {
    return `jit-${randomBytes(6).toString('hex')}`;
}

/** `realpath` of the path, or of its nearest existing parent joined with the rest, so a symlink cannot hide a denied folder. */
function resolveExisting(p: string): string {
    if (existsSync(p)) return realpathSync(p);
    const parent = dirname(p);
    return parent === p ? p : `${resolveExisting(parent).replace(/\/$/, '')}/${p.slice(parent.length).replace(/^\//, '')}`;
}

function execFileRunner(file: string, args: string[], options: { timeoutMs: number }): Promise<SandboxRunResult> {
    const started = Date.now();
    return new Promise((resolve) => {
        const child = execFile(file, args, { timeout: options.timeoutMs, maxBuffer: MAX_OUTPUT, killSignal: 'SIGKILL', env: { PATH: process.env.PATH, HOME: process.env.HOME } }, (error, stdout, stderr) => {
            const timedOut = Boolean(error && 'killed' in error && error.killed);
            const errText = String(stderr) || (error ? error.message : '');
            resolve({ ExitCode: timedOut ? null : (child.exitCode ?? (error ? 1 : 0)), TimedOut: timedOut, Stdout: String(stdout), Stderr: errText, DurationMs: Date.now() - started });
        });
    });
}
