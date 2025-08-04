import { Command } from '@oclif/core';

export default class AI extends Command {
  static description = 'Execute AI agents and actions';

  static hidden = false;

  async run(): Promise<void> {
    // This command just displays help for the ai topic
    await this.config.runCommand('help', ['ai']);
  }
}