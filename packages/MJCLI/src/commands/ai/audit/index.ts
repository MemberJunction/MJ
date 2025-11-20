import { Command } from '@oclif/core';

export default class Audit extends Command {
  static description = 'Analyze and audit AI agent runs, prompts, and actions for debugging and performance analysis';

  static hidden = false;

  async run(): Promise<void> {
    // This command just displays help for the audit topic
    await this.config.runCommand('help', ['ai', 'audit']);
  }
}
