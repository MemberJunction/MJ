import { Command, Flags } from '@oclif/core';
import { PromptService } from '../../services/PromptService';
import chalk from 'chalk';

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
    const { flags } = await this.parse(PromptsList);
    
    try {
      const service = new PromptService();
      const models = await service.listAvailableModels();

      this.log(chalk.bold(`\nAvailable AI Models (${models.length}):\n`));

      for (const model of models) {
        this.log(`${chalk.cyan(model.name)} ${chalk.gray(`(${model.vendor})`)}`);
        if (flags.verbose && model.description) {
          this.log(`  ${chalk.dim(model.description)}`);
        }
      }

      this.log(chalk.gray('\nUse any of these models with the --model flag when running prompts'));

    } catch (error) {
      this.error(error as Error);
    }
  }
}