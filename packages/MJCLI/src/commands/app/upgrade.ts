import { Args, Command, Flags } from '@oclif/core';
import { UpgradeApp } from '@memberjunction/open-app-engine';
import ora from 'ora-classic';
import chalk from 'chalk';
import { BuildOrchestratorContext } from '../../utils/open-app-context.js';
import { ParseDependenciesFromHead } from '../../utils/dependencies-from-head.js';

/**
 * CLI command: `mj app upgrade <name>`.
 *
 * Upgrades an installed Open App to a newer version, running new migrations,
 * updating packages, and recording upgrade history.
 */
export default class AppUpgrade extends Command {
  static description = 'Upgrade an installed MJ Open App to a newer version';

  static examples = [
    '<%= config.bin %> app upgrade acme-crm',
    '<%= config.bin %> app upgrade acme-crm --version 1.3.0',
    '<%= config.bin %> app upgrade acme-crm --dependencies-from-head mj-common',
  ];

  static args = {
    name: Args.string({
      description: 'Name of the installed app to upgrade',
      required: true,
    }),
  };

  static flags = {
    version: Flags.string({ description: 'Specific version to upgrade to (default: latest)' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
    'non-interactive': Flags.boolean({
      description: 'Skip interactive prompts; post-upgrade hooks use environment variables / defaults (for CI/headless upgrades)',
      default: false,
    }),
    'dependencies-from-head': Flags.string({
      description:
        "For development: read the dependencies of this installed app from its repository's default branch, instead of those recorded for its installed version. Repeat for more apps, or give 'all'",
      helpValue: '<app|all>',
      multiple: true,
      multipleNonGreedy: true,
    }),
    'dangerously-ignore-dbl-underscore-schema-rule': Flags.boolean({
      hidden: true,
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppUpgrade);
    const spinner = ora();
    let failed = false;

    try {
      const context = await BuildOrchestratorContext(this, flags.verbose, !flags['non-interactive']);

      const result = await UpgradeApp(
        {
          AppName: args.name,
          Version: flags.version,
          Verbose: flags.verbose,
          AllowDoubleUnderscoreSchema: flags['dangerously-ignore-dbl-underscore-schema-rule'],
          DependenciesFromHead: ParseDependenciesFromHead(flags['dependencies-from-head']),
        },
        context
      );

      if (result.Success) {
        spinner.succeed(chalk.green(`Upgraded ${result.AppName} to v${result.Version}`));
        if (result.Summary) {
          this.log(`\n${result.Summary}`);
        }
      } else {
        spinner.fail(chalk.red(`Upgrade failed: ${result.ErrorMessage}`));
        failed = true;
      }
    } catch (error) {
      spinner.fail('Upgrade failed');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
    // Outside the try on purpose: oclif's exit() works by throwing, and the catch above would
    // swallow it — printing a second failure line and exiting 2 with "EEXIT: 1".
    if (failed) {
      this.exit(1);
    }
  }
}
