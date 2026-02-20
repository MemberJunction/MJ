/**
 * Phase G — Dependencies (Install + Build)
 *
 * Runs `npm install` at the repo root to install all workspace dependencies,
 * then `npm run build` to compile all packages.
 */

import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import { InstallerError } from '../errors/InstallerError.js';
import { ProcessRunner, type ProcessResult } from '../adapters/ProcessRunner.js';

/**
 * Packages that contain generated code managed by CodeGen. Build failures in
 * ONLY these packages are treated as partial success — CodeGen will regenerate
 * the stale code and rebuild in a later phase. If any package outside this list
 * fails, the build is a hard error.
 */
const CODEGEN_MANAGED_PACKAGES = [
  'ng-core-entity-forms',
  'server-bootstrap-lite',
  'server-bootstrap',
  'ng-bootstrap',
];

export interface DependencyContext {
  /** Target directory (repo root) */
  Dir: string;
  Emitter: InstallerEventEmitter;
}

export interface DependencyResult {
  /** Whether npm install completed successfully */
  InstallSuccess: boolean;
  /** Whether npm run build completed successfully (false if only partial) */
  BuildSuccess: boolean;
  /** Whether the build was partial — some codegen-managed packages failed but everything else succeeded */
  BuildPartial: boolean;
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
    const buildPartial = await this.runNpmBuild(context.Dir, emitter, warnings);

    return {
      InstallSuccess: true,
      BuildSuccess: !buildPartial,
      BuildPartial: buildPartial,
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

    let result = await this.runNpmInstallOnce(dir, emitter, []);

    if (result.TimedOut) {
      throw new InstallerError(
        'dependencies',
        'NPM_INSTALL_TIMEOUT',
        'npm install timed out after 10 minutes.',
        'Run "npm install" manually at the repo root. Check network connectivity.'
      );
    }

    // If npm install failed due to peer dependency conflicts, retry with --legacy-peer-deps
    if (result.ExitCode !== 0 && this.isEresolveError(result.Stderr)) {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'dependencies',
        Message: 'Peer dependency conflict detected. Retrying with --legacy-peer-deps...',
      });

      result = await this.runNpmInstallOnce(dir, emitter, ['--legacy-peer-deps']);

      if (result.TimedOut) {
        throw new InstallerError(
          'dependencies',
          'NPM_INSTALL_TIMEOUT',
          'npm install --legacy-peer-deps timed out after 10 minutes.',
          'Run "npm install --legacy-peer-deps" manually at the repo root.'
        );
      }

      if (result.ExitCode === 0) {
        warnings.push(
          'npm install required --legacy-peer-deps due to peer dependency conflicts in the release. ' +
          'This is safe but indicates a minor version skew in the release packages.'
        );
      }
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

  /**
   * Runs npm run build. Returns true if the build was "partial" (only codegen-managed
   * packages failed), false if it fully succeeded. Throws on hard failures.
   */
  private async runNpmBuild(dir: string, emitter: InstallerEventEmitter, warnings: string[]): Promise<boolean> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'dependencies',
      Message: 'Running npm run build (first-time builds can take 15-20 minutes for 170 packages)...',
    });

    const result = await this.processRunner.Run('npm', ['run', 'build'], {
      Cwd: dir,
      TimeoutMs: 1_800_000, // 30 minutes — first-time full workspace build of 170 packages can take 17+ min
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
        'npm run build timed out after 30 minutes.',
        'Run "npm run build" manually at the repo root to see full output. First-time builds of 170 packages can take 15-20 minutes.'
      );
    }

    if (result.ExitCode === 0) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: 'Build completed successfully.',
      });
      return false;
    }

    // Build failed — check if failures are only in codegen-managed packages.
    // These packages contain generated code that may be stale in the release.
    // CodeGen will regenerate them and rebuild in a later phase.
    // Note: turbo outputs the "Failed:" summary to stdout, not stderr.
    const combinedOutput = result.Stdout + '\n' + result.Stderr;
    const failedPackages = this.extractFailedTurboPackages(combinedOutput);
    const onlyCodegenFailures = failedPackages.length > 0
      && failedPackages.every(pkg => CODEGEN_MANAGED_PACKAGES.some(pattern => pkg.includes(pattern)));

    if (onlyCodegenFailures) {
      const failList = failedPackages.join(', ');
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'dependencies',
        Message: `Build partially succeeded. Failed packages (${failList}) contain generated code that will be regenerated by CodeGen.`,
      });
      warnings.push(
        `Build partially succeeded. The following packages failed due to stale generated code and will be fixed by CodeGen: ${failList}`
      );
      return true;
    }

    // Non-codegen failures — hard error
    const lastLines = this.lastNLines(result.Stderr || result.Stdout, 50);
    throw new InstallerError(
      'dependencies',
      'BUILD_FAILED',
      `Build failed (exit code ${result.ExitCode}):\n${lastLines}`,
      'Run "npm run build" manually at the repo root to see full error output.'
    );
  }

  // ---------------------------------------------------------------------------
  // Turbo output parsing
  // ---------------------------------------------------------------------------

  /**
   * Extract failed package names from turbo's stderr output.
   * Turbo outputs lines like: "Failed:    @memberjunction/ng-core-entity-forms#build"
   */
  private extractFailedTurboPackages(stderr: string): string[] {
    const packages: string[] = [];
    const failedPattern = /Failed:\s+(@[^#\s]+)#build/g;
    let match: RegExpExecArray | null;
    while ((match = failedPattern.exec(stderr)) !== null) {
      packages.push(match[1]);
    }
    return [...new Set(packages)];
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async runNpmInstallOnce(
    dir: string,
    emitter: InstallerEventEmitter,
    extraArgs: string[]
  ): Promise<ProcessResult> {
    const args = ['install', ...extraArgs];
    return this.processRunner.Run('npm', args, {
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
        if (line.includes('WARN') || line.includes('warn')) {
          emitter.Emit('log', {
            Type: 'log',
            Level: 'verbose',
            Message: `[npm] ${line.trim()}`,
          });
        }
      },
    });
  }

  private isEresolveError(stderr: string): boolean {
    return stderr.includes('ERESOLVE') || stderr.includes('unable to resolve dependency tree');
  }

  private lastNLines(text: string, n: number): string {
    const lines = text.split('\n');
    return lines.slice(-n).join('\n');
  }
}
