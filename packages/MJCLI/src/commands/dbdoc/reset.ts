import { Command, Flags } from '@oclif/core';

export default class DbDocReset extends Command {
  static description = 'Reset analysis state (delegates to db-auto-doc reset)';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --force',
  ];

  static flags = {
    force: Flags.boolean({
      description: 'Force reset without confirmation',
      char: 'f',
      default: false
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DbDocReset);

    // Load DBAutoDoc command dynamically
    const { default: ResetCommand } = await import('@memberjunction/db-auto-doc/dist/commands/reset.js');

    // Build args array for DBAutoDoc command
    const args: string[] = [];
    if (flags.force) {
      args.push('--force');
    }

    // Execute the DBAutoDoc reset command
    await ResetCommand.run(args);
  }
}
