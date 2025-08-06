import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import ora from 'ora-classic';
import { ActionService } from '../../services/ActionService';
import { ValidationService } from '../../services/ValidationService';
import { OutputFormatter } from '../../lib/output-formatter';

export default class ActionsRun extends Command {
  static description = 'Execute individual actions directly';

  static examples = [
    '<%= config.bin %> <%= command.id %> -n "Get Weather" --param "Location=Boston"',
    '<%= config.bin %> <%= command.id %> -n "Send Email" --param "To=user@example.com" --param "Subject=Test"',
    '<%= config.bin %> <%= command.id %> --output=json',
    '<%= config.bin %> <%= command.id %> -n "Calculate" --param "Numbers=[1,2,3]" --verbose',
  ];

  static flags = {
    name: Flags.string({
      char: 'n',
      description: 'Name of the action to execute',
      required: false
    }),
    param: Flags.string({
      description: 'Action parameter (key=value format, can be used multiple times)',
      multiple: true,
      default: []
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
    const { flags } = await this.parse(ActionsRun);
    const spinner = ora();

    try {
      // Validate inputs
      const validator = new ValidationService();
      const outputFormat = validator.validateOutputFormat(flags.output);
      const timeout = validator.validateTimeout(flags.timeout);
      const parameters = validator.parseParameters(flags.param);

      await validator.validateActionInput(flags.name, parameters);

      // Show available actions if none specified
      if (!flags.name) {
        spinner.start('Loading available actions...');
        
        const actionService = new ActionService();
        await actionService.initialize();
        
        const actions = await actionService.listActions();
        spinner.stop();
        
        const formatter = new OutputFormatter(outputFormat);
        this.log(formatter.formatActionList(actions));
        return;
      }

      if (flags['dry-run']) {
        spinner.start('Validating action and parameters...');
        
        const actionService = new ActionService();
        await actionService.initialize();
        
        // Try to find the action to validate it exists
        const action = await actionService.findAction(flags.name);
        spinner.stop();
        
        if (!action) {
          this.error(`Action "${flags.name}" not found. Use 'mj-ai actions:list' to see available actions.`);
        }
        
        this.log(chalk.green('✓ Validation passed - dry run complete'));
        this.log(chalk.dim(`Action: ${flags.name}`));
        
        if (Object.keys(parameters).length > 0) {
          this.log(chalk.dim(`Parameters:`));
          Object.entries(parameters).forEach(([key, value]) => {
            const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            const displayValue = valueStr.length > 50 ? valueStr.substring(0, 50) + '...' : valueStr;
            this.log(chalk.dim(`  ${key}: ${displayValue}`));
          });
        } else {
          this.log(chalk.dim(`Parameters: None`));
        }
        
        this.log(chalk.dim(`Timeout: ${timeout}ms`));
        return;
      }

      // Execute action
      spinner.start(`Executing action: ${flags.name}...`);
      
      const actionService = new ActionService();
      await actionService.initialize();
      
      const result = await actionService.executeAction(flags.name, {
        verbose: flags.verbose,
        timeout: timeout,
        parameters: parameters
      });

      spinner.stop();

      const formatter = new OutputFormatter(outputFormat);
      this.log(formatter.formatActionResult(result));

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