import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Settings } from '../settings';
import { InfrastructureError } from '../target/VitestCatchTarget';

export interface SandboxMount { Host: string; Container: string; Mode: 'ro' | 'rw'; }
/**
 * `Tmpfs` lists container paths that get a 256 MB tmpfs with mode 1777, so the non-root container user can write
 * there even when the mount point is an existing folder (Docker otherwise copies that folder's mode, owned by root).
 */
export interface SandboxRunOptions { Mounts: SandboxMount[]; Tmpfs?: string[]; WorkDir: string; Command: string[]; TimeoutMs: number; Env?: Record<string, string>; }
export interface SandboxRunResult { ExitCode: number | null; TimedOut: boolean; Stdout: string; Stderr: string; DurationMs: number; }
export type CommandRunner = (file: string, args: string[], options: { timeoutMs: number }) => Promise<SandboxRunResult>;
/** The host user the container runs as, and the host home folder whose dot-folders are never mounted. */
export interface SandboxHost { Uid: number; Gid: number; Home: string; }

const ENV_ALLOW = new Set(['TZ', 'HOME', 'CI', 'NODE_OPTIONS', 'TURBO_CACHE_DIR', 'TURBO_TELEMETRY_DISABLED', 'TURBO_LOG_ORDER']);
const MAX_OUTPUT = 32 * 1024 * 1024;
/**
 * Host folders the sandbox never mounts, nor any folder inside or above them. The runner user has
 * passwordless sudo, so a socket or system path is a way out. On macOS, Docker Desktop keeps its sockets
 * in `~/.docker` and `~/Library/Containers/com.docker.docker`. Every dot-folder directly under the home
 * folder (credentials and tool config) is denied as well, see `isDenied`.
 */
const SYSTEM_DENIED_ROOTS = ['/etc', '/proc', '/sys', '/dev', '/run', '/var/run', '/root', '/boot', '/private/etc', '/private/var/run'];

/** The current user and home folder. */
function currentHost(): SandboxHost { const u = userInfo(); return { Uid: u.uid, Gid: u.gid, Home: homedir() }; }

/**
 * Runs untrusted code in a Docker container with no network, no secrets and its own PID namespace (D28).
 * Refuses to run when the host user is root, since the container would then run as root too.
 * The container runs as the host uid, which the image does not know; `identityDir` holds the passwd and
 * group files mounted over `/etc/passwd` and `/etc/group` so that `os.userInfo()` resolves in the container.
 */
export class Sandbox {
    private readonly deniedRoots: string[];
    private readonly homes: string[];
    constructor(private readonly settings: Settings['Sandbox'], private readonly runner: CommandRunner = execFileRunner, private readonly host: SandboxHost = currentHost(), private readonly identityDir: string = join(tmpdir(), 'jit-catch-sandbox')) {
        this.homes = [...new Set([resolve(host.Home), resolveExisting(resolve(host.Home))])];
        this.deniedRoots = [...SYSTEM_DENIED_ROOTS, ...this.homes.flatMap((h) => [join(h, '.docker'), join(h, 'Library', 'Containers', 'com.docker.docker')])];
    }

    public BuildArgs(o: SandboxRunOptions): string[] {
        return this.buildArgsNamed(o, newContainerName());
    }

    /** Runs the command; after a timeout it removes the container by name, since killing the docker client leaves it running. */
    public async Run(o: SandboxRunOptions): Promise<SandboxRunResult> {
        const name = newContainerName();
        const result = await this.runner('docker', this.buildArgsNamed(o, name), { timeoutMs: o.TimeoutMs });
        if (result.TimedOut) await this.runner('docker', ['rm', '-f', name], { timeoutMs: 10_000 }).catch(() => undefined);
        return result;
    }

    private buildArgsNamed(o: SandboxRunOptions, name: string): string[] {
        if (this.host.Uid === 0) throw new InfrastructureError('refusing to run the sandbox as root (uid 0): run the JiT pipeline as an unprivileged user');
        const args = ['run', '--rm', '--name', name, '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--pids-limit', String(this.settings.PidsLimit), '--memory', `${this.settings.MemoryGB}g`, '--cpus', String(this.settings.Cpus),
            '--user', `${this.host.Uid}:${this.host.Gid}`, '--workdir', o.WorkDir];
        for (const m of [...this.identityMounts(), ...o.Mounts]) args.push('-v', `${this.checkedHost(m)}:${m.Container}:${m.Mode}`);
        for (const t of o.Tmpfs ?? []) args.push('--tmpfs', `${t}:rw,size=256m,mode=1777`);
        for (const [k, v] of Object.entries(o.Env ?? {})) {
            if (!ENV_ALLOW.has(k)) throw new Error(`environment variable ${k} is not allowed in the sandbox`);
            args.push('-e', `${k}=${v}`);
        }
        return [...args, this.settings.Image, ...o.Command];
    }

    /** Writes the passwd and group files for the host user (home `/tmp`, no shell) and returns their read-only mounts. */
    private identityMounts(): SandboxMount[] {
        mkdirSync(this.identityDir, { recursive: true });
        const passwd = join(this.identityDir, `passwd-${this.host.Uid}`);
        const group = join(this.identityDir, `group-${this.host.Gid}`);
        writeFileSync(passwd, `root:x:0:0:root:/root:/usr/sbin/nologin\njit:x:${this.host.Uid}:${this.host.Gid}:jit:/tmp:/usr/sbin/nologin\n`);
        writeFileSync(group, `root:x:0:\njit:x:${this.host.Gid}:\n`);
        return [{ Host: passwd, Container: '/etc/passwd', Mode: 'ro' }, { Host: group, Container: '/etc/group', Mode: 'ro' }];
    }

    /**
     * The real on-disk host path of a mount, which is what Docker mounts; throws when the mount would expose
     * a denied folder or breaks the `-v` syntax (a `:` or `,` in the given path, its realpath or the container path).
     */
    private checkedHost(m: SandboxMount): string {
        const host = resolve(m.Host);
        const real = resolveExisting(host);
        if (/[:,]/.test(m.Host) || /[:,]/.test(real) || /[:,]/.test(m.Container) || this.isDenied(host) || this.isDenied(real)) throw new Error(`refusing to mount ${m.Host}`);
        return real;
    }

    /**
     * True for `/`, a Docker socket, a denied folder, a folder inside one, or a folder that contains one; also for
     * a dot-folder directly under the home folder and everything inside it.
     */
    private isDenied(p: string): boolean {
        if (p === '/' || p.includes('docker.sock')) return true;
        if (this.homes.some((h) => p.startsWith(`${h}/.`))) return true;
        return this.deniedRoots.some((d) => p === d || p.startsWith(`${d}/`) || d.startsWith(`${p}/`));
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

/**
 * Native `realpath` of the path (true on-disk spelling, so case and symlinks cannot hide a denied folder),
 * or of its nearest existing parent joined with the rest.
 */
function resolveExisting(p: string): string {
    if (existsSync(p)) return realpathSync.native(p);
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
