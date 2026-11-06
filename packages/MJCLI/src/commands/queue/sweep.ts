import { Command, Flags } from '@oclif/core';
import { IndependentProviderSource, MJWorkLogger, WorkQueueEngine, WorkQueueHost } from '@memberjunction/work-queue-engine';
import { FormatSweep, SweepFailed } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

/** One sweeper pass from a host that runs no subscriptions, for a cron where no MJAPI host sweeps. */
export default class QueueSweep extends Command {
  static description = 'Run one sweeper pass: expire leases, purge retention and the deduplication ledger, then exit (exit code 1 when a step fails)';

  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --json'];

  static flags = {
    json: Flags.boolean({ description: 'Print JSON instead of text', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueSweep);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      await WorkQueueEngine.Instance.Config(false, session.User, session.Provider);
      const host = new WorkQueueHost(
        { InstanceID: `mj-queue-sweep-${process.pid}`, Subscriptions: [], IdlePollMinMs: 250, IdlePollMaxMs: 2000, ShutdownDrainMs: 0, SweeperIntervalMs: 0, ReconcileIntervalMs: 0 },
        WorkQueueEngine.Instance, session.User, session.Provider, new MJWorkLogger('[mj queue sweep]'),
        { ProviderSource: new IndependentProviderSource(session.Provider) },
      );
      const counts = await host.RunSweeperOnce();
      this.log(flags.json ? JSON.stringify(counts, null, 2) : FormatSweep(counts));
      if (SweepFailed(counts)) {
        failure = 'Sweeper pass failed; see the log above.';
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
