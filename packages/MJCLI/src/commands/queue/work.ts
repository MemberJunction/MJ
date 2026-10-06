import { Command, Flags } from '@oclif/core';
import { MJWorkLogger, SharedProviderSource, WorkQueueEngine, WorkQueueHost } from '@memberjunction/work-queue-engine';
import type { RunOnceResult } from '@memberjunction/work-queue-engine';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';
import { RunUntilStopped, WorkerStartFailure } from '../../lib/work-queue/queue-worker.js';
// Registers the 'AWS' transport driver factory and manifest enricher for this command only (work-queue 03 §0).
import '@memberjunction/work-queue-engine/aws';

const DEFAULT_IDLE_EXIT_MS = 5000;
const DEFAULT_SHUTDOWN_DRAIN_MS = 30000;

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
          SweeperIntervalMs: 0, ReconcileIntervalMs: 0,        // a short-lived job neither sweeps nor re-plans
        },
        WorkQueueEngine.Instance, session.User, session.Provider, new MJWorkLogger('[mj queue work]'),
        { ProviderSource: new SharedProviderSource(session.Provider) },
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
