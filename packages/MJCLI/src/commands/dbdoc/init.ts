import { Command } from '@oclif/core';

export default class DbDocInit extends Command {
  static description = 'Initialize DBAutoDoc project (delegates to db-auto-doc init)';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  async run(): Promise<void> {
    // Load DBAutoDoc command dynamically
    const { default: InitCommand } = await import('@memberjunction/db-auto-doc/dist/commands/init');

    // Execute the DBAutoDoc init command
    await InitCommand.run([]);
  }
}
