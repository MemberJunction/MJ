import { Command, Flags } from '@oclif/core';
import { LoadConfig, StandardsConfigError } from '@memberjunction/standards';
import { ExitCodeFor, FormatSummary, RunStandards } from '@memberjunction/standards';

/**
 * `mj standards check` — run the standards this repository has adopted.
 *
 * Reads `.mj-standards.json` and runs only what it names. A standard that exists in
 * `@memberjunction/standards` but is not in the config is reported as **available** and not run,
 * which is what lets the package ship new standards without changing this repo's result.
 */
export default class StandardsCheck extends Command {
  static description = 'Run the MemberJunction standards this repository has adopted';

  static examples = [
    { command: '<%= config.bin %> <%= command.id %>', description: 'Run every adopted standard' },
    { command: '<%= config.bin %> <%= command.id %> --check ui-layers', description: 'Run one standard' },
    { command: '<%= config.bin %> <%= command.id %> --strict', description: 'Fail on warnings too' },
  ];

  static flags = {
    cwd: Flags.string({ description: 'Repository root. Defaults to the current directory.' }),
    check: Flags.string({ description: 'Only run these check ids.', multiple: true }),
    strict: Flags.boolean({
      description: 'Treat warnings as errors. Use in CI once a newly adopted check is clean.',
      default: false,
    }),
    quiet: Flags.boolean({ description: 'Print only the summary line.', default: false }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(StandardsCheck);
    const repoRoot = flags.cwd ?? process.cwd();

    let config;
    try {
      config = LoadConfig(repoRoot);
    } catch (e) {
      if (e instanceof StandardsConfigError) {
        this.error(e.message, { exit: 2 });
      }
      throw e;
    }

    if (flags.check?.length) {
      // Narrowing runs the SAME configured severities — it never promotes an `off` check, because
      // "run just this one" should not also mean "and enable it".
      const wanted = new Set(flags.check);
      config = { ...config, Checks: Object.fromEntries(Object.entries(config.Checks).filter(([id]) => wanted.has(id))) };
    }

    const summary = await RunStandards(repoRoot, config);
    if (!flags.quiet) this.log(FormatSummary(summary, config));

    const failed = ExitCodeFor(summary) !== 0 || (flags.strict && summary.WarningCount > 0);
    if (failed) {
      if (flags.strict && summary.WarningCount > 0 && summary.ErrorCount === 0) {
        this.log('\n--strict: failing on warnings.');
      }
      process.exitCode = 1;
    }
  }
}
