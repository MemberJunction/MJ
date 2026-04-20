import { Command, Flags } from '@oclif/core';

export default class Export extends Command {
  static description = 'Export queries from database to metadata files';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --output ./metadata/queries`,
    `<%= config.bin %> <%= command.id %> --verbose`,
  ];

  static flags = {
    output: Flags.string({
      char: 'o',
      description: 'Output directory',
      default: './metadata/queries'
    }),
    verbose: Flags.boolean({ char: 'v', description: 'Verbose output' }),
  };

  async run(): Promise<void> {
    const { exportCommand } = await import('@memberjunction/query-gen');
    const { loadMJConfig, initializeProvider } = await import('@memberjunction/metadata-sync');

    const { flags } = await this.parse(Export);

    try {
      // Load MJ configuration and initialize provider
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }

      await initializeProvider(mjConfig);

      // Convert flags to options object for QueryGen
      const options: Record<string, unknown> = {
        output: flags.output,
        verbose: flags.verbose
      };

      // Call QueryGen export command
      await exportCommand(options);

    } catch (error) {
      // QueryGen commands call process.exit(), so this may not be reached
      // But we handle it just in case
      this.error(error as Error);
    }
  }
}
