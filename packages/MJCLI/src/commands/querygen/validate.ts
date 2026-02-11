import { Command, Flags } from '@oclif/core';

export default class Validate extends Command {
  static description = 'Validate existing query templates';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --path ./metadata/queries`,
    `<%= config.bin %> <%= command.id %> --verbose`,
  ];

  static flags = {
    path: Flags.string({
      char: 'p',
      description: 'Path to queries metadata file or directory',
      default: './metadata/queries'
    }),
    verbose: Flags.boolean({ char: 'v', description: 'Verbose output' }),
  };

  async run(): Promise<void> {
    const { validateCommand } = await import('@memberjunction/query-gen');
    const { loadMJConfig, initializeProvider } = await import('@memberjunction/metadata-sync');

    const { flags } = await this.parse(Validate);

    try {
      // Load MJ configuration and initialize provider
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }

      await initializeProvider(mjConfig);

      // Convert flags to options object for QueryGen
      const options: Record<string, unknown> = {
        path: flags.path,
        verbose: flags.verbose
      };

      // Call QueryGen validate command
      await validateCommand(options);

    } catch (error) {
      // QueryGen commands call process.exit(), so this may not be reached
      // But we handle it just in case
      this.error(error as Error);
    }
  }
}
