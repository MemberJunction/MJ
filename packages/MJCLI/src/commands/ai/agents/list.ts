import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';

export default class AgentsList extends Command {
  static description = 'List available AI agents';

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
    const { AgentService, OutputFormatter } = await import('@memberjunction/ai-cli');

    const { flags } = await this.parse(AgentsList);
    const spinner = ora();

    try {
      spinner.start('Loading available agents...');
      const service = new AgentService();
      const agents = await service.listAgents();
      spinner.stop();

      const formatter = new OutputFormatter(flags.output as 'compact' | 'json' | 'table');
      this.log(formatter.formatAgentList(agents));
      
      // Force exit after completion
      process.exit(0);
    } catch (error) {
      spinner.fail('Failed to load agents');
      this.error(error as Error);
    }
  }
}