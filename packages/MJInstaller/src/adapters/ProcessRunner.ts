/**
 * Adapter for spawning child processes and capturing output.
 *
 * Used by installer phases that run external tools (`npm`, `npx mj codegen`,
 * `npx turbo build`, etc.). Handles cross-platform differences:
 *
 * - **Windows**: Spawns with `shell: true` so that `.cmd` shims (npm, npx)
 *   are resolved correctly. Uses `taskkill /F /T` for process tree cleanup.
 * - **Unix**: Spawns without shell. Uses process group kill (`kill -SIGTERM -pid`)
 *   with a 5-second SIGKILL fallback.
 *
 * @module adapters/ProcessRunner
 * @see DependencyPhase — uses Run for `npm install` and `npm run build`.
 * @see CodeGenPhase — uses Run for `npx mj codegen` and `npx turbo build`.
 * @see SmokeTestPhase — uses Run for service startup and killByPort for cleanup.
 *
 * @example
 * ```typescript
 * const runner = new ProcessRunner();
 * const result = await runner.Run('npm', ['install'], {
 *   Cwd: '/path/to/repo',
 *   TimeoutMs: 600_000,
 *   OnStdout: (line) => console.log(line),
 * });
 * if (result.ExitCode !== 0) console.error(result.Stderr);
 * ```
 */

import { spawn, execSync } from 'node:child_process';

/**
 * Result of a child process execution.
 *
 * @see ProcessRunner.Run — returns this after the process exits or times out.
 */
export interface ProcessResult {
  /** Process exit code (`0` = success). Set to `1` on spawn errors. */
  ExitCode: number;
  /** Accumulated stdout output from the process. */
  Stdout: string;
  /** Accumulated stderr output from the process. */
  Stderr: string;
  /** Whether the process was killed due to exceeding {@link ProcessOptions.TimeoutMs}. */
  TimedOut: boolean;
}

/**
 * Options for configuring child process execution.
 *
 * @see ProcessRunner.Run
 */
export interface ProcessOptions {
  /** Working directory for the child process (defaults to `process.cwd()`). */
  Cwd?: string;
  /** Additional environment variables (merged with `process.env`). */
  Env?: Record<string, string>;
  /** Maximum execution time in milliseconds. Process tree is killed on timeout. */
  TimeoutMs?: number;
  /**
   * Streaming callback invoked with each line of stdout.
   * Used by phases to emit `step:progress` events for real-time output.
   */
  OnStdout?: (line: string) => void;
  /**
   * Streaming callback invoked with each line of stderr.
   * Used by phases to emit verbose log events for diagnostic output.
   */
  OnStderr?: (line: string) => void;
}

/**
 * Cross-platform child process runner with streaming output, timeout support,
 * and process tree cleanup.
 *
 * Key behaviors:
 * - On Windows, spawns with `shell: true` to resolve `.cmd` shims.
 * - Supports configurable timeouts with full process tree kill on expiry.
 * - Streams stdout/stderr line-by-line via callbacks for real-time progress.
 * - Provides {@link killByPort} for port-based process cleanup (used by smoke test).
 *
 * @example
 * ```typescript
 * const runner = new ProcessRunner();
 *
 * // Simple command
 * const version = await runner.RunSimple('node', ['--version']);
 *
 * // Long-running command with streaming and timeout
 * const result = await runner.Run('npm', ['run', 'build'], {
 *   Cwd: '/path/to/repo',
 *   TimeoutMs: 1_800_000,
 *   OnStdout: (line) => emitter.Emit('step:progress', { ... }),
 * });
 * ```
 */
