import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import { AgentService } from '../../services/AgentService';
import { OutputFormatter } from '../../lib/output-formatter';
import { ValidationService } from '../../services/ValidationService';

export default class AgentsList extends Command {
  static description = 'List available AI agents';

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
    const { flags } = await this.parse(AgentsList);
    const spinner = ora('Loading available agents...');

    try {
      const validator = new ValidationService();
      const outputFormat = validator.validateOutputFormat(flags.output);

      spinner.start();

      const agentService = new AgentService();
      await agentService.initialize();
      
      const agents = await agentService.listAgents();
      
      spinner.stop();

      const formatter = new OutputFormatter(outputFormat);
      this.log(formatter.formatAgentList(agents));
      
      // Clean up resources
      await this.cleanup();
      
      // Force exit after successful completion
      setImmediate(() => process.exit(0));

    } catch (error: any) {
      if (spinner.isSpinning) {
        spinner.fail('Failed to load agents');
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