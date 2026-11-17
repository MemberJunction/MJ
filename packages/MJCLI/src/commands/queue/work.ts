import { Command, Flags } from '@oclif/core';
import { IndependentProviderSource, MJWorkLogger, SharedProviderSource, WorkQueueEngine, WorkQueueHost } from '@memberjunction/work-queue-engine';
import type { WorkQueueProviderSource } from '@memberjunction/work-queue-engine';
import type { DatabaseProviderBase } from '@memberjunction/core';
import type { RunOnceResult } from '@memberjunction/work-queue-engine';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';
import { RunUntilStopped, WorkerStartFailure } from '../../lib/work-queue/queue-worker.js';
// Registers the 'AWS' transport driver factory and manifest enricher for this command only (work-queue 03 §0).
import '@memberjunction/work-queue-engine/aws';

const DEFAULT_IDLE_EXIT_MS = 5000;
const DEFAULT_SHUTDOWN_DRAIN_MS = 30000;
/** Long-running mode: retention and dedup purge, as MJAPI's sweeper does (#6274). */
export const DEFAULT_SWEEPER_INTERVAL_MS = 300000;
/** Long-running mode: re-plan subscriptions; MJAPI's default (`workQueue.reconcileIntervalMs`). */
export const DEFAULT_RECONCILE_INTERVAL_MS = 30000;

/**
 * The host timers for a run: none for a one-shot container job (it neither sweeps nor re-plans), the flag values for a
 * long-running worker, which otherwise would never re-plan and, with MJAPI publish-only, leave nothing to purge.
 */
export function QueueWorkTimers(once: boolean, sweeperIntervalMs: number, reconcileIntervalMs: number): { SweeperIntervalMs: number; ReconcileIntervalMs: number } {
  return once ? { SweeperIntervalMs: 0, ReconcileIntervalMs: 0 } : { SweeperIntervalMs: sweeperIntervalMs, ReconcileIntervalMs: reconcileIntervalMs };
}

/**
 * One provider for every delivery at concurrency 1; a connection-scoped provider per delivery above that, so parallel
 * handlers do not share transaction state (#6273).
 */
export function QueueWorkProviderSource(provider: DatabaseProviderBase, concurrency: number): WorkQueueProviderSource {
  return concurrency > 1 ? new IndependentProviderSource(provider) : new SharedProviderSource(provider);
}

export default class QueueWork extends Command {
  static description = 'Run work-queue subscriptions in this process: once for a container job, or until stopped';

  static examples = [
    '<%= config.bin %> <%= command.id %> --subscription venue-import --once',
    '<%= config.bin %> <%= command.id %> --subscription venue-import --once --max 5 --concurrency 2 --max-duration-ms 3300000',
    '<%= config.bin %> <%= command.id %> --subscription "*"',
  ];

  static flags = {
    subscription: Flags.string({ char: 's', description: "Subscription name, or '*' for every MJWorker subscription", required: true }),
    once: Flags.boolean({ description: 'Receive up to --max deliveries, drain and exit (container-job mode)', default: false }),
    max: Flags.integer({ description: 'With --once: how many deliveries to receive', default: 1, min: 1, dependsOn: ['once'] }),
    'idle-exit-ms': Flags.integer({ description: 'With --once: exit after this long with an empty queue', default: DEFAULT_IDLE_EXIT_MS, min: 0, dependsOn: ['once'] }),
    'max-duration-ms': Flags.integer({ description: "With --once: stop claiming after this long and drain (keep it below the scheduler's job deadline)", min: 1000, dependsOn: ['once'] }),
    concurrency: Flags.integer({ description: 'Handlers in flight per subscription', default: 1, min: 1 }),
    'shutdown-drain-ms': Flags.integer({ description: 'How long in-flight handlers get to finish on exit; the drain can take twice this', default: DEFAULT_SHUTDOWN_DRAIN_MS, min: 0 }),
    'sweeper-interval-ms': Flags.integer({ description: 'Without --once: how often to run the sweeper (lease expiry, retention, dedup purge); 0 turns it off', default: DEFAULT_SWEEPER_INTERVAL_MS, min: 0 }),
    'reconcile-interval-ms': Flags.integer({ description: 'Without --once: how often to re-plan subscriptions; 0 turns it off', default: DEFAULT_RECONCILE_INTERVAL_MS, min: 0 }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueWork);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      await WorkQueueEngine.Instance.Config(false, session.User, session.Provider);
      const host = new WorkQueueHost(
        {
          InstanceID: `mj-queue-work-${process.pid}`,
          Subscriptions: [{ Name: flags.subscription, Concurrency: flags.concurrency }],
          IdlePollMinMs: 250, IdlePollMaxMs: 2000, ShutdownDrainMs: flags['shutdown-drain-ms'],
          ...QueueWorkTimers(flags.once, flags['sweeper-interval-ms'], flags['reconcile-interval-ms']),
        },
        WorkQueueEngine.Instance, session.User, session.Provider, new MJWorkLogger('[mj queue work]'),
        { ProviderSource: QueueWorkProviderSource(session.Provider, flags.concurrency) },
      );
      failure = flags.once ? await this.runOnce(host, flags) : await this.runUntilSignal(host, flags.subscription);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();   // only after the drain: RunUntilStopped awaits host.Shutdown() first
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }

  /** One-shot mode. Exit 0 for an empty queue, a spent budget, MaxDuration or a signal; non-zero when nothing could run. */
  private async runOnce(host: WorkQueueHost, flags: { subscription: string; max: number; 'idle-exit-ms': number; 'max-duration-ms'?: number }): Promise<string | null> {
    let result: RunOnceResult = { Processed: 0, Reason: 'Shutdown' };
    const work = host
      .RunOnce({ MaxDeliveries: flags.max, IdleExitMs: flags['idle-exit-ms'], MaxDurationMs: flags['max-duration-ms'] })
      .then(r => { result = r; });
    await RunUntilStopped(host, work);
    // RunOnce returns at once when nothing could run (Task 3b); the health says why. The host is shut down by now,
    // so a subscription that did run reports HOST_SHUT_DOWN_REASON.
    const startFailure = WorkerStartFailure(host.GetHealth(), flags.subscription);
    if (startFailure) {
      return startFailure;
    }
    this.log(`Processed ${result.Processed} deliver${result.Processed === 1 ? 'y' : 'ies'} (${result.Reason}).`);
    return null;
  }

  private async runUntilSignal(host: WorkQueueHost, requested: string): Promise<string | null> {
    await host.Start();
    const startFailure = WorkerStartFailure(host.GetHealth(), requested);
    if (startFailure) {
      await host.Shutdown();
      return startFailure;
    }
    this.log(`Running ${requested}; send SIGINT or SIGTERM to stop.`);
    await RunUntilStopped(host, new Promise<void>(() => undefined));
    return null;
  }
}
