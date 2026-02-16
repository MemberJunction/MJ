/**
 * Phase H — CodeGen + Validation
 *
 * Runs `mj codegen`, validates that required artifacts are generated,
 * retries once if the critical artifact (mj_generatedentities) is missing.
 *
 * Artifact verification is two-tier:
 *  - mj_generatedentities in node_modules — critical (blocks install if missing)
 *  - packages/GeneratedEntities — secondary (warns if missing, does not block)
 */

import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import { InstallerError } from '../errors/InstallerError.js';
import { ProcessRunner } from '../adapters/ProcessRunner.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';

export interface CodeGenContext {
  /** Target directory (repo root) */
  Dir: string;
  Emitter: InstallerEventEmitter;
}

export interface CodeGenResult {
  /** Whether codegen completed successfully */
  Success: boolean;
  /** Whether all required artifacts were verified */
  ArtifactsVerified: boolean;
  /** Whether a retry was needed */
  RetryUsed: boolean;
}

export class CodeGenPhase {
  private processRunner = new ProcessRunner();
  private fileSystem = new FileSystemAdapter();

  async Run(context: CodeGenContext): Promise<CodeGenResult> {
    const { Emitter: emitter } = context;

    // --- First attempt ---
    const firstResult = await this.attemptCodeGen(context.Dir, emitter);

    if (firstResult.Success) {
      // Codegen succeeded, but if AFTER commands failed, the generated .ts
      // files were never compiled to .js. Services will crash on import.
      // Run a full rebuild to compile everything before the smoke test.
      if (firstResult.AfterCommandsFailed) {
        emitter.Emit('warn', {
          Type: 'warn',
          Phase: 'codegen',
          Message: 'CodeGen AFTER commands failed. Rebuilding packages to compile generated code...',
        });
        await this.rebuildPackages(context.Dir, emitter);
      }
      return { Success: true, ArtifactsVerified: firstResult.AllArtifactsVerified, RetryUsed: false };
    }

    // --- First attempt failed (codegen crash OR missing critical artifacts) ---
    // Common cause: a previous codegen run's AFTER commands failed, leaving
    // dist/ directories with stale compiled .js that reference generated .ts
    // files which were never compiled. A full rebuild restores consistency.
    emitter.Emit('warn', {
      Type: 'warn',
      Phase: 'codegen',
      Message: `First codegen attempt failed: ${firstResult.FailureReason}. Rebuilding packages before retry...`,
    });

    await this.rebuildPackages(context.Dir, emitter);

    // --- Second attempt (throws on failure — no more retries) ---
    const secondResult = await this.attemptCodeGen(context.Dir, emitter);

    if (secondResult.Success) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: 'Code generation completed after rebuild + retry.',
      });
      return { Success: true, ArtifactsVerified: secondResult.AllArtifactsVerified, RetryUsed: true };
    }

    // Still failing after rebuild + retry
    throw new InstallerError(
      'codegen',
      'CODEGEN_FAILED',
      `Code generation failed after rebuild and retry: ${secondResult.FailureReason}`,
      'Run "npm run build" then "mj codegen" manually to see full error output. Verify database connectivity and that migrations have been applied.'
    );
  }

  /**
   * Runs codegen and verifies artifacts. Returns a result object instead of
   * throwing, so the caller can decide whether to retry.
   * Only timeouts throw immediately (not recoverable by rebuild).
   */
  private async attemptCodeGen(
    dir: string,
    emitter: InstallerEventEmitter
  ): Promise<{ Success: boolean; AllArtifactsVerified: boolean; AfterCommandsFailed: boolean; FailureReason: string }> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'codegen',
      Message: 'Running code generation...',
    });

    const codegenResult = await this.runCodeGen(dir, emitter);

    if (!codegenResult.Success) {
      return { Success: false, AllArtifactsVerified: false, AfterCommandsFailed: false, FailureReason: codegenResult.ErrorSummary };
    }

    // Codegen exited 0 — verify artifacts
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'codegen',
      Message: 'Verifying generated artifacts...',
    });

    const artifacts = await this.verifyArtifacts(dir, emitter);

    if (artifacts.CriticalPassed) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: 'Code generation completed and artifacts verified.',
      });
      return {
        Success: true,
        AllArtifactsVerified: artifacts.AllPassed,
        AfterCommandsFailed: codegenResult.AfterCommandsFailed,
        FailureReason: '',
      };
    }

    return { Success: false, AllArtifactsVerified: false, AfterCommandsFailed: codegenResult.AfterCommandsFailed, FailureReason: 'critical artifact mj_generatedentities not found' };
  }

  // ---------------------------------------------------------------------------
  // CodeGen execution
  // ---------------------------------------------------------------------------

  private async runCodeGen(
    dir: string,
    emitter: InstallerEventEmitter
  ): Promise<{ Success: boolean; AfterCommandsFailed: boolean; ErrorSummary: string }> {
    const result = await this.processRunner.Run('npx', ['mj', 'codegen'], {
      Cwd: dir,
      TimeoutMs: 600_000, // 10 minutes
      OnStdout: (line: string) => {
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'codegen',
          Message: line.trim(),
        });
      },
      OnStderr: (line: string) => {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `[codegen:stderr] ${line.trim()}`,
        });
      },
    });

    // Timeouts are not recoverable by rebuild — throw immediately
    if (result.TimedOut) {
      throw new InstallerError(
        'codegen',
        'CODEGEN_TIMEOUT',
        'Code generation timed out after 10 minutes.',
        'Run "mj codegen" manually. Check that the database is accessible and migrations are applied.'
      );
    }

    if (result.ExitCode !== 0) {
      const lastLines = this.lastNLines(result.Stderr || result.Stdout, 50);
      return { Success: false, AfterCommandsFailed: false, ErrorSummary: `exit code ${result.ExitCode}: ${lastLines}` };
    }

    // Log AFTER command output if present
    this.saveAfterLog(dir, result.Stdout, result.Stderr, emitter);

    // Detect AFTER command failures: codegen exited 0 but post-generation
    // build steps failed, leaving dist/ directories with stale .js that
    // reference generated .ts files which were never compiled.
    const afterFailed = /COMMAND:.*FAILED/i.test(result.Stderr);

    return { Success: true, AfterCommandsFailed: afterFailed, ErrorSummary: '' };
  }

  private saveAfterLog(dir: string, stdout: string, stderr: string, emitter: InstallerEventEmitter): void {
    if (!stdout.includes('AFTER') && !stderr.includes('AFTER')) return;

    const logDir = path.join(dir, 'logs');
    const logPath = path.join(logDir, 'mj-codegen-after.log');
    this.fileSystem.WriteText(logPath, stdout + '\n' + stderr)
      .then(() => {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `CodeGen AFTER output saved to ${logPath}`,
        });
      })
      .catch(() => {
        // non-critical
      });
  }

  // ---------------------------------------------------------------------------
  // Artifact verification
  // ---------------------------------------------------------------------------

  private async verifyArtifacts(
    dir: string,
    emitter: InstallerEventEmitter
  ): Promise<{ CriticalPassed: boolean; AllPassed: boolean }> {
    // Critical: mj_generatedentities must exist in node_modules for the app to run.
    // Secondary: packages/GeneratedEntities is expected but its absence is a warning, not a blocker.
    const criticalPath = path.join(dir, 'node_modules', 'mj_generatedentities');
    const secondaryPath = path.join(dir, 'packages', 'GeneratedEntities');

    const criticalExists = await this.fileSystem.DirectoryExists(criticalPath);
    const secondaryExists = await this.fileSystem.DirectoryExists(secondaryPath);

    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `[codegen] mj_generatedentities package: ${criticalExists ? 'found' : 'NOT found'}`,
    });

    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `[codegen] packages/GeneratedEntities directory: ${secondaryExists ? 'found' : 'NOT found'}`,
    });

    if (!secondaryExists && criticalExists) {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'codegen',
        Message: 'packages/GeneratedEntities not found. This is non-critical but may indicate an incomplete codegen run.',
      });
    }

    return {
      CriticalPassed: criticalExists,
      AllPassed: criticalExists && secondaryExists,
    };
  }

  // ---------------------------------------------------------------------------
  // Rebuild packages (recovery before retry)
  // ---------------------------------------------------------------------------

  private async rebuildPackages(dir: string, emitter: InstallerEventEmitter): Promise<void> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'codegen',
      Message: 'Rebuilding packages to restore consistent state before retry...',
    });

    const result = await this.processRunner.Run('npm', ['run', 'build'], {
      Cwd: dir,
      TimeoutMs: 1_800_000, // 30 minutes — same as DependencyPhase
      OnStdout: (line: string) => {
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'codegen',
          Message: line.trim(),
        });
      },
      OnStderr: (line: string) => {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `[codegen:rebuild:stderr] ${line.trim()}`,
        });
      },
    });

    if (result.TimedOut) {
      throw new InstallerError(
        'codegen',
        'CODEGEN_FAILED',
        'Package rebuild timed out after 30 minutes during codegen retry preparation.',
        'Run "npm run build" manually at the repo root, then re-run "mj codegen".'
      );
    }

    if (result.ExitCode !== 0) {
      const lastLines = this.lastNLines(result.Stderr || result.Stdout, 50);
      throw new InstallerError(
        'codegen',
        'CODEGEN_FAILED',
        `Package rebuild failed before codegen retry (exit code ${result.ExitCode}):\n${lastLines}`,
        'Run "npm run build" manually at the repo root to see full error output, then re-run "mj codegen".'
      );
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: 'Package rebuild completed. Retrying code generation...',
    });
  }

  private lastNLines(text: string, n: number): string {
    const lines = text.split('\n');
    return lines.slice(-n).join('\n');
  }
}
