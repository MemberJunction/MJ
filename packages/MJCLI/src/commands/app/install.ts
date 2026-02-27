import { Args, Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';
import { buildOrchestratorContext } from '../../utils/open-app-context.js';

/**
 * CLI command: `mj app install <source>`.
 *
 * Installs an Open App from a GitHub repository URL, executing the full
 * install flow (manifest validation, dependency resolution, schema creation,
 * migration execution, npm package management, and config updates).
 */
export default class AppInstall extends Command {
  static description = 'Install an MJ Open App from a GitHub repository';

  static examples = [
    '<%= config.bin %> app install https://github.com/acme/mj-crm',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --version 1.2.0',
    '<%= config.bin %> app install https://github.com/acme/mj-crm --verbose',
  ];

  static args = {
    source: Args.string({
      description: 'GitHub repository URL of the Open App',
      required: true,
    }),
  };

  static flags = {
    version: Flags.string({ description: 'Specific version to install (default: latest)' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppInstall);
    const spinner = ora();

    try {
      const { InstallApp } = await import('@memberjunction/open-app-engine');
      const context = await buildOrchestratorContext(this, flags.verbose);

      const result = await InstallApp(
        { Source: args.source, Version: flags.version, Verbose: flags.verbose },
        context
      );

      if (result.Success) {
        spinner.succeed(chalk.green(`Installed ${result.AppName} v${result.Version}`));
        if (result.Summary) {
          this.log(`\n${result.Summary}`);
        }
      } else {
        spinner.fail(chalk.red(`Install failed: ${result.ErrorMessage}`));
        this.exit(1);
      }
    } catch (error) {
      spinner.fail('Install failed');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}
