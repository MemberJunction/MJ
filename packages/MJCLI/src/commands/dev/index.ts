import { Command } from '@oclif/core';

export default class Dev extends Command {
  static description =
    'Local development tooling: generate, inspect, and tear down the cross-repo pnpm workspace that links ' +
    'sibling repo clones. Run `mj dev usage` for every command\'s flags, examples, and runtime hints.';

  static hidden = false;

  async run(): Promise<void> {
    // This command just displays help for the dev topic
    await this.config.runCommand('help', ['dev']);
  }
}
