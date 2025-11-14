import { Command, Flags } from '@oclif/core';

export default class DbDocGenerateQueries extends Command {
  static description = 'Generate sample SQL queries from existing analysis state (delegates to db-auto-doc generate-queries)';

  static examples = [
    '<%= config.bin %> <%= command.id %> --from-state ./output/run-1/state.json',
    '<%= config.bin %> <%= command.id %> --from-state ./output/run-1/state.json --output-dir ./queries',
    '<%= config.bin %> <%= command.id %> --from-state ./output/run-1/state.json --queries-per-table 10',
  ];

  static flags = {
    'from-state': Flags.string({
      description: 'Path to existing state.json file from previous analysis',
      required: true
    }),
    'output-dir': Flags.string({
      description: 'Output directory for generated queries',
      required: false
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to config file (for database connection and AI settings)',
      default: './config.json'
    }),
    'queries-per-table': Flags.integer({
      description: 'Number of queries to generate per table',
      required: false
    }),
    'max-execution-time': Flags.integer({
      description: 'Maximum execution time for query validation (ms)',
      required: false
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DbDocGenerateQueries);

    // Load DBAutoDoc command dynamically
    const { default: GenerateQueriesCommand } = await import('@memberjunction/db-auto-doc/dist/commands/generate-queries');

    // Build args array for DBAutoDoc command
    const args: string[] = [];

    if (flags['from-state']) {
      args.push('--from-state', flags['from-state']);
    }
    if (flags['output-dir']) {
      args.push('--output-dir', flags['output-dir']);
    }
    if (flags.config) {
      args.push('--config', flags.config);
    }
    if (flags['queries-per-table']) {
      args.push('--queries-per-table', flags['queries-per-table'].toString());
    }
    if (flags['max-execution-time']) {
      args.push('--max-execution-time', flags['max-execution-time'].toString());
    }

    // Execute the DBAutoDoc generate-queries command
    await GenerateQueriesCommand.run(args);
  }
}
