import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { Skyway } from '@memberjunction/skyway-core';
import type { MigrateResult, MigrationExecutionResult, ResolvedMigration, SkywayConfig } from '@memberjunction/skyway-core';
import ora from 'ora-classic';
import { getValidatedConfig, getSkywayConfig, type MJConfig } from '../../config';
import { fetchMigrationSlice, resolveGitRef, type MigrationFetchResult } from '../../lib/migration-fetch';
import { verifyDatabaseConnection } from '../../lib/db-preflight';
import { readCurrentDbVersion } from '../../lib/db-version';
import { executeOpenAppMetadataRefresh, isOpenAppSchema } from '@memberjunction/open-app-engine';

/** Skyway's default history table — matches `@memberjunction/skyway-core`'s config default. */
const HISTORY_TABLE = 'flyway_schema_history';

export default class Migrate extends Command {
  static description = 'Migrate MemberJunction database to latest version. Open App migrates also run the core metadata-heal procs (same work as R__RefreshMetadata) scoped to the app schema, on SQL Server and PostgreSQL.';

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
    'check-connection': Flags.boolean({
      description: 'Verify the database connection (including TLS) and exit without migrating',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Migrate);
    const config = getValidatedConfig();

    // Connection preflight: a real connect with the configured TLS/auth settings, so a
    // self-signed cert or bad credentials fails fast with an actionable hint instead of a
    // cryptic error mid-migration. `--check-connection` runs only this and exits.
    await this.preflightConnection(config, flags['check-connection']);
    if (flags['check-connection']) return;

    // For a remote ref we read the DB's current migration version, then fetch only the
    // slice needed to reach the target — versioned migrations after the current version
    // for an existing DB, or baseline + tail for a fresh one — into a temp dir handed to
    // Skyway. cleanup() runs on every exit path.
    //
    // Explicit --tag wins; otherwise the install-pinned version (mjRepoVersion) drives
    // the fetch so migrate stays consistent with the installed code. An explicit --dir
    // override (without --tag) keeps using the local filesystem and skips fetching, so
    // monorepo developers are unaffected.
    const ref = flags.tag ?? (flags.dir ? undefined : config.mjRepoVersion);
    const fetched = ref ? await this.fetchSliceForRef(config, ref, flags.schema) : null;

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
   * Reads the database's current migration version, logs it, then fetches the minimal
   * slice to reach `ref`: versioned migrations after the current version for an existing
   * database, or baseline + tail for a fresh one.
   */
  private async fetchSliceForRef(config: MJConfig, ref: string, schema: string | undefined): Promise<MigrationFetchResult> {
    const currentVersion = await this.readInstalledVersion(config, schema);
    this.logInstalledVersion(currentVersion);
    return fetchMigrationSlice({
      repoUrl: config.mjRepoUrl,
      ref: resolveGitRef(ref),
      dialect: config.dbPlatform,
      currentVersion,
    });
  }

  /**
   * Connects to read the highest migration version already applied (from Skyway's
   * history table). Returns null for a fresh database (no history table yet).
   */
  private async readInstalledVersion(config: MJConfig, schema: string | undefined): Promise<string | null> {
    // A throwaway config just to obtain a provider — the migration location is irrelevant here.
    const probe = await getSkywayConfig(config, undefined, schema, undefined);
    return readCurrentDbVersion(probe.Provider, probe.Migrations.DefaultSchema, HISTORY_TABLE);
  }

  /** Surfaces the detected installed version so the user sees what's being upgraded from. */
  private logInstalledVersion(currentVersion: string | null): void {
    if (currentVersion === null) {
      this.log('No prior migration history detected — treating as a fresh install (baseline + later migrations).');
    } else {
      this.log(`Detected installed migration version: ${currentVersion} — fetching only migrations newer than it.`);
    }
  }

  /**
   * Verify the database is reachable with the configured TLS/auth settings before
   * running migrations. On failure, prints a classified message (and an actionable
   * suggestion such as DB_TRUST_SERVER_CERTIFICATE for a self-signed cert) and exits.
   */
  private async preflightConnection(config: MJConfig, checkOnly: boolean): Promise<void> {
    const result = await verifyDatabaseConnection(config);
    if (!result.Ok) {
      const suggestion = result.Suggestion ? `\n→ ${result.Suggestion}` : '';
      this.error(`Database connection failed: ${result.Message ?? 'unknown error'}${suggestion}`);
    }
    if (checkOnly) {
      this.log(`Database connection OK (${config.dbHost}:${config.dbPort}, ${config.dbDatabase}).`);
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
      await this.refreshMetadataAfterOpenAppMigrate(config, targetSchema, flags.verbose);
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
            this.printMigrationError(detail.Error);
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
   * Core `mj migrate` ends with Flyway running `R__RefreshMetadata` against `__mj`.
   * An Open App migrate is a different history, so that repeatable never runs.
   * After a successful Open App migrate, run the same heal (SQL Server: all seven
   * R__ members with dependency-ordered view refresh; PostgreSQL: field-heal
   * functions — no view recompile). `mj app install` uses the same helper via
   * RunAppMigrations.
   */
  private async refreshMetadataAfterOpenAppMigrate(config: MJConfig, targetSchema: string, verbose: boolean): Promise<void> {
    const coreSchema = config.coreSchema ?? '__mj';
    if (!isOpenAppSchema(targetSchema, coreSchema)) {
      return;
    }

    const spinner = ora(`Refreshing metadata for ${targetSchema}...`);
    spinner.start();
    try {
      await executeOpenAppMetadataRefresh({
        platform: config.dbPlatform === 'postgresql' ? 'postgresql' : 'sqlserver',
        coreSchema,
        appSchema: targetSchema,
        database: {
          Host: config.dbHost,
          Port: config.dbPort,
          Database: config.dbDatabase,
          User: config.codeGenLogin,
          Password: config.codeGenPassword,
          Encrypt: config.dbEncrypt,
          TrustServerCertificate: config.dbTrustServerCertificate,
        },
      });
      spinner.succeed(`Metadata refreshed for ${targetSchema}`);
    } catch (err: unknown) {
      spinner.fail();
      const message = err instanceof Error ? err.message : String(err);
      this.error(`Open App metadata refresh failed for ${targetSchema}: ${message}`);
    }
  }

  /**
   * Print everything Skyway captured about a failed migration.
   *
   * Skyway builds a `MigrationExecutionError` carrying the batch number, its line range in the
   * script, and the lines within that batch which mention the identifiers named in the error — and
   * we were printing only `Error.message`, discarding all of it. That is the difference between
   * "a migration failed somewhere in 60,000 lines" and a file:line to open.
   *
   * Everything here is defensive: `BatchInfo` is optional on the error type, and a reporting path
   * must never throw while reporting a failure.
   */
  private printMigrationError(error: Error): void {
    this.logToStderr(`    Error: ${error.message}`);

    const batch = (error as { BatchInfo?: {
      BatchNumber?: number;
      TotalBatches?: number;
      StartLine?: number;
      EndLine?: number;
      SucceededBatches?: number;
      ContextLines?: Array<{ LineNumber: number; Text: string }>;
      BatchSQL?: string;
    } }).BatchInfo;
    if (!batch) {
      return;
    }

    if (batch.BatchNumber != null && batch.TotalBatches != null) {
      const range = batch.StartLine != null && batch.EndLine != null ? ` (lines ${batch.StartLine}-${batch.EndLine})` : '';
      this.logToStderr(`    Batch: ${batch.BatchNumber} of ${batch.TotalBatches}${range}`);
    }
    if (batch.SucceededBatches != null) {
      this.logToStderr(`    Batches applied before the failure: ${batch.SucceededBatches}`);
    }

    // The lines Skyway matched to identifiers in the error message. These carry FILE line numbers,
    // so they paste straight into an editor.
    if (batch.ContextLines?.length) {
      this.logToStderr('    Related lines:');
      for (const line of batch.ContextLines) {
        this.logToStderr(`      ${line.LineNumber}: ${line.Text.trim()}`);
      }
    }

    // When nothing could be matched, the batch SQL itself is the next best thing — without it the
    // reader has a line range and no way to see what is in it.
    else if (batch.BatchSQL) {
      const preview = batch.BatchSQL.split('\n').slice(0, 10);
      this.logToStderr('    Failing batch:');
      for (const line of preview) {
        this.logToStderr(`      ${line}`);
      }
      if (batch.BatchSQL.split('\n').length > preview.length) {
        this.logToStderr('      ...');
      }
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
          this.printMigrationError(detail.Error);
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
