import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';

export default class PromptsRun extends Command {
  static description = 'Execute a direct prompt with an AI model';

  static examples = [
    '<%= config.bin %> <%= command.id %> -p "Explain quantum computing in simple terms"',
    '<%= config.bin %> <%= command.id %> -p "Write a Python function to sort a list" --model "gpt-4"',
    '<%= config.bin %> <%= command.id %> -p "Translate to French: Hello world" --temperature 0.3',
    '<%= config.bin %> <%= command.id %> -p "Generate a haiku" --system "You are a poet" --max-tokens 100',
  ];

  static flags = {
    prompt: Flags.string({
      char: 'p',
      description: 'The prompt to execute',
      required: true,
    }),
    model: Flags.string({
      char: 'm',
      description: 'AI model to use (e.g., gpt-4, claude-3-opus)',
    }),
    system: Flags.string({
      char: 's',
      description: 'System prompt to set context',
    }),
    temperature: Flags.string({
      char: 't',
      description: 'Temperature for response creativity (0.0-2.0)',
    }),
    'max-tokens': Flags.integer({
      description: 'Maximum tokens for the response',
    }),
    configuration: Flags.string({
      char: 'c',
      description: 'AI Configuration ID to use',
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
    const { PromptService, OutputFormatter } = await import('@memberjunction/ai-cli');

    const { flags } = await this.parse(PromptsRun);
    const service = new PromptService();
    const formatter = new OutputFormatter(flags.output as 'compact' | 'json' | 'table');

    try {
      const spinner = ora();
      
      // Show what model will be used
      if (flags.model) {
        spinner.start(`Executing prompt with model: ${flags.model}`);
      } else {
        spinner.start('Executing prompt with default model');
      }

      // Parse temperature if provided
      let temperature: number | undefined;
      if (flags.temperature) {
        temperature = parseFloat(flags.temperature);
        if (isNaN(temperature) || temperature < 0 || temperature > 2) {
          spinner.fail();
          this.error('Temperature must be a number between 0.0 and 2.0');
        }
      }

      const result = await service.executePrompt(flags.prompt, {
        verbose: flags.verbose,
        timeout: flags.timeout,
        model: flags.model,
        temperature,
        maxTokens: flags['max-tokens'],
        systemPrompt: flags.system,
        configurationId: flags.configuration,
      });

      spinner.stop();
      this.log(formatter.formatPromptResult(result));

      if (!result.success) {
        this.exit(1);
      }
    } catch (error) {
      this.error(error as Error);
    }
  }
}