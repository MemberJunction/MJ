import { Command } from '@oclif/core';
import { MJWorkLogger, SharedProviderSource, WorkQueueEngine, WorkQueueHost } from '@memberjunction/work-queue-engine';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

/**
 * Runs one sweeper pass (#6274) — lease expiry, retention and dedup purge — for deployments where no long-running host
 * sweeps, such as MJAPI configured publish-only. Schedule it with cron.
 */
export default class QueueSweep extends Command {
  static description = 'Run one work-queue sweeper pass (lease expiry, retention, dedup purge) and print what it did';

  static examples = ['<%= config.bin %> <%= command.id %>'];

  async run(): Promise<void> {
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      await WorkQueueEngine.Instance.Config(false, session.User, session.Provider);
      const host = new WorkQueueHost(
        {
          InstanceID: `mj-queue-sweep-${process.pid}`,
          Subscriptions: [],
          IdlePollMinMs: 250, IdlePollMaxMs: 2000, ShutdownDrainMs: 0,
          SweeperIntervalMs: 0, ReconcileIntervalMs: 0,
        },
        WorkQueueEngine.Instance, session.User, session.Provider, new MJWorkLogger('[mj queue sweep]'),
        { ProviderSource: new SharedProviderSource(session.Provider) },
      );
      const counts = await host.RunSweeperOnce();
      this.log(FormatSweepCounts(counts));
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

/** One line per sweeper step, or a note that the pass did nothing (a failed pass reports no steps). */
export function FormatSweepCounts(counts: Record<string, number>): string {
  const steps = Object.entries(counts);
  if (steps.length === 0) {
    return 'Sweeper pass finished; no steps reported (nothing to do, or the pass failed — see the log above).';
  }
  return steps.map(([step, count]) => `${step}: ${count}`).join('\n');
}
