import { Command, Flags } from '@oclif/core';

export default class DbDocExport extends Command {
  static description = 'Export documentation in multiple formats (delegates to db-auto-doc export)';

  static examples = [
    '<%= config.bin %> <%= command.id %> --state-file=./db-doc-state.json',
    '<%= config.bin %> <%= command.id %> --sql',
    '<%= config.bin %> <%= command.id %> --markdown',
    '<%= config.bin %> <%= command.id %> --html',
    '<%= config.bin %> <%= command.id %> --csv',
    '<%= config.bin %> <%= command.id %> --mermaid',
    '<%= config.bin %> <%= command.id %> --sql --markdown --html --csv --mermaid --apply',
  ];

  static flags = {
    'state-file': Flags.string({
      description: 'Path to state JSON file',
      char: 's'
    }),
    'output-dir': Flags.string({
      description: 'Output directory for generated files',
      char: 'o'
    }),
    sql: Flags.boolean({
      description: 'Generate SQL script'
    }),
    markdown: Flags.boolean({
      description: 'Generate Markdown documentation'
    }),
    html: Flags.boolean({
      description: 'Generate interactive HTML documentation'
    }),
    csv: Flags.boolean({
      description: 'Generate CSV exports (tables and columns)'
    }),
    mermaid: Flags.boolean({
      description: 'Generate Mermaid ERD diagram files'
    }),
    report: Flags.boolean({
      description: 'Generate analysis report'
    }),
    apply: Flags.boolean({
      description: 'Apply SQL to database',
      default: false
    }),
    'approved-only': Flags.boolean({
      description: 'Only export approved items',
      default: false
    }),
    'confidence-threshold': Flags.string({
      description: 'Minimum confidence threshold',
      default: '0'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DbDocExport);

    // Load DBAutoDoc command dynamically
    const { default: ExportCommand } = await import('@memberjunction/db-auto-doc/dist/commands/export');

    // Build args array for DBAutoDoc command
    const args: string[] = [];

    if (flags['state-file']) args.push('--state-file', flags['state-file']);
    if (flags['output-dir']) args.push('--output-dir', flags['output-dir']);
    if (flags.sql) args.push('--sql');
    if (flags.markdown) args.push('--markdown');
    if (flags.html) args.push('--html');
    if (flags.csv) args.push('--csv');
    if (flags.mermaid) args.push('--mermaid');
    if (flags.report) args.push('--report');
    if (flags.apply) args.push('--apply');
    if (flags['approved-only']) args.push('--approved-only');
    if (flags['confidence-threshold']) args.push('--confidence-threshold', flags['confidence-threshold']);

    // Execute the DBAutoDoc export command
    await ExportCommand.run(args);
  }
}
