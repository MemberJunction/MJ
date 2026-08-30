import { Command } from '@oclif/core';
import { ListInstalledApps, GetLatestVersion } from '@memberjunction/open-app-engine';
import ora from 'ora-classic';
import chalk from 'chalk';
import { buildContextUser, buildGitHubOptions } from '../../utils/open-app-context.js';
import { CheckAppsForUpdates, FormatUpdateCheckReport, type UpdateCheckLine } from '../../utils/update-check.js';
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
      const report = await CheckAppsForUpdates(apps, (repoUrl, subpath) =>
        GetLatestVersion(repoUrl, githubOptions, subpath)
      );

      spinner.stop();

      // WHICH lines get printed is decided by FormatUpdateCheckReport — in particular the rule
      // that the reassuring "All apps are up to date" only appears when every app produced an
      // answer. That decision is unit-tested; this loop only paints it.
      for (const line of FormatUpdateCheckReport(report)) {
        this.log(RenderUpdateCheckLine(line));
      }
    } catch (error) {
      spinner.fail('Failed to check for updates');
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}

/** Applies colour and spacing to one formatted line. Presentation only — no decisions here. */
function RenderUpdateCheckLine(line: UpdateCheckLine): string {
  switch (line.Kind) {
    case 'up-to-date':
      return chalk.green(`\n${line.Text}`);
    case 'inconclusive':
      return chalk.yellow(`\n${line.Text}`);
    case 'updates-header':
      return chalk.bold(`\n${line.Text}\n`);
    case 'update': {
      // `<name>: <current> -> <latest>` — colour the two versions, not the arrow.
      const [name, versions] = SplitOnce(line.Text, ': ');
      const [current, latest] = SplitOnce(versions, ' -> ');
      return `  ${name}: ${chalk.yellow(current)} -> ${chalk.green(latest)}`;
    }
    case 'upgrade-hint':
      return `\nRun ${chalk.cyan('mj app upgrade <name>')} to upgrade.`;
    case 'failures-header':
    case 'unresolved-header':
      return chalk.yellow(`\n${line.Text}\n`);
    case 'failure': {
      const [name, message] = SplitOnce(line.Text, ': ');
      return `  ${name}: ${chalk.red(message)}`;
    }
    case 'unresolved': {
      // `<name> (installed <version>): <reason>` — the installed version is highlighted the same
      // way it is on an update line, so the two sections read consistently.
      const parts = line.Text.match(/^(.*) \(installed (.*)\): ([\s\S]*)$/);
      if (!parts) {
        return `  ${line.Text}`;
      }
      return `  ${parts[1]} (installed ${chalk.yellow(parts[2])}): ${chalk.dim(parts[3])}`;
    }
    case 'failures-note':
    case 'unresolved-note':
      return chalk.dim(`\n${line.Text}`);
  }
}

/** Splits on the FIRST occurrence only, so a separator inside the remainder survives intact. */
function SplitOnce(text: string, separator: string): [string, string] {
  const at = text.indexOf(separator);
  return at === -1 ? [text, ''] : [text.slice(0, at), text.slice(at + separator.length)];
}
