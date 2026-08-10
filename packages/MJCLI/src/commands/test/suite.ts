import { Command, Flags, Args } from '@oclif/core';

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
    format: Flags.string({
      char: 'f',
      description: 'Output format',
      options: ['console', 'json', 'markdown'],
      default: 'console',
    }),
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
    'max-retries': Flags.integer({
      description: 'Retry a FAILED test up to N extra times, passing if any attempt passes (absorbs transient/non-deterministic flakiness). A test that fails then passes is reported as flaky. Default 0 (no retries).',
      default: 0,
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
    tests: Flags.string({
      description:
        'Restrict the run to specific tests by NAME (comma-separated). Names are ' +
        'resolved against the suite; unknown names are skipped with a warning. Used ' +
        'by `test regression rerun-failures` and for ad-hoc selection.',
    }),
    'max-suite-duration': Flags.integer({
      description:
        'Suite wall-clock budget in SECONDS. Once elapsed, dispatch of new ' +
        'tests stops and the run finalizes gracefully with partial results (the ' +
        'in-flight test still finishes). Overrides the suite\'s MaxExecutionTimeMS. ' +
        'Guarantees the run terminates even if individual tests hang.',
    }),
    'circuit-breaker': Flags.boolean({
      description:
        'Abort the run early when it is doomed: a sliding window of ' +
        'environment-class failures (degrading host) or the --max-failures cap ' +
        '(broken deploy). Recommended for CI. Default off.',
      default: false,
    }),
    'max-failures': Flags.integer({
      description:
        'Total-failure cap (any category) for --circuit-breaker. Default ' +
        'max(10, 25% of the suite). Ignored without --circuit-breaker.',
    }),
    'fail-fast': Flags.boolean({
      description:
        'Stop dispatching new tests on the first hard failure (drains in-flight, ' +
        'then finalizes with partial results). Default off.',
      default: false,
    }),
    sequence: Flags.string({
      description:
        'Run only the tests at these 1-based suite positions (comma-separated, ' +
        'e.g. "1,3,5"). Applied by the engine\'s sequence filter.',
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
        format: flags.format as 'console' | 'json' | 'markdown',
        output: flags.output,
        verbose: flags.verbose,
        delay: flags.delay,
        parallel: flags.parallel,
        maxParallel: flags['max-parallel'],
        flakyCheck: flags['flaky-check'],
        maxRetries: flags['max-retries'],
        oraclesModule: flags['oracles-module'],
        tests: flags.tests,
        maxSuiteDuration: flags['max-suite-duration'],
        circuitBreaker: flags['circuit-breaker'],
        maxFailures: flags['max-failures'],
        failFast: flags['fail-fast'],
        sequence: flags.sequence,
        checksModule: flags['checks-module'],
      });

    } catch (error) {
      this.error(error as Error);
    }
  }
}
