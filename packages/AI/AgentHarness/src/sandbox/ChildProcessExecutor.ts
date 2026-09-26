import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { HarnessProcess, HarnessProcessSpec, SandboxExecutor } from './SandboxExecutor.js';

/**
 * Turns a spawned child process into the backend-neutral {@link HarnessProcess} shape.
 *
 * Shared by every executor that ultimately runs a local binary — the local provider spawns the
 * harness itself, and the Docker provider spawns `docker exec`. Only the argv differs, so the
 * process plumbing lives here once rather than in each provider.
 */
export function WrapChildProcess(child: ChildProcessWithoutNullStreams): HarnessProcess {
    return {
        Stdout: readLines(child.stdout),
        Stderr: readLines(child.stderr),
        ExitCode: new Promise<number | null>((resolve) => {
            if (child.exitCode !== null) {
                resolve(child.exitCode);
                return;
            }
            child.once('close', (code) => resolve(code));
            // A spawn failure (ENOENT for a missing binary) emits 'error' and never 'close', so
            // without this the ExitCode promise would hang forever and take the turn with it.
            child.once('error', () => resolve(null));
        }),
        Kill: () => {
            if (child.exitCode !== null || child.killed) {
                return;
            }
            child.kill('SIGTERM');
            // Escalate to SIGKILL if the harness ignores/hangs on SIGTERM. This runs on every
            // AI-agent CLI turn (BaseCliHarnessAdapter calls Kill() per turn), so without this a
            // harness process that hangs on SIGTERM becomes a permanent orphan with no cap over many
            // runs.
            //
            // NOTE: `child.killed` becomes `true` synchronously as soon as `kill()` successfully
            // *sends* a signal — NOT once the process has actually exited (Node sets it inside
            // `kill()` itself, independent of whether the OS delivered/honored it). So this callback
            // cannot re-check `!child.killed` to decide whether to escalate — it would already be
            // `true` from the SIGTERM call above and the SIGKILL would never fire. The `once('exit', …)`
            // listener below is what actually tells us the process is gone (by clearing this timer
            // before it runs), so if this callback DOES run, the process is still alive and SIGKILL is
            // unconditionally correct.
            const forceKillTimer = setTimeout(() => {
                child.kill('SIGKILL');
            }, 5000);
            forceKillTimer.unref();
            child.once('exit', () => clearTimeout(forceKillTimer));
        },
    };
}

/** @deprecated Use {@link WrapChildProcess}. */
export function wrapChildProcess(child: ChildProcessWithoutNullStreams): HarnessProcess {
    return WrapChildProcess(child);
}

/** Frames a stream into complete lines. */
async function* readLines(stream: Readable): AsyncIterable<string> {
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of lines) {
        yield line;
    }
}

/**
 * Runs harness processes directly on the MJAPI host.
 *
 * Provides no isolation whatsoever — see {@link LocalDirectorySandboxProvider} for what that means
 * and why it is a development-only posture.
 */
export class ChildProcessExecutor implements SandboxExecutor {
    public constructor(private readonly defaultWorkingDirectory: string) {}

    /**
     * The host variables a locally-spawned harness inherits, before granted credentials are layered
     * on top.
     *
     * Deliberately an ALLOWLIST, not the full process environment: passing everything through would
     * hand the harness whatever credentials the MJAPI process happens to hold, which is exactly the
     * over-granting the credential model exists to prevent.
     *
     * `HOME` is on the list for a specific reason. Local CLI harnesses keep their own login state
     * under the user's home directory (Claude Code in `~/.claude`), so a developer who has already
     * authenticated their CLI can run a harness agent with no credential row and no API key at all —
     * the "true local" mode. Without HOME the harness cannot find its session and reports "Not
     * logged in", which reads as a broken integration rather than a stripped variable.
     *
     * This applies ONLY to local execution. The Docker executor passes just the granted environment,
     * because a container has no business inheriting the host developer's identity.
     */
    private baseEnvironment(): Record<string, string> {
        const allowed = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'TERM'];
        const env: Record<string, string> = {};
        for (const key of allowed) {
            const value = process.env[key];
            if (value !== undefined) {
                env[key] = value;
            }
        }
        return env;
    }

    /** @inheritdoc */
    public Run(spec: HarnessProcessSpec): HarnessProcess {
        const child = spawn(spec.Command, spec.Args, {
            cwd: spec.WorkingDirectory ?? this.defaultWorkingDirectory,
            env: { ...this.baseEnvironment(), ...spec.Environment },
            signal: spec.CancellationToken,
        });
        return WrapChildProcess(child);
    }
}
