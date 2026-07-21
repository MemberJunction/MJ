import { Command } from '@oclif/core';
import {
  dockerComposeArgs,
  requireMonorepoRoot,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionStop extends Command {
  static description =
    'Stop the regression stack WITHOUT wiping the DB (docker compose stop). The ' +
    'containers + volumes are preserved so the run stays inspectable and can be ' +
    'restarted; use `down` to tear it down and `down` (default) to wipe volumes.';

  static examples = ['<%= config.bin %> <%= command.id %>'];

  async run(): Promise<void> {
    requireMonorepoRoot();
    // `--profile *` so every service stops, not just the active profile's.
    const code = await spawnInherit('docker', dockerComposeArgs(undefined, ['--profile', '*', 'stop']));
    if (code !== 0) this.exit(code);
  }
}
