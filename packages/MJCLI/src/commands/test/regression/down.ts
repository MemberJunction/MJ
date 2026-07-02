import { Command, Flags } from '@oclif/core';
import {
  dockerComposeArgs,
  requireMonorepoRoot,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionDown extends Command {
  static description =
    'Stop the regression stack and wipe DB volumes (docker compose down -v).';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --keep-volumes',
  ];

  static flags = {
    'keep-volumes': Flags.boolean({
      description: 'Skip the `-v` flag — preserves the ephemeral DB volume.',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionDown);
    requireMonorepoRoot();

    // Use `--profile *` so compose tears down services in every profile,
    // not just the active one. Otherwise `down` leaves orphan containers
    // from a profile we haven't named.
    const composeArgs = dockerComposeArgs(undefined, ['--profile', '*', 'down']);
    if (!flags['keep-volumes']) composeArgs.push('-v');

    const code = await spawnInherit('docker', composeArgs);
    if (code !== 0) this.exit(code);
  }
}
