import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import { ActionService } from '../../services/ActionService';
import { OutputFormatter } from '../../lib/output-formatter';
import { ValidationService } from '../../services/ValidationService';

export default class ActionsList extends Command {
  static description = 'List available actions';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --output=json',
    '<%= config.bin %> <%= command.id %> --output=table',
  ];

  static flags = {
    output: Flags.string({
      description: 'Output format',
      options: ['compact', 'json', 'table'],
      default: 'table'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ActionsList);
    const spinner = ora('Loading available actions...');

    try {
      const validator = new ValidationService();
      const outputFormat = validator.validateOutputFormat(flags.output);

      spinner.start();

      const actionService = new ActionService();
      await actionService.initialize();
      
      const actions = await actionService.listActions();
      
      spinner.stop();

      const formatter = new OutputFormatter(outputFormat);
      this.log(formatter.formatActionList(actions));
      
      // Clean up resources
      await this.cleanup();
      
      // Force exit after successful completion
      setImmediate(() => process.exit(0));

    } catch (error: any) {
      if (spinner.isSpinning) {
        spinner.fail('Failed to load actions');
      }
      
      // If it's a formatted error message, show it cleanly
      if (error.message.startsWith('❌')) {
        this.log(error.message);
        this.exit(1);
      } else {
        this.error(error.message);
      }
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const { closeMJProvider } = await import('../../lib/mj-provider');
      await closeMJProvider();
    } catch (error) {
      // Ignore cleanup errors to not interfere with main execution
    }
  }
}