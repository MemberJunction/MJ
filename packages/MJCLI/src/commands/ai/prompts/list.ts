import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import ora from 'ora-classic';

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
    const { PromptService } = await import('@memberjunction/ai-cli');

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
      
      // Force exit after completion
      process.exit(0);

    } catch (error) {
      spinner.fail('Failed to load models');
      this.error(error as Error);
    }
  }
}