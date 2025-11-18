import { Command, Flags } from '@oclif/core';

export default class DbDocAnalyze extends Command {
  static description = 'Analyze database and generate documentation (delegates to db-auto-doc analyze)';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --resume ./output/run-6/state.json',
    '<%= config.bin %> <%= command.id %> --config ./my-config.json',
  ];

  static flags = {
    resume: Flags.string({
      char: 'r',
      description: 'Resume from an existing state file',
      required: false
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to config file',
      default: './config.json'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DbDocAnalyze);

    // Load DBAutoDoc command dynamically
    const { default: AnalyzeCommand } = await import('@memberjunction/db-auto-doc/dist/commands/analyze');

    // Build args array for DBAutoDoc command
    const args: string[] = [];
    if (flags.resume) {
      args.push('--resume', flags.resume);
    }
    if (flags.config) {
      args.push('--config', flags.config);
    }

    // Execute the DBAutoDoc analyze command
    await AnalyzeCommand.run(args);
  }
}
