/**
 * Phase H — CodeGen + Validation
 *
 * Runs `mj codegen`, validates that required artifacts are generated,
 * retries once if artifacts are missing.
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

    // First run
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'codegen',
      Message: 'Running code generation...',
    });

    await this.runCodeGen(context.Dir, emitter);

    // Verify artifacts
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'codegen',
      Message: 'Verifying generated artifacts...',
    });

    const firstCheck = await this.verifyArtifacts(context.Dir, emitter);

    if (firstCheck) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: 'Code generation completed and artifacts verified.',
      });
      return { Success: true, ArtifactsVerified: true, RetryUsed: false };
    }

    // Retry once
    emitter.Emit('warn', {
      Type: 'warn',
      Phase: 'codegen',
      Message: 'Some artifacts missing after first codegen run. Retrying...',
    });

    await this.runCodeGen(context.Dir, emitter);

    const secondCheck = await this.verifyArtifacts(context.Dir, emitter);

    if (secondCheck) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: 'Code generation completed after retry. Artifacts verified.',
      });
      return { Success: true, ArtifactsVerified: true, RetryUsed: true };
    }

    // Still missing after retry
    throw new InstallerError(
      'codegen',
      'GENERATED_ENTITIES_MISSING',
      'Required artifacts (mj_generatedentities) not found after code generation.',
      'Run "mj codegen" manually and check for errors in the output. Verify database connectivity and that migrations have been applied.'
    );
  }

  // ---------------------------------------------------------------------------
  // CodeGen execution
  // ---------------------------------------------------------------------------

  private async runCodeGen(dir: string, emitter: InstallerEventEmitter): Promise<void> {
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
      throw new InstallerError(
        'codegen',
        'CODEGEN_FAILED',
        `Code generation failed (exit code ${result.ExitCode}):\n${lastLines}`,
        'Run "mj codegen" manually to see the full error output.'
      );
    }

    // Log AFTER command output if present
    if (result.Stdout.includes('AFTER') || result.Stderr.includes('AFTER')) {
      const logDir = path.join(dir, 'logs');
      const logPath = path.join(logDir, 'mj-codegen-after.log');
      try {
        await this.fileSystem.WriteText(logPath, result.Stdout + '\n' + result.Stderr);
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `CodeGen AFTER output saved to ${logPath}`,
        });
      } catch {
        // non-critical
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Artifact verification
  // ---------------------------------------------------------------------------

  private async verifyArtifacts(dir: string, emitter: InstallerEventEmitter): Promise<boolean> {
    const checks = [
      {
        path: path.join(dir, 'node_modules', 'mj_generatedentities'),
        label: 'mj_generatedentities package',
        isDir: true,
      },
      {
        path: path.join(dir, 'GeneratedEntities'),
        label: 'GeneratedEntities directory',
        isDir: true,
      },
    ];

    let allPassed = true;
    for (const check of checks) {
      const exists = check.isDir
        ? await this.fileSystem.DirectoryExists(check.path)
        : await this.fileSystem.FileExists(check.path);

      if (exists) {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `[codegen] ${check.label}: found`,
        });
      } else {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `[codegen] ${check.label}: NOT found`,
        });
        allPassed = false;
      }
    }

    return allPassed;
  }

  private lastNLines(text: string, n: number): string {
    const lines = text.split('\n');
    return lines.slice(-n).join('\n');
  }
}
