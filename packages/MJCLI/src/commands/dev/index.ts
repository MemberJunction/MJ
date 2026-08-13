import { Command } from '@oclif/core';

export default class Dev extends Command {
  static description = 'Local development tooling (cross-repo workspace generation)';

  static hidden = false;

  async run(): Promise<void> {
    // This command just displays help for the dev topic
    await this.config.runCommand('help', ['dev']);
  }
}
