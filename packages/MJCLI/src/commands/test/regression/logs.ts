import { Args, Command, Flags } from '@oclif/core';
import {
  dockerComposeArgs,
  requireMonorepoRoot,
  spawnInherit,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionLogs extends Command {
  static description =
    'Tail logs from the regression stack (wrapper over `docker compose logs`), so ' +
    'monitoring a run is a command instead of Docker archaeology. Per-run console ' +
    'output also lives at test-results/<run>/console.log (host) + runner.log (container).';

  static examples = [
    '<%= config.bin %> <%= command.id %> -f',
    '<%= config.bin %> <%= command.id %> test-runner --since 10m',
  ];

  static args = {
    service: Args.string({
      description: 'Service to show (sqlserver|db-setup|mjapi|mjexplorer|test-runner). Omit for all.',
      required: false,
    }),
  };

  static flags = {
    follow: Flags.boolean({ char: 'f', description: 'Follow log output (stream).', default: false }),
    since: Flags.string({ description: 'Show logs since a timestamp or relative time (e.g. 10m, 2h).' }),
    tail: Flags.string({ description: 'Number of lines to show from the end of each container.', default: '200' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TestRegressionLogs);
    requireMonorepoRoot();

    const extra = ['--profile', '*', 'logs', '--tail', flags.tail];
    if (flags.follow) extra.push('--follow');
    if (flags.since) extra.push('--since', flags.since);
    if (args.service) extra.push(args.service);

    const code = await spawnInherit('docker', dockerComposeArgs(undefined, extra));
    if (code !== 0) this.exit(code);
  }
}
