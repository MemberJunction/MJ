import { Command, Flags } from '@oclif/core';

export default class DbDocStatus extends Command {
  static description = 'Show analysis status and progress (delegates to db-auto-doc status)';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --state-file ./custom-state.json',
  ];

  static flags = {
    'state-file': Flags.string({
      description: 'Path to state JSON file',
      char: 's'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DbDocStatus);

    // Load DBAutoDoc command dynamically
    const { default: StatusCommand } = await import('@memberjunction/db-auto-doc/dist/commands/status.js');

    // Build args array for DBAutoDoc command
    const args: string[] = [];
    if (flags['state-file']) {
      args.push('--state-file', flags['state-file']);
    }

    // Execute the DBAutoDoc status command
    await StatusCommand.run(args);
  }
}
