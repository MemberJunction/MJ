import { Command, Flags } from '@oclif/core';
import {
  dockerComposeArgs,
  requireMonorepoRoot,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionUp extends Command {
  static description =
    'Run the self-contained MJ regression stack (Mode A). Creates a new test-results/run-* folder.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --detach',
  ];

  static flags = {
    detach: Flags.boolean({
      char: 'd',
      description: 'Run containers in the background (docker compose up -d).',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionUp);
    requireMonorepoRoot();

    const composeArgs = dockerComposeArgs('full', ['up']);
    if (flags.detach) composeArgs.push('-d');

    const code = await spawnInherit('docker', composeArgs);
    if (code !== 0) this.exit(code);
  }
}
