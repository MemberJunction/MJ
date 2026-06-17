/**
 * Pluggable `mj sync` commands (plan §3/§5).
 *
 * These classes extend {@link BaseCLIPlugin} so they inherit `--format`,
 * `--verbose`, `--no-banner`, the runtime advisory, and uniform result emission.
 * They live behind the `@memberjunction/metadata-sync/plugins` subpath — NOT the
 * package's main entry — so that loading them for oclif manifest generation or
 * `mj usage` enumeration does NOT pull in the heavy sync engine. The engine is
 * dynamic-imported inside `Execute()`, exactly as the original commands did, so
 * the per-command lazy-loading contract is preserved.
 *
 * Stdio discipline (plan D2): no `ora`/`console` here. Progress goes through
 * `this.Host.*`; rich human text is built with the engine's `FormattingService`
 * and handed to `this.Host.Log` (which suppresses/redirects it in JSON mode).
 */
import { Flags, type Interfaces } from '@oclif/core';
import { confirm, select } from '@inquirer/prompts';
import { RegisterClass } from '@memberjunction/global';
import { BaseCLIPlugin, type MJCLIResult, type MJCLIResultError, type PluginUsage } from '@memberjunction/cli-core';
import fs from 'fs';
import path from 'path';
import { writeFileSync } from 'fs';

// Type-only imports are erased at runtime — they never load the engine.
import type { PushResult } from '../services/PushService';
import type { PullOptions } from '../services/PullService';

// Flag types derived from this package's own @oclif/core copy (portable). Used
// with BaseCLIPlugin.GetFlags<T>() so Execute() neither re-parses nor casts.
type SyncPushFlags = Interfaces.InferredFlags<(typeof SyncPushPlugin)['flags']>;
type SyncPullFlags = Interfaces.InferredFlags<(typeof SyncPullPlugin)['flags']>;

/** Shared loader for the heavy sync engine. Dynamic so the plugin module stays light. */
async function loadEngine() {
  return import('../index.js');
}

// ─────────────────────────────────────────────────────────────────────────────
// mj sync push
// ─────────────────────────────────────────────────────────────────────────────

