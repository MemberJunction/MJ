import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';

export default class AgentsRun extends Command {
  static description = 'Execute an AI agent with a prompt or start interactive chat';

  static examples = [
    '<%= config.bin %> <%= command.id %> -a "Skip: Requirements Expert" -p "Create a dashboard for sales metrics"',
    '<%= config.bin %> <%= command.id %> -a "Child Component Generator Sub-agent" --chat',
    '<%= config.bin %> <%= command.id %> -a "Skip: Technical Design Expert" -p "Build a React component" --verbose --timeout=600000',
  ];

  static flags = {
    agent: Flags.string({
      char: 'a',
      description: 'Agent name',
      required: true,
    }),
    prompt: Flags.string({
      char: 'p',
      description: 'Prompt to execute',
      exclusive: ['chat'],
    }),
    chat: Flags.boolean({
      char: 'c',
      description: 'Start interactive chat mode',
      exclusive: ['prompt'],
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      options: ['compact', 'json', 'table'],
      default: 'compact',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed execution information',
    }),
    timeout: Flags.integer({
      description: 'Execution timeout in milliseconds',
      default: 300000, // 5 minutes
    }),
  };

  async run(): Promise<void> {
    const { AgentService, OutputFormatter, ConversationService } = await import('@memberjunction/ai-cli');

    const { flags } = await this.parse(AgentsRun);

    if (!flags.prompt && !flags.chat) {
      this.error('Either --prompt or --chat flag is required');
    }

    const service = new AgentService();
    const formatter = new OutputFormatter(flags.output as 'compact' | 'json' | 'table');

    try {
      if (flags.chat) {
        // Interactive chat mode
        const conversationService = new ConversationService();
        await conversationService.startChat(flags.agent, undefined, {
          verbose: flags.verbose,
          timeout: flags.timeout,
        });
      } else {
        // Single prompt execution
        const spinner = ora();
        spinner.start(`Executing agent: ${flags.agent}`);

        const result = await service.executeAgent(flags.agent, flags.prompt!, {
          verbose: flags.verbose,
          timeout: flags.timeout,
        });

        spinner.stop();
        this.log(formatter.formatAgentResult(result));

        if (!result.success) {
          this.exit(1);
        }
      }
    } catch (error) {
      this.error(error as Error);
    }
  }
}