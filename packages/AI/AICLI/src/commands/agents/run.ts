import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import ora from 'ora-classic';
import { AgentService } from '../../services/AgentService';
import { ConversationService } from '../../services/ConversationService';
import { ValidationService } from '../../services/ValidationService';
import { OutputFormatter } from '../../lib/output-formatter';

export default class AgentsRun extends Command {
  static description = 'Execute AI agents with custom prompts';

  static examples = [
    '<%= config.bin %> <%= command.id %> -a "Demo Loop Agent" -p "Hello world"',
    '<%= config.bin %> <%= command.id %> -a "Demo Loop Agent" --chat',
    '<%= config.bin %> <%= command.id %> -a "Demo Loop Agent" -p "Get weather" --verbose',
    '<%= config.bin %> <%= command.id %> --output=json',
  ];

  static flags = {
    agent: Flags.string({
      char: 'a',
      description: 'Name of the AI agent to execute',
      required: false
    }),
    prompt: Flags.string({
      char: 'p', 
      description: 'Prompt text to send to the agent'
    }),
    chat: Flags.boolean({
      char: 'c',
      description: 'Start interactive conversation mode'
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed execution information'
    }),
    timeout: Flags.integer({
      description: 'Override default timeout (milliseconds)',
      default: 300000
    }),
    'dry-run': Flags.boolean({
      description: 'Validate without executing'
    }),
    output: Flags.string({
      description: 'Output format',
      options: ['compact', 'json', 'table'],
      default: 'compact'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AgentsRun);
    const spinner = ora();

    try {
      // Validate inputs
      const validator = new ValidationService();
      const outputFormat = validator.validateOutputFormat(flags.output);
      const timeout = validator.validateTimeout(flags.timeout);
      
      await validator.validateAgentInput(flags.agent, flags.prompt, flags.chat);

      // Show available agents if none specified
      if (!flags.agent) {
        spinner.start('Loading available agents...');
        
        const agentService = new AgentService();
        await agentService.initialize();
        
        const agents = await agentService.listAgents();
        spinner.stop();
        
        const formatter = new OutputFormatter(outputFormat);
        this.log(formatter.formatAgentList(agents));
        return;
      }

      if (flags['dry-run']) {
        spinner.start('Validating agent and configuration...');
        
        const agentService = new AgentService();
        await agentService.initialize();
        
        // Try to find the agent to validate it exists
        const agent = await agentService.findAgent(flags.agent);
        spinner.stop();
        
        if (!agent) {
          this.error(`Agent "${flags.agent}" not found. Use 'mj-ai agents:list' to see available agents.`);
        }
        
        this.log(chalk.green('✓ Validation passed - dry run complete'));
        this.log(chalk.dim(`Agent: ${flags.agent}`));
        if (flags.prompt) {
          this.log(chalk.dim(`Prompt: ${flags.prompt.substring(0, 100)}${flags.prompt.length > 100 ? '...' : ''}`));
        }
        this.log(chalk.dim(`Mode: ${flags.chat ? 'Interactive chat' : 'Single execution'}`));
        this.log(chalk.dim(`Timeout: ${timeout}ms`));
        return;
      }

      // Execute agent in chat mode
      if (flags.chat) {
        const conversationService = new ConversationService();
        await conversationService.startChat(flags.agent, flags.prompt, {
          verbose: flags.verbose,
          timeout: timeout
        });
        return;
      }

      // Execute agent with single prompt
      if (!flags.prompt) {
        this.error('Prompt is required for non-interactive mode. Use --chat for interactive mode or provide --prompt.');
      }

      spinner.start(`Executing agent: ${flags.agent}...`);
      
      const agentService = new AgentService();
      await agentService.initialize();
      
      const result = await agentService.executeAgent(flags.agent, flags.prompt, {
        verbose: flags.verbose,
        timeout: timeout
      });

      spinner.stop();

      const formatter = new OutputFormatter(outputFormat);
      this.log(formatter.formatAgentResult(result));

      // Clean up resources
      await this.cleanup();
      
      // Exit with error code if execution failed
      if (!result.success) {
        this.exit(1);
      }
      
      // Force exit after successful completion
      setImmediate(() => process.exit(0));

    } catch (error: any) {
      if (spinner.isSpinning) {
        spinner.fail('Operation failed');
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