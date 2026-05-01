import { Command, Flags } from '@oclif/core';
import type { BatchConverterConfig, BatchConverterResult, ConversionStats } from '@memberjunction/sql-converter';

/**
 * CLI command to discover and convert T-SQL migrations to PostgreSQL.
 *
 * Scans the SQL Server migrations directory, identifies files that don't
 * have a corresponding .pg.sql counterpart in the PG migrations directory,
 * and converts them using the BatchConverter pipeline.
 *
 * Usage:
 *   mj migrate convert                              # Convert all unconverted migrations
 *   mj migrate convert --file V20260401__foo.sql     # Convert a specific file
 *   mj migrate convert --dry-run                     # Show what would be converted
 *   mj migrate convert --verbose                     # Show per-statement progress
 */
export default class MigrateConvert extends Command {
  static description = 'Convert T-SQL migrations to PostgreSQL using the BatchConverter pipeline';

  static examples = [
    '<%= config.bin %> migrate convert',
    '<%= config.bin %> migrate convert --dry-run',
    '<%= config.bin %> migrate convert --file V202604060452__v5.24.x__KnowledgeHub.sql',
    '<%= config.bin %> migrate convert --source-dir ./migrations/v5 --output-dir ./migrations-pg/v5',
    '<%= config.bin %> migrate convert --verbose',
  ];

