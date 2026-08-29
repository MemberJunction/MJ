import { Command, Flags, Args } from '@oclif/core';
import { TEST_FORMAT_FLAG, TEST_FORMAT_MAP, resolveLegacyFormat } from '../../lib/format-compat.js';

export default class TestRun extends Command {
  static description = 'Execute a single test by ID or name';

  static examples = [
    '<%= config.bin %> <%= command.id %> <test-id>',
    '<%= config.bin %> <%= command.id %> --name="Active Members Count"',
    '<%= config.bin %> <%= command.id %> <test-id> --environment=staging',
    '<%= config.bin %> <%= command.id %> <test-id> --format=json --output=results.json',
    '<%= config.bin %> <%= command.id %> <test-id> --dry-run',
  ];

  static args = {
    testId: Args.string({
      description: 'Test ID to execute',
      required: false,
    }),
  };

  static flags = {
    name: Flags.string({
      char: 'n',
      description: 'Test name to execute',
    }),
    environment: Flags.string({
      char: 'e',
      description: 'Environment context (dev, staging, prod)',
    }),
    format: TEST_FORMAT_FLAG,
    output: Flags.string({
      char: 'o',
      description: 'Output file path',
    }),
    'dry-run': Flags.boolean({
      description: 'Validate without executing',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed execution information',
      default: false,
    }),
    'checks-module': Flags.string({
      description:
        'Module specifier (package name or path) side-effect-imported before the run so its ' +
        'integration check bundles register on the IntegrationCheckRegistry. Durable form: ' +
        "mj.config.cjs `testing.checkModules` (this repo loads '@memberjunction/integration-test-suite' that way).",
    }),
    'oracles-module': Flags.string({
      description:
        'Path to a JS/TS module that exports custom IOracle classes or instances. ' +
        'Each export is registered on the engine before the test runs — used by non-MJ ' +
        'adopters to plug app-specific oracle types without modifying TestingFramework.',
    }),
  };

  async run(): Promise<void> {
    const { RunCommand } = await import('@memberjunction/testing-cli');

    const { args, flags } = await this.parse(TestRun);

    try {
      // Create RunCommand instance and execute
      // Context user will be fetched internally after MJ provider initialization
      const runCommand = new RunCommand();
      await runCommand.execute(args.testId, {
        name: flags.name,
        environment: flags.environment,
        format: resolveLegacyFormat({
          format: flags.format,
          legacy: 'console' as const,
          legacyDefault: 'console' as const,
          map: TEST_FORMAT_MAP,
        }),
        output: flags.output,
        dryRun: flags['dry-run'],
        verbose: flags.verbose,
        oraclesModule: flags['oracles-module'],
        checksModule: flags['checks-module'],
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
