import { Command } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';
import { buildContextUser } from '../../utils/open-app-context.js';
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
      const { ListInstalledApps, GetLatestVersion } = await import('@memberjunction/open-app-engine');
      const config = getValidatedConfig();

      const contextUser = await buildContextUser();
      const apps = await ListInstalledApps(contextUser);

      if (apps.length === 0) {
        spinner.info('No Open Apps installed.');
        return;
      }

      const githubOptions = { Token: config.openApps?.github?.token ?? process.env.GITHUB_TOKEN };
      const updates: Array<{ Name: string; Current: string; Latest: string }> = [];

      for (const app of apps) {
        const latest = await GetLatestVersion(app.RepositoryURL, githubOptions);
        if (latest && latest !== app.Version) {
          updates.push({ Name: app.Name, Current: app.Version, Latest: latest });
        }
      }

      spinner.stop();

      if (updates.length === 0) {
        this.log(chalk.green('\nAll apps are up to date.'));
        return;
      }

      this.log(chalk.bold('\nUpdates available:\n'));
      for (const update of updates) {
        this.log(`  ${update.Name}: ${chalk.yellow(update.Current)} -> ${chalk.green(update.Latest)}`);
      }
      this.log(`\nRun ${chalk.cyan('mj app upgrade <name>')} to upgrade.`);
    } catch (error) {
      spinner.fail('Failed to check for updates');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}