  static flags = {
    'source-dir': Flags.string({
      description: 'Source T-SQL migrations directory',
      default: './migrations/v5',
    }),
    'output-dir': Flags.string({
      description: 'Output PG migrations directory',
      default: './migrations-pg/v5',
    }),
    file: Flags.string({
      description: 'Convert a specific file (filename only, looked up in source-dir)',
    }),
    schema: Flags.string({
      description: 'Target schema name',
      default: '__mj',
    }),
    'dry-run': Flags.boolean({
      description: 'Show what would be converted without writing files',
      default: false,
    }),
    'no-header': Flags.boolean({
      description: 'Skip PG header (extensions, schema, implicit cast)',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show per-statement progress',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MigrateConvert);

    const fs = await import('node:fs');
    const path = await import('node:path');
    const { convertFile, getRulesForDialects, createConversionStats, deduplicateEntityFieldSequences } = await import('@memberjunction/sql-converter');

    const sourceDir = path.resolve(flags['source-dir']);
    const outputDir = path.resolve(flags['output-dir']);

    // Verify directories exist
    if (!fs.existsSync(sourceDir)) {
      this.error(`Source directory not found: ${sourceDir}`);
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      this.log(`Created output directory: ${outputDir}`);
    }

    // Load conversion rules
    const rules = getRulesForDialects('tsql', 'postgres');
    if (rules.length === 0) {
      this.error('No conversion rules found for tsql -> postgres');
    }

    // Discover migrations
    const unconverted = this.discoverUnconverted(sourceDir, outputDir, flags.file, fs, path);

    if (unconverted.length === 0) {
      this.log('All migrations are already converted. Nothing to do.');
      return;
    }

    this.log(`Found ${unconverted.length} migration(s) to convert:\n`);
    for (const m of unconverted) {
      this.log(`  ${m.SourceFile} → ${m.OutputFile}`);
    }

    if (flags['dry-run']) {
      this.log('\nDry run — no files written.');
      return;
    }

    this.log('');

    // Convert each file
    let successCount = 0;
    let errorCount = 0;
    const totalStats: ConversionStats = createConversionStats();

    for (const migration of unconverted) {
      this.log(`Converting: ${migration.SourceFile}`);

      const config: BatchConverterConfig = {
        Source: path.join(sourceDir, migration.SourceFile),
        SourceIsFile: true,
        OutputFile: path.join(outputDir, migration.OutputFile),
        Rules: rules,
        Schema: flags.schema,
        SourceDialect: 'tsql',
        TargetDialect: 'postgres',
        IncludeHeader: !flags['no-header'],
        EnablePostProcess: true,
        OnProgress: flags.verbose ? (msg: string) => this.log(`  ${msg}`) : undefined,
      };

      const result: BatchConverterResult = convertFile(config);
      this.mergeStats(totalStats, result.Stats);

      if (result.Stats.Errors > 0) {
        errorCount++;
        this.logToStderr(`  ERRORS: ${result.Stats.Errors} in ${migration.SourceFile}`);
        for (const err of result.Stats.ErrorBatches) {
          this.logToStderr(`    ${err.substring(0, 200)}`);
        }
      } else {
        successCount++;
        this.log(`  OK (${result.Stats.Converted} batches, ${result.Stats.TotalBatches - result.Stats.Converted} skipped)`);
      }
    }

    // Print summary
    this.log('');
    this.log('=== Conversion Summary ===');
    this.log(`  Files:       ${unconverted.length} (${successCount} OK, ${errorCount} errors)`);
    this.log(`  Batches:     ${totalStats.TotalBatches} total, ${totalStats.Converted} converted, ${totalStats.Skipped} skipped, ${totalStats.Errors} errors`);
    this.log(`  Tables:      ${totalStats.TablesCreated}`);
    this.log(`  Views:       ${totalStats.ViewsCreated}`);
    this.log(`  Procedures:  ${totalStats.ProceduresConverted}`);
    this.log(`  Functions:   ${totalStats.FunctionsConverted}`);
    this.log(`  Triggers:    ${totalStats.TriggersConverted}`);
    this.log(`  Indexes:     ${totalStats.IndexesCreated}`);
    this.log(`  Inserts:     ${totalStats.InsertsConverted}`);
    this.log(`  Grants:      ${totalStats.GrantsConverted}`);

    if (errorCount > 0) {
      this.error(`Conversion completed with errors in ${errorCount} file(s)`);
    }

    // Post-conversion: deduplicate EntityField Sequence values across files
    // to prevent UQ_EntityField_EntityID_Sequence violations on PG
    this.log('\nRunning EntityField Sequence deduplication...');
    const dedupResult = deduplicateEntityFieldSequences(outputDir);
    if (dedupResult.totalCollisions > 0) {
      this.log(`  Fixed ${dedupResult.totalCollisions} sequence collision(s) across ${dedupResult.fixes.length} INSERT(s):`);
      for (const fix of dedupResult.fixes) {
        this.log(`    ${fix.file} line ${fix.line}: ${fix.originalSequence} → ${fix.newSequence}`);
      }
    } else {
      this.log(`  No collisions found (${dedupResult.totalInserts} EntityField INSERTs scanned).`);
    }
  }

  /**
   * Discovers T-SQL migrations that don't have a corresponding PG counterpart.
   *
   * A T-SQL file like `V202604060452__v5.24.x__Foo.sql` maps to:
   * - `V202604060452__v5.24.x__Foo.pg.sql` in the output directory
   *
   * Baseline files (B__) and .pg-only.sql files are skipped.
   */
  private discoverUnconverted(
    sourceDir: string,
    outputDir: string,
    specificFile: string | undefined,
    fs: typeof import('node:fs'),
    path: typeof import('node:path')
  ): Array<{ SourceFile: string; OutputFile: string }> {
    const sourceFiles = fs.readdirSync(sourceDir)
      .filter((f: string) => f.endsWith('.sql') && !f.endsWith('.pg.sql') && !f.endsWith('.pg-only.sql'))
      .sort();

    const outputFiles = new Set(
      fs.readdirSync(outputDir)
        .filter((f: string) => f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql'))
    );

    const unconverted: Array<{ SourceFile: string; OutputFile: string }> = [];

    for (const sourceFile of sourceFiles) {
      // If a specific file was requested, only convert that one
      if (specificFile && sourceFile !== specificFile) {
        continue;
      }

      // Generate expected PG filename: replace .sql with .pg.sql
      const pgFileName = sourceFile.replace(/\.sql$/, '.pg.sql');

      // Check if PG version already exists
      if (!outputFiles.has(pgFileName)) {
        // Also check if a .pg-only.sql variant exists (manual PG-specific override)
        const pgOnlyFileName = sourceFile.replace(/\.sql$/, '.pg-only.sql');
        if (!outputFiles.has(pgOnlyFileName)) {
          unconverted.push({
            SourceFile: sourceFile,
            OutputFile: pgFileName,
          });
        }
      }
    }

    return unconverted;
  }

  private mergeStats(target: ConversionStats, source: ConversionStats): void {
    target.TotalBatches += source.TotalBatches;
    target.Converted += source.Converted;
    target.Skipped += source.Skipped;
    target.Errors += source.Errors;
    target.TablesCreated += source.TablesCreated;
    target.ViewsCreated += source.ViewsCreated;
    target.ProceduresConverted += source.ProceduresConverted;
    target.FunctionsConverted += source.FunctionsConverted;
    target.TriggersConverted += source.TriggersConverted;
    target.IndexesCreated += source.IndexesCreated;
    target.InsertsConverted += source.InsertsConverted;
    target.GrantsConverted += source.GrantsConverted;
    target.FKConstraints += source.FKConstraints;
    target.CheckConstraints += source.CheckConstraints;
    target.CommentsConverted += source.CommentsConverted;
    target.ErrorBatches.push(...source.ErrorBatches);
    target.SkippedBatches.push(...source.SkippedBatches);
  }
}
