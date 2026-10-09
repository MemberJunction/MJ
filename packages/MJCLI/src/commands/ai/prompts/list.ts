import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import ora from 'ora-classic';
import { CloseAIProvider, EndAICommand, RouteConsoleToStderr } from '../../../lib/ai-command-lifecycle.js';

export default class PromptsList extends Command {
  static description = 'List available models for prompt execution';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  static flags = {
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed model information',
    }),
  };

  async run(): Promise<void> {
    // stdout is this command's result; framework logging goes to stderr, out of a piped listing.
    RouteConsoleToStderr();
    const { PromptService, CloseMJProvider } = await import('@memberjunction/ai-cli');

    const { flags } = await this.parse(PromptsList);
    const spinner = ora();

    try {
      spinner.start('Loading available models...');
      const service = new PromptService();
      const models = await service.listAvailableModels();
      spinner.stop();

      this.log(chalk.bold(`\nAvailable AI Models (${models.length}):\n`));

      for (const model of models) {
        this.log(`${chalk.cyan(model.name)} ${chalk.gray(`(${model.vendor})`)}`);
        if (flags.verbose && model.description) {
          this.log(`  ${chalk.dim(model.description)}`);
        }
      }

      this.log(chalk.gray('\nUse any of these models with the --model flag when running prompts'));
    } catch (error) {
      spinner.fail('Failed to load models');
      await CloseAIProvider(CloseMJProvider);
      this.error(error as Error);
    }

    // Close the pool instead of process.exit(): exiting at once could cut the list short.
    await EndAICommand(CloseMJProvider, 0);
  }
}