@RegisterClass(BaseCLIPlugin, 'sync:push')
export class SyncPushPlugin extends BaseCLIPlugin {
  static description = 'Push local file changes to the database';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --dry-run`,
    `<%= config.bin %> <%= command.id %> --dir="ai-prompts"`,
    `<%= config.bin %> <%= command.id %> --ci --format=json`,
  ];

  static flags = {
    dir: Flags.string({ description: 'Specific entity directory to push' }),
    'dry-run': Flags.boolean({ description: 'Show what would be pushed without actually pushing' }),
    ci: Flags.boolean({ description: 'CI mode - no prompts, fail on issues' }),
    'no-validate': Flags.boolean({ description: 'Skip validation before push' }),
    'delete-db-only': Flags.boolean({
      description: 'Delete database-only records that reference records being deleted (prevents FK errors)',
      default: false,
    }),
    'parallel-batch-size': Flags.integer({
      description: 'Number of records to process in parallel (default: 10)',
      default: 10,
      min: 1,
      max: 50,
    }),
    include: Flags.string({ description: 'Only process these directories (comma-separated, supports patterns)' }),
    exclude: Flags.string({ description: 'Skip these directories (comma-separated, supports patterns)' }),
    incremental: Flags.boolean({
      description: 'Skip unchanged files using stored checksums from last push',
      default: false,
    }),
    'change-detail': Flags.boolean({
      description: 'Write a detailed per-record change report (primary keys + field diffs) to a file',
      default: false,
    }),
  };

  static Usage: PluginUsage = {
    domain: 'sync',
    command: 'sync:push',
    summary: 'Push local metadata files to the database (upsert).',
    description:
      'Reads entity directories under --dir and creates/updates matching records. Runs validation first unless --no-validate.',
    flags: [
      { name: '--dir', type: 'string', description: 'Entity directory to push' },
      { name: '--dry-run', type: 'boolean', description: 'Report what would change without writing' },
      { name: '--ci', type: 'boolean', description: 'No prompts; non-zero exit on error' },
      { name: '--no-validate', type: 'boolean', description: 'Skip pre-push validation' },
      { name: '--incremental', type: 'boolean', description: 'Skip unchanged files using stored checksums' },
      { name: '--format', type: 'text|json|md', description: 'Output format (json for machine-readable result)' },
    ],
    examples: ['mj sync push --dir=ai-agents', 'mj sync push --ci --format=json'],
    runtime: { class: 'variable', typicalSeconds: 20, note: 'scales with number of records in --dir' },
  };

  protected async Execute(): Promise<MJCLIResult> {
    const startTime = Date.now();
    const flags = this.GetFlags<SyncPushFlags>();
    const isText = this.Host.Format === 'text';
    const nonInteractive = flags.ci || !isText;

    const engine = await loadEngine();
    const {
      PushService, ValidationService, FormattingService,
      loadMJConfig, loadSyncConfig, initializeProvider,
      getSyncEngine, getSystemUser, configManager, SyncStateManager,
    } = engine;

    const errors: MJCLIResultError[] = [];
    const warnings: string[] = [];

    try {
    this.Host.StartStep('Loading configuration');
    const mjConfig = loadMJConfig();
    if (!mjConfig) {
      this.Host.FailStep('Loading configuration', 'No mj.config.cjs found');
      return this.fail(startTime, [{ message: 'No mj.config.cjs found in current directory or parent directories' }]);
    }

    const baseDir = configManager.getOriginalCwd();
    const syncConfigDir = flags.dir ? path.resolve(baseDir, flags.dir) : baseDir;
    await loadSyncConfig(syncConfigDir);

    await initializeProvider(mjConfig);
    await getSyncEngine(getSystemUser());
    this.Host.SucceedStep('Configuration and metadata loaded');

    const includeFilter = flags.include ? flags.include.split(',').map((s) => s.trim()) : undefined;
    const excludeFilter = flags.exclude ? flags.exclude.split(',').map((s) => s.trim()) : undefined;
    const formatter = new FormattingService();

    // ── Validation ────────────────────────────────────────────────────────────
    if (!flags['no-validate']) {
      this.Host.StartStep('Validating metadata');
      const validator = new ValidationService({ verbose: this.Host.Verbose, include: includeFilter, exclude: excludeFilter });
      const targetDir = flags.dir ? path.resolve(baseDir, flags.dir) : baseDir;
      const validationResult = await validator.validateDirectory(targetDir);

      if (!validationResult.isValid || validationResult.warnings.length > 0) {
        this.Host.FailStep('Validation reported issues');
        if (isText) this.Host.Log('\n' + formatter.formatValidationResult(validationResult, this.Host.Verbose));

        if (!validationResult.isValid) {
          if (nonInteractive) {
            return this.fail(startTime, [{ context: 'validation', message: 'Validation failed. Cannot proceed with push.' }]);
          }
          const shouldContinue = await confirm({
            message: 'Validation failed with errors. Do you want to continue anyway?',
            default: false,
          });
          if (!shouldContinue) {
            // Clean cancel (exit 0) — matches the original interactive behavior.
            return this.cancelled(startTime, 'Push cancelled due to validation errors.');
          }
        }
      } else {
        this.Host.SucceedStep('Validation passed');
      }
    }

    // ── Push ────────────────────────────────────────────────────────────────��─
    const pushService = new PushService(await getSyncEngine(getSystemUser()), getSystemUser());
    if (flags.incremental) {
      const stateDir = flags.dir ? path.resolve(baseDir, flags.dir) : baseDir;
      const stateManager = new SyncStateManager(stateDir);
      await stateManager.load();
      pushService.setStateManager(stateManager);
    }

    const result: PushResult = await pushService.push(
      {
        dir: flags.dir,
        dryRun: flags['dry-run'],
        verbose: this.Host.Verbose,
        noValidate: flags['no-validate'],
        deleteDbOnly: flags['delete-db-only'],
        parallelBatchSize: flags['parallel-batch-size'],
        include: includeFilter,
        exclude: excludeFilter,
        incremental: flags.incremental,
      },
      {
        onProgress: (message) => this.Host.StartStep(message),
        onSuccess: (message) => this.Host.SucceedStep(message),
        // onError is multi-line HUMAN logging — route to the host, do NOT treat
        // each line as a discrete error. Structured per-record failures arrive
        // via onRecordError (below), so errors[] stays clean (plan §1a/§6/D6).
        onError: (message) => {
          if (message.includes('Rolling back database') || message.includes('rolled back successfully')) {
            warnings.push(message);
            this.Host.Log(message, 'warn');
          } else {
            this.Host.Log(message, 'error');
          }
        },
        onRecordError: (d) => {
          const context = d.path ? `${d.path}${d.entityName ? ` [${d.entityName}]` : ''}` : d.entityName || undefined;
          const message = d.primaryKey ? `${d.message} (pk: ${d.primaryKey})` : d.message;
          errors.push({ context, message });
        },
        onWarn: (message) => {
          warnings.push(message);
          this.Host.Log(message, 'warn');
        },
        onLog: (message) => this.Host.Log(message),
        onConfirm: async (message) => (nonInteractive ? true : confirm({ message })),
      },
    );

    const endTime = Date.now();
    for (const w of result.warnings) if (!warnings.includes(w)) warnings.push(w);

    // Recovery decision: with non-fatal errors, the original CLI asked whether to
    // keep the successfully-committed changes. Preserve that for interactive text
    // mode. CI / non-interactive keeps the failure (no prompt possible).
    let success = result.errors === 0 && errors.length === 0;
    if (!success && result.errors > 0 && !flags.ci && isText) {
      const commit = await confirm({
        message: 'Push completed with errors. Do you want to commit the successful changes?',
        default: false,
      });
      if (commit) success = true;
      else warnings.push('Push cancelled due to errors.');
    }

    if (isText) {
      this.renderPushTextSummary(formatter, result, flags['change-detail'], startTime, endTime);
    }

    return {
      success,
      command: 'sync:push',
      durationSeconds: (endTime - startTime) / 1000,
      data: {
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        deleted: result.deleted ?? 0,
        skipped: result.skipped ?? 0,
        deferred: result.deferred ?? 0,
        // The raw engine error COUNT is always present, even when fail-fast threw
        // before every failing record could be enumerated into errors[].
        errorCount: result.errors,
        dryRun: !!flags['dry-run'],
        sqlLogPath: result.sqlLogPath,
      },
      errors,
      warnings,
    };
    } catch (error) {
      // Infrastructure failures (config load, DB connect, etc.) — surface them
      // as a structured result so JSON consumers always get an output, and so
      // Cleanup() still runs to close the pool. If a per-record failure already
      // populated errors[] (fail-fast throws AFTER onRecordError fires), don't
      // duplicate it with the rethrown wrapper message.
      const message = error instanceof Error ? error.message : String(error);
      this.Host.FailStep('Push failed', message);
      if (errors.length === 0) errors.push({ message });
      return { success: false, command: 'sync:push', durationSeconds: (Date.now() - startTime) / 1000, errors, warnings };
    }
  }

  /** Reproduces the original rich text summary (recap, change-detail file, box, status). */
  private renderPushTextSummary(
    formatter: InstanceType<(typeof import('../services/FormattingService'))['FormattingService']>,
    result: PushResult,
    changeDetail: boolean,
    startTime: number,
    endTime: number,
  ): void {
    const recap = formatter.formatChangesRecap(result.changeLog);
    if (recap) this.Host.Log('\n' + recap);

    if (changeDetail && result.changeLog.length > 0) {
      const stamp = new Date(endTime).toISOString().replace(/[:.]/g, '-');
      const reportDir = result.sqlLogPath ? path.dirname(result.sqlLogPath) : process.cwd();
      const reportPath = path.join(reportDir, `MetadataSync_Changes_${stamp}.log`);
      try {
        writeFileSync(reportPath, formatter.formatChangesReport(result.changeLog, new Date(endTime).toISOString()));
        this.Host.Log(`\n📄 Detailed change report: ${path.relative(process.cwd(), reportPath)}`);
      } catch (writeErr) {
        this.Host.Log(`\n⚠️  Could not write change report: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`, 'warn');
      }
    }

    const changed = result.created > 0 || result.updated > 0 || (result.deleted || 0) > 0 || result.errors > 0;
    if (changed || this.Host.Verbose) {
      this.Host.Log(
        '\n' +
          formatter.formatSyncSummary('push', {
            created: result.created,
            updated: result.updated,
            unchanged: result.unchanged,
            deleted: result.deleted || 0,
            skipped: result.skipped || 0,
            deferred: result.deferred || 0,
            errors: result.errors,
            duration: endTime - startTime,
          }),
      );
    }

    if (result.warnings.length > 0) {
      this.Host.Log(`\n⚠️  ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''} during push`, 'warn');
      if (this.Host.Verbose) result.warnings.forEach((w) => this.Host.Log(`   - ${w}`, 'warn'));
    }

    const extras = changed || this.Host.Verbose ? '' : ` · no changes · ${formatter.formatDuration(endTime - startTime)}`;
    if (result.errors === 0) {
      this.Host.Log(`\n✓ Push completed successfully${extras}`);
    } else {
      this.Host.Log('\n⚠️  Push completed with errors', 'warn');
    }
    if (result.sqlLogPath) this.Host.Log(`\n📄 SQL log saved to: ${path.relative(process.cwd(), result.sqlLogPath)}`);
  }

  private fail(startTime: number, errors: MJCLIResultError[]): MJCLIResult {
    return { success: false, command: 'sync:push', durationSeconds: (Date.now() - startTime) / 1000, errors };
  }

  private cancelled(startTime: number, message: string): MJCLIResult {
    if (this.Host.Format === 'text') this.Host.Log(`\n⚠️  ${message}`, 'warn');
    return { success: true, command: 'sync:push', durationSeconds: (Date.now() - startTime) / 1000, warnings: [message] };
  }

  /**
   * Reset singletons + close the DB pool so the process can exit cleanly, then
   * force-exit. Without this the pg.Pool/mssql pool — and any embedding ONNX
   * worker threads — keep the event loop alive and the CLI hangs after a push.
   */
  protected async Cleanup(result: MJCLIResult): Promise<void> {
    try {
      const { resetSyncEngine, cleanupProvider } = await loadEngine();
      resetSyncEngine();
      await cleanupProvider();
    } catch {
      // best-effort
    }
    // Force-exit to kill lingering handles (pg.Pool, embedding ONNX workers).
    // Flush stdout FIRST so a buffered JSON result isn't truncated when piped
    // (e.g. `| jq`) — process.exit() would otherwise drop the unflushed write.
    const code = result.success ? 0 : 1;
    process.stdout.write('', () => process.exit(code));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// mj sync pull
// ─────────────────────────────────────────────────────────────────────────────

@RegisterClass(BaseCLIPlugin, 'sync:pull')
export class SyncPullPlugin extends BaseCLIPlugin {
  static description = 'Pull metadata from database to local files';

  static examples = [
    `<%= config.bin %> <%= command.id %> --entity="MJ: AI Prompts"`,
    `<%= config.bin %> <%= command.id %> --entity="MJ: AI Agents" --merge-strategy=overwrite`,
    `<%= config.bin %> <%= command.id %> --entity="Templates" --dry-run --verbose`,
  ];

  static flags = {
    entity: Flags.string({ description: 'Entity name to pull', required: true }),
    filter: Flags.string({ description: 'Additional filter for pulling specific records' }),
    'dry-run': Flags.boolean({ description: 'Show what would be pulled without actually pulling' }),
    'multi-file': Flags.string({ description: 'Create a single file with multiple records (provide filename)' }),
    'no-validate': Flags.boolean({ description: 'Skip validation before pull' }),
    'update-existing': Flags.boolean({ description: 'Update existing records during pull', default: true }),
    'create-new': Flags.boolean({ description: 'Create new files for records not found locally', default: true }),
    'backup-before-update': Flags.boolean({ description: 'Create backups before updating files', default: true }),
    'merge-strategy': Flags.string({ description: 'Merge strategy for updates', options: ['merge', 'overwrite', 'skip'], default: 'merge' }),
    'backup-directory': Flags.string({ description: 'Custom backup directory (default: .backups)' }),
    'preserve-fields': Flags.string({ description: 'Comma-separated list of fields to preserve during updates', multiple: true }),
    'exclude-fields': Flags.string({ description: 'Comma-separated list of fields to exclude from pull', multiple: true }),
    'target-dir': Flags.string({ description: 'Specific target directory (overrides auto-discovery)' }),
    incremental: Flags.boolean({ description: 'Only pull records updated since last successful pull', default: false }),
    since: Flags.string({ description: 'Only pull records updated after this ISO 8601 timestamp' }),
  };

  static Usage: PluginUsage = {
    domain: 'sync',
    command: 'sync:pull',
    summary: 'Pull database records into local metadata files.',
    description:
      'Writes records of --entity into the matching entity directory, creating or updating files per the merge strategy.',
    flags: [
      { name: '--entity', type: 'string', description: 'Entity name to pull (required)' },
      { name: '--filter', type: 'string', description: 'Extra SQL filter for which records to pull' },
      { name: '--merge-strategy', type: 'merge|overwrite|skip', description: 'How to reconcile existing files' },
      { name: '--dry-run', type: 'boolean', description: 'Report what would be pulled without writing' },
      { name: '--format', type: 'text|json|md', description: 'Output format (json for machine-readable result)' },
    ],
    examples: ['mj sync pull --entity="MJ: AI Prompts"', 'mj sync pull --entity="Actions" --format=json'],
    runtime: { class: 'variable', typicalSeconds: 15, note: 'scales with number of records matched for --entity' },
  };

  protected async Execute(): Promise<MJCLIResult> {
    const startTime = Date.now();
    const flags = this.GetFlags<SyncPullFlags>();
    const isText = this.Host.Format === 'text';
    const nonInteractive = !isText;

    const engine = await loadEngine();
    const {
      PullService, ValidationService, FormattingService,
      loadMJConfig, initializeProvider, getSyncEngine, getSystemUser,
      configManager, loadEntityConfig, FileBackupManager, SyncStateManager,
    } = engine;

    const errors: MJCLIResultError[] = [];
    const warnings: string[] = [];
    let backupManager: InstanceType<typeof FileBackupManager> | null = null;

    try {
      this.Host.StartStep('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.Host.FailStep('Loading configuration', 'No mj.config.cjs found');
        return { success: false, command: 'sync:pull', durationSeconds: (Date.now() - startTime) / 1000, errors: [{ message: 'No mj.config.cjs found in current directory or parent directories' }] };
      }

      await initializeProvider(mjConfig);
      const syncEngine = await getSyncEngine(getSystemUser());
      this.Host.SucceedStep('Configuration and metadata loaded');

      const entityDirectories = await this.findEntityDirectories(flags.entity, configManager, loadEntityConfig, warnings);
      if (entityDirectories.length === 0) {
        return { success: false, command: 'sync:pull', durationSeconds: (Date.now() - startTime) / 1000, errors: [{ context: flags.entity, message: `No directories found for entity "${flags.entity}". Ensure its .mj-sync.json config exists.` }] };
      }

      let targetDir = flags['target-dir'];
      if (!targetDir) {
        if (entityDirectories.length === 1) {
          targetDir = entityDirectories[0];
        } else if (nonInteractive) {
          return { success: false, command: 'sync:pull', durationSeconds: (Date.now() - startTime) / 1000, errors: [{ context: flags.entity, message: `Multiple directories found for "${flags.entity}"; pass --target-dir to choose one in non-interactive mode.` }] };
        } else {
          targetDir = await select({
            message: `Multiple directories found for entity "${flags.entity}". Which one to use?`,
            choices: entityDirectories.map((dir) => ({ name: dir, value: dir })),
          });
        }
      }

      const formatter = new FormattingService();
      if (!flags['no-validate']) {
        this.Host.StartStep('Validating target directory');
        const validator = new ValidationService({ verbose: this.Host.Verbose });
        const validationResult = await validator.validateDirectory(targetDir);
        if (!validationResult.isValid || validationResult.warnings.length > 0) {
          this.Host.FailStep('Validation reported issues');
          if (isText) this.Host.Log('\n' + formatter.formatValidationResult(validationResult, this.Host.Verbose));
          if (!validationResult.isValid) {
            if (nonInteractive) {
              return { success: false, command: 'sync:pull', durationSeconds: (Date.now() - startTime) / 1000, errors: [{ context: 'validation', message: 'Validation failed. Cannot proceed with pull.' }] };
            }
            const shouldContinue = await confirm({ message: 'Validation failed with errors. Continue anyway?', default: false });
            if (!shouldContinue) {
              if (isText) this.Host.Log('\n⚠️  Pull cancelled due to validation errors.', 'warn');
              return { success: true, command: 'sync:pull', durationSeconds: (Date.now() - startTime) / 1000, warnings: ['Pull cancelled due to validation errors.'] };
            }
          }
        } else {
          this.Host.SucceedStep('Validation passed');
        }
      }

      if (flags['backup-before-update']) {
        backupManager = new FileBackupManager();
        await backupManager.initialize();
      }

      const pullService = new PullService(syncEngine, getSystemUser());
      if (flags.incremental || flags.since) {
        const stateManager = new SyncStateManager(targetDir);
        await stateManager.load();
        pullService.setStateManager(stateManager);
      }

      // Only the fields PullService.pull() actually reads are forwarded; the
      // backup/merge/preserve/exclude flags it ignores are kept for help/CLI
      // compatibility but were no-ops in the original (passed via `any`).
      const pullOptions: PullOptions = { entity: flags.entity, targetDir, dryRun: flags['dry-run'], verbose: this.Host.Verbose, noValidate: flags['no-validate'] };
      if (flags.filter !== undefined) pullOptions.filter = flags.filter;
      if (flags['multi-file'] !== undefined) pullOptions.multiFile = flags['multi-file'];
      if (flags['update-existing'] !== undefined) pullOptions.updateExistingRecords = flags['update-existing'];
      if (flags['create-new'] !== undefined) pullOptions.createNewFileIfNotFound = flags['create-new'];
      if (flags.incremental) pullOptions.incremental = flags.incremental;
      if (flags.since !== undefined) pullOptions.since = flags.since;

      const result = await pullService.pull(pullOptions, {
        onProgress: (message) => this.Host.StartStep(message),
        onSuccess: (message) => this.Host.SucceedStep(message),
        onError: (message) => {
          errors.push({ message });
          this.Host.FailStep(message);
        },
        onWarn: (message) => {
          warnings.push(message);
          this.Host.Log(message, 'warn');
        },
        onLog: (message) => this.Host.Log(message),
      });

      if (backupManager && !flags['dry-run']) {
        await backupManager.cleanup();
      }
      if (!flags['dry-run']) {
        try {
          await pullService.cleanupBackupFiles();
        } catch (cleanupError) {
          warnings.push(`Failed to cleanup persistent backup files: ${cleanupError}`);
        }
      }

      if (isText && !flags['dry-run']) this.Host.Log('\n✅ Pull completed successfully');

      return {
        success: errors.length === 0,
        command: 'sync:pull',
        durationSeconds: (Date.now() - startTime) / 1000,
        data: {
          entity: flags.entity,
          targetDir: result.targetDir,
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          dryRun: !!flags['dry-run'],
        },
        errors,
        warnings,
      };
    } catch (error) {
      if (backupManager) {
        try {
          await backupManager.rollback();
        } catch (rollbackError) {
          warnings.push(`Failed to rollback backup files: ${rollbackError}`);
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      this.Host.FailStep('Pull failed', message);
      errors.push({ context: flags.entity, message });
      return { success: false, command: 'sync:pull', durationSeconds: (Date.now() - startTime) / 1000, errors, warnings };
    }
  }

  private async findEntityDirectories(
    entityName: string,
    configMgr: { getOriginalCwd(): string },
    loadConfig: (dir: string) => Promise<{ entity: string } | null>,
    warnings: string[],
  ): Promise<string[]> {
    const workingDir = configMgr.getOriginalCwd();
    const allDirs = this.findAllEntityDirectoriesRecursive(workingDir);
    const entityDirs: string[] = [];
    for (const dir of allDirs) {
      try {
        const config = await loadConfig(dir);
        if (config && config.entity === entityName) entityDirs.push(dir);
      } catch (error) {
        warnings.push(`Skipping directory ${dir}: invalid configuration (${error})`);
      }
    }
    return entityDirs;
  }

  private findAllEntityDirectoriesRecursive(dir: string): string[] {
    const directories: string[] = [];
    try {
      if (fs.existsSync(path.join(dir, '.mj-sync.json'))) directories.push(dir);
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isDirectory() && !item.name.startsWith('.')) {
          directories.push(...this.findAllEntityDirectoriesRecursive(path.join(dir, item.name)));
        }
      }
    } catch {
      // Skip directories we can't read
    }
    return directories;
  }

  protected async Cleanup(result: MJCLIResult): Promise<void> {
    try {
      const { resetSyncEngine } = await loadEngine();
      resetSyncEngine();
    } catch {
      // best-effort
    }
    // Pull doesn't spawn embedding workers, but close the pool to avoid a hang.
    try {
      const { cleanupProvider } = await loadEngine();
      await cleanupProvider();
    } catch {
      // best-effort
    }
    if (!result.success) process.exitCode = 1;
  }
}

/** Tree-shaking / dynamic-load anchor — referenced by the CLI plugin loader. */
export function LoadMetadataSyncPlugins(): void {
  // no-op; importing this module triggers the @RegisterClass decorators above.
}
