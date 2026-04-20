import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';

export default class ActionsList extends Command {
  static description = 'List available AI actions';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --output=table',
    '<%= config.bin %> <%= command.id %> --output=json',
  ];

  static flags = {
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      options: ['compact', 'json', 'table'],
      default: 'compact',
    }),
  };

  async run(): Promise<void> {
    const { ActionService, OutputFormatter } = await import('@memberjunction/ai-cli');

    const { flags } = await this.parse(ActionsList);
    const spinner = ora();

    try {
      spinner.start('Loading available actions...');
      const service = new ActionService();
      const actions = await service.listActions();
      spinner.stop();

      const formatter = new OutputFormatter(flags.output as 'compact' | 'json' | 'table');
      this.log(formatter.formatActionList(actions));
      
      // Force exit after completion
      process.exit(0);
    } catch (error) {
      spinner.fail('Failed to load actions');
      this.error(error as Error);
    }
  }
}