/**
 * Phase G — Dependencies (Install + Build)
 *
 * Runs `npm install` at the repo root to install all workspace dependencies,
 * then `npm run build` to compile all packages.
 */

import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import { InstallerError } from '../errors/InstallerError.js';
import { ProcessRunner } from '../adapters/ProcessRunner.js';

export interface DependencyContext {
  /** Target directory (repo root) */
  Dir: string;
  Emitter: InstallerEventEmitter;
}

export interface DependencyResult {
  /** Whether npm install completed successfully */
  InstallSuccess: boolean;
  /** Whether npm run build completed successfully */
  BuildSuccess: boolean;
  /** Collected warnings (e.g., npm audit advisories) */
  Warnings: string[];
}

export class DependencyPhase {
  private processRunner = new ProcessRunner();

  async Run(context: DependencyContext): Promise<DependencyResult> {
    const { Emitter: emitter } = context;
    const warnings: string[] = [];

    // Step 1: npm install
    await this.runNpmInstall(context.Dir, emitter, warnings);

    // Step 2: npm run build
    await this.runNpmBuild(context.Dir, emitter);

    return {
      InstallSuccess: true,
      BuildSuccess: true,
      Warnings: warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // npm install
  // ---------------------------------------------------------------------------

  private async runNpmInstall(
    dir: string,
    emitter: InstallerEventEmitter,
    warnings: string[]
  ): Promise<void> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'dependencies',
      Message: 'Running npm install (this may take several minutes)...',
    });

    const result = await this.processRunner.Run('npm', ['install'], {
      Cwd: dir,
      TimeoutMs: 600_000, // 10 minutes
      OnStdout: (line: string) => {
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'dependencies',
          Message: line.trim(),
        });
      },
      OnStderr: (line: string) => {
        // npm writes progress to stderr
        if (line.includes('WARN') || line.includes('warn')) {
          emitter.Emit('log', {
            Type: 'log',
            Level: 'verbose',
            Message: `[npm] ${line.trim()}`,
          });
        }
      },
    });

    if (result.TimedOut) {
      throw new InstallerError(
        'dependencies',
        'NPM_INSTALL_TIMEOUT',
        'npm install timed out after 10 minutes.',
        'Run "npm install" manually at the repo root. Check network connectivity.'
      );
    }

    if (result.ExitCode !== 0) {
      const lastLines = this.lastNLines(result.Stderr || result.Stdout, 50);
      throw new InstallerError(
        'dependencies',
        'NPM_INSTALL_FAILED',
        `npm install failed (exit code ${result.ExitCode}):\n${lastLines}`,
        'Run "npm install" manually at the repo root to see full error output.'
      );
    }

    // Check for audit vulnerabilities (informational only)
    if (result.Stderr.includes('vulnerabilit')) {
      warnings.push(
        'npm reports vulnerabilities in dependencies. This is common in large workspaces. ' +
        'Do NOT run "npm audit fix --force" — it can break the workspace.'
      );
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'dependencies',
        Message: 'npm reports dependency vulnerabilities (informational). Do not run "npm audit fix --force".',
      });
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: 'npm install completed successfully.',
    });
  }

  // ---------------------------------------------------------------------------
  // npm run build
  // ---------------------------------------------------------------------------

  private async runNpmBuild(dir: string, emitter: InstallerEventEmitter): Promise<void> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'dependencies',
      Message: 'Running npm run build (this may take several minutes)...',
    });

    const result = await this.processRunner.Run('npm', ['run', 'build'], {
      Cwd: dir,
      TimeoutMs: 600_000, // 10 minutes
      OnStdout: (line: string) => {
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'dependencies',
          Message: line.trim(),
        });
      },
      OnStderr: (line: string) => {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `[build:stderr] ${line.trim()}`,
        });
      },
    });

    if (result.TimedOut) {
      throw new InstallerError(
        'dependencies',
        'BUILD_TIMEOUT',
        'npm run build timed out after 10 minutes.',
        'Run "npm run build" manually at the repo root to see full output.'
      );
    }

    if (result.ExitCode !== 0) {
      const lastLines = this.lastNLines(result.Stderr || result.Stdout, 50);
      throw new InstallerError(
        'dependencies',
        'BUILD_FAILED',
        `Build failed (exit code ${result.ExitCode}):\n${lastLines}`,
        'Run "npm run build" manually at the repo root to see full error output.'
      );
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: 'Build completed successfully.',
    });
  }

  private lastNLines(text: string, n: number): string {
    const lines = text.split('\n');
    return lines.slice(-n).join('\n');
  }
}
