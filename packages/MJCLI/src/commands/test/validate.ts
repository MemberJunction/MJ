import { Command, Flags, Args } from '@oclif/core';
import { TEST_FORMAT_FLAG, TEST_FORMAT_MAP, resolveLegacyFormat } from '../../lib/format-compat.js';

export default class TestValidate extends Command {
  static description = 'Validate test definitions without executing';

  static examples = [
    '<%= config.bin %> <%= command.id %> <test-id>',
    '<%= config.bin %> <%= command.id %> --all',
    '<%= config.bin %> <%= command.id %> --type=agent-eval',
    '<%= config.bin %> <%= command.id %> --all --save-report',
    '<%= config.bin %> <%= command.id %> --all --output=validation-report.md',
  ];

  static args = {
    testId: Args.string({
      description: 'Test ID to validate',
      required: false,
    }),
  };

  static flags = {
    all: Flags.boolean({
      char: 'a',
      description: 'Validate all tests',
      default: false,
    }),
    type: Flags.string({
      char: 't',
      description: 'Validate tests by type',
    }),
    'save-report': Flags.boolean({
      description: 'Save validation report to file',
      default: false,
    }),
    format: TEST_FORMAT_FLAG,
    output: Flags.string({
      char: 'o',
      description: 'Output file path',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed information',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { ValidateCommand } = await import('@memberjunction/testing-cli');

    const { args, flags } = await this.parse(TestValidate);

    try {
      // Create ValidateCommand instance and execute
      // Context user will be fetched internally after MJ provider initialization
      const validateCommand = new ValidateCommand();
      await validateCommand.execute(args.testId, {
        all: flags.all,
        type: flags.type,
        saveReport: flags['save-report'],
        format: resolveLegacyFormat({
          format: flags.format,
          legacy: 'console' as const,
          legacyDefault: 'console' as const,
          map: TEST_FORMAT_MAP,
        }),
        output: flags.output,
        verbose: flags.verbose,
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
