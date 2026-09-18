import { Command, Flags, Args } from '@oclif/core';
import { TEST_FORMAT_FLAG, TEST_FORMAT_MAP, resolveLegacyFormat } from '../../lib/format-compat.js';

export default class TestSuite extends Command {
  static description = 'Execute a test suite';

  static examples = [
    '<%= config.bin %> <%= command.id %> <suite-id>',
    '<%= config.bin %> <%= command.id %> --name="Agent Quality Suite"',
    '<%= config.bin %> <%= command.id %> <suite-id> --format=json',
    '<%= config.bin %> <%= command.id %> <suite-id> --output=suite-results.json',
  ];

  static args = {
    suiteId: Args.string({
      description: 'Test suite ID to execute',
      required: false,
    }),
  };

  static flags = {
    name: Flags.string({
      char: 'n',
      description: 'Test suite name to execute',
    }),
    format: TEST_FORMAT_FLAG,
    output: Flags.string({
      char: 'o',
      description: 'Output file path',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed execution information',
      default: false,
    }),
    delay: Flags.integer({
      char: 'd',
      description: 'Delay in milliseconds between test executions (avoids Auth0 rate limits)',
      default: 0,
    }),
    parallel: Flags.boolean({
      char: 'p',
      description: 'Run tests in parallel with shared browser sessions',
      default: false,
    }),
    'max-parallel': Flags.integer({
      description: 'Maximum number of parallel workers (default 4)',
      default: 4,
    }),
    'flaky-check': Flags.integer({
      description: 'Run each test N times to detect flakiness (variance > 0.3 or mixed pass/fail = flaky). Recommended: 3 or 5',
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
        'Each export is registered on the engine before the suite runs — used by non-MJ ' +
        'adopters to plug app-specific oracle types without modifying TestingFramework.',
    }),
  };

  async run(): Promise<void> {
    const { SuiteCommand } = await import('@memberjunction/testing-cli');

    const { args, flags } = await this.parse(TestSuite);

    try {
      // Create SuiteCommand instance and execute
      // Context user will be fetched internally after MJ provider initialization
      const suiteCommand = new SuiteCommand();
      await suiteCommand.execute(args.suiteId, {
        name: flags.name,
        format: resolveLegacyFormat({
          format: flags.format,
          legacy: 'console' as const,
          legacyDefault: 'console' as const,
          map: TEST_FORMAT_MAP,
        }),
        output: flags.output,
        verbose: flags.verbose,
        delay: flags.delay,
        parallel: flags.parallel,
        maxParallel: flags['max-parallel'],
        flakyCheck: flags['flaky-check'],
        oraclesModule: flags['oracles-module'],
        checksModule: flags['checks-module'],
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