export class ProcessRunner {
  /**
   * Spawn a child process and return the full result after it exits.
   *
   * The process is spawned with `shell: true` on Windows (for `.cmd` shim
   * resolution) and `shell: false` on Unix. Stdout and stderr are accumulated
   * in memory and optionally streamed line-by-line via callbacks.
   *
   * If {@link ProcessOptions.TimeoutMs} is set and the process exceeds it,
   * the entire process tree is killed and `{ TimedOut: true }` is returned.
   *
   * @param command - The command to execute (e.g., `'npm'`, `'npx'`).
   * @param args - Command arguments (e.g., `['install', '--legacy-peer-deps']`).
   * @param options - Execution options (cwd, env, timeout, streaming callbacks).
   * @returns The process result with exit code, output, and timeout status.
   *
   * @example
   * ```typescript
   * const result = await runner.Run('npx', ['mj', 'codegen'], {
   *   Cwd: dir,
   *   TimeoutMs: 600_000,
   *   OnStdout: (line) => console.log(line),
   * });
   * ```
   */
  async Run(command: string, args: string[], options?: ProcessOptions): Promise<ProcessResult> {
    return new Promise<ProcessResult>((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? true : false;

      const child = spawn(command, args, {
        cwd: options?.Cwd ?? process.cwd(),
        env: { ...process.env, ...options?.Env },
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      if (options?.TimeoutMs) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          this.killTree(child.pid);
        }, options.TimeoutMs);
      }

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        if (options?.OnStdout) {
          const lines = text.split('\n').filter((l) => l.length > 0);
          for (const line of lines) {
            options.OnStdout(line);
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        if (options?.OnStderr) {
          const lines = text.split('\n').filter((l) => l.length > 0);
          for (const line of lines) {
            options.OnStderr(line);
          }
        }
      });

      child.on('close', (code) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolve({
          ExitCode: code ?? 1,
          Stdout: stdout,
          Stderr: stderr,
          TimedOut: timedOut,
        });
      });

      child.on('error', (err) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolve({
          ExitCode: 1,
          Stdout: stdout,
          Stderr: err.message,
          TimedOut: false,
        });
      });
    });
  }

  /**
   * Run a command and return just the trimmed stdout.
   *
   * Convenience wrapper around {@link Run} for simple commands where you only
   * need the output text. Throws an `Error` if the process exits with a
   * non-zero code.
   *
   * @param command - The command to execute.
   * @param args - Command arguments.
   * @param cwd - Optional working directory.
   * @returns Trimmed stdout output.
   * @throws Error if the process exits with a non-zero exit code.
   *
   * @example
   * ```typescript
   * const npmVersion = await runner.RunSimple('npm', ['--version']);
   * // "10.9.0"
   * ```
   */
  async RunSimple(command: string, args: string[], cwd?: string): Promise<string> {
    const result = await this.Run(command, args, { Cwd: cwd });
    if (result.ExitCode !== 0) {
      throw new Error(`Command "${command} ${args.join(' ')}" failed (exit ${result.ExitCode}): ${result.Stderr}`);
    }
    return result.Stdout.trim();
  }

  /**
   * Check whether a command exists on the system PATH.
   *
   * Uses `where` on Windows or `which` on Unix to locate the executable.
   *
   * @param command - The command name to look up (e.g., `'npm'`, `'git'`).
   * @returns `true` if the command is found, `false` otherwise.
   */
  async CommandExists(command: string): Promise<boolean> {
    try {
      const isWindows = process.platform === 'win32';
      const checkCmd = isWindows ? 'where' : 'which';
      const result = await this.Run(checkCmd, [command]);
      return result.ExitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Kill a process and its entire process tree.
   *
   * On Windows, `child.kill()` with `shell: true` only terminates the
   * top-level `cmd.exe` shell, leaving turbo/node grandchild processes
   * running as orphans. This method uses `taskkill /F /T /PID` on Windows
   * and process group signals (`SIGTERM` then `SIGKILL`) on Unix to ensure
   * the full process tree is terminated.
   *
   * @param pid - Process ID of the root process to kill. No-op if `undefined`.
   */
  killTree(pid: number | undefined): void {
    if (!pid) return;
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } else {
        process.kill(-pid, 'SIGTERM');
        setTimeout(() => {
          try { process.kill(-pid, 'SIGKILL'); } catch { /* already dead */ }
        }, 5000);
      }
    } catch {
      // Process may have already exited
    }
  }

  /**
   * Kill all processes listening on a given TCP port.
   *
   * Used by {@link SmokeTestPhase} to clean up MJAPI and Explorer service
   * processes after smoke test health checks complete. Without port-based
   * cleanup, turbo/node grandchild processes survive parent shell termination
   * and block future starts with `EADDRINUSE`.
   *
   * - **Windows**: Uses `netstat -ano` to find listening PIDs, then
   *   `taskkill /F /T` to kill each process tree.
   * - **Unix**: Uses `lsof -ti:<port> | xargs kill -9`.
   *
   * @param port - TCP port number to scan for listening processes.
   */
  killByPort(port: number): void {
    try {
      if (process.platform === 'win32') {
        // Find PIDs listening on this port and kill their process trees
        const output = execSync(
          `netstat -ano | findstr ":${port}" | findstr "LISTENING"`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
        );
        const pids = new Set<string>();
        for (const line of output.split('\n')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0') {
            pids.add(pid);
          }
        }
        for (const pid of pids) {
          try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
          } catch { /* already dead */ }
        }
      } else {
        execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
      }
    } catch {
      // No process on this port, or already killed
    }
  }
}
