import { Command, Flags } from '@oclif/core';
import { Flyway } from 'node-flyway';
import ora from 'ora-classic';
import { config, getFlywayConfig } from '../../config';

export default class Migrate extends Command {
  static description = 'Migrate MemberJunction database to latest version';

  static examples = [
    `<%= config.bin %> <%= command.id %>
`,
  ];

  static flags = {
    verbose: Flags.boolean({ char: 'v', description: 'Enable additional logging' }),
    tag: Flags.string({ char: 't', description: 'Version tag to use for running remote migrations' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Migrate);

    if (!config) {
      this.error('No configuration found');
    }

    const flywayConfig = await getFlywayConfig(config, flags.tag);
    const flyway = new Flyway(flywayConfig);

    if (flags.verbose) {
      this.log(`Connecting to ${flywayConfig.url}`);
      this.log(`Migrating ${config.coreSchema} schema using migrations from:\n\t- ${flywayConfig.migrationLocations.join('\n\t- ')}\n`);
    }

    if (flags.tag) {
      this.log(`Migrating to ${flags.tag}`);
    }
    const spinner = ora('Running migrations...');
    spinner.start();

    const result = await flyway.migrate();

    if (result.success) {
      spinner.succeed();
      this.log(`Migrations complete in ${result.additionalDetails.executionTime / 1000}s`);
      if (result.flywayResponse?.success && flags.verbose) {
        this.log(`\tUpdated to ${result.flywayResponse?.targetSchemaVersion}`);
      }
    } else {
      spinner.fail();
      if (result.error) {
        this.logToStderr(result.error.message);
        if (flags.verbose) {
          this.logToStderr(`ERROR CODE: ${result.error.errorCode}`);
          this.logToStderr(result.error.stackTrace);
        }
      }
      this.error('Migrations failed');
    }
  }
}
