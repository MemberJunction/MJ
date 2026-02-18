import { Command, Args, Flags } from '@oclif/core';

/**
 * CLI command for converting SQL files between database dialects using
 * the deterministic sqlglot transpiler with optional database verification
 * and LLM fallback.
 *
 * Usage:
 *   mj sql-convert source.sql --from tsql --to postgres
 *   mj sql-convert source.sql --from tsql --to postgres --verify --target-db "postgres://..."
 *   mj sql-convert source.sql --from tsql --to postgres --output converted.sql --verbose
 */
export default class SqlConvert extends Command {
  static description = 'Convert SQL files between database dialects using sqlglot (deterministic transpilation)';

  static examples = [
    '<%= config.bin %> sql-convert ./migration.sql --from tsql --to postgres',
    '<%= config.bin %> sql-convert ./migration.sql --from tsql --to postgres --output converted.sql',
    '<%= config.bin %> sql-convert ./migration.sql --from tsql --to postgres --verify --target-db "postgres://user:pass@host:5432/db"',
    '<%= config.bin %> sql-convert ./migration.sql --from tsql --to postgres --verbose',
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
    verify: Flags.boolean({
      description: 'Execute each statement against target DB to verify',
      default: false,
    }),
    'target-db': Flags.string({
      description: 'Target database connection string for verification',
    }),
    'stop-on-error': Flags.boolean({
      description: 'Stop on first conversion failure',
      default: false,
    }),
    pretty: Flags.boolean({
      description: 'Pretty-print output',
      default: true,
      allowNo: true,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show per-statement progress',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SqlConvert);

    // Lazy-load dependencies
    const { ConversionPipeline } = await import('@memberjunction/sql-converter');
    const fs = await import('node:fs');
    const path = await import('node:path');

    const sourceFile = args.source;

    // Verify source file exists
    if (!fs.existsSync(sourceFile)) {
      this.error(`Source file not found: ${sourceFile}`);
    }

    // Determine output file path
    const outputFile = flags.output ?? this.defaultOutputPath(sourceFile, path);

    this.log(`Converting: ${sourceFile}`);
    this.log(`  From: ${flags.from} → To: ${flags.to}`);
    this.log(`  Output: ${outputFile}`);
    if (flags.verify) {
      this.log(`  Verification: enabled`);
    }
    this.log('');

    const pipeline = new ConversionPipeline();

    const result = await pipeline.Run({
      source: sourceFile,
      sourceIsFile: true,
      sourceDialect: flags.from,
      targetDialect: flags.to,
      outputFile,
      verify: flags.verify,
      llmFallback: false,
      audit: false,
      stopOnError: flags['stop-on-error'],
      maxLLMRetries: 0,
      pretty: flags.pretty,
      onProgress: flags.verbose ? (msg) => this.log(`  ${msg}`) : undefined,
    });

    // Print results
    this.log('');
    this.log('=== Conversion Results ===');
    this.log(`  Total statements: ${result.totalStatements}`);
    this.log(`  Successful: ${result.successCount}`);
    this.log(`  Failed: ${result.failureCount}`);
    this.log(`  Method: sqlglot=${result.sqlglotCount}, llm=${result.llmCount}, passthrough=${result.passthroughCount}`);
    this.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    this.log(`  Output: ${outputFile}`);

    if (result.failureCount > 0) {
      this.log('');
      this.log('--- Failed Statements ---');
      for (const stmt of result.statements) {
        if (!stmt.success) {
          this.log(`  [${stmt.index + 1}] ${stmt.error}`);
          if (flags.verbose) {
            this.log(`       Original: ${stmt.originalSQL.slice(0, 100).replace(/\n/g, ' ')}...`);
          }
        }
      }
    }

    if (!result.success) {
      this.error(`Conversion completed with ${result.failureCount} failures`);
    }
  }

  private defaultOutputPath(sourceFile: string, pathModule: typeof import('node:path')): string {
    const parsed = pathModule.parse(sourceFile);
    return pathModule.join(parsed.dir, `${parsed.name}.converted${parsed.ext}`);
  }
}
