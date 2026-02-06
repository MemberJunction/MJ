import { Command, Flags } from '@oclif/core';

export default class DbDocExportSoftKeys extends Command {
  static description = 'Convert discovered relationships to soft PK/FK configuration (delegates to db-auto-doc)';

  static examples = [
    '<%= config.bin %> <%= command.id %> --input ./db-doc-state.json --output ./config/soft-keys.json',
    '<%= config.bin %> <%= command.id %> -i ./state.json -o ./soft-keys.json --min-confidence 80 --validated-only',
    '<%= config.bin %> <%= command.id %> -i ./state.json -o ./soft-keys.json --status-filter confirmed --overwrite',
    '<%= config.bin %> <%= command.id %> -i ./state.json -o ./soft-keys.json --source discovery',
    '<%= config.bin %> <%= command.id %> -i ./state.json -o ./soft-keys.json --source schema',
  ];

  static flags = {
    input: Flags.string({
      description: 'Path to state.json file from dbautodoc',
      char: 'i',
      required: true,
    }),
    output: Flags.string({
      description: 'Output path for database-metadata-config.json',
      char: 'o',
      required: true,
    }),
    'min-confidence': Flags.integer({
      description: 'Minimum confidence threshold (0-100, only applies to discovered relationships)',
      default: 70,
    }),
    'validated-only': Flags.boolean({
      description: 'Only export LLM-validated relationships (only applies to discovered)',
      default: false,
    }),
    'status-filter': Flags.string({
      description: 'Comma-separated status filter (confirmed, candidate, rejected)',
      default: 'confirmed,candidate',
    }),
    overwrite: Flags.boolean({
      description: 'Overwrite existing output file',
      default: false,
    }),
    source: Flags.string({
      description: 'Data source: "discovery" (keyDetection phase), "schema" (existing FKs), or "auto" (try both)',
      options: ['discovery', 'schema', 'auto'],
      default: 'auto',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DbDocExportSoftKeys);

    // Load DBAutoDoc command dynamically
    const { default: ExportSoftKeysCommand } = await import('@memberjunction/db-auto-doc/dist/commands/export-soft-keys');

    // Build args array for DBAutoDoc command
    const args: string[] = [];

    args.push('--input', flags.input);
    args.push('--output', flags.output);
    args.push('--min-confidence', flags['min-confidence'].toString());
    args.push('--status-filter', flags['status-filter']);
    args.push('--source', flags.source);

    if (flags['validated-only']) args.push('--validated-only');
    if (flags.overwrite) args.push('--overwrite');

    // Execute the DBAutoDoc export-soft-keys command
    await ExportSoftKeysCommand.run(args);
  }
}
