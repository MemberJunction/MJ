import { Command } from '@oclif/core';

export default class DBDoc extends Command {
  static description = 'AI-powered database documentation generator';

  static hidden = false;

  async run(): Promise<void> {
    // This command just displays help for the dbdoc topic
    await this.config.runCommand('help', ['dbdoc']);
  }
}
