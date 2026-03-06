import { Command, Args, Flags } from '@oclif/core';
import type { BatchConverterConfig, BatchConverterResult, ConversionStats } from '@memberjunction/sql-converter';

/**
 * CLI command for converting SQL files between database dialects using
 * a rule-based BatchConverter engine that applies dialect-specific
 * conversion rules (CREATE TABLE, VIEW, PROCEDURE→FUNCTION, triggers, etc.).
 *
 * Usage:
 *   mj sql-convert source.sql --from tsql --to postgres
 *   mj sql-convert source.sql --from tsql --to postgres --output converted.sql --verbose
 *   mj sql-convert source.sql --from tsql --to postgres --schema my_schema --no-header
 */
export default class SqlConvert extends Command {
  static description = 'Convert SQL files between database dialects using rule-based BatchConverter engine';

  static examples = [
    '<%= config.bin %> sql-convert ./migration.sql --from tsql --to postgres',
    '<%= config.bin %> sql-convert ./migration.sql --from tsql --to postgres --output converted.sql',
    '<%= config.bin %> sql-convert ./migration.sql --from tsql --to postgres --schema my_schema',
    '<%= config.bin %> sql-convert ./migration.sql --from tsql --to postgres --no-header --verbose',
  ];

  static args = {
    source: Args.string({
      description: 'Source SQL file path',
      required: true,
    }),
  };

  static flags = {
    from: Flags.string({
      description: 'Source SQL dialect',
      required: true,
    }),
    to: Flags.string({
      description: 'Target SQL dialect',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file path (default: <source>.converted.<ext>)',
    }),
    schema: Flags.string({
      description: 'Target schema name',
      default: '__mj',
    }),
    'no-header': Flags.boolean({
      description: 'Skip PG header (extensions, schema, implicit cast)',
      default: false,
    }),
    'no-post-process': Flags.boolean({
      description: 'Skip post-processing pass',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show per-statement progress and detailed report',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SqlConvert);

    // Lazy-load dependencies
    const { convertFile, getRulesForDialects, printReport } = await import('@memberjunction/sql-converter');
    const fs = await import('node:fs');
    const path = await import('node:path');

    const sourceFile = args.source;

    // Verify source file exists
    if (!fs.existsSync(sourceFile)) {
      this.error(`Source file not found: ${sourceFile}`);
    }

    // Determine output file path
    const outputFile = flags.output ?? this.defaultOutputPath(sourceFile, path);

    // Load rules for the requested dialect pair
    const rules = getRulesForDialects(flags.from, flags.to);
    if (rules.length === 0) {
      this.error(`No conversion rules found for ${flags.from} -> ${flags.to}`);
    }

    this.log(`Converting: ${sourceFile}`);
    this.log(`  From: ${flags.from} → To: ${flags.to}`);
    this.log(`  Schema: ${flags.schema}`);
    this.log(`  Rules: ${rules.length} conversion rules loaded`);
    this.log(`  Output: ${outputFile}`);
    this.log('');

    const config: BatchConverterConfig = {
      Source: sourceFile,
      SourceIsFile: true,
      OutputFile: outputFile,
      Rules: rules,
      Schema: flags.schema,
      SourceDialect: flags.from,
      TargetDialect: flags.to,
      IncludeHeader: !flags['no-header'],
      EnablePostProcess: !flags['no-post-process'],
      OnProgress: flags.verbose ? (msg: string) => this.log(`  ${msg}`) : undefined,
    };

    const result: BatchConverterResult = convertFile(config);

    // Print summary
    const stats: ConversionStats = result.Stats;
    this.log('');
    this.log('=== Conversion Summary ===');
    this.log(`  Total batches: ${stats.TotalBatches}`);
    this.log(`  Converted:     ${stats.Converted}`);
    this.log(`  Skipped:       ${stats.Skipped}`);
    this.log(`  Errors:        ${stats.Errors}`);
    this.log('');
    this.log('  Objects created:');
    this.log(`    Tables:      ${stats.TablesCreated}`);
    this.log(`    Views:       ${stats.ViewsCreated}`);
    this.log(`    Procedures:  ${stats.ProceduresConverted}`);
    this.log(`    Functions:   ${stats.FunctionsConverted}`);
    this.log(`    Triggers:    ${stats.TriggersConverted}`);
    this.log(`    Indexes:     ${stats.IndexesCreated}`);
    this.log(`    Inserts:     ${stats.InsertsConverted}`);
    this.log(`    Grants:      ${stats.GrantsConverted}`);
    this.log(`    FK Constr.:  ${stats.FKConstraints}`);
    this.log(`    Comments:    ${stats.CommentsConverted}`);
    this.log(`  Output: ${outputFile}`);

    // Print detailed report in verbose mode
    if (flags.verbose) {
      printReport(stats, (msg: string) => this.log(msg));
    }

    if (stats.Errors > 0) {
      this.error(`Conversion completed with ${stats.Errors} errors`);
    }
  }

  private defaultOutputPath(sourceFile: string, pathModule: typeof import('node:path')): string {
    const parsed = pathModule.parse(sourceFile);
    return pathModule.join(parsed.dir, `${parsed.name}.converted${parsed.ext}`);
  }
}
