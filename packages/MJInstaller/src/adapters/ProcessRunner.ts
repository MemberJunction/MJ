/**
 * Adapter for spawning child processes and capturing output.
 * Used by phases that run external tools (npm, mj codegen, etc.)
 */

import { spawn } from 'node:child_process';

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
          child.kill('SIGTERM');
          // Force kill after 5s if SIGTERM didn't work
          setTimeout(() => child.kill('SIGKILL'), 5000);
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
}
