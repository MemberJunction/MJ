/**
 * How to run one command inside a sandbox.
 *
 * Deliberately NOT modelled on Node's `ChildProcess`. Spawning locally and `docker exec` both
 * happen to produce a child process, but a Kubernetes exec is streams over a websocket and a remote
 * runner is HTTP — an interface that promised `ChildProcess` could never be implemented honestly by
 * either. Promising async iterables of lines instead lets every backend satisfy the same contract.
 *
 * The second benefit is testing: a fake executor replays canned JSONL, so adapter behaviour can be
 * unit-tested without a harness binary, a container, or a network.
 */
export interface HarnessProcessSpec {
    /** Binary or command to run inside the sandbox. */
    Command: string;
    /** Arguments, already split — never a shell string, so nothing needs quoting or escaping. */
    Args: string[];
    /** Environment for the process. Exactly what the agent was granted; never the host's full env. */
    Environment: Record<string, string>;
    /** Working directory inside the sandbox. Defaults to the workspace root. */
    WorkingDirectory?: string;
    /** Aborts the process. */
    CancellationToken?: AbortSignal;
}

/**
 * A running process inside a sandbox, wherever that sandbox physically is.
 */
export interface HarnessProcess {
    /** stdout as complete lines, already framed. Ends when the process closes its stream. */
    Stdout: AsyncIterable<string>;
    /** stderr as complete lines. Consumers typically buffer this for error reporting. */
    Stderr: AsyncIterable<string>;
    /** Resolves with the exit code (or null if terminated by signal) once the process has exited. */
    ExitCode: Promise<number | null>;
    /** Terminates the process. Must be safe to call more than once, and after exit. */
    Kill(): void;
}

/**
 * Runs commands inside a provisioned sandbox.
 *
 * Obtained from {@link SandboxHandle}, so the sandbox provider — not the adapter — decides WHERE a
 * harness process runs. That separation is the whole point: `CodexAdapter` builds argv and parses
 * events, and never learns whether it is executing on the MJAPI host, in a container, or in a pod.
 */
export interface SandboxExecutor {
    Run(spec: HarnessProcessSpec): HarnessProcess;
}
