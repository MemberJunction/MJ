import { Args, Command } from '@oclif/core';
import chalk from 'chalk';
import { buildStubDataProvider } from '../../utils/open-app-context.js';

export default class AppInfo extends Command {
  static description = 'Show detailed information about an installed MJ Open App';

  static examples = [
    '<%= config.bin %> app info acme-crm',
  ];

  static args = {
    name: Args.string({
      description: 'Name of the installed app',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(AppInfo);

    try {
      const { FindInstalledApp } = await import('@memberjunction/mj-open-app-engine');
      const dataProvider = buildStubDataProvider();
      const app = await FindInstalledApp(dataProvider, args.name);

      if (!app) {
        this.error(`App '${args.name}' is not installed.`);
      }

      this.log(chalk.bold(`\n${app.DisplayName}\n`));
      this.log(`  Name:        ${app.Name}`);
      this.log(`  Version:     ${app.Version}`);
      this.log(`  Status:      ${FormatStatus(app.Status)}`);
      this.log(`  Publisher:   ${app.Publisher}`);
      if (app.PublisherEmail) this.log(`  Email:       ${app.PublisherEmail}`);
      if (app.PublisherURL) this.log(`  URL:         ${app.PublisherURL}`);
      this.log(`  Repository:  ${app.RepositoryURL}`);
      if (app.SchemaName) this.log(`  Schema:      ${app.SchemaName}`);
      this.log(`  MJ Range:    ${app.MJVersionRange}`);
      if (app.License) this.log(`  License:     ${app.License}`);
      if (app.Description) this.log(`\n  ${app.Description}`);
      this.log('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
    }
  }

}

function FormatStatus(status: string): string {
  switch (status) {
    case 'Active': return chalk.green(status);
    case 'Error': return chalk.red(status);
    case 'Disabled': return chalk.yellow(status);
    default: return chalk.blue(status);
  }
}
