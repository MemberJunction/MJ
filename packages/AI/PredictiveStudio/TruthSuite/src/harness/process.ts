import { spawn } from 'node:child_process';

/** Options for one child process: its working directory and, when given, its whole environment. */
export interface HarnessProcessOptions {
  Cwd: string;
  /** The child's environment; the parent's when omitted. */
  Env?: NodeJS.ProcessEnv;
}

/** The harness's one child-process runner. */
export class HarnessProcess {
  /** Run `cmd args` to completion without blocking the event loop and return its exit code and captured output. */
  public static Run(cmd: string, args: string[], opts: HarnessProcessOptions): Promise<{ Code: number; Stdout: string; Stderr: string }> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(cmd, args, { cwd: opts.Cwd, env: opts.Env || { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('error', reject);
      // `??`: exit code 0 is the success value; only a signal-terminated child (null) maps to -1.
      child.on('close', (code: number | null) => resolvePromise({ Code: code ?? -1, Stdout: stdout, Stderr: stderr }));
    });
  }
}
