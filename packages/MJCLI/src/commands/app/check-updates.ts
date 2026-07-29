import { Command } from '@oclif/core';
import { ListInstalledApps, GetLatestVersion } from '@memberjunction/open-app-engine';
import ora from 'ora-classic';
import chalk from 'chalk';
import { buildContextUser, buildGitHubOptions } from '../../utils/open-app-context.js';
import { CheckAppsForUpdates } from '../../utils/update-check.js';
import { getValidatedConfig } from '../../config.js';

/**
 * CLI command: `mj app check-updates`.
 *
 * Queries GitHub for the latest version tag of each installed Open App
 * and reports which apps have newer versions available.
 */
export default class AppCheckUpdates extends Command {
  static description = 'Check for available upgrades for installed MJ Open Apps';

  static examples = [
    '<%= config.bin %> app check-updates',
  ];

  async run(): Promise<void> {
    const spinner = ora('Checking for updates...').start();

    try {
      const config = getValidatedConfig();

      const contextUser = await buildContextUser();
      const apps = await ListInstalledApps(contextUser);

      if (apps.length === 0) {
        spinner.info('No Open Apps installed.');
        return;
      }

      // Same options `mj app install` / `upgrade` use, so a repo reachable there is reachable here.
      // A bare `{ Token }` dropped the per-repo TokenMap, and every private repo whose token lives
      // there reported "up to date" forever.
      const githubOptions = buildGitHubOptions(config);
      const { Updates: updates, Failures: failures } = await CheckAppsForUpdates(apps, (repoUrl, subpath) =>
        GetLatestVersion(repoUrl, githubOptions, subpath)
      );

      spinner.stop();

      if (updates.length === 0) {
        this.log(chalk.green('\nAll apps are up to date.'));
      } else {
        this.log(chalk.bold('\nUpdates available:\n'));
        for (const update of updates) {
          this.log(`  ${update.Name}: ${chalk.yellow(update.Current)} -> ${chalk.green(update.Latest)}`);
        }
        this.log(`\nRun ${chalk.cyan('mj app upgrade <name>')} to upgrade.`);
      }

      if (failures.length > 0) {
        this.log(chalk.yellow(`\nCould not check ${failures.length} app(s):\n`));
        for (const failure of failures) {
          this.log(`  ${failure.Name}: ${chalk.red(failure.Message)}`);
        }
        this.log(chalk.dim('\nThese apps may or may not have updates — the check did not complete for them.'));
      }
    } catch (error) {
      spinner.fail('Failed to check for updates');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}
