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
export function wrapChildProcess(child: ChildProcessWithoutNullStreams): HarnessProcess {
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
            if (child.exitCode === null && !child.killed) {
                child.kill();
            }
        },
    };
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

    /** @inheritdoc */
    public Run(spec: HarnessProcessSpec): HarnessProcess {
        const child = spawn(spec.Command, spec.Args, {
            cwd: spec.WorkingDirectory ?? this.defaultWorkingDirectory,
            // PATH is inherited so the binary resolves; everything else is exactly what the agent
            // was granted. Passing the host environment through would hand the harness whatever
            // credentials the MJAPI process happens to hold.
            env: { PATH: process.env.PATH ?? '', ...spec.Environment },
            signal: spec.CancellationToken,
        });
        return wrapChildProcess(child);
    }
}
