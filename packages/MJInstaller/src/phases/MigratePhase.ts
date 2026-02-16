/**
 * Phase D — Migrate
 *
 * Runs database migrations via `npx mj migrate` (node-flyway under the hood).
 * Validates that the __mj schema exists afterward.
 */

import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { ProcessRunner } from '../adapters/ProcessRunner.js';

export interface MigrateContext {
  /** Target directory (repo root) */
  Dir: string;
  /** Current install config */
  Config: PartialInstallConfig;
  Emitter: InstallerEventEmitter;
}

export interface MigrateResult {
  /** Whether migration completed successfully */
  Success: boolean;
  /** Raw output from the migration command */
  Output: string;
}

export class MigratePhase {
  private processRunner = new ProcessRunner();

  async Run(context: MigrateContext): Promise<MigrateResult> {
    const { Emitter: emitter } = context;

    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'migrate',
      Message: 'Running database migrations...',
    });

    // Use npx mj migrate to run Flyway-based migrations
    // Always pass --verbose so we get detailed Flyway output for diagnostics
    const result = await this.processRunner.Run('npx', ['mj', 'migrate', '--verbose'], {
      Cwd: context.Dir,
      TimeoutMs: 300_000, // 5 minutes
      OnStdout: (line: string) => {
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'migrate',
          Message: line.trim(),
        });
      },
      OnStderr: (line: string) => {
        emitter.Emit('log', {
          Type: 'log',
          Level: 'verbose',
          Message: `[migrate:stderr] ${line.trim()}`,
        });
      },
    });

    if (result.TimedOut) {
      throw new InstallerError(
        'migrate',
        'MIGRATE_TIMEOUT',
        'Database migration timed out after 5 minutes.',
        'Run "mj migrate" manually to see detailed output. Check database connectivity.'
      );
    }

    if (result.ExitCode !== 0) {
      // Combine stdout and stderr for full diagnostic output — Flyway errors go to stderr
      const combined = [result.Stdout, result.Stderr].filter(Boolean).join('\n');
      const lastLines = this.lastNLines(combined, 80);
      throw new InstallerError(
        'migrate',
        'MIGRATE_FAILED',
        `Database migration failed (exit code ${result.ExitCode}):\n${lastLines}`,
        'Check the migration output above. Common issues: database connectivity, incorrect credentials, or SQL syntax errors.'
      );
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: 'Database migrations completed successfully.',
    });

    return {
      Success: true,
      Output: result.Stdout,
    };
  }

  private lastNLines(text: string, n: number): string {
    const lines = text.split('\n');
    return lines.slice(-n).join('\n');
  }
}
