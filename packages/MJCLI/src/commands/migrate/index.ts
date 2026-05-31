import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { Skyway } from '@memberjunction/skyway-core';
import type { MigrateResult, MigrationExecutionResult, ResolvedMigration, SkywayConfig } from '@memberjunction/skyway-core';
import ora from 'ora-classic';
import { getValidatedConfig, getSkywayConfig, type MJConfig } from '../../config';
import { fetchMigrationSlice, resolveGitRef, type MigrationFetchResult } from '../../lib/migration-fetch';

export default class Migrate extends Command {
  static description = 'Migrate MemberJunction database to latest version';

  static examples = [
    `<%= config.bin %> <%= command.id %>
`,
    `<%= config.bin %> <%= command.id %> --schema __BCSaaS --dir ./migrations/v1
`,
    `<%= config.bin %> <%= command.id %> --schema __BCSaaS --tag v1.0.0
`,
  ];

  static flags = {
    verbose: Flags.boolean({ char: 'v', description: 'Enable additional logging' }),
    tag: Flags.string({ char: 't', description: 'Version tag to use for running remote migrations' }),
    schema: Flags.string({ char: 's', description: 'Target schema (overrides coreSchema from config)' }),
    dir: Flags.string({ description: 'Migration source directory (overrides migrationsLocation from config)' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Migrate);
    const config = getValidatedConfig();

    // For a remote ref we fetch only the slice Skyway will actually run (highest
    // baseline + the versioned tail after it + repeatables) into a temp dir, then
    // hand that dir to Skyway. cleanup() runs on every exit path.
    //
    // Explicit --tag wins; otherwise the install-pinned version (mjRepoVersion) drives
    // the fetch so migrate stays consistent with the installed code. An explicit --dir
    // override (without --tag) keeps using the local filesystem and skips fetching, so
    // monorepo developers are unaffected.
    const ref = flags.tag ?? (flags.dir ? undefined : config.mjRepoVersion);
    const fetched = ref
      ? await fetchMigrationSlice({ repoUrl: config.mjRepoUrl, ref: resolveGitRef(ref), dialect: config.dbPlatform })
      : null;

    try {
      const sourceDir = this.resolveSourceDir(fetched, flags.dir);
      const skywayConfig = await getSkywayConfig(config, undefined, flags.schema, sourceDir);
      this.logFetchSummary(flags.verbose, fetched);
      await this.executeMigration(config, flags, skywayConfig);
    } finally {
      if (fetched) await fetched.cleanup();
    }
  }

  /**
   * Resolves the migration source directory handed to Skyway. With a fetched slice,
   * the temp clone root is used (Skyway scans it recursively); a `--dir` override is
   * applied as a subpath within that clone.
   */
  private resolveSourceDir(fetched: MigrationFetchResult | null, dirFlag: string | undefined): string | undefined {
    if (!fetched) return dirFlag;
    if (!dirFlag) return fetched.dir;
    const subPath = dirFlag.replace(/^filesystem:/, '').replace(/^\.\//, '');
    return path.join(fetched.dir, subPath);
  }

  private logFetchSummary(verbose: boolean, fetched: MigrationFetchResult | null): void {
    if (!verbose || !fetched) return;
    this.log(
      fetched.usedFallback
        ? 'Fetched full migration history (partial clone unavailable)'
        : `Fetched ${fetched.selected.length} migration file(s) for the target slice`,
    );
  }

  /** Runs Skyway against the prepared config and reports the outcome. */
  private async executeMigration(config: MJConfig, flags: { verbose: boolean; tag?: string }, skywayConfig: SkywayConfig): Promise<void> {
    const targetSchema = skywayConfig.Migrations.DefaultSchema;
    const skyway = new Skyway(skywayConfig);

    // Always capture progress for error diagnostics; verbose mode prints it live
    const errorLog: string[] = [];
    const failedMigrations: MigrationExecutionResult[] = [];
    let lastMigrationStarted: ResolvedMigration | undefined;

    skyway.OnProgress({
      OnLog: (msg) => {
        errorLog.push(msg);
        if (flags.verbose) this.log(`  ${msg}`);
      },
      OnMigrationStart: (m) => {
        lastMigrationStarted = m;
        if (flags.verbose) this.log(`  Applying: ${m.Version ?? '(repeatable)'} — ${m.Description}`);
      },
      OnMigrationEnd: (r) => {
        if (!r.Success) failedMigrations.push(r);
        if (flags.verbose) this.log(`  ${r.Success ? 'OK' : 'FAIL'}: ${r.Migration.Description} (${r.ExecutionTimeMS}ms)`);
      },
    });

    if (flags.verbose) {
      this.log(`Database Connection: ${config.dbHost}:${config.dbPort}, ${config.dbDatabase}, User: ${config.codeGenLogin}`);
      this.log(`Migrating ${targetSchema} schema using migrations from:\n\t- ${skywayConfig.Migrations.Locations.join('\n\t- ')}\n`);
      this.log(`Skyway config: baselineVersion: ${config.baselineVersion ?? '(auto-detect)'}, baselineOnMigrate: ${config.baselineOnMigrate}\n`);
    }

    if (flags.tag) {
      this.log(`Migrating to ${flags.tag}`);
    }

    const spinner = ora('Running migrations...');
    spinner.start();

    let result: MigrateResult;
    try {
      result = await skyway.Migrate();
    } catch (err: unknown) {
      spinner.fail();
      const message = err instanceof Error ? err.message : String(err);
      this.logToStderr(`\nMigration error: ${message}\n`);
      this.printCallbackErrors(failedMigrations, lastMigrationStarted, errorLog);
      this.error('Migrations failed');
    } finally {
      await skyway.Close();
    }

    if (result.Success) {
      spinner.succeed();
      this.log(`Migrations complete in ${(result.TotalExecutionTimeMS / 1000).toFixed(1)}s — ${result.MigrationsApplied} applied`);
      if (result.CurrentVersion && flags.verbose) {
        this.log(`\tCurrent version: ${result.CurrentVersion}`);
      }
      if (flags.verbose && result.Details.length > 0) {
        for (const detail of result.Details) {
          this.log(`\t${detail.Migration.Version ?? '(R)'} ${detail.Migration.Description} — ${detail.ExecutionTimeMS}ms`);
        }
      }
    } else {
      spinner.fail();
      this.logToStderr(`\nMigration failed: ${result.ErrorMessage ?? 'unknown error'}\n`);

      if (result.Details.length > 0) {
        // We have per-migration details — show them
        const succeeded = result.Details.filter((d) => d.Success);
        if (succeeded.length > 0) {
          this.logToStderr(`  Applied ${succeeded.length} migration(s) before failure:`);
          for (const detail of succeeded) {
            this.logToStderr(`    OK: ${detail.Migration.Filename} (${detail.ExecutionTimeMS}ms)`);
          }
          this.logToStderr('');
        }

        const failed = result.Details.filter((d) => !d.Success);
        for (const detail of failed) {
          this.logToStderr(`  FAILED: ${detail.Migration.Filename}`);
          this.logToStderr(`    Script: ${detail.Migration.FilePath}`);
          this.logToStderr(`    Version: ${detail.Migration.Version ?? '(repeatable)'}`);
          this.logToStderr(`    Description: ${detail.Migration.Description}`);
          if (detail.Error) {
            this.logToStderr(`    Error: ${detail.Error.message}`);
          }
        }
      } else {
        // Details is empty — error was caught at the transaction/connection level.
        // Fall back to errors captured by OnProgress callbacks.
        this.printCallbackErrors(failedMigrations, lastMigrationStarted, errorLog);
      }

      this.error('Migrations failed');
    }
  }

  /**
   * Prints error details captured by OnProgress callbacks.
   * Used when Skyway's result.Details is empty (transaction-level errors).
   */
  private printCallbackErrors(failedMigrations: MigrationExecutionResult[], lastMigrationStarted: ResolvedMigration | undefined, errorLog: string[]): void {
    // Show any migration failures captured by OnMigrationEnd
    if (failedMigrations.length > 0) {
      for (const detail of failedMigrations) {
        this.logToStderr(`  FAILED: ${detail.Migration.Filename}`);
        this.logToStderr(`    Script: ${detail.Migration.FilePath}`);
        this.logToStderr(`    Version: ${detail.Migration.Version ?? '(repeatable)'}`);
        this.logToStderr(`    Description: ${detail.Migration.Description}`);
        if (detail.Error) {
          this.logToStderr(`    Error: ${detail.Error.message}`);
        }
      }
    } else if (lastMigrationStarted) {
      // OnMigrationEnd never fired, but we know which migration was running
      this.logToStderr(`  Failed while executing: ${lastMigrationStarted.Filename}`);
      this.logToStderr(`    Script: ${lastMigrationStarted.FilePath}`);
      this.logToStderr(`    Version: ${lastMigrationStarted.Version ?? '(repeatable)'}`);
    }

    // Show relevant log messages from Skyway (error/failure lines)
    const relevantLogs = errorLog.filter(
      (msg) => msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') || msg.toLowerCase().includes('rolled back'),
    );
    if (relevantLogs.length > 0) {
      this.logToStderr('');
      this.logToStderr('  Skyway log:');
      for (const msg of relevantLogs) {
        this.logToStderr(`    ${msg}`);
      }
    }
  }
}
