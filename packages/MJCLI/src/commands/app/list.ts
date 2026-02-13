import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { buildContextUser } from '../../utils/open-app-context.js';

interface InstalledAppRow {
  Name: string;
  Version: string;
  Status: string;
  SchemaName: string | null;
  Publisher: string;
}

export default class AppList extends Command {
  static description = 'List all installed MJ Open Apps';

  static examples = [
    '<%= config.bin %> app list',
  ];

  static flags = {
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppList);

    try {
      const { ListInstalledApps } = await import('@memberjunction/mj-open-app-engine');
      const contextUser = await buildContextUser();
      const apps = await ListInstalledApps(contextUser);

      if (apps.length === 0) {
        this.log('No Open Apps installed.');
        return;
      }

      this.log(chalk.bold('\nInstalled Open Apps:\n'));
      this.log(FormatAppTable(apps, flags.verbose));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }
}

function FormatAppTable(
  apps: InstalledAppRow[],
  verbose?: boolean
): string {
  const lines: string[] = [];
  const header = verbose
    ? PadColumns(['Name', 'Version', 'Status', 'Schema', 'Publisher'])
    : PadColumns(['Name', 'Version', 'Status']);
  const separator = '-'.repeat(header.length);

  lines.push(header);
  lines.push(separator);

  for (const app of apps) {
    const statusColor = app.Status === 'Active' ? chalk.green : app.Status === 'Error' ? chalk.red : chalk.yellow;
    const row = verbose
      ? PadColumns([app.Name, app.Version, statusColor(app.Status), app.SchemaName ?? '-', app.Publisher])
      : PadColumns([app.Name, app.Version, statusColor(app.Status)]);
    lines.push(row);
  }

  return lines.join('\n');
}

function PadColumns(values: string[]): string {
  const widths = [30, 12, 12, 20, 30];
  return values.map((v, i) => v.padEnd(widths[i] ?? 20)).join('  ');
}
