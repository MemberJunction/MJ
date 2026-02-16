/**
 * Adapter for spawning child processes and capturing output.
 * Used by phases that run external tools (npm, mj codegen, etc.)
 */

import { spawn, execSync } from 'node:child_process';

export interface ProcessResult {
  ExitCode: number;
  Stdout: string;
  Stderr: string;
  TimedOut: boolean;
}

export interface ProcessOptions {
  /** Working directory */
  Cwd?: string;
  /** Environment variables (merged with process.env) */
  Env?: Record<string, string>;
  /** Timeout in milliseconds */
  TimeoutMs?: number;
  /** Called with each line of stdout */
  OnStdout?: (line: string) => void;
  /** Called with each line of stderr */
  OnStderr?: (line: string) => void;
}

export class ProcessRunner {
  /**
   * Run a command and return the full result.
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
   * Run a command and return just the trimmed stdout. Throws on non-zero exit.
   */
  async RunSimple(command: string, args: string[], cwd?: string): Promise<string> {
    const result = await this.Run(command, args, { Cwd: cwd });
    if (result.ExitCode !== 0) {
      throw new Error(`Command "${command} ${args.join(' ')}" failed (exit ${result.ExitCode}): ${result.Stderr}`);
    }
    return result.Stdout.trim();
  }

  /**
   * Check if a command exists on the PATH.
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
   * Kill a process and all its children.
   * On Windows, `child.kill()` with `shell: true` only kills the cmd.exe shell,
   * leaving turbo/node grandchild processes running as orphans.
   * This uses `taskkill /T` (Windows) or process group kill (Unix) instead.
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
   * Used by SmokeTestPhase to clean up service processes after health checks.
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
