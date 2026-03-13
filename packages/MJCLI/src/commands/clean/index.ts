import { Command, Flags } from '@oclif/core';
import { Skyway } from '@memberjunction/skyway-core';
import ora from 'ora-classic';
import { getValidatedConfig, getSkywayConfig } from '../../config';

export default class Clean extends Command {
  static description = 'Resets the MemberJunction database to a pre-installation state';

  static examples = [
    `<%= config.bin %> <%= command.id %>
`,
  ];

  static flags = {
    verbose: Flags.boolean({ char: 'v', description: 'Enable additional logging' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Clean);
    const config = getValidatedConfig();

    if (config.cleanDisabled !== false) {
      this.error('Clean is disabled. Set cleanDisabled: false in mj.config.cjs to enable.');
    }

    const skywayConfig = await getSkywayConfig(config);
    const skyway = new Skyway(skywayConfig);

    this.log('Resetting MJ database to pre-installation state');
    this.log('Note that users and roles have not been dropped');
    const spinner = ora('Cleaning up...');
    spinner.start();

    try {
      const result = await skyway.Clean();

      if (result.Success) {
        spinner.succeed();
        this.log(`The database has been reset. ${result.ObjectsDropped} objects dropped.`);
        if (result.DroppedObjects.length > 0) {
          this.log(`Objects dropped:\n\t- ${result.DroppedObjects.join('\n\t- ')}`);
        }
      } else {
        spinner.fail();
        this.logToStderr(`\nClean failed: ${result.ErrorMessage ?? 'unknown error'}`);
        if (flags.verbose && result.DroppedObjects.length > 0) {
          this.logToStderr(`Partial cleanup:\n\t- ${result.DroppedObjects.join('\n\t- ')}`);
        }
        this.error('Command failed');
      }
    } catch (err: unknown) {
      spinner.fail();
      const message = err instanceof Error ? err.message : String(err);
      this.error(`Clean error: ${message}`);
    } finally {
      await skyway.Close();
    }
  }
}
