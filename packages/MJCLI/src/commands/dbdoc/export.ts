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
    }),
    'erd-mode': Flags.string({
      description: 'ERD layout: full, clusters (one diagram per subject area) or both',
      options: ['full', 'clusters', 'both']
    }),
    'erd-columns': Flags.string({
      description: 'Columns drawn per entity: all, keys (PK/FK only) or none',
      options: ['all', 'keys', 'none']
    }),
    'erd-hub-min-inbound': Flags.integer({
      description: 'A table referenced by at least this many tables is a subject-area hub'
    }),
    'erd-lookup-max-rows': Flags.integer({
      description: 'A table that references nothing and has fewer rows than this is a reference table'
    }),
    'erd-page-size': Flags.integer({
      description: 'Tables per diagram page beyond the hub'
    }),
    'erd-min-cluster-size': Flags.integer({
      description: 'Subject areas smaller than this fold into a neighbour'
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
    if (flags['erd-mode']) args.push('--erd-mode', flags['erd-mode']);
    if (flags['erd-columns']) args.push('--erd-columns', flags['erd-columns']);
    if (flags['erd-hub-min-inbound'] !== undefined) args.push('--erd-hub-min-inbound', String(flags['erd-hub-min-inbound']));
    if (flags['erd-lookup-max-rows'] !== undefined) args.push('--erd-lookup-max-rows', String(flags['erd-lookup-max-rows']));
    if (flags['erd-page-size'] !== undefined) args.push('--erd-page-size', String(flags['erd-page-size']));
    if (flags['erd-min-cluster-size'] !== undefined) args.push('--erd-min-cluster-size', String(flags['erd-min-cluster-size']));

    // Execute the DBAutoDoc export command
    await ExportCommand.run(args);
  }
}
