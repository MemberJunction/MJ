import { Command, Flags } from '@oclif/core';
import { ParserOutput } from '@oclif/core/lib/interfaces/parser';
import { Flyway } from 'node-flyway';
import { config, getFlywayConfig } from '../../config';
import ora from 'ora-classic';

export default class Migrate extends Command {
  static description = 'Migrate MemberJunction database to latest version';

  static examples = [
    `<%= config.bin %> <%= command.id %>
`,
  ];

  static flags = {
    verbose: Flags.boolean({ char: 'v', description: 'Enable additional logging' }),
  };

  flags: ParserOutput<Migrate>['flags'];

  async run(): Promise<void> {
    const parsed = await this.parse(Migrate);
    this.flags = parsed.flags;

    if (!config) {
      this.error('No configuration found');
    }

    const flywayConfig = getFlywayConfig(config);
    const flyway = new Flyway(flywayConfig);

    if (this.flags.verbose) {
      this.log(`Connecting to ${flywayConfig.url}`);
      this.log(`Migrating ${config.coreSchema} schema using migrations from:\n\t- ${flywayConfig.migrationLocations.join('\n\t- ')}\n`);
    }

    const spinner = ora('Running migrations...');
    spinner.start();

    const result = await flyway.migrate();

    if (result.success) {
      spinner.succeed();
      this.log(`Migrations complete in ${result.additionalDetails.executionTime / 1000}s`);
      if (result.flywayResponse?.success && this.flags.verbose) {
        this.log(`\tUpdated to ${result.flywayResponse?.targetSchemaVersion}`);
      }
    } else {
      spinner.fail();
      if (result.error) {
        this.logToStderr(result.error.message);
        if (this.flags.verbose) {
          this.logToStderr(`ERROR CODE: ${result.error.errorCode}`);
          this.logToStderr(result.error.stackTrace);
        }
      }
      this.error('Migrations failed');
    }
  }
}
