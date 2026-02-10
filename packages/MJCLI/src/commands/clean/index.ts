import { Command, Flags } from '@oclif/core';
import type { ParserOutput } from '@oclif/core/lib/interfaces/parser';
import { Flyway } from 'node-flyway';
import { getValidatedConfig, getFlywayConfig } from '../../config';
import ora from 'ora-classic';

export default class Clean extends Command {
  static description = 'Resets the MemberJunction database to a pre-installation state';

  static examples = [
    `<%= config.bin %> <%= command.id %>
`,
  ];

  static flags = {
    verbose: Flags.boolean({ char: 'v', description: 'Enable additional logging' }),
  };

  flags: ParserOutput<Clean>['flags'];

  async run(): Promise<void> {
    const parsed = await this.parse(Clean);
    this.flags = parsed.flags;

    const config = getValidatedConfig();

    const flywayConfig = await getFlywayConfig(config);
    const flyway = new Flyway(flywayConfig);

    this.log('Resetting MJ database to pre-installation state');
    this.log('Note that users and roles have not been dropped');
    const spinner = ora('Cleaning up...');
    spinner.start();

    const result = await flyway.clean();

    if (result.success) {
      spinner.succeed();
      this.log(`The database has been reset. Schemas dropped:\n\t- ${result.flywayResponse?.schemasDropped.join('\n\t- ')}`);
    } else {
      spinner.fail();
      if (result.error) {
        this.logToStderr(result.error.message);
        if (this.flags.verbose) {
          this.logToStderr(`ERROR CODE: ${result.error.errorCode}`);
          this.logToStderr(result.error.stackTrace);
        }
      }
      this.error('Command failed');
    }
  }
}